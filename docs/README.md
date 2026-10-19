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

Barrow stores money as integer cents and quantities as whole sell units, and shows amounts in US dollars. The invoice CSV's currency column reads the currency the order recorded: `USD` for orders prepared now, `AUD` for records written before orders carried a currency. Stock shown in a catalog is an observation; Pier reserves it after supplier approval. An invoice CSV is available only when every ordered unit is reserved.

The CSV is a handoff to your accounting system. Barrow does not calculate tax, collect payment or mark invoices paid. Review the tax treatment in your accounting system.

For implementation details, see the [CSV format and import contract](MOVE-IN.md) and [source lineage](SOURCES.md). The [repository README](../README.md) also covers deployment and development.
