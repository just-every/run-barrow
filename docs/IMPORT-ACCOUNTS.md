# Move in your trade accounts

Use Move in to bring existing trade accounts and agreed SKU prices into Barrow. A dry run shows the proposed changes before you apply them.

## Prepare the CSV

Open Move in and choose **Download example CSV**, or create a UTF-8 CSV with this exact header:

```csv
accountId,name,email,pierCustomerId,termsDays,minimumCents,sku,unitCents,minQty
trade-river,River Grocer,buyer@river.example,pier-river,14,10000,APPLE-BOX,2500,2
trade-river,River Grocer,buyer@river.example,pier-river,14,10000,PEAR-BOX,3000,1
```

These rows illustrate the format. Replace the account details, Pier IDs and SKUs with your real records before ordering.

To carry each stockist's town, add two columns at the end of the header, `,city,state`, and fill them on every row of that account (or leave both empty).

Repeat the account details for every SKU price, with each SKU appearing once per account. Repeated account fields must agree. For an account without prices, leave `sku`, `unitCents` and `minQty` empty. Use stable non-email account IDs, exact Pier customer IDs and lowercase emails. No customer matching or guessing occurs. An existing account's buyer email cannot be reassigned by an import.

Money uses nonnegative integer cents; quantities are positive whole units. Decimal prices, currency symbols, signs, exponents and leading zeros are rejected. Files are limited to 256 KiB, 1,000 account/price rows and 200 distinct accounts, with at most 200 prices per account. See the [complete CSV contract](MOVE-IN.md) for validation rules.

## Review and apply

1. In **1. Add your CSV**, choose a file or paste its contents into CSV source. If you supply a source namespace, keep it unchanged when resuming.
2. Choose **Run dry run**. Review the counts, diagnostics, planned account changes and reviewed fingerprint in **2. Review & apply**. A dry run does not write account changes.
3. Choose **Apply reviewed import** only when the plan is right. Barrow rebuilds the plan and refuses a changed file, fingerprint or account snapshot. Existing agreed prices and terms may be updated.
4. Each request applies up to ten accounts. If work remains, choose **Resume apply** until the job is completed. Keep the exact CSV and fingerprint. Repeating the approved request resumes its existing durable job.

If a request fails, read the conflict before deciding what to do. Earlier successful batches remain saved. A partial apply is not silently rolled back.

## Inspect, resume or undo

In History, use **Refresh journal**, then **View** beside a job. The journal shows progress, retained source and undo information. A resumable job can use its retained original CSV; if that original is unavailable, journal-based resume is refused.

Undo restores the before-images of a completed import where it is safe. Review the journal before confirming **Undo import**, and resume an undo if its state is still `undoing`. Later native edits are preserved and can block reversal. Orders that reference imported accounts block undo. Undo a newer import before its predecessor.

The import creates accounts and prices only. It sends no invitations, creates no orders and makes no Pier stock mutations. Invite buyers from [Accounts](ACCOUNTS.md) after reviewing the imported records.
