# Trade account move-in

The server-only entry point is `src/barrow/imports/index.ts`. It uses the real
Base import-kit D1 engine copied, without tests or modifications, from
`references/gr-barrow-1/base/modules/import-kit/src` at committed Base revision
`fc0e1041efa55771142bbb57c4ab4743147e264d`. The copy is in
`src/modules/import-kit/src`. `0015_import_kit.sql` materializes every schema
export in `initializeD1ImportStorage` order, including preparation steps,
stream origins, legacy receipt conversion, native staging, custody revisions,
reversal fences and retirement. Apply it through the normal migration path.
The Worker requires the foundation's `nodejs_compat` support.

## File shape

Use UTF-8 CSV with these exact case-sensitive headers, in this order:

```csv
accountId,name,email,pierCustomerId,termsDays,minimumCents,sku,unitCents,minQty
trade-river,River Grocer,buyer@river.example,pier-river,14,10000,APPLE-BOX,2500,2
trade-river,River Grocer,buyer@river.example,pier-river,14,10000,PEAR-BOX,3000,1
```

`accountId` is the source system's stable non-email ID and becomes the native
`bw_accounts.id`; changing an email does not change the account identity.
`pierCustomerId` is the exact, explicitly supplied Pier party ID. Both IDs use
letters, digits, dot, underscore, colon or dash, starting with a letter or digit,
and are at most 100 characters. No customer matching or guessing occurs.

Repeat an account row for each unique SKU. All repeated account fields must
agree. An account without prices has all three price columns empty. Email is
lowercase, trimmed and valid; names preserve business capitalization and must
be nonempty trimmed text. Different accounts cannot share an email, including
existing native accounts. The parent-owned native unique index also enforces
email uniqueness during concurrent transactions.

All money is integer cents, zero or greater. `termsDays` is a nonnegative
integer; `minQty` is a positive integer. Decimal prices, currency symbols,
exponents, signs and leading zeros are rejected. Numeric values must fit safe
JavaScript integers. Each account has at most 200 prices and each SKU appears
once per account. Files are at most 256 KiB, 1000 account/price rows and 200
distinct accounts. BOM, CRLF and ordinary CSV quoting are supported. Unknown
columns, mismatched counts, conflicting duplicates and broken quotes reject.

Every dry run reconciles the source against the planned Barrow records:
accounts, price rows and the USD sums of unit-price and order-minimum cents on
both sides, with new, updated and unchanged accounts. Each price SKU must be an
active item in the connected Pier catalog; an unknown SKU is an error naming the
account and SKU, and when Pier cannot be read the dry run says the check did not
run and apply refuses. Apply records the owner/admin's approval of the exact
fingerprint, with those counts and sums, in the commercial audit (MOVE-007).

The fixture `fixtures/trade-accounts.csv` is illustrative input for a human
move-in (its SKUs must exist in the connected Pier); it is never loaded automatically and creates no sign-in grants,
invitations, orders, messages, background jobs or Pier mutations.

## Native integration

The parent supplies `bw_accounts(id TEXT PRIMARY KEY, value_json TEXT NOT NULL,
revision TEXT NOT NULL)` and `bw_orders.account_id`. Every account JSON has
exactly `{name,email,pierCustomerId,termsDays,minimumCents,prices}`; each price
has exactly `{sku,unitCents,minQty}`. Reuse `validateAccountValue` for manual
account editing. Revisions must change on every manual write.

Each exported action takes a real D1 binding and a trusted actor `{id,role}`
obtained from the native authenticated server handler. Each action checks that
the current `oa_operators` row is active, that its stored role equals the
actor's role, and that it is owner/admin. The kit repeats this SQL authority
predicate within atomic batches and SELECT fences. Route guards alone do not
authorize these functions. Never accept the actor, native erase SQL or
checkpoint SQL from a browser payload.

1. Call `dryRunAccountImport(db,actor,{csv,namespace?})`. It returns
   `{plan,fingerprint,counts,diagnostics}` without database mutations. Show the
   account changes, counts, diagnostics and fingerprint for explicit human
   review. An invalid file throws an error with a product error `code`.
2. After the human approves, call
   `applyAccountImport(db,actor,{csv,namespace?,fingerprint})`. It rebuilds the
   reviewed plan and refuses changed source, changed account snapshots or a
   different fingerprint. It saves retained originals, source ownership,
   before-images and provenance through `createD1ImportJob`, then applies.
   Input cannot supply an executable plan. The operation key is derived from
   the approved fingerprint; exact resubmission resumes its durable job.
3. Each call commits at most one batch of ten accounts. Repeat the identical
   approved apply request while `job.state` is `queued` or `applying`, showing
   `checkpoint/total`, until `completed`. Do not retry failures automatically;
   surface the conflict and let the operator choose the next action. A failed
   request leaves prior successful batches durable.
4. `listAccountImports(db,actor,limit=50)` returns the newest journals (limit
   1–100). `getAccountImport(db,actor,id)` returns `{job,originals,undoReport}`
   with digest-checked original bytes and the native kit's reversal report.
5. `undoAccountImport(db,actor,id)` reverses a completed import. Repeat only
   while the returned state is `undoing`, until `undone`. A later order
   referring to any imported account blocks undo; an order arriving during
   preflight also fails the transaction's dependency guard. Full native
   values and revisions are fenced, so an operator edit is preserved. A
   newer import must be undone before its predecessor. Partial apply is not
   silently rolled back; fix the conflict and explicitly resume its request.

The effective source namespace is the supplied namespace (default
`barrow-trade-accounts`) plus the exact file SHA-256. Each distinct export can
supersede an unchanged earlier imported account, while the native account ID
stays stable. Custody is bound to the durable installation trade administration
grant, so an active owner/admin can inspect and undo jobs after restore; no
restored operator row ID is trusted. The reviewed payload includes complete
native before-images to detect edits made without changing revision. The thin
adapter uses Base's internal validated `stored` reader only to restore those
reviewed snapshots for an explicit resume; publication remains the public kit
engine and exact SQL guards.

## Person erasure and portability

Call `retireAccountImportCustody(db,actor,{accountId,email,nativeStatements,
checkpoint})` from the native account erasure handler. `email` is the exact
lowercase identifier from the native erasure plan, never a substring. Supply
the native deletion/redaction plan as inert `{sql,params}` statements and the
real portability module's `redactionStatements()` mapped to the same shape.
For an account with no retained order dependency, the native deletion includes
`DELETE FROM bw_accounts WHERE id=?`; any order retention or redaction is the
native erasure planner's responsibility. Do not commit native deletion first.

The wrapper calls Base `retireD1ImportCustody` with target
`{kind:'account',id:accountId}`, exact `values:[email]`, exact retained payload
matching and exact CSV email-column matching. It removes affected account
records and reversal before-images throughout custody, withdraws entire
affected originals (a shared file may contain peer accounts), retires headers
that contain the exact identifier, and writes the value-free erasure journal.
Native SQL, custody changes and the portability checkpoint commit in one D1
batch with current owner/admin authority. Export the complete kit tables and
erasure journal with domain data and portability's journal/epochs; older
archives must be rejected by portability's existing restore fence. A missing
checkpoint fails closed. Do not fabricate a checkpoint or recreate custody
from sanitized source after erasure.

No test suite, build, dev server or heavy process was run by this subsystem
lane; the integrating parent owns the targeted real-D1 and transport checks.

Account price books use USD integer cents; the catalog API labels that currency and each new order snapshots it. CSV amounts are not converted. Legacy order records retain their recorded currency (AUD when the old record has no currency field), including after restore.

## NuORDER reviewed source batch

The owner selects **NuORDER** in the existing Move in manifest form. The native
HTTP doors are `POST /api/barrow/imports/nuorder/preview` and
`POST /api/barrow/imports/nuorder/apply`. This is a supplied export adapter,
not a claim that every brand uses one standard NuORDER archive.

The JSON manifest contains `tenant`, `products`, `orders`, `authority`, `scope`
and optional `images` and `lists`. Each source table is either `{name,csv}` or
`{name,base64,sheet}` for an XLSX workbook, with an exact sheet name. Binary legacy
XLS is not accepted: save it as XLSX or CSV first. Each table accepts `columns`,
a mapping from the logical field below to the brand's actual source header.
Unrecognized source columns are retained verbatim and reported as retained only.
CSV files are bounded to 256 KiB and 500 rows; XLSX files to 1 MiB before parsing,
with formula and unsafe archive refusal inherited from the existing workbook reader.

| Logical product field | Default source header |
| --- | --- |
| id, style, color, size | Product ID, Style Number, Color, Size |
| upc, season, archived | UPC, Season, Archived |
| casePack, increment | Case Pack, Increment |

`Archived` is explicitly `true` or `false`. Active products must map to existing
active Pier SKUs; source UPC must match Pier's barcode. Archived product metadata
is retained as a removed listing. Pier remains the product and stock authority;
this importer creates neither stock nor Pier items. Style, color, size, UPC and
season remain in the retained source and catalog metadata. Case packs and
increments feed the existing account quantity rules for entitled SKUs, including
products absent from the imported order lines. No source product adds an account price.

| Logical order field | Default source header |
| --- | --- |
| id, customerId, productId | Order Number, Company Code, Product ID |
| currency, total, shipping | Currency, Order Total, Shipping |
| status, date, quantity | Status, Order Date, Quantity |
| unitPrice, openQuantity | Wholesale Price, Open Quantity |
| po, shipStart, shipEnd | Customer PO, Ship Start, Ship End |

Order rows repeat their header and contain one mapped product each. An optional
`type` mapping defaults to `Type`; a supplied value other than `Order` refuses. Currency is
an explicit ISO code, amounts are exact decimal currency units, and open quantity
is a nonnegative whole number no larger than ordered quantity. Conflicting repeated
headers and duplicate mapped order lines refuse. `authority` uses `system: supplied`
with explicit `customers` from source company IDs to native account IDs and
`products` from source product IDs to Pier SKUs. `scope` declares ISO dates or
null in `from` and `to`, `filters` and `fullTenant`. Optional `lists` use the
existing supplied list CSV shape: desired quantities only, initially private,
repriced through the current cart preview, included in reconciliation and export.

Downloaded JPEGs use `images: [{name,base64}]`; the supported primary filename is
`STYLE_COLOR_1.jpg`, matched exactly against source style and color. It attaches
to all supplied sizes of that style and color. Existing ORD-014 sanitization,
200 KiB limit, installation-only custody and content deduplication apply. Other
slots and unmatched files are reported without automatic attachment. Remote URLs,
held unmatched media and full CAT-010 naming rules are still pending; no remote
media fetch or malware verdict is claimed. Missing remote images cannot yet be
reported as successfully attempted retrievals.

Preview writes nothing. It names original columns, product and archived counts,
primary image targets, retained-only fields, missing entities, line and list counts,
per-currency order value and open quantities. Apply requires the exact fingerprint
and a nonempty owner reason; stale source or native data refuses. Approval is
recorded as `import.approved`. All order records are labeled retained source
history, including open ones. Replay creates no second history record or list,
and imports never reserve stock, issue an invoice, collect payment or send mail.
NuORDER retailer-network orders stop arriving at cutover. Companies and buyers
remain MOVE-009's, while document rebuilding through CAT-003 and CAT-004, broader
image-slot custody and a complete receivable rehearsal remain unfinished.
