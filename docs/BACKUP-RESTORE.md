# Back up, restore and erase

Export Barrow's commercial records from its installation checkout. Keep the archive private: it contains business and customer data.

## Make a backup

Stop the running development or preview server before exporting. For development:

```sh
rer dev --stop
rer export --output exports/barrow.rer
```

If you started preview, stop it with `rer preview --stop` instead. Choose a new output file for each export.

Archives include accounts, agreed prices, orders, approval history, import custody and erasure journals. They exclude login identities and sessions, agent credentials, local email and private connection settings. Keep the Pier connection credentials separately in private storage.

## Restore into an empty destination

Use a new, empty checkout with the same Barrow project identity. With no development or preview server running there:

```sh
rer import --input /absolute/path/barrow.rer --yes
rer setup
rer dev
```

Complete setup, invite users again and issue new agent credentials if needed. Reconnect Pier using the [connection guide](GETTING-STARTED.md). Then open **Data → Diagnostics**: it checks Pier and lists every stock reservation or release still awaiting Pier's acknowledgment, with its command ID and the action that resumes it on the same order. **Export diagnostics** downloads that list without sessions or credentials. A restore intended for continued operation must use the same Pier origin: existing orders refuse a different one.

Import validates the archive and restores it atomically into an empty destination. It is not a way to merge into a live store. `rer reset --yes` destroys that checkout's local state, owner and settings; use an empty destination for routine restore work.

## Erase an unused account

In the supplier Data page, select the account under **Erase an unused trade account**, then choose **Review account erasure**. Check the account and type `ERASE` to confirm permanent removal.

Erasure removes the Barrow account, its retained import custody and the customer's portal access. Accounts with orders cannot be erased in this release: their commercial history is retained. Base sign-in identities, Pier records and previously downloaded files or backups have separate custody and remain.

## Respect erasure when restoring

Make a newer export after an erasure. If restoring an older archive into a fresh store, supply the later archive as its erasure journal:

```sh
rer import --input /absolute/path/older.rer --journal /absolute/path/newer.rer --yes
```

The later journal refuses the whole pre-erasure archive rather than silently bringing erased data back. It must be from the same installation. Protect and retire older backups according to your retention policy.
