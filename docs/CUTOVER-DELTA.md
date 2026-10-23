# Cutover delta and merchant SFTP bridge

The signed-in owner opens **Move in → Delta cutover and feed rehearsal**. This is an explicit, owner-operated migration bridge. Pier remains the live stock/reservation authority. The supplied incumbent and accounting source retain authority for their declared historical open orders and receivables. It does not implement the full scheduled inventory connector in INT-020.

1. Supply the workbook and ledger formats in [CUTOVER.md](CUTOVER.md), name existing native accounts and the incumbent responsible system, and explicitly pause new order entry for that scope. Rehearsal retains the seven source categories in an isolated dataset. It changes no native order, reservation, invoice, payment, reminder or invitation.
2. Supply a complete delta export. Stable category/source IDs identify changes, including an order edited at source. Review the before/after fields, citations, quantities, per-currency cents and native comparison. Correcting mappings preserves the already recorded source delta. Every source revision and its original bytes remain in custody.
3. Repoint a merchant ERP's export job at a merchant-hosted SFTP server. Configure distinct absolute import, order-export and acknowledgment directories, a pinned OpenSSH `SHA256:` host-key fingerprint, a server credential reference, exact column mappings and a saved named confirmation CSV layout. Rehearsal reads source files only. It writes no order file.
4. Review every source order/invoice's responsible system, differences and missing releases. Sign the exact source/feed fingerprint and UTC cutoff. Source product case packs and increments apply only to matching native price-book SKUs whose unit exactly matches live Pier. No unit conversion is inferred. Native orders already present at sign-off are excluded even if a cutoff timestamp is earlier. New order entry opens only after sign-off and the cutoff time.
5. After a buyer submits a genuinely new order and a person approves it with a confirmed Pier reservation, explicitly run delivery. The bridge freezes the exact native and accepted-confirmation revisions, named layout and bytes before network IO. A durable destination-bound identity and stable filename accompany the chosen layout's columns. Historical records and pre-cutoff drafts/orders are excluded. Native mutations and rollback refuse while a destination run is in flight.
6. A missing file is resent with its original identity, filename and bytes. A directory pickup/removal alone is never evidence of success. Only an exact processed acknowledgment closes the handoff. Wrong identity/revision, changed native orders and conflicting destination bytes remain visible exceptions.
7. Rollback stops future bridge delivery and explicitly resumes native Pier-only order entry. Source originals and external responsibility remain. An unchanged case-pack mapping without a later native dependency can be reversed. Later account edits, orders, confirmations, reservations and shipments are preserved with record-specific dispositions. Restored sessions are inactive; they cannot resume exchange automatically.

## Merchant-held connection credentials

Configure the optional private `BARROW_SFTP_SECRETS` binding during deployment. It is a JSON object keyed by the credential reference entered in the UI. Each value contains a `password`, or a PEM `privateKey` and optional `passphrase`. Credential material is read only by the connection boundary. Never put it in the feed settings, source file, browser form, audit reason or archive. A restore requires re-entering the private binding and explicit owner review; no connection can resume merely by restoring data.

Demo installations refuse merchant SFTP connections before credential lookup or network contact. Connections require the owner-supplied server public-key fingerprint. The connector does not silently accept changed hosts. Connection errors are sanitized and transfers/listings have bounds and deadlines.

## Native CSV layouts

Files are UTF-8 RFC 4180 CSV. The import directory contains `products.csv`, optional `customers.csv`, and `ats.csv`. Saved mappings select the exact source headers; these native layouts do not claim NuORDER template compatibility.

| File | Default headers | Rehearsal effect |
| --- | --- | --- |
| products.csv | sku,name,unit,casePack,increment | Isolated product rows; positive whole packs/increments, matching stock-unit code required at cutoff |
| customers.csv | accountId,name | Isolated rows limited to the exact native account scope |
| ats.csv | sku,warehouse,available,observedAt | Isolated nonnegative whole ATS evidence, explicit source observation time; incoming date unknown |

Each file is at most 128 KiB and 1,000 rows. File content and category define its stable identity. Identical replay does not add another row, receipt or approval revision. Changed mappings/products cause dependent rows to be revalidated. Valid rows remain visible, and malformed rows carry original row number, error, receipt and owner. Any unresolved row error blocks cutoff sign-off. The custody limit is 768 KiB of retained SFTP source bytes per session.

Order files are native CSV named `barrow-<identity>.csv`. They are written to a temporary name and renamed after the write. Metadata columns identify the delivery, native order/revision and confirmation revision; selected named-layout columns retain their chosen order and exact immutable values. A run admits at most 20 new deliveries and reports additional pending work.

The acknowledgment directory accepts `<order-filename>.ack.json`:

```json
{"identity":"<delivery identity>","orderId":"<native order>","orderRevision":"<frozen native revision>","status":"processed"}
```

Alternatively, `<order-filename>.ack.csv` has exactly the headers `identity,orderId,orderRevision,status` and one corresponding `processed` row. Acknowledgments are retained remotely for replay-safe reconciliation.

## Custody and remaining connector work

Only the signed-in owner can read or mutate these sessions or export their original bytes. Owner JSON/CSV and full archives preserve source revisions, mappings, feed reports and delivery evidence. Account erasure retires the entire shared original/feed custody unit, including all prior delta revisions, while retaining opaque fingerprints and attribution. Erasure refuses during an active destination lease.

Conservative default pending ct approval: owner-only, separately consented rehearsal/cutoff/delivery/rollback; mandatory pinned host trust and server-held credentials; source systems retain historical authority and Pier retains native stock authority; no automatic outbound delivery or replay after restore. MOVE-008 remains partial while that policy is pending. Full scheduled imports, NuORDER's unchanged standard templates, live feed ATS authority/freshness, wider product/customer/location/price imports, order-edit/cancellation/shipment exchange and all other INT-020 inherited obligations remain INT-020 work. ORD-011/016 accepted-order edits still require Pier's missing edit command; this bridge does not claim them.
