# Connect a controlled WooCommerce store

WooCommerce can be the selected stock authority instead of Pier. Barrow reads source variations by exact SKU and maps each trade account to an explicit source customer ID. Account price books remain private in Barrow. Only an approved order sends its exact commercial snapshot; no product price or retail customer price is written to WooCommerce.

Install the owner-controlled bridge in `./integrations/woocommerce/barrow-bridge.php` as a WordPress plugin and activate it beside WooCommerce. The bridge uses native WooCommerce orders, order items, refunds and stock. Its durable handoff table stores identities and acknowledgments, never a separate stock ledger. The controlled journey currently exercises WooCommerce 10.3.3 with WordPress and MariaDB. An existing store should be backed up and reviewed by its owner before installing a connector.

In the installation's private server settings, set `INVENTORY_PROVIDER` to `woocommerce`, `WOO_ORIGIN` to the store's exact HTTPS origin, and provision `WOO_KEY`, `WOO_SECRET` and `WOO_WEBHOOK_SECRET` as server secrets. Development alone permits a loopback HTTP store. Use a dedicated, revocable WooCommerce REST key with read and write access owned by a current shop manager. Never put a credential in a URL, account record, source file or browser page. Rotating or removing bindings records a credential-free configuration observation. Revoke replaced REST keys at WooCommerce itself.

While signed in as the Barrow owner, send a same-origin request to `POST /api/barrow/commands`:

```json
{"type":"woocommerce.connect","payload":{"reason":"Owner approves this controlled store as the stock authority."}}
```

The request checks the live REST permission and pins the store's durable identity. In the existing account editor, add a provider reference whose key is `woocommerce` and whose value is the source customer ID. Add the variation's exact source SKU to that account's agreed price list. The older Pier customer field does not select the WooCommerce customer. Open the buyer's Order pad to read the source variation, its current stock, observation time and negotiated account price. Unmapped customers, unavailable credentials and mismatched currencies refuse preparation. There is no fallback to Pier or synthetic stock.

WooCommerce core supplies no warehouse, incoming receipt or promise date. These facts are explicitly unknown. Accounts restricted to named warehouses cannot promise unlocated source stock. Only managed, whole-unit stock with backorders disabled is offered. Seasonal promises, freight handoffs and cancellation initiation are outside this bridge; use the source authority to manage its own business records. Split invoices are not enabled: a short allocation remains explicit and has no invoice download.

A buyer prepares and submits through the existing Orders screen. Supplier approval sends one destination-bound identity, exact currency, line totals, terms and human approval identities. The bridge requires InnoDB for the relevant WordPress and WooCommerce tables and serializes that identity and native stock changes in a database transaction. A replayed acknowledgment is followed by a current source read before invoice admission. A lost acknowledgment leaves the native order pending in Barrow; **Retry stock reservation** repeats the same identity. It must never be recovered by creating a second order. A changed store origin or installation identity refuses an old order.

Configure a WooCommerce order webhook to `POST /api/barrow/woocommerce/webhook` with the same server-held webhook secret. Its body supplies the native WooCommerce order ID and its `X-WC-Webhook-Signature` is the standard base64 HMAC-SHA256 of the exact body. Notifications only prompt an authenticated current-source read. Duplicate and older notifications cannot overwrite newer state or create orders. Unlinked source orders are acknowledged without importing them.

For source-confirmed shipping, an authorized shop manager records a native order's exact fulfillment reference through `POST /wp-json/barrow/v1/orders/ORDER_ID/fulfillments` using the dedicated REST credential:

```json
{"reference":"SOURCE-SHIPMENT-1","lines":[{"lineId":"SOURCE_LINE_ID","quantity":2}]}
```

The source refuses quantities beyond its allocated units and changed reuse of a reference. This receipt confirms shipped units only: warehouse, shipment date, carrier delivery and on-time delivery remain unknown. Record refunds through WooCommerce's native refund door. Barrow reads the exact native refund ID, amount and line references; it does not initiate a gateway refund or equate a recorded refund with provider settlement. In Orders, **Reconcile WooCommerce** refreshes these receipts; the fulfillment report reads the source directly. Historical invoices retain the original agreed snapshot.

To disable access, the owner sends `woocommerce.revoke` with a reason through the same command door and revokes the REST key at WooCommerce. Signed replay cannot re-enable the connection. Buyer access to another account, source configuration and staff audit is refused. The staff audit search and complete CSV record connector decisions and reconciliations with actor, source, time, revision and reason. Archives carry no REST keys, and restored connection consent is disabled until an owner explicitly reconnects the original store. The existing erasure journal fence runs before webhook processing.

The controlled public-door sanity journey is `./tests/api/woocommerce.test.mjs`; built-page proof is `./tests/journeys/woocommerce.test.mjs`. They provision an actual disposable WordPress installation with WooCommerce and MariaDB through Docker. Only transport acknowledgment loss and the unrelated paid mail edge are simulated. They require a working local Docker daemon and access to the official container images and WordPress plugin distribution. Containers, volumes, private generated credentials and browser processes are removed by their owning journey.
