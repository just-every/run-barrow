# Order confirmations (ORD-014)

Orders → Order confirmations lists each recorded revision. Submission records a snapshot and supplier acceptance records another. A stock reservation retry reuses the accepted snapshot. These are commercial confirmations, not claims of stock reservation, tax calculation, email delivery or carrier delivery. Orders written before this feature have no fabricated historical confirmations.

The same signed-in people who can read an order can list and download its confirmations:

- `GET /api/barrow/orders/<orderId>/confirmations`
- `GET /api/barrow/orders/<orderId>/confirmations/<number>.pdf`
- `GET /api/barrow/orders/<orderId>/confirmations/<number>.csv`

Numbers increase per order. The snapshot keeps the exact order revision, buyer/account, PO, bill-to and ship-to, requested and cancel dates, payment terms, selling-unit lines and conversions, agreed currency and integer cents, delivery method/charge/window where recorded, and total. Later account, price, address, reservation or cancellation changes never rewrite it. Where the account's ORD-015 sales terms were accepted at submission, the snapshot also copies the accepted terms text and the acceptance record (version, how, who, when, printed name and signature digest), so a later terms version never changes it. Confirmation revisions link from the order timeline. Commercial JSON and `confirmations.csv` exports retain the snapshots and download paths; owner archives retain the same records.

In **Line sheets → Order confirmation details**, an owner or admin saves seller legal identity, explicit variant style/color/size attributes and one JPEG per variant. Metadata is removed before hashing; images stay in this installation’s D1 and archives while referenced and are embedded in PDFs, with their SHA-256 named in CSVs. They have no separate download door and contain no buyer data, so buyer erasure leaves them. ct approved this custody as landed on 22 October 2026 at 22:15Z; DATA-001’s media manifest and DATA-004’s malware screening for CAT-002 remain open.

Before supplier acceptance, the account buyer can revise submitted line quantities in **Orders** under unchanged pricing, with current terms acceptance where required. A revision records the exact changed lines and keeps the earlier documents. Supplier-started and accepted-order edits remain with ORD-011. Each confirmation is emailed once through the configured sender with links to that exact revision behind sign-in. The displayed send result records acceptance by the sender; restored history never re-sends. Downloads label absent facts; they do not infer them.

## Bulk per-line CSV

In supplier Orders, use the existing status/history filters, open **Bulk confirmation CSV** and **Load current view** (up to 50 orders). Select individual recorded orders or **Select all recorded**. Choose exactly one numbered confirmation for each selected order; the latest recorded number is initially selected. Drafts and historical orders without confirmations are shown but cannot be included. Loading a different view clears the selection.

Choose an existing named layout or use the installation default, then download one CSV. The file keeps the chosen layout's column order and appends any missing `order`, `order_revision`, `confirmation` columns. Every row comes from the explicitly selected immutable confirmation, in selection order and then snapshot line order. It does not reread current prices or combine currencies or selling units. Missing revisions, duplicate orders, empty-line snapshots and any unauthorized order refuse the whole file.

The corresponding authenticated HTTP doors are `POST /api/barrow/confirmations/selection` with `{ "orderIds": ["ORDER_ID"] }` and `POST /api/barrow/confirmations/export.csv` with `{ "confirmations": [{ "orderId": "ORDER_ID", "number": 1 }], "layout": "LAYOUT_ID" }`. Omit `layout` for the current default. Existing individual-confirmation account authority applies to every selected order; agents are refused, and explicit layout selection is supplier-only. Browser POSTs use the installation origin.

Use **Manage named layouts** to save ordered columns as a per-line or size-matrix layout and make one the default. Buyer downloads follow the default; supplier staff can choose a named layout. Layouts and their default are retained in archives. A size matrix splits rows by ship window and selling unit, with recorded sizes as quantity columns.

To select a season, enter its exact published line-sheet season and choose **Load season orders**, then select the recorded revisions. More than 50 orders refuses rather than truncating. **Download style, color and size totals** sums their base quantities by style, color, size and base unit, naming every source confirmation. Per-line and matrix downloads retain exact snapshot values and source order/revision identities; none of these exports changes an order or stock.

PRI-008 records optional variant MSRP and separate confirmation-PDF/order-CSV price display preferences with the prepared order. Each confirmation freezes them. Wholesale-only omits MSRP and margin; retail-only omits wholesale unit/line price columns; both includes exact MSRP and gross margin. Every order total remains wholesale. See [line sheets and retail prices](LINE-SHEETS.md).

For orders with recorded PRI-008 display preferences, monetary CSV exports retain an explicit ISO `currency` column even when a named layout omits it. This also applies to bulk price handoffs; chosen metadata columns keep their order.
