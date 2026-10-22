# Retention, erasure and independent restore custody

Only the signed-in owner may verify requests, release holds or erase personal data. In **Data → Account retention and erasure**, record requester, channel, verification note and reason; preview every class and floor date; review any individually reasoned exclusions; then type ERASE. A hold permits only the separate access-revocation action. Expiry nominates owner review and never deletes silently.

Account and operator IDs remain. Buyer names/emails become non-routable placeholders, credentials are removed, the commercial account closes, and personal contacts, addresses, lists, messages, unconverted attachments and mail fields are removed or neutralized. Submitted financial evidence stays unchanged for seven calendar years from its latest financial event. After the floor, personal snapshot details are redacted by default. Explicit order deletion retains currency, total and invoice number in its receipt. No legal adequacy is asserted.

## Keep the independent journal

`deploy.json` provisions the private `ERASURE_JOURNAL` R2 binding. `wrangler.jsonc` declares the same binding for local development. This is separate from D1 and is deliberately outside a database archive. Each erasure saves a private write-ahead operation, commits the native change, import retirement, receipt and D1 journal atomically, then confirms completion in R2. Every data/auth request and cron checks this source-bound journal. D1 rewinds are re-applied before business data is served or mail is considered. An incomplete operation, missing registry, missing journal object or conflicting fingerprint pauses service with `ERASURE_RESTORE_FENCE`; it is never treated as an empty journal.

The private journal retains minimal original identity identifiers needed for re-application, not message or attachment bodies. Protect its access as carefully as the database. Never delete it while an older copy can be restored. Do not restore or replace the R2 bucket when restoring D1.

For an installation created before this binding, use the owner-only `initialize` command below once, after reviewing existing receipts. It carries previously authorized PO, application, one-user and unused-account erasures into R2 and audits initialization. A database with import history cannot initialize an invented empty journal: attach its source journal instead. With a closed serve fence, only Base’s `rer signin` owner-specific sign-in and the owner journal endpoint remain available for recovery.

## Restore an archive or D1 Time Travel

For a platform restore, retain the same R2 bucket and binding. Barrow re-applies committed later erasures before serving. If the source journal is unavailable or an intent has no atomic D1 receipt and no R2 completion marker, leave service paused; recover the complete source journal. Do not delete an indeterminate intent to make service resume. A known committed D1 receipt can repair its missing completion marker automatically.

For an archive into a fresh checkout, first start the empty destination and finish owner setup, attach the source’s complete **current** independent journal, then stop that owned process and run `rer import`. Restart it with the same R2 state/binding. An old archive with an explicit newer Base `--journal` checkpoint may be refused wholesale; attaching the independent source journal also protects accepted older imports by re-applying erasures before serving. Restored queued mail is never resubmitted.

The owner journal endpoint is `GET /api/barrow/erasure-journal` for a private download and `POST` for an explicit, reasoned `JOURNAL` confirmation. Buyers, admins, functional staff and agents are refused. The following tool uses a regular mode-0600 file holding an owner session’s Cookie header; it never prints the session or journal contents. Keep both files outside the checkout. For a fresh restore use an owner session from the empty destination, not a transplanted browser profile.

```sh
node scripts/erasure-journal.mjs export --origin https://SOURCE --session-file /private/source-session --file /private/current-journal.json
node scripts/erasure-journal.mjs attach --origin https://DESTINATION --session-file /private/destination-session --file /private/current-journal.json --confirm JOURNAL --reason 'Owner verified the complete current source journal before restore'
```

Existing pre-R2 installations use `initialize` instead of `attach`, with the same `--origin`, `--session-file`, `--confirm JOURNAL` and `--reason` flags. Initialization is owner-attributed and preserves the old receipts. The source’s live R2 bucket remains authoritative; obtain the latest journal again if any erasure happens after downloading a copy. Attaching an older copy never removes newer entries already present in the destination.

## Copies Barrow cannot recall

D1 Time Travel is always on, retains 30 days on paid accounts or 7 on free accounts, restores destructively and cannot be purged early. The preview/receipt shows both latest window-end dates; the independent journal prevents resurrection during those windows and afterward. Pier customer/order commands, accounting/payment systems once connected, the sign-in provider, mail-provider message IDs, mailboxes and previously downloaded files have separate custody. Barrow discloses these copies and sends no provider deletion. No provider deletion or legal adequacy is claimed.

## HTTP review commands

`GET /api/barrow/retention` returns policy, PO candidates, requests, receipts and separate custody. POST `/api/barrow/commands` with `{type,payload}`. `retention.settings` takes the current `revision`, a `days` object with `poDocuments`, `media`, `messages`, `commercialHistory`, `applicationRecords` (null or whole days 1–36500), and a reason. Missing upload age never establishes PO eligibility.

`retention.request` takes accountId, the current request revision when updating, requester, channel, verificationNote, boolean held and a reason. `retention.preview` takes accountId and makes no business change. `retention.erase-account` and `retention.revoke-access` take its accountId, accountRevision, requestRevision, policyRevision and reviewHash, with reason and confirm `ERASE`. Optional exclusions are `{id,reason}` for reviewed items; optional deleteOrderIds explicitly select only orders outside their financial floor.

`retention.erase-document` retains its existing orderId, revision, sha256, policyRevision, confirm `ERASE` and reason payload. It refuses ineligible or held documents and preserves order metadata/history. `retention.erase-application` similarly requires the current application and policy revisions and explicit confirmation. The independent R2 journal also protects these doors, unused-account erasure and one-user erasure.
