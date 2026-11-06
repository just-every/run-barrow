# sx-barrow-c-f73: retained invoice PDF handoff

Repository: just-every/run-barrow
Branch: cloud/sx-barrow-c-f73
Product head: 4b193fde21ffd691dbee7b4ec1b892ff47d98a6f
Base main: 297b78740b0037045e0da786340b24bb8079ca57
Save: 34c17f24820d1a30307bd5cb458203ac0c33741f, pushed with skip CI.
No PR was created: Verify has a branch-push entry point. Main was never pushed or advanced.

PAY-008 remains PARTIAL → PARTIAL. Counts remain 73 DONE, 44 PARTIAL, 37 MISSING, 154 clauses. Only PAY-008's plan evidence and remaining-work row needs updating. No acceptance sentence, unrelated judgment, homepage, workflow or Base pin changed. The current checkout's existing RER pin was retained.

The assigned native PDF slice is complete. It cannot complete PAY-008: the accounting sandbox, verified tax, accounting-controlled issue and void, eligible split-shipment and tracked PDF-delivery acceptance remain outside the admitted slice. TAX-001 and TAX-002 accounts are not held; TAX-003 and TAX-004 remain ct-held. ORD-009 retains its connected Pier edit prerequisite; INT-002 and INT-003 retain accounting-authority obligations. All feeder, account, ct, device and DATA-003 financial-floor and name-only-erasure holds remain.

## Plan and result

1. Mapped the complete clause and existing CSV, order, confirmation, staff, company and retention doors. Existing native eligibility already refuses pending and incomplete reservations. Current finance admission already distinguishes people, functional staff, company purchasers and agents.
2. Added a shared invoice eligibility check and a deterministic read-only PDF projection. Both formats retain the original invoice identity, buyer, PO, selling quantities and units, ISO currency, integer minor-unit lines and total, dates, terms and recorded freight. Seller identity comes from the order's buying-profile snapshot or retained accepted confirmation, never current settings. Unknown fields remain unrecorded; tax is explicitly not calculated.
3. Added an Orders PDF link beside the existing CSV download. The PDF embeds licensed Noto Sans, preserves tested accented Latin, Greek and Polish identities, wraps measured text at word boundaries and paginates long invoices. It creates no invoice, legal issue, void, payment, reservation, ledger entry or delivery. CSV retains its existing columns and adds explicit retained terms, addresses, tax status and delivery components.
4. Extended the existing order-guarantee registration and the existing seasonal-confirmation browser registration through helper modules. No registration or existing assertion was removed, narrowed, skipped or moved behind a width condition. Direct registrations remain 152 API and 46 browser; the existing seed cap remains 200. No cap increase or test deletion was made.
5. Updated PAY-008 Evidence and Gap and the existing Orders documentation. Contract write and check passed with unchanged counts, then both generated view files were restored from origin/main and excluded from commits. The source lock was generated last and its check passed. Every parent Status ID and table-row count was retained in both commits.
6. Re-fetched main and merged it after the published save; main had not advanced at the pre-push fetch. Ran touched proof, typecheck, first-party and mechanical checks, inspected every candidate identity and message, and pushed only the named product branch using the fleet guard. Evidence is returned independently on the evidence ref. Publication scan, guarded landing and Run site remain the Mac lander's responsibility.

## Actual local validation

The final API and browser runs executed the final product head. The production build contains the final product code; later changes were documentation and test coverage. Detailed actual outputs are selected in this packet.

- `node --test --test-concurrency=1 tests/api/order-guarantee.test.mjs`: exit 0; one existing registration, 83.2 seconds. It includes the native PDF helper, real pinned Pier reservations, lost acknowledgment recovery, shortfalls, both currencies, current commercial edits, two retained seller sources, refusals, cancellation credit, reviewed erasure and later-journal restore.
- `timeout 1200 node --test --test-concurrency=1 --test-name-pattern='buyer books a spring season' tests/journeys/confirmations.test.mjs`: exit 0; one existing registration, 43.3 seconds. The new helper uses actual built Orders pages and downloads; assertions run at 1440, with final USD and AUD cards captured at 1440 and 390. Chromium used the system executable with no sandbox. Browser contexts and processes closed through their registered teardown.
- `npx -y @runeditrun/rer build`, through cloud_run: exit 0. No tests were added to the build.
- `pnpm run typecheck`: exit 0.
- `pnpm exec rer check --profile first-party`: exit 0.
- `node scripts/contract-docs.mjs write` followed by `check`: both exit 0; 73 done, 44 partial, 37 missing, 154 total. The generated views were restored afterwards, as required.
- `node scripts/edition-authoring/cli.mjs lock` followed by `check`: both exit 0; the actual lock-check result is included.
- Migration ledger: not applicable; no migration was added or edited.
- Changed-file local publication hygiene inspection: zero findings. This is not a complete full-history publication scan. The cloud route delegates that scan to the guarded lander.
- Independent `pdftotext` extraction and rendered first-page inspection confirmed actual embedded Unicode text, legible wrapping and pagination. This supplements the committed content-stream and character-map assertions.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock then check exit=0; views=node scripts/contract-docs.mjs write then check exit=0; ledger=none exit=0.

Initial local proof corrections were limited to test fixtures: trim a long buyer name to meet native input validation, select the named CSV download when another existing link shares its URL, and expect the existing not-found response after staff revocation. No production admission or test guard was weakened. Two temporary command-line test attempts inherited an unsuitable module-input mode and were stopped by their known process IDs; the normal file-based runners passed. Browser runs emitted local TLS certificate-probe diagnostics but completed successfully. No CI repair round has been attempted.

## Public-door probes and fixed rubric

R1 — MET locally: authorized retained documents and exact money. `tests/api/invoice-documents.mjs:22` and `:64`; `tests/journeys/invoice-documents.mjs:19`.
PROBE PAY-008 documents: native buyer HTTP downloads and built Orders links for twelve acknowledged lines → PDF and CSV, three PDF pages, original number, tested Unicode seller and buyer identities, dates, Net 30, selling units, exact 157906 total minor units and recorded 1750 delivery minor units (1500 freight and 250 handling).

R2 — MET locally: retained revision after current edits. `tests/api/invoice-documents.mjs:97` and `:104`; `tests/journeys/invoice-documents.mjs:35`.
PROBE PAY-008 immutability: change current account name, prices, terms, billing address, item description, shipping settings, seller identity, brand seller and buying-profile pricing → original PDF and CSV bytes unchanged, original orders and acknowledged Pier records unchanged.

R3 — MET locally: legacy and unknown fields. `tests/api/order-guarantee.test.mjs:18` and `tests/api/invoice-documents.mjs:116`.
PROBE PAY-008 legacy: historical archive record without a currency snapshot → original AUD amounts and dates; absent seller stays Not recorded; tax stays explicitly not calculated. Historical records are the only direct database fixture because native commands cannot recreate pre-currency records.

R4 — MET locally: native eligibility. `tests/api/order-guarantee.test.mjs:18` and `tests/api/invoice-documents.mjs:55`.
PROBE PAY-008 eligibility: draft, lost-acknowledgment pending reservation and actual source-confirmed shortfall → both document formats refused with 409; fully acknowledged retry → one original Pier identity, eligible invoice and downloadable PDF.

R5 — MET locally: current person and finance authority. `tests/api/invoice-documents.mjs:79`.
PROBE PAY-008 authority: entitled buyer and activated account-scoped finance staff → same PDF bytes; foreign company → 404; operations, purchaser without finance and agent → 403; signed-out person → 401; revoked finance → 404 for both formats. The existing native responses remain unchanged.

R6 — MET locally: cancellation and correcting credit. `tests/api/invoice-documents.mjs:120`.
PROBE PAY-008 cancellation: confirmed cancellation without credit → PDF 409; explicit native cancellation credit → original 157906-minor-unit invoice retained and marked withdrawn with linked credit, without a new invoice or altered original line basis.

R7 — MET locally: reviewed erasure and restore. `tests/api/invoice-documents.mjs:125`.
PROBE PAY-008 erasure: owner-reviewed erasure and later-journal import of the earlier archive → prior buyer session refused, required financial invoice bytes retained for authorized owner access, legacy document retained, no resurrection of the erased buyer's access. This does not claim provider erasure or close DATA-003's remaining name-only gap.

R8 — MET locally: no download effects and visible download controls. `tests/api/invoice-documents.mjs:67` and `:103`; `tests/journeys/invoice-documents.mjs:19`.
PROBE PAY-008 effects: repeated native and built-page downloads → unchanged original order and Pier records, no extra mail delivery, same invoice identity and bytes. Both formats have labeled links; the touched cards have no unlabelled icon-only controls and no horizontal overflow at the captured widths.

R9 — UNMET-EXTERNAL: complete clause acceptance. The connected accounting and verified-tax sandbox journey, eligible split shipment, tracked PDF delivery, accounting-controlled issue and void, and one accounting invoice ID are not claimed. Full freight and tax cases remain owed. No provider credential was sought or substituted.

## DONE-RIDERS review

No DONE claim or ct judge request is made. These rows record the applicable proof and remaining boundary.

| Row | Result | Evidence or boundary |
| --- | --- | --- |
| 1 | Partial overall; slice passes locally | R1–R8 perform the assigned outcomes through HTTP and built pages. R9 and exact-SHA CI remain separately identified. |
| 2 | Pass for assigned dangerous paths | Populated real native orders; allowed finance downloads and actual unsafe refusals, retained integer money, unchanged records, cancellation and erasure. API helper lines 64–131. |
| 3 | Expected generated-view failure; runtime CI deferred | Existing API shard loads order-guarantee; Verify barrow-6 invokes the existing seasonal registration including the browser helper. CI provenance is in ci.json and receipt.json. |
| 4 | Pass locally | Final-head API and browser commands completed. Production build code equals the final head; no product-code edit followed the build. |
| 5 | Unchanged | PAY-008 already names BAR-002 snapshots, acknowledged handoffs and eligible quantities and MOVE-007 reconciliation. No new inherited duty is claimed complete. |
| 6 | Pass for honest partial status | Gap names the external and full-clause remainder; generation and check passed before the mandated view restoration. Global ct judgment provenance was not overwritten. |
| 7 | Pass | No acceptance point or identifier changed; every parent Status row retained. |
| 8 | Pass for assigned authority | Native buyer and current scoped finance served; operations, non-finance purchaser, foreign company, agent, signed-out and revoked staff refused. |
| 9 | Pass boundary | No tax, carrier, accounting sandbox or provider erasure completion is claimed. |
| 10 | Not applicable | Existing native authority and retention policy reused; no custody, consent, spending or authority default introduced. |
| 11 | Pending guarded lander | No main equality, Run site success or COMPLETE full-history scan is claimed from cloud. |

## Handoff and custody

The product branch contains only product, contract, documentation, dependency and generated source-lock changes. ACCEPTANCE.md and docs/CLAIMS.md are not committed. Reports, logs, receipts, downloads and browser captures remain outside the product tree and are published only to the task's separate evidence ref. No credentials, environment dumps, private held-out gate material or symlinks are selected.

The exact-SHA CI result and evidence transfer identity are recorded when publication completes. Product custody and evidence custody are separate; the evidence ref does not mean READY, DONE, accepted or landed. The existing guarded lander must perform its complete publication scan and exact-SHA verification, regenerate views at landing and validate Run site.

After the candidate push, remote main advanced to `7f9f666c0fa53f81729bdb99e74e5834f3263ca4`. The pushed candidate was preserved. The guarded lander owns integration and fresh gates for that later main; no main-equality claim is made.

## Final exact-SHA CI observation

Verify run 42224331045, event push, head 4b193fde21ffd691dbee7b4ec1b892ff47d98a6f, completed with conclusion failure: https://github.com/just-every/run-barrow/actions/runs/42224331045 . The plan passed; each shard failed its first project verification step. The shard commands all begin with `node scripts/contract-docs.mjs check`. The failed archive for barrow-6 job 127913957870 reports exactly: `Error: ACCEPTANCE.md is stale; run node scripts/contract-docs.mjs write.` The verify summary fails because the shards failed; proof jobs were skipped.

The same command on the committed candidate exits 1 with that exact stale-view error. The earlier local write and check both exited 0, after which the views were restored from main as explicitly required. The provided generated-view exception applies. No generated view was committed, no workflow was changed, no CI rerun or dispatch was performed, and no production repair round was attempted. This is not a claim that the candidate's product tests ran in CI: they passed locally; the guarded lander must regenerate the views and obtain fresh exact-SHA proof.

Five GitHub budget calls were used: the pinned Pier archive, initial exact-head run discovery, discovery after 301 seconds, completed-run job listing, and one failed-job archive read. The ordinary product and evidence Git transports are separate.
