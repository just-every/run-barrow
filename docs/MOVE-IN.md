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
`{name,base64,sheet}` for an XLSX or Excel 97–2003 binary XLS workbook, with an exact sheet name. The binary reader accepts ordinary values and native Excel dates; formulas, encryption, macros and external workbook links are refused. Each table accepts `columns`,
a mapping from the logical field below to the brand's actual source header.
Unrecognized source columns are retained verbatim and reported as retained only.
CSV files are bounded to 256 KiB and 500 rows; workbooks to 1 MiB before parsing,
with formula and unsafe archive refusal inherited from the existing workbook reader. The complete NuORDER manifest is bounded to 18 MiB; split larger supplied exports into separately reviewed batches.

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

Downloaded JPEGs use `images: [{name,base64}]`. The default `imageRule` is
`{style}_{color}_{slot}.jpg`; a supplied rule may also use `{size}` or `{upc}`.
It must include a style or UPC key and a slot. Slots 1 through 9 match exact
filenames to supplied product variants; omitting size attaches to all matching
sizes. A later upload replaces its exact variant slot without adding a duplicate.
Slot 1 feeds the existing primary document image. Other slots remain private
catalog references. Existing ORD-014 JPEG sanitization, the 200 KiB limit and
installation-only custody apply; identical sanitized bytes share one media row.

An unmatched downloaded JPEG is held privately in the retained source batch,
separately from retrieval failures. A later approved import for the same tenant
rechecks held names against the new products and rule. The source batch and its
held bytes travel in owner archives. Each batch accepts fifty files or URLs and
a tenant retains at most five hundred held filenames through this door; full
CAT-010 archive batches are still separate work.

For an export-supplied URL, use `{name,url,style}` instead of base64 and explicitly
set `retrieveImages: true` and `imageHosts: ["media.example.test"]`. Each URL must
name an exact declared public HTTPS host, with no credentials, query, fragment or
custom port. Both address families are resolved over authenticated HTTPS; every returned address must be public. A TLS socket connects to the checked address with the original hostname, so a later DNS change cannot redirect it to a private address. Redirects are refused. The five-second bound includes resolution, TLS and body streaming; transferred body bytes stop at 204 KiB, before the 200 KiB sanitized limit, and both preview and apply retrieve the current bytes. Changed
bytes invalidate the old approval. Only images that fail retrieval or JPEG
validation appear in `missingImages`, by source style, filename and safe reason;
nonmatching downloaded files appear in `heldImages`. A failed URL cannot silently
reuse older held bytes. No image is served on a new public download door and no
malware verdict is claimed. CT approved this owner-operated migration boundary with riders on 27 October 2026; broader catalog-media delegation and delivery remain separate receiving duties.

Optional `priceBooks` entries each name a mapped `customerId` and a separately
supplied `file` in the same CSV or workbook table shape. Logical fields `productId`,
`currency`, `unitPrice` and `minQty` default to `Product ID`, `Currency`,
`Wholesale Price` and `Minimum Quantity`; explicit `columns` map brand headers.
Each account receives one current USD or CAD book of active mapped products,
with exact decimal source prices and whole minimum quantities. The preview
compares source and planned row counts and sums of unit cents per book; only
fingerprint approval replaces the current account book. Product packs and
increments still apply. Dated book revisions, configured selling units or pricing rules require review
through the native account door before replacement. Historical order prices never
activate a current book and remain unchanged when a supplied current book changes.

After applying, use the native Line sheets publishing door to rebuild a CAT-003
recipient document from the imported SKU assortment, current book, season and ship
window. Its PDF retains that recipient snapshot. The optional **Presentation collections** field rebuilds editorial text and product collections on that same recipient share. Its hotspots link to eligible native products, its PDF embeds the approved primary JPEGs, and price, stock, current book and share-revocation checks remain active. This rebuild does not copy incumbent private layouts. CAT-004 still owns broader video, editorial-media composition and its complete lookbook capability.

For example, publish the imported SKU assortment with this optional presentation:

```json
{"title":"Spring presentation","introduction":"Approved imported assortment.","sections":[{"title":"Pantry collection","text":"Source products rebuilt for this buyer.","skus":["OAT-1"]}]}
```

When a source ledger is supplied, add `receivables` with `file`, `mappings` and optional `dispositions`. The table's logical fields `id`, `orderId`, `customerId`, `currency` and `balance` default to `Invoice ID`, `Order Number`, `Company Code`, `Currency` and `Balance`; `file.columns` maps other brand headers. Every invoice must name a supplied order with the same mapped company and currency. Original columns and artifacts stay in private source custody and the owner export.

Map each source invoice ID to an issued native order ID to compare independently against its recorded invoice outstanding after captured-principal allocations and applied credits. The preview shows source and planned counts and exact per-currency balances. A missing, duplicate, foreign-account or wrong-currency target refuses activation. A balance difference requires its own explicit owner disposition; changing the native invoice or financial records invalidates the reviewed fingerprint. Alternatively, map an invoice to `retain-history` and give its disposition: that balance remains labeled source ledger history and grants no native collection authority. The source ledger remains authoritative; recorded native outstanding is not proof of provider-confirmed unpaid balances. Applying the comparison never issues invoices, allocates money or rewrites a native balance.

```json
{"receivables":{"file":{"name":"ledger.csv","csv":"Invoice ID,Order Number,Company Code,Currency,Balance\ninvoice-1,NU-1,store-1,USD,100.00\n"},"mappings":{"invoice-1":"retain-history"},"dispositions":{"invoice-1":"Retain source collection authority; create no native debt."}}}
```

Preview writes nothing. It names original columns, product and archived counts,
image-slot targets, held filenames, retrieval failures by style, supplied current books, retained-only fields, missing entities, line and list counts,
per-currency order value and open quantities. Apply requires the exact fingerprint
and a nonempty owner reason; stale source or native data refuses. Approval is
recorded as `import.approved`. All order records are labeled retained source
history, including open ones. Replay creates no second history record or list,
and imports never reserve stock, issue an invoice, collect payment or send mail.
NuORDER retailer-network orders stop arriving at cutover. Companies and buyers
remain MOVE-009's. Missing source exports and provider rights remain labeled boundaries; this adapter makes no provider-access, legal-adequacy or malware claim. Broader media delivery, catalog delegation, manifests, erasure and scanning remain with their named receiving clauses.
