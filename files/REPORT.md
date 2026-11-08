# sx-barrow-bar002-1 — BAR-002 date-dependent test failure

Repository: just-every/run-barrow. Product branch: cloud/sx-barrow-bar002-1.

cause = the PDF test reader matched binary stream boundaries with a newline regex. On the failing invoice date, the cancelled USD invoice's first-page Flate stream ends in the Adler-32 byte 0x0d; the regex consumes that payload byte as the CR in CRLF before endstream. inflateSync then reports a truncated stream, which the catch silently ignores, so the reader loses page one and fails the unchanged invoice-number assertion. fix = parse declared-length PDF streams through pdf-lib, decode their declared filters without swallowing errors, and extract actual page contents in page order. A deterministic regression creates a valid compressed first-page stream ending in CR and requires identical complete text and page count.

The assertion is at tests/api/invoice-documents.mjs:42 in the baseline; the failing call is the corrected/cancelled invoice download at baseline line 135, invoked by the BAR-002 test. This is a test extraction defect, not an AUD conversion, exchange-rate provider, expired fixture, or stock/invoice eligibility defect. The failing invoice itself is USD. The public PDF retains its header when decoded at its declared length.

## Source comparison and scope

Main at clone and first refresh is a465fabc8b49b48e532a02f3364e3bf51373ffb3, exactly the last known-green commit. There are no later main commits to bisect. Its unchanged physical tests/api/order-guarantee.test.mjs reproduces the historical failed-job assertion. The failure depends on the rendered supplier-calendar date changing the compressed bytes, rather than the host timezone itself.

Historical log read once: run 42426600897, job 128566138413, using gh run view 42426600897 --job 128566138413 --repo just-every/run-barrow --log-failed. No CI dispatch or rerun is used.

Only tests/api/invoice-documents.mjs and the regenerated sources.lock.json are intended product changes. No existing assertion is removed, skipped or loosened. All glyph-outline, Unicode, human attribution, exact money/currency/date/terms, invoice eligibility, idempotent Pier handoff, permission/refusal, cancellation, erasure, and restore assertions remain. The added regression checks all extracted text and pages. No top-level test is added. No workflow or CONTRACT.md edit is made; no generated view is committed.

Contract before and after: 154 clauses; 72 done, 44 partial, 38 missing. Published clauses: 6 done, 0 partial, 0 missing. BAR-002 remains done. Clause status, gap and evidence changes: none.

## Reproduction and validation

The supplied toolchain shim is sourced for each checkout shell; the installed pinned Node 22.20.0 is placed first for clock experiments and final checks, with pnpm 10.12.4. The initial real-clock unchanged-main reproduction used the VM Node 24.19.0 and failed with the identical leaf; all date/timezone comparisons use Node 22.20.0, matching CI.

Pier remains the real pinned Worker at 60fde60ffa1f44c2ae6a3ef47225117f36cf546a. Its source was obtained only through gh api repos/just-every/run-pier/tarball/<revision>, extracted without a Git clone, and selected with BARROW_PIER_SOURCE. No sibling repository was changed or pushed.

Clock experiments load clock-hook.mjs with node --import. It supplies the existing installation({clock}) test-harness hook, including Pier's harness clock, without changing the process/auth clock or system time. Both tests execute the physical .mjs test entry with a 240-second bound and serial execution. The hook is evidence only and is not committed to the product branch.

Before fix, on main/known-green a465fabc:

| Business clock | TZ | BAR-002 pass/fail |
| --- | --- | --- |
| 2026-11-07T01:00:00Z | UTC | 1 / 0 |
| 2026-11-07T01:00:00Z | Australia/Sydney | 1 / 0 |
| 2026-11-08T00:00:00Z | UTC | 0 / 1 |
| 2026-11-08T00:00:00Z | Australia/Sydney | 0 / 1 |

The baseline clock receipt and actual TAP logs preserve these results. On the captured failed PDF, the first stream declares 1513 bytes while the regex extracts 1512; its last six actual bytes are ff00c186a60d. zlib decompression fails on the extracted bytes and succeeds on the declared-length bytes. The byte-analysis report and synthetic downloaded PDF are included.

Final clock matrix, deterministic regression, shard/typecheck receipts, exact product SHA, push custody and exact-SHA Verify are recorded below when complete.

## Publication boundary

Fleet reports, probe hooks and receipts are outside the product checkout. Explicitly selected public-safe evidence is published only through refs/heads/evidence/sx-barrow-bar002-1. Product READY and evidence transfer are separate. The Mac lander retains its required full publication scan and landing checks; this cloud task does not land or push main.

## Completed local clock and regression results

After fix, each of the four matrix cases passes BAR-002 (1 passed, 0 failed, 0 skipped per run). Both fake dates are proved in both UTC and Australia/Sydney. The exact order-guarantee test file and all 37 pre-existing assertion lines in invoice-documents.mjs are unchanged. The deterministic CR-tail regression fails with the baseline reader (expected exit 1) and passes with the corrected reader (exit 0), using the attached synthetic retained AUD PDF as its input. The same regression also runs against the native multi-page Unicode invoice inside every BAR-002 journey.

Source lock regeneration and its check pass. Only the test helper's one SHA-256 entry changes in sources.lock.json. The full barrow-1 command is `nice -n 15 timeout 1200 node scripts/verify-ci.mjs barrow-1`, under cloud_run and the pinned Node/pnpm toolchain. It includes contract-docs check, first-party command check, real app build, typecheck, deployment-spec freshness, source-lock and offline Base-copy integrity checks, API batches 9/16, 15/16 and 6/16, the run-site build and site test. Its actual full log and timestamped exit receipt are retained.

## Product custody

Product commit: 5f9209f03c22eb679f396b03f96e97fa79095814. Branch: cloud/sx-barrow-bar002-1. Base refreshed immediately before publication: a465fabc8b49b48e532a02f3364e3bf51373ffb3; rebase onto current origin/main reported up to date. The outgoing identity and complete commit message were inspected; author and committer are Run Edit Run fleet <fleet@runeditrun.com>, with no trailers. The initial auxiliary machine audit treated the empty trailer output as a non-coauthor line; its blank-line handling was corrected and the identity audit passed. The required raw identity/message review had already confirmed the allowed identities and absence of trailers before the guard push. No product commit or history was changed by that audit correction.

The product push guard succeeded on attempt 1. Product branch pushed once. No force push, main push, empty commit, workflow edit, dispatch or rerun occurred. No PR is required by this repository's provided landing rules, so none was opened. The fleet owns publication scanning and landing; this is a candidate handoff.

The local barrow-1 shard passed 26/26 tests across its three API batches and site test, with 0 failures and 0 skipped tests. Exact-SHA Verify will be attached as its own actual REST receipt.

The attached failing PDF, decoded with the corrected reader, has 3 pages and retains `Invoice BAR-ORD-10001`, `Status: withdrawn; original preserved with linked credit`, `Issue date: 2026-11-07`, `Due date: 2026-12-07`, `Currency: USD`, and the exact invoice total 157906 minor units. This independently confirms the lost first page was an extraction error and that the legacy-AUD suspicion was incidental.

Public evidence hygiene: the historical failed-job log omits GitHub step environment blocks; the original remains outside the packet. The actual assertion, stack and preceding test output are retained without alteration. No environment dump is selected for transfer.

## Final exact-SHA outcome

Verify run 42430406986 completed successfully on 5f9209f03c22eb679f396b03f96e97fa79095814: https://github.com/just-every/run-barrow/actions/runs/42430406986. Its actual REST receipt matches this full SHA. One watcher made 4 run reads, each at least 300 seconds apart; the total GitHub command budget used is 6/10, including the one historical failed-job archive read and the pinned Pier archive. No failing-job retry, workflow dispatch or rerun was needed.

All requested local proof is complete: four corrected clock/timezone runs passed; the baseline comparison passed at the earlier date and failed at the later date in both zones; the deterministic stream-boundary regression fails with the old reader and passes with the fix; full barrow-1 passed 26/26, including typecheck and source-lock checks. No assertions were loosened or skipped. Before/after clause counts remain 72 done / 44 partial / 38 missing / 154 total; BAR-002 remains done and no clause judgments changed.

Product blockers: none. Product READY is separate from evidence publication and from the fleet Mac's required publication scan and landing. This cloud has not landed the candidate or pushed main. The complete explicitly selected packet is transferred on the separate evidence ref; the terminal response names its exact ref and head.

READY branch=cloud/sx-barrow-bar002-1 head=5f9209f03c22eb679f396b03f96e97fa79095814
