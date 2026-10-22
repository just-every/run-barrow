# Trade accounts and invitations

Each trade account has its own buyer email, agreed prices, minimums and payment terms. The customer signs in to see only that account's catalog and orders.

## Agree the account details

In the supplier workspace, open Accounts and choose **Add trade account**.

| Field | What to enter |
| --- | --- |
| Business name | The stockist's business name. |
| Customer email | Its buyer's email, stored lowercase. Each account needs a distinct email. |
| City and State | Optional. The stockist's town, shown beside its name in the order pad ("Palmetto & Pine · Columbia, SC"). |
| Account ID | A permanent, stable ID; leave blank to take one from the business name (`palmetto-pine`). Use the same ID in future imports. |
| Pier customer ID | The exact customer party ID from Pier. Names are not matched automatically. |
| Payment terms (days) | Whole days, from 0 to 365. Zero means due on receipt. |
| Minimum order (cents) | A whole number of cents; `15000` means $150.00. |
| Agreed prices | One line per SKU: `SKU,unitCents,minQty`, without a header. Optionally add `,casePack,increment` in base units: a quantity must then be a whole number of case packs and the minimum plus whole steps (`JV-2214-S,4800,12,6,12` allows 12, 24, 36…). An invalid quantity is refused with the nearest valid choices; Barrow never changes it for the buyer. |

For example, a price line of `JV-2214-S,4800,2` means USD 48.00 per sell unit with a minimum quantity of two. Only agreed SKUs appear in that account's catalog. Use the exact SKUs held in Pier. Quantities are whole sell units. A SKU that ends in a size (`JV-2214-S`, `JV-2214-1X`) shows in its style's row of the order pad, one column per size.

Choose **Save account**. You can use **Edit account** to update prices, minimums and terms. Existing order snapshots retain their commercial details. The account ID and buyer email cannot be changed through the editor: create a separate account for a different buyer email so existing order access cannot be reassigned.

## Send the invitation

Choose **Send invitation** on the account card. The email link takes that buyer to its own portal. A customer cannot read another account's catalog or prices. If the customer sees **Your account is not linked yet**, check that its signed-in email exactly matches the account's customer email.

Local invitations stay in the private development outbox; see [getting started](GETTING-STARTED.md) for testing the ordinary email flow in separate browser profiles. Hosted invitations use the installation's configured mail provider.

## Prepare an order together

The customer can enter quantities in Catalog. A supplier can also use **Prepare order** on the account card, or select a trade account from Orders. Both use that account's agreed prices and terms. Continue with [orders and invoices](ORDERS.md).

To add many accounts at once, use [Move in](IMPORT-ACCOUNTS.md). To remove an unused account, follow [account erasure](BACKUP-RESTORE.md).

## Billing and delivery locations

Supplier staff (Accounts) and the account's buyer (Orders) keep **Billing and delivery locations**: bill-to and ship-to addresses and contacts. The first bill-to and ship-to become the defaults; **Make default** changes that. Barrow checks the address format, the state code and that the ZIP belongs to the state; it does not verify the address with USPS or a carrier. A ship-to can carry default delivery instructions and a tax exemption reference for its own state. Barrow records the state as the tax jurisdiction and calculates no tax.

On the order pad, **Ship to** chooses a ship-to (blank uses the default). Each order keeps a copy of its bill-to and ship-to, so later edits, a new default or **Archive** never change an order. Commands: `location.save {accountId, kind, value, id?, revision?, makeDefault?}` and `location.archive {accountId, id, revision}`; read with `GET /api/barrow/locations?accountId=`. `order.prepare` takes `billToId` and `shipToId`. Locations appear in the data export as `locations.csv`.


## Rep territories and coverage

Owners, admins and all-account sales managers open **Accounts → Rep territories and coverage**. A rep holds an account only through a dated assignment (an exact account, or every account whose territory equals a named territory) or temporary coverage (an account, a territory or another rep’s whole book, with an end date). Reps read their own assignments under **Reports → Your accounts**; buyers see their current rep’s name. Transfers and endings act immediately and never rewrite earlier orders, quotes, commission snapshots or audit events; new orders freeze the fixed commission label of the single primary rep. Commands: `rep.assign`, `rep.cover`, `rep.end`, `rep.transfer`; read `GET /api/barrow/rep-assignments`.

## Approval routes and delegation

A company administrator (or the supplier) opens **Company → Approval routes and delegation**. A rule names an amount threshold and ship-to locations and lists sequential steps; each step names current company approvers and may add an escalation time with escalation approvers. The matching rule is frozen on each order or accepted quote that needs company approval; step 2 opens only after step 1, and a different person decides each step. **Delegate approval** lets one current approver act for an absent one for up to 90 days. After a step's escalation time its escalation approvers may also decide it. **Withdraw request** returns an unapproved request to a draft; a price change, an edited ship-to address or a revised quantity needs fresh approval at every step. Commands: `company.route.save`, `company.delegate`, `company.undelegate`, `order.withdraw`; read `GET /api/barrow/company/routes`.

## Visits, samples and show baskets

On the **Order pad**, **Visits, samples and show baskets** plans a showroom visit, on-site visit, trade-show appointment or call for the selected account (one you hold today), with its date, time, location and agenda. Each visit adds a next action to **Follow-ups**. During or after the visit record the buyer's notes, request samples from the account's own collection, and turn the show basket into a quote or a draft order. An owner, admin, or a sales manager or operations person with every warehouse hands the samples to inventory (operations see them under **Orders → Sample requests awaiting inventory**): Barrow places one Pier sales order for the samples and shows Pier's reservation as the acknowledgment. Commands: `visit.schedule`, `visit.record`, `visit.samples`, `visit.basket`, `visit.handoff`; read `GET /api/barrow/visits`.

## Approval notices and escalation

Company approvers see **Orders → Approvals waiting for you**: one entry for each approval step that waits for them, as the step's named approver, as the delegate of an absent approver, or as an escalation approver once the step's escalation time has passed. An entry closes when the step is decided, the request is released, withdrawn, voided by a price, address or account change, or revised, or when the person can no longer decide it. Every hour (and when an owner or admin runs `approval.escalate`) Barrow opens the notices a step now owes and, for orders waiting more than 24 hours for supplier approval, opens or escalates an overdue approval task on **Data → Next actions** with the exact blocking cause; it belongs to the owner and can be reassigned only to people who can approve. Approving the order closes it. Notices are in the app only. Read `GET /api/barrow/approval-notices`.

## Application routing and review deadlines

An owner or admin opens **Accounts → Application routing and review deadlines**. The first rule matching a verified application (requested location state, requested payment terms, expected volume, whether a document is attached) names an owner or admin reviewer, an escalation person, a deadline of one to sixty days and, optionally, a prepared missing-information request; unmatched applications use the fallback or the owner with three days. Applicants may request payment terms on the public form; the request grants nothing, and the supplier sets the account's terms when approving. Each verified application opens one owner task on **Data → Next actions**, linked to the application under **Accounts → Trade applications**, where the reviewer sees the route, people, deadline and prepared request and chooses **Use the prepared request** before sending it. Once a deadline passes with no decision the task shows as escalated to the escalation person and stays escalated, and due, through later requests, answers, next-contact changes and emails until approval, decline, the applicant's withdrawal or an explicit closure. Each staff decision (information requested, approved, declined) emails the applicant one generic status update with the new state and the application link only; the reason and request text stay in the portal behind a fresh code, and the send label is shown beside the application. Commands: `application.rules.save`; read `GET /api/barrow/application-rules`.
