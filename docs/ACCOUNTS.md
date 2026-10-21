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
