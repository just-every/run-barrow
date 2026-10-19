# Orders and invoice CSVs

The customer prepares and submits an order. The supplier approves it, Pier reserves the stock, and Barrow makes the invoice CSV available once the reservation is complete.

## Prepare and submit

1. Open Catalog as the customer. Review its agreed prices, available stock, per-SKU minimums and order minimum. **Refresh stock** reads Pier again.
2. Enter whole-unit quantities and an optional purchase order reference, then choose **Prepare draft**. The minimum quantities and minimum order must be met.
3. In Orders, review the lines, prices, total and payment terms. Choose **Submit for supplier review** when ready.

Orders are numbered in sequence, the next after the highest number on record (`JV-10438` is followed by `JV-10439`; a new installation starts at `ORD-10001`). The invoice number (`BAR-JV-10439`) and the demo's Pier reference follow it. Every date and time in the app reads in Eastern time, the supplier's zone, marked "ET" when your device's clock reads differently.

If a draft's prices or terms changed after it was written, it cannot be submitted as it stands. Open it in the order pad, settle the change in its row and choose **Prepare draft**: the new draft replaces the old one, which leaves Drafts and is shown only as the new order's "Replaces JV-10431" note. An agent cannot replace a draft; a person must.

A draft reserves no stock. Submission also reserves no stock. Barrow snapshots the commercial details on the order, so later account edits do not rewrite that order's agreed prices and terms.

## Approve and reserve

As the supplier, open Orders and review the submitted order. Choose **Approve & reserve stock**. The server records the approver and sends a durable, idempotent order command to the recorded Pier origin.

Open **Order history & Pier details** for preparation, submission and approval identities, approval time and Pier references.

| Status | Next action |
| --- | --- |
| `draft` | Review and submit the draft. No stock is reserved. |
| `submitted` | The supplier reviews and approves. No stock is reserved yet. |
| `reserving` | If the response is uncertain and no Pier order is confirmed, use **Retry stock reservation** on this same order. If a Pier order is known, use **Refresh stock status**. |
| `shortfall` | Resolve the shortfall and reserve the remainder in Pier, then use **Refresh stock status**. |
| `approved` | Every ordered unit is reserved. Use **Download invoice CSV**. |

Never create a second order to recover an uncertain reservation response. The retry action reuses the first order's durable Pier command ID. If the Pier session expires, reconnect Pier and recover the same order.

## Hand the invoice to accounting

Choose **Download invoice CSV** on the fully reserved order. The file contains SKU amounts, exact cents, issue and due dates based on the saved terms, and a stable invoice number. The customer can also download an approved order's invoice.

Barrow does not add or compute tax. Review tax treatment in your existing accounting system. Downloading the CSV does not collect money or mark an invoice paid. A partial reservation blocks invoice export until every unit is reserved.

An [agent credential](AGENTS-API.md) can read catalogs and prepare drafts. A signed-in person must submit; a supplier must approve.
