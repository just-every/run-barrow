# Connector reconciliation

The signed-in owner opens Data → Connector reconciliation, records a reason and chooses **Inspect connectors**. The retained review names the responsible owner, record authorities, explicit identity mappings, source samples, successful read times, lag and exact exceptions. Inspection is read-only at the source. Credentials never appear in the review or audit.

Pier remains the stock authority. Repair customer IDs and priced SKUs in Accounts, inspect again, then enable Stock synchronization. Flat-file source authority, custom columns, read and write permission rehearsal, quarantine repair and processed acknowledgments remain under Move in.

## Faire before go-live

Configure the server-held brand connection as described by the existing Faire intake boundary. Only the owner can use these HTTP commands; buyers, staff and agents are refused. All writes require the normal authenticated same-origin request.

1. POST `/api/barrow/faire/configure` with `brand`, `enabled: false` and a human `reason`. This records disabled intake without collecting money or sending an order.
2. POST `/api/barrow/faire/preview` with `brand` to stage one source page while intake stays disabled. Repeat until `sync.complete` is 1. Failed pages retain the checkpoint; `restart: true` begins a fresh source pass. Only the final successful page advances the complete-source time.
3. Read GET `/api/barrow/faire`. For each review row, POST `/api/barrow/faire/match` with `brand`, the original source `id`, its current `revision`, the reviewed `accountId`, an explicit `skuMap` and a human `reason`. The trade account must be active, use the source currency and contain every chosen SKU. An ingested customer identity cannot be reassigned.
4. Inspect connectors. Faire retains authority over its orders, source prices and settlement; Barrow retains its trade accounts and Pier retains stock. The complete live read compares source orders with retained matching decisions, by original identity, currency, quantity and integer minor units. Missing mappings, changed source facts, missing source orders and reviewed duplicate customer mappings name the affected records and their repair action. Count and value totals are separate for each ISO currency.
5. POST `/api/barrow/faire/configure` with `enabled: true` and a human `reason`. Activation performs a fresh authenticated source read and refuses incomplete staging, missing mappings or unreconciled differences. A bounded preview reads at most twenty pages; a larger or unavailable source remains disabled until a complete comparison is possible. Explicitly reviewed duplicate customer mappings remain visible without merging accounts.

Enabled polling uses POST `/api/barrow/faire/poll`; its retained source identities deduplicate replay. Source changes return an order to review. Re-preview and match the current revision before enabling a disconnected or paused intake again. No Faire operation initiates Barrow collection.

If credentials are revoked, inspection reports an owned connection exception and retains previous samples, successful times and local order history. Reconnect the same destination and explicitly retry. A retained review labels its observation time; it never claims an unavailable source is current. Staff audit search and the complete audit CSV preserve actor, source, time, revision and reason for configuration, source-page reconciliation, reviewed matching and connector inspections. Buyer histories contain no internal decisions.
