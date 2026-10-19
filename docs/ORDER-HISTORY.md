# Order history and repeat orders

In **Orders**, filter the history by purchase reference, inclusive date range, ordered SKU or delivery location. Dates use America/New_York. A delivery location is currently a user-entered order label, not a validated postal address; an order without one has no recorded location.

Open **Reorder selected lines**, select all or some lines and compare current terms. You can enter an explicit replacement SKU from your current account assortment. The comparison shows original and current prices and currency, minimums, stock, terms and selected-line totals. Unavailable lines and insufficient quantities stay blocked; quantities are never silently raised or substituted. Start a new order if you want different quantities.

Acknowledge the comparison to prepare a fresh draft. Review and submit it from Orders. The original order stays unchanged and the new draft records its source and acknowledging person. Preparation reserves no stock. If the account, stock or comparison changed, compare and acknowledge again.

## HTTP door

Use a current native session, and the installation's own Origin for POST requests. Buyer history is limited to the buyer's account. Supplier access follows the existing owner/admin authority. Agent credentials cannot acknowledge a reorder.

- `GET /api/barrow/orders/history?po=SPRING&from=2026-04-01&to=2026-04-30&sku=TEE-M&location=flagship` returns matching `orders`. Omit any filter to leave it open.
- `POST /api/barrow/commands` with `type: "order.reorder-preview"` and a payload containing `orderId` and `selections: [{"sku":"TEE-M"},{"sku":"OLD-SKU","replacementSku":"NEW-SKU"}]` returns the current comparison and its `fingerprint`. Select each original and target SKU once.
- Use `type: "order.reorder"` with the same selection, the returned `fingerprint`, `acknowledged: true` and an optional new `reference`. Blockers refuse preparation. A successful result is a draft; the usual `order.submit` and supplier approval doors follow.

The comparison is read-only. Caller-provided prices, quantities and totals never override the original selected quantities or current supplier prices. Existing draft replacement remains a separate action in the order pad.
