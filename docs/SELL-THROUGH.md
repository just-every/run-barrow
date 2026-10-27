# Buyer-authorized sell-through planning

The current public HTTP commands calculate a replenishment draft. Orders shows
the accepted calculation in a disclosure. Interactive planning controls, rep
contact-cadence review and verified carrier-delivery outcomes remain unfinished under
AGT-004. No external model is called and no message, payment or stock reservation
occurs when previewing or accepting a plan.

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
seasonal forecast. Subtract stock on hand and every existing open commitment,
including prebooks due after the selected date. Pier supplies the remaining
unshipped, uncancelled base units of approved orders. Submitted and pending
company approvals count at their full requested quantity. Drafts are not supply.
Conversions use the catalogue's selling-unit basis. A missing live commitment
refuses planning; it never becomes zero. Purchase cadence is the mean interval
between distinct native purchase dates, or unknown with fewer than two dates.
Cadence is contextual evidence and does not silently change the buyer's horizon.

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
model cost, zero contacts and the accepting buyer. Existing company submission,
approval limits, supplier approval and live Pier checks remain separate steps.
Restored order history does not execute any plan or send outreach.

`order.sellthrough-outcomes` takes `orderId`. It returns one recorded acceptance,
its exact SKU and unit quantities, currency, verified principal explicitly
allocated to that invoice and Pier-dispatched base quantity. Captured but
unallocated cash is not counted as paid. Unavailable dispatch is unknown.
`deliveredQuantity` remains null: carrier delivery is not recorded and dispatch
is not delivery. The order's accepted summary is included in its scoped data
export and normal owner archive. Retention follows the existing commercial-order
policy; no raw POS file or separate external processor is introduced.
