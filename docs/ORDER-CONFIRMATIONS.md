# Order confirmations (ORD-014, partial)

Orders → Order confirmations lists each recorded revision. Submission records a snapshot and supplier acceptance records another. A stock reservation retry reuses the accepted snapshot. These are commercial confirmations, not claims of stock reservation, tax calculation, email delivery or carrier delivery. Orders written before this feature have no fabricated historical confirmations.

The same signed-in people who can read an order can list and download its confirmations:

- `GET /api/barrow/orders/<orderId>/confirmations`
- `GET /api/barrow/orders/<orderId>/confirmations/<number>.pdf`
- `GET /api/barrow/orders/<orderId>/confirmations/<number>.csv`

Numbers increase per order. The snapshot keeps the exact order revision, buyer/account, PO, bill-to and ship-to, requested and cancel dates, payment terms, selling-unit lines and conversions, agreed currency and integer cents, delivery method/charge/window where recorded, and total. Later account, price, address, reservation or cancellation changes never rewrite it. Confirmation revisions link from the order timeline. Commercial JSON and `confirmations.csv` exports retain the snapshots and download paths; owner archives retain the same records.

Seller legal identity, product images, explicit style/color/size attributes, MSRP, sales-terms versions/signatures, commercial edit revisions, confirmation email delivery, saved export layouts and bulk production spreadsheets remain required by ORD-014. The clause stays partial. Downloads label absent facts; they do not infer them.
