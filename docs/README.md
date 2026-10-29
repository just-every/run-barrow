# Barrow guides

Take a stockist's order from its agreed price list to an invoice CSV. Barrow keeps the commercial details; [Pier](https://github.com/just-every/run-pier) holds and reserves the stock.

## Start with one stockist

1. [Get Barrow running and connect Pier](GETTING-STARTED.md).
2. [Add a trade account and invite its buyer](ACCOUNTS.md).
3. [Prepare, submit and approve the first order](ORDERS.md).

## Bring your existing work

- [Move in trade accounts and agreed prices](IMPORT-ACCOUNTS.md): review a CSV dry run, apply it and inspect or undo its journal.
- [Back up, restore and erase unused accounts](BACKUP-RESTORE.md): keep commercial records portable and respect later erasures.
- [Let an agent prepare drafts](AGENTS-API.md): use a revocable credential while people retain submission and approval.

## Keep the boundaries clear

Barrow stores money as integer cents and quantities as whole sell units, and labels amounts with their ISO currency code. Account price books and new orders use the selected USD, CAD, EUR or GBP currency; legacy accounts default to USD. Whole-unit quantities multiplied by integer cents need no rounding; transaction amounts are never converted; dated USD reporting references remain separate. The invoice CSV's currency column reads the currency the order recorded: `USD`, `CAD`, `EUR` or `GBP` for orders prepared now, `AUD` for records written before orders carried a currency. Restoring those older records preserves their original cents and AUD labels in both Orders and the CSV. Stock shown in a catalog is an observation; Pier reserves it after supplier approval. An invoice CSV is available only when every ordered unit is reserved.

The CSV is a handoff to your accounting system. Barrow does not calculate tax, collect payment or mark invoices paid. Review the tax treatment in your accounting system.

For implementation details, see the [CSV format and import contract](MOVE-IN.md) and [source lineage](SOURCES.md). The [repository README](../README.md) also covers deployment and development.

## Account lifecycle and recorded assignments

In Accounts, an owner or admin records the sales channel, territory, rep and catalog references, provider references, and active/on-hold/closed state. These references describe existing assignments; they do not grant additional portal access. Agreed SKUs still determine the account assortment. Older accounts without a state remain active.

On hold and closed stop new drafts, submission and the first supplier approval. Buyers keep their existing history and invoice downloads. A reservation already approved before the account changed can still be retried or reconciled with its original command identity. Reopening an account does not refresh old drafts: prepare a new draft against its current revision.

A matching company name (Unicode-normalized, case-insensitive, with repeated spaces collapsed) or Pier customer ID requires a review of the matching account IDs and revisions. Confirm separate companies before saving; this never merges their sign-ins or history. Duplicate email ownership remains refused. Move in shows possible duplicates in its reviewed preview, and applying that exact fingerprint records the review with its actor and time. CSV updates preserve existing lifecycle and profile fields that are absent from the CSV format.

See [Seasonal line sheets and retail prices](LINE-SHEETS.md) for recipient shares, size runs, fixed assortments, price display preferences and buyer engagement.

See [Dated books and currency](PRICING.md) for scheduled revisions and frozen USD reporting references.

## Put Barrow online

[Hosting](/docs/hosting) explains Assisted setup and deployment to your own Cloudflare account.
