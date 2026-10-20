# Orders and invoice CSVs

The customer prepares and submits an order. The supplier approves it, Pier reserves the stock, and Barrow makes the invoice CSV available once the reservation is complete.

## Prepare and submit

1. Open Catalog as the customer. Review its agreed prices, available stock, per-SKU minimums and order minimum. **Refresh stock** reads Pier again.
2. Enter whole-unit quantities and an optional purchase order reference, then choose **Prepare draft**. The minimum quantities and minimum order must be met.
3. In Orders, review the lines, prices, total and payment terms. Choose **Submit for supplier review** when ready.

Orders are numbered in sequence, the next after the highest number on record (`JV-10438` is followed by `JV-10439`; a new installation starts at `ORD-10001`). The invoice number (`BAR-JV-10439`) and the demo's Pier reference follow it. Every date and time in the app reads in Eastern time, the supplier's zone, marked "ET" when your device's clock reads differently.

If a draft's prices or terms changed after it was written, it cannot be submitted as it stands. Open it in the order pad, settle the change in its row and choose **Prepare draft**: the new draft replaces the old one, which leaves Drafts and is shown only as the new order's "Replaces JV-10431" note. An agent cannot replace a draft; a person must.

### Purchase details

Under **Delivery dates & instructions** in the order pad, add an optional requested delivery date, a cancel-after date and instructions. Dates are Eastern calendar days, cannot be before today, and the cancel-after date cannot be before the requested date. In Orders, attach one PDF, PNG or JPEG purchase order (up to 1 MB) to a draft; it is locked once the order is submitted and only the buyer and the supplier can download it. Through the API, `order.prepare` also takes `requestedDate`, `cancelAfter`, `instructions` and, on each line, `buyerSku` (the buyer's own code, kept as written). Agents cannot attach or read the document.

Submitting a purchase order number already on one of this account's open orders is refused as an accidental repeat. If it is a deliberate further delivery, choose **Submit as a new release of PO …**: the order is recorded as release 2, 3 and so on, with who confirmed it. Pier receives the requested delivery date as its promise date; the other purchase details stay in Barrow.

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
| `releasing` | The order is cancelled but Pier has not confirmed the stock release. Its units stay out of every buyer's available stock. Use **Retry stock release** or **Refresh release status**. |
| `cancelled` | Pier confirmed the release. The order holds no stock and has no invoice. |

Never create a second order to recover an uncertain reservation response. The retry action reuses the first order's durable Pier command ID. If the Pier session expires, reconnect Pier and recover the same order.

## Negotiate a quote

On the order pad, enter quantities and choose **Request quote** instead of preparing a draft. The quote appears under **Quotes** on the Orders page with today's prices; nothing is reserved.

As the supplier, choose **Propose quote** (later **Revise quote**). For each line, set the quantity and optionally a quoted unit price in dollars and cents; through the API a line can instead take `discountBps` off its current price. Set the payment terms, a shipping note and the inclusive **Valid through** date (Eastern time). Any price below today's price waits for **Approve discount**, which records your reason in the audit. Until supplier roles exist, the owner or an admin proposes and approves.

The buyer chooses **Accept revision N and place order**. Only the latest approved revision is accepted, only by the account's buyer, and only through its valid-through date. Barrow first rechecks today's pricing rule, quantity rules, the account and live Pier stock. If the pricing rule behind the quote changed, ask for a revised quote. Accepting creates one `submitted` order with the quoted prices and terms; accepting again returns that same order. The supplier then approves it like any other order. Barrow does not calculate or bill freight: the shipping note is recorded on the order only.

Commands: `quote.request {accountId, lines, note?}`, `quote.propose {quoteId, revision, lines:[{sku, unit?, quantity, unitCents? | discountBps?}], validUntil, termsDays?, shipping?, note?}`, `quote.approve {quoteId, revision, number, reason}` and `quote.accept {quoteId, number}`. Read with `GET /api/barrow/quotes` and `GET /api/barrow/quotes/<id>`. Agents cannot read or change quotes. Quotes appear in the data export as `quotes.csv` and `quotelines.csv`.

## Talk through a quote

Open **Conversation** on a quote to write a message the other side reads, with one PDF, PNG or JPEG attachment up to 1 MB. Supplier staff can tick **Internal note** instead: the buyer never sees it, in the app, in a download or in their data export. Messages and notes are kept as written; nothing edits or deletes them, and writing one never changes the quote, so a revision in progress stays valid.

**Revision history** shows who proposed each revision and what it changed against the one before: lines, quantities, amounts, payment terms, shipping note and valid-through date. The buyer can accept only the latest revision; an older one they still have open is refused.

New activity shows as **N new** on the quote, for the other side only: the buyer hears of supplier messages and of a revision once it can be accepted; supplier staff hear of requests, buyer messages, internal notes and acceptance. **Mark read** clears it for everyone on your side. Until reps exist, the owner and admins share the rep's notices. Barrow does not email these notices yet.

Commands: `quote.message {quoteId, body, internal?, attachment?: {name, contentBase64}}` and `quote.read {quoteId}`. `GET /api/barrow/quotes/<id>` returns the quote with its `thread` and your unread `notices`; attachments download from `/api/barrow/quotes/<id>/attachments/<entryId>`. Entries appear in the data export as `quotemessages.csv`.

## Follow an order

Open **Order timeline** on a submitted order. It lists what Barrow recorded (submitted, accepted, allocated, backordered, cancelled) and what Pier records for the order: each dispatch as a shipment with its reference and units, and each return. Every entry shows where it came from, when, and who. Delivery, holds and closing are shown as not recorded, because no connected source reports them yet; if Pier does not answer, shipments are shown as unknown rather than guessed.

## Cancel an order and release its stock

As the supplier, choose **Cancel order & release stock** on an `approved` or `shortfall` order and give a reason. Barrow sends one Pier cancellation with the durable command ID `barrow-release-<order>` and keeps the order `releasing` until Pier confirms that every unshipped unit is cancelled and nothing is reserved. If the response is lost, **Retry stock release** repeats the same command, so Pier releases only once; **Refresh release status** reads Pier's order instead.

Until Pier confirms, the units Pier held for the order stay out of the available stock every buyer sees, even if Pier has already freed them. An order with dispatched units cannot be cancelled; arrange a return instead. Buyers cannot cancel an order themselves yet.

## Hand the invoice to accounting

Choose **Download invoice CSV** on the fully reserved order. The file contains SKU amounts, exact cents, issue and due dates based on the saved terms, and a stable invoice number. The customer can also download an approved order's invoice.

Barrow does not add or compute tax. Review tax treatment in your existing accounting system. Downloading the CSV does not collect money or mark an invoice paid. A partial reservation blocks invoice export until every unit is reserved.

An [agent credential](AGENTS-API.md) can read catalogs and prepare drafts. A signed-in person must submit; a supplier must approve.
