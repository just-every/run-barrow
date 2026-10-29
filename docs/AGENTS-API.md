# Agent prepares; person approves

Company-policy MCP access and its current native limits are documented in [Company agents](AGENT-DOOR.md). The HTTP credentials below retain their existing narrow authority.

In the supplier Data page, create a seven-day agent credential. Save it in a private `0600` file outside the checkout. It is shown once, stored only as a SHA-256 digest and revoked when its issuing operator loses authority or when that operator revokes agent credentials.

```sh
node scripts/barrow.mjs catalogue --origin http://127.0.0.1:BARROW_PORT --token-file /private/barrow-token.txt --account cedar
node scripts/barrow.mjs prepare-order --origin http://127.0.0.1:BARROW_PORT --token-file /private/barrow-token.txt --input /private/order.json
```

`order.json` contains an existing account ID, an optional customer reference, SKU quantities and a stable retry key:

```json
{"accountId":"cedar","reference":"PO-October","lines":[{"sku":"OAT-1","quantity":2}],"idempotency_key":"cedar-po-october-draft-1"}
```

Prices, minimums, terms and Pier IDs come from current server records. The agent may read supplier-visible accounts and stock and prepare a draft. There is no agent approval command. A customer or supplier reviews and submits the draft in Orders; a supplier then approves. The server records `preparedBy`, `submittedBy`, `approvedBy`, `approvedAt`, the commercial snapshot and the returned Pier reservation.

The HTTP doors are `GET /api/barrow/catalogue?accountId=ID` and `POST /api/barrow/commands` with `{type:"order.prepare",payload:...}` and a Bearer credential. Browser mutations require a current Base session and same-origin request. Unknown commands and unauthorized cross-account reads fail closed.

## Version 1 wholesale exchange

All versioned doors start at `/api/barrow/v1`. They use the existing native
session for people. Native staff roles, company purchasing and finance rights,
location scope, buying profiles and current usage terms apply on every request.
A versioned URL does not grant a new native permission. Responses are private
and have `Cache-Control: no-store`.

The signed-in owner can issue a separate integration credential, shown once and
stored only as a digest. The grant names exactly one active account and explicit
scopes from `catalog:read`, `order:prepare` and the entity preparation scopes
described below. Expiry is an integer Unix timestamp
in milliseconds, after now and at most seven days away. There is no automatic
submission, approval, import, invoice read, fulfillment read, grant management,
erasure or outbound authority. A legacy agent credential uses the shared policy door through MCP or the
legacy HTTP compatibility transport; it is not a versioned integration grant.

These requests use a private native session file obtained through normal native
sign-in, not a copied browser profile. Keep session and token files outside the
checkout, readable by their owner only. Set `ORIGIN` to the installation origin.

```sh
curl --cookie /private/native-session.txt --header "Origin: $ORIGIN" \
  --header 'Content-Type: application/json' \
  --data @/private/integration-grant.json "$ORIGIN/api/barrow/v1/grants"
```

The grant input is:

```json
{"accountId":"cedar","scopes":["catalog:read","order:prepare"],"expiresAt":1793278800000,"consent":true,"reason":"Approved Cedar catalog and draft preparation"}
```

Replace the example expiry with the intended future time. The response contains
`token` and `grant`. `GET /api/barrow/v1/grants?accountId=cedar` lists metadata
without digests or tokens. `POST /api/barrow/v1/grants/revoke` takes `grantId`,
the current grant `revision` and a human `reason`. A stale revocation is refused.
Revocation closes access immediately. Every request rechecks expiry, current
issuer activation, owner role and native version, plus the account lifecycle.
Owner deactivation and later reactivation do not revive an old credential.
Grants are excluded from archives and removed with account erasure.

### Entity reads and pagination

Each collection requires an exact `accountId`. Supported collections are
`products`, `variants`, `accounts`, `locations`, `price-books`, `quotes`,
`orders`, `invoices` and `fulfillment`. Catalog reads may also select an existing
`profileId`; integration grants currently cover the account's default book only.
Products and variants retain their source item IDs and SKUs; Barrow's variant
attributes and image references accompany those rows. Source product identity,
name, barcode and stock remain owned by Pier. Price books name their ISO currency
and exact integer minor-unit prices. Accounts, locations, quotes and orders keep
their native IDs and revisions. Invoice rows name the invoice number, order,
source order, original lines, currency, exact total and authorized CSV path.

Native entity reads use the same rights as their existing screen doors. Company
purchasers read their current assortment and quotes; finance reads authorized
invoices. Fulfillment requires the existing supplier fulfillment-report rights,
including staff account and warehouse scope. Agents cannot read invoices or
fulfillment. Fulfillment rows reuse RPT-003's live source-confirmed quantities,
warehouse attribution and explicit unknown delivery and tracking facts. Rows name
`kind`: `source-line` for Pier, `channel-line` for existing channel observations,
and `commitment` for seasonal promises. A commitment's released quantity is a
handoff, never proof of shipment; its shipped quantity, warehouse and delivery
remain explicitly unknown. Channel observations keep their recorded source and
unknown quantities without being combined with Pier's stock. A missing
or mismatched source refuses the read; Barrow never infers quantities from a draft.

The envelope is `{version:1,data:[...],snapshot,nextCursor}`. `limit` is one to
100, default 50. Rows sort by stable ID. Supply the returned cursor unchanged for
the next page; null means the end. A cursor belongs to its resource, account and
profile. A changed collection returns HTTP 409 rather than silently skipping or
duplicating rows; restart from the first page. A malformed or foreign-scope cursor
returns HTTP 400. Pagination retains no server-side copy of private records.

```sh
node scripts/barrow.mjs products --origin "$ORIGIN" \
  --token-file /private/integration-token.txt --account cedar --limit 25
node scripts/barrow.mjs variants --origin "$ORIGIN" \
  --token-file /private/integration-token.txt --account cedar --cursor "$CURSOR"
curl --cookie /private/native-session.txt \
  "$ORIGIN/api/barrow/v1/invoices?accountId=cedar&limit=25"
curl --cookie /private/native-session.txt \
  "$ORIGIN/api/barrow/v1/fulfillment?accountId=cedar&limit=25"
```

### Draft preparation and reviewed native writes

`POST /api/barrow/v1/orders/prepare` takes an exact account ID, its current
`accountRevision`, explicit ISO `currency` and normal order preparation fields.
The account revision is returned by the native account read; the account revision
on a catalog row also provides the current default book basis. Optional profile,
address and replaced-draft IDs must be exact stable IDs. Account changes, wrong
currency, unknown SKUs, invalid quantities, inaccessible locations and stale
replacements are refused without creating a draft. Prices and totals always come
from current server records. A successful response is `{version:1,result:order}`;
`preparedBy` retains the grant identity and no stock is reserved.

```json
{"accountId":"cedar","accountRevision":"CURRENT_ACCOUNT_REVISION","currency":"USD","reference":"PO-October","lines":[{"sku":"OAT-1","quantity":2}]}
```

```sh
node scripts/barrow.mjs prepare-order-v1 --origin "$ORIGIN" \
  --token-file /private/integration-token.txt --input /private/order.json
```

People retain the canonical native command surface at
`POST /api/barrow/v1/commands` with `{type,payload}`. This includes account and
location maintenance, version-guarded variant attributes, price-book import,
quote requests and revisions, human submission and supplier approval. Each
command retains its original required revision, fingerprint, consent, company
limit and permission checks. Integration credentials cannot use this door.

Reviewed catalog XLSX imports use `POST /api/barrow/v1/imports/catalog/preview`
and `POST /api/barrow/v1/imports/catalog/apply`. The input is the documented
catalog workbook `{workbook:{name,base64}}`; apply additionally supplies the exact
preview `fingerprint`, `reason` and `approveRemoved` where needed. Existing source
products must already be mapped in Pier; source-owned edits are refused. Company
and price CSV imports use `POST /api/barrow/v1/imports/companies/preview` and
`POST /api/barrow/v1/imports/companies/apply`, retaining the documented account
CSV headers, reconciliation, exact fingerprint approval and replay behavior.
These imports require the existing signed-in native supplier authority and the
installation's same Origin header. Agents cannot import.

A complete native sequence is: preview and approve the catalog workbook; preview
and approve the company CSV; read the account revision and catalog; issue the
account's draft grant; prepare a draft; have a purchaser submit it and the supplier
approve it through native commands; read its original invoice and source-confirmed
fulfillment as authorized people. `tests/api/integration-api.test.mjs` exercises
this sequence without direct database access.

### Prepared entity exchange

BAR-003's preparation and human review boundary also applies to entity changes.
An owner may explicitly grant `products:prepare`, `variants:prepare`,
`accounts:prepare`, `locations:prepare`, `price-books:prepare` and
`quotes:prepare`, independently. These scopes permit preparation only. They
cannot apply changes, submit or approve orders, import, export invoices, erase,
issue grants or send messages. The existing native person doors remain available
under their existing permissions.

`POST /api/barrow/v1/exchange/prepare` uses the integration Bearer credential.
Its JSON contains `entity`, `accountId`, current `accountRevision`, current ISO
`currency` and `payload`. The response contains the exact `proposal`, a server
authenticated `fingerprint`, and `requiresPerson:true`. Preparation changes no
entity and reserves no stock. It records an attributed audit event. A preparer
receives its submitted data and opaque revision basis, never another account's
profile, catalog maintenance report or quote history.

Each payload uses the existing native format:

| Entity | Payload and boundary |
| --- | --- |
| `products` | `{workbook:{name,base64}}`, using the documented catalog XLSX format. Every SKU must already belong to the grant account's assortment. Native source-owned field validation applies; item identity, name, barcode and inventory remain in Pier. The person reviews any listing removals and supplier-wide metadata effects before applying. |
| `variants` | `{revision,variants:[{sku,style,color,size}]}`. The attributes revision comes from a versioned variant row; SKU scope is the existing account assortment. Existing media and recorded order snapshots remain intact. |
| `accounts` | `{id,revision,value,duplicateReviews?}`, using the complete native account value. This edits the grant's existing company only. Its buyer identity cannot be reassigned; native duplicate review and commercial validation still apply. |
| `locations` | `{accountId,kind,value,makeDefault?}` for creation, or `{accountId,id,revision,value,makeDefault?}` for an existing location. Native address validation, current location revision and account ownership apply. |
| `price-books` | `{accountId,revision,csv}`, with `sku,currency,unitCents,msrpCents,minQty` headers. Native single-currency, integer minor-unit, minimum and configured selling-unit rules apply. |
| `quotes` | `{type,accountId,lines,note?}` for `quote.request`; `quote.propose` also names `quoteId`, current `revision`, and ordinary `validUntil`, `termsDays` and `shipping` fields where needed. Native quote pricing and approval rules apply. Acceptance, discount approval and order submission remain separate human actions. |

For example, save this input privately as `entity-change.json`, substituting the
current revision returned by the person's account read:

```json
{"entity":"locations","accountId":"cedar","accountRevision":"CURRENT_ACCOUNT_REVISION","currency":"USD","payload":{"accountId":"cedar","kind":"ship-to","value":{"name":"Warehouse counter","line1":"102 Main Street","city":"Columbia","state":"SC","zip":"29201"}}}
```

Read the Bearer credential from an owner-only private file and save the response
outside the checkout:

```sh
node scripts/barrow.mjs prepare-exchange-v1 --origin "$ORIGIN" \
  --token-file /private/integration-token.txt --input /private/entity-change.json
```

The signed-in owner then posts
that exact response to `/api/barrow/v1/exchange/review`, with the installation's
Origin header, to recheck it without writes. For products this owner-only response
also contains the native `catalog` preview, including planned rows, reconciliation
and the exact list of removed listings. After reviewing its complete input,
the owner posts the same `proposal` and `fingerprint`, plus `confirm:true` and
a specific `reason`, to `/api/barrow/v1/exchange/apply`. A catalog workbook that
removes listings also requires the person's separate `approveRemoved:true`;
the ordinary confirmation never supplies removal approval implicitly:

```sh
curl --cookie /private/native-session.txt --header "Origin: $ORIGIN" \
  --header 'Content-Type: application/json' --data @/private/approved-change.json \
  "$ORIGIN/api/barrow/v1/exchange/apply"
```

Apply requires the current native owner session; the integration credential and
buyer sessions are refused. It rechecks scope, expiry, issuer activation and
version, account lifecycle and revision, the full proposal fingerprint and the
native entity's current revision or source basis. A changed workbook, payload,
grant or relevant source requires fresh preparation and review. The native effect,
live grant guard, account revision guard and unique receipt are one atomic batch.
Replaying the same approval returns HTTP 409 and makes no second change.
Revocation, issuer removal, expiry and account erasure also close pending approvals;
an old archive cannot restore grant authority. No proposal body is stored by this
door. Retain private review files only under the operator's own custody policy.

The response names the native result and a receipt with `id`, `grantId`,
`preparedBy`, `appliedBy` and `entity`. Preparation is attributed to the agent;
application and the ordinary native audit event are attributed to the person.
The append-only `integration.applied` event retains the grant revision, exact
fingerprint, source, time and owner's reason. Search by account or preparing
identity and open the complete audit CSV to reconcile both sides. Applied quote
changes use the existing human-authorized notification path.

Grant creation and revocation are append-only DATA-002 events with the exact
person, account, revision, source, time and human reason. Draft events retain
`agent:<grant ID>`. Staff can find them through `/api/barrow/audit` and the
complete filtered `/api/barrow/audit.csv`; neither contains token material.
Buyers and agents cannot read internal audit decisions. The versioned sanity
journeys in `tests/api/integration-api.test.mjs` exercise every prepared entity,
human application, unchanged issued invoices, exact source fulfillment, replay,
stale revisions and authority withdrawal through these public HTTP doors.

Legacy `prepare-order` input must include a stable `idempotency_key`. The owner must first answer the shared agent policy; unset policy and Pause refuse catalogue reads and preparation. Native draft and proposal attribution names `Barrow scoped agent for <person>`. Keep the exact input file and key when retrying.
