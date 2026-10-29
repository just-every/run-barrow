# Buyer-authorized sell-through planning

In Orders, open **Plan from sell-through** to authorize a normalized POS export,
choose a stock observation date, replenishment date, horizon, seasonality and
merchandise budget, and compare demand with stock and open prebooks. Edit the
chosen quantities and recalculate before accepting the exact basket for one draft.
An outage needs an explicit manual-quantity acknowledgment. The accepted plan
remains visible on the order. No external model is called and no message, payment
or stock reservation occurs when previewing or accepting a plan.

Use a current company purchaser's session at `POST /api/barrow/commands`.
Supplier identity and agent credentials cannot authorize a buyer's POS export.
The purchaser must set `authorized: true` for each calculation. This authorizes
use of the export for the calculation and retention of the accepted commercial
summary with the order, visible to its ordinary authorized readers. Raw CSV is
never retained. Preview alone writes no plan or draft.

`order.sellthrough-preview` takes this payload (add `profileId` when deliberately
selecting an approved buying profile):

```json
{
  "accountId": "cedar",
  "authorized": true,
  "csv": "sku,unit,sold,observedDays,onHand,status\nOAT-1,case,20,10,2,complete\nJAM-1,case,,10,1,outage",
  "observedOn": "2026-10-27",
  "requestedDate": "2026-11-26",
  "horizonDays": 10,
  "seasonalityBps": 10000,
  "budgetCents": 200000
}
```

Dates in the example must be updated for the actual observation. Stock must be
from the last seven Eastern calendar days and the requested date cannot be past.
The six columns are required in that order. Each entitled SKU appears once with
one defined selling unit. Sold and on-hand quantities are whole selling units;
observed days are the complete sales interval. A complete observation explicitly
reports sold units, including zero. An outage has an empty sold cell. It produces
unknown demand and no suggested quantity, rather than an estimated sales rate.
The feed is a normalized export from the buyer's POS; direct Shopify and
Lightspeed file adapters and API connections are not implemented.

For known sales, demand is the ceiling of sold units multiplied by the horizon
and the buyer's explicit seasonality factor, divided by observed days. 10000
basis points means no seasonal adjustment. This is a buyer input, not an inferred
seasonal forecast. Subtract stock on hand and every visible open commitment,
including prebooks due after the selected date. Pier supplies the remaining
unshipped, uncancelled base units of approved orders. Submitted and pending
company approvals count at their full requested quantity. Drafts are not supply.
Conversions use the catalogue's selling-unit basis. A missing live commitment
refuses planning; it never becomes zero. Purchase cadence is the mean interval
between distinct native purchase dates, or unknown with fewer than two dates.
Cadence is contextual evidence and does not silently change the buyer's horizon.
All commitment quantities, purchase dates, source references and approval guards
use the same current company rights and ship-to location scope as ordinary order
reads. Orders outside that scope contribute no data or fingerprint changes.

Review the returned explanation for every line. Add `selections`, containing
`sku`, `unit` and `quantity`, to edit quantities; zero removes a line. A positive
manual quantity for an outage also requires `acknowledgedOutage: true`. Preview
again after every edit. Stock, selling-unit rules, prices, promotions, account
minimum and the merchandise budget are checked. A blocked basket cannot be
accepted and quantities are never silently cut to fit a budget.

Call `order.sellthrough` with that exact preview payload, its `fingerprint`,
`acknowledged: true`, a unique plain `key` and an optional `reference`. Retrying
the same accepted request, including concurrent retries, returns the same draft.
Reusing a key for different input is refused. Source-order revisions, current
catalogue and account changes invalidate a previous preview. The draft records
the feed hash, dated quantities, arithmetic, native source revisions, zero paid
model cost, zero contacts and the accepting buyer. Its native run identity is
the source-bound review fingerprint; the acceptance has an attributed audit row. Existing company submission,
approval limits, supplier approval and live Pier checks remain separate steps.
Restored order history does not execute any plan or send outreach.

`order.sellthrough-outcomes` takes `orderId`. It returns one recorded acceptance,
its exact SKU and unit quantities, currency, verified principal explicitly
allocated to that invoice and Pier-dispatched base quantity. Captured but
unallocated cash is not counted as paid. Unavailable dispatch is unknown.
`deliveredQuantity` remains null: carrier delivery is not recorded and dispatch
is not delivery. The order's accepted summary is included in its scoped data
export and normal owner archive. Retention follows the existing commercial-order
policy; no raw POS file or separate external processor is introduced. An owner
reviews holds before explicit erasure. Erasure closes account access while the
submitted commercial snapshot, including the accepted plan, remains unchanged
within its seven-year financial floor. Restoring an older archive reapplies the
independent erasure journal before serving the account. Verified delivery needs
SHIP-003 and an owner-provisioned EasyPost account; no delivery receipt is claimed.

## Rep contact review

On an accepted plan, the owner, an admin or currently scoped sales staff may
choose the next contact date and explicitly review it. Use
`order.sellthrough-contact` with `orderId`, the current order `revision`,
`nextContactDate` and `acknowledged: true`. Dates are Eastern calendar dates,
today or later. This records the reviewer, time and an attributed audit event.
It changes neither the accepted basket nor the order's purchase state and sends
no message. Changing the date requires a fresh review. Buyers, agents, staff
outside sales and people outside the account scope are refused. Cancelled,
superseded and releasing orders cannot receive a new contact review. Archives
restore the recorded review without activating outreach.

Verified delivered outcomes remain unproved pending SHIP-003 and the
owner-provisioned EasyPost account named in the campaign dependency. The
normalized export door implements the other-POS-export option; native Shopify
and Lightspeed intake remain unavailable. No delivery is inferred from dispatch.
