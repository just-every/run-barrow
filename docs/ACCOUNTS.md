# Trade accounts and invitations

Each trade account has its own buyer email, agreed prices, minimums and payment terms. The customer signs in to see only that account's catalog and orders.

## Agree the account details

In the supplier workspace, open Accounts and choose **Add trade account**.

| Field | What to enter |
| --- | --- |
| Business name | The stockist's business name. |
| Customer email | Its buyer's email, stored lowercase. Each account needs a distinct email. |
| Account ID | A permanent, stable ID; leave blank to generate one. Use the same ID in future imports. |
| Pier customer ID | The exact customer party ID from Pier. Names are not matched automatically. |
| Payment terms (days) | Whole days, from 0 to 365. Zero means due on receipt. |
| Minimum order (cents) | A whole number of cents; `15000` means $150.00. |
| Agreed prices | One line per SKU: `SKU,unitCents,minQty`, without a header. |

For example, a price line of `JV-2214-S,4800,2` means $48.00 per sell unit with a minimum quantity of two. Only agreed SKUs appear in that account's catalog. Use the exact SKUs held in Pier. Quantities are whole sell units. A SKU that ends in a size (`JV-2214-S`, `JV-2214-1X`) shows in its style's row of the order pad, one column per size.

Choose **Save account**. You can use **Edit account** to update prices, minimums and terms. Existing order snapshots retain their commercial details. The account ID and buyer email cannot be changed through the editor: create a separate account for a different buyer email so existing order access cannot be reassigned.

## Send the invitation

Choose **Send invitation** on the account card. The email link takes that buyer to its own portal. A customer cannot read another account's catalog or prices. If the customer sees **Your account is not linked yet**, check that its signed-in email exactly matches the account's customer email.

Local invitations stay in the private development outbox; see [getting started](GETTING-STARTED.md) for testing the ordinary email flow in separate browser profiles. Hosted invitations use the installation's configured mail provider.

## Prepare an order together

The customer can enter quantities in Catalog. A supplier can also use **Prepare order** on the account card, or select a trade account from Orders. Both use that account's agreed prices and terms. Continue with [orders and invoices](ORDERS.md).

To add many accounts at once, use [Move in](IMPORT-ACCOUNTS.md). To remove an unused account, follow [account erasure](BACKUP-RESTORE.md).
