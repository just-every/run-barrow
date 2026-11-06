# sx-barrow-c-f75 — INT-003 gate repair

Candidate: 91bbcc9a7741c2ce4f248f832a4931a29e143456
Repository: just-every/run-barrow
Branch: cloud/sx-barrow-c-f75
Rejected predecessor: 9989fb9634182f840a0791ee5ae8276c965fddf0
Main parent: 7f9f666c0fa53f81729bdb99e74e5834f3263ca4
PR: none; this repository starts Verify on branch push.
Verify: push run 42232911157 completed SUCCESS on exact candidate 91bbcc9a7741c2ce4f248f832a4931a29e143456. URL: https://github.com/just-every/run-barrow/actions/runs/42232911157 . Actual REST response: {"conclusion": "success", "head_sha": "91bbcc9a7741c2ce4f248f832a4931a29e143456", "html_url": "https://github.com/just-every/run-barrow/actions/runs/42232911157", "status": "completed"}.

The FIX override limits this round to four findings. All four were reproduced through public HTTP doors against the original predecessor implementation, and all four pass against the repair. No other clause or campaign work was added.

## Frozen gate findings

| Finding | Observed original failure | Repair and public-door proof |
| --- | --- | --- |
| Privacy B | Finance scoped to a different account read the private contact note from the Xero follow-up HTTP response. The existing admission returned for finance before testing account scope. | `src/barrow/staff-access.ts` now requires the current account scope for accounting tasks. `tests/api/xero-accounting.mjs` lines 88–102 first reads the real private note while entitled, narrows the grant to the other account, then proves absence in HTTP, CSV and JSON exports, no task returned by refresh, refused foreign update and assignment, and unchanged task data. |
| OAuth A | A new-app granular token returned HTTP 409 `XERO_SCOPE` instead of the successful callback. | `src/barrow/accounting/xero.ts` requests `accounting.invoices.read`, accepts the required granular read permissions and additive legacy read permissions, and rejects missing or write permissions. `tests/api/xero-accounting.mjs` lines 9–25 proves the successful owner callback, wrong person and tenant refusals, all missing required scopes, both write-scope refusals, and successful encrypted refresh. |
| Account reference A | A valid account with no optional Code rejected the page with `XERO_RESPONSE`: “Xero omitted a required source identity.” | Reference identity falls back to AccountID when Code is absent; invoice references and their reviewed financial fingerprints use the same fallback. The bounded page retains coded and uncoded accounts. `tests/api/xero-accounting.mjs` lines 24–30 explicitly reviews the active uncoded bank account and verifies the mapping. The separate runtime probe also reads and maps a page whose primary account has no Code. |
| Owned exception A | A formerly matched invoice voided upstream produced a 13000-cent difference with no source row; `undefined !== '100'`. | Read filtering and parsing retain VOIDED receivable invoices. Their status remains in the observation and reviewed fingerprint, the original native link remains, linking a void is refused, and comparison labels it “Upstream invoice voided.” `tests/api/xero-accounting.mjs` lines 73–89 proves source readback, 13000 native versus 0 ledger, statement CSV and PDF, finance page data and CSV, one assigned open task with the same source link, and unchanged issued and native records. `tests/journeys/xero-accounting.mjs` lines 36–39 proves the statement, finance comparison and owned task in built pages at 1440 and 390. |

Covering registered tests, unchanged registration count:

- `tests/api/statements.test.mjs` — “PAY-007: a dated statement of invoices with opening and closing balances by currency, as JSON, CSV and PDF, for the buyer even after hold and close”, invoking `xeroAccounting` and existing `qboAccounting`.
- `tests/api/staff.test.mjs` — existing functional-role journey and existing functional application-reviewer journey.
- `tests/api/followups.test.mjs` — existing source-linked queue, archive restore, and grounded account-plan journeys.
- `tests/journeys/pricing.test.mjs` — “supplier schedules a complete book and dated USD basis, buyer keeps CAD documents, and reports show the recorded conversion without changing cents”, invoking the extended `xeroBrowser`. The existing QBO browser helper remains registered.

## Actual results

- Before probes: 0 of 4 passed, exit 1; `BEFORE-four-findings.log`. This temporarily restored only the original three implementation files and restored the repair afterward. It did not alter published history.
- After probes: 4 of 4 passed, exit 0; `AFTER-four-findings.log`. The committed candidate repeats all four through the public doors in `EXACT-SHA-PROBES.log`.
- Covering API files: 6 of 6 tests passed, exit 0; `TESTS.log`.
- Typecheck: exit 0; `TYPECHECK.log`. Initial TS7006 annotations were corrected before the final successful check.
- Application build: exit 0; `BUILD.log`.
- Built Xero browser journey: 1 of 1 passed, exit 0; `BROWSER.log`, with 22 actual images in `screens`. Local synthetic TLS probes emitted certificate warnings; the browser assertions and screenshots completed successfully.
- Contract generator write and check: both exit 0. Main's two generated views were restored afterward and are absent from the product diff.
- Edition source lock regenerated last and its check exited 0; `MECHANICAL.log`.
- First-party check and deployment specification check: exit 0; `RER-CHECK.log`, `DEPLOYMENT-SPEC.log`.
- Test registration delta: zero; cap remains 200. No existing assertion removed, narrowed, skipped or placed behind a new condition.
- Added email-shaped strings: zero. Repair bare slash tokens: zero. Every candidate author and committer is the fleet identity, with no trailers.

The final committed candidate was rebuilt and qualified again: all six registered API tests, typecheck, build and the Xero browser journey passed on 91bbcc9a7741c2ce4f248f832a4931a29e143456. The final captures overwrite the same 22 image paths. Actual logs are the four files ending in `-exact.log`, with exits in `EXACT-RESULTS.txt`. Source and image hashes are in `receipt.json`.

## Contract and custody

INT-003 is claimed PARTIAL. No full-clause acceptance point is claimed complete by this FIX round. The sending, verified payment synchronization, financial writes, complete receiving obligations and live Xero sandbox receipt are still owed. Held client credentials do not establish tenant consent, callback configuration or live provider completion. No new policy default was introduced.

Current main's contract source is byte-for-byte retained. Before and after main-judged counts are 73 DONE, 44 PARTIAL, 37 MISSING, total 154. The predecessor had an unlanded INT-003 PARTIAL row; this task deliberately does not carry that builder-authored row into the new candidate. The lander owns judgments. The only plan row to update is INT-003's repair evidence; no plan file is shipped or edited.

The unpublished task candidate was placed on current main with the predecessor's complete product snapshot and these seven-file repairs retained; the published predecessor ref and commits were not rewritten. The final product push occurred once. Main was never pushed. The incoming rer and Base pins were preserved without refresh or adoption.

## DONE riders and pre-ready check

This is a PARTIAL repair claim, not a DONE request. For completeness:

| Rider | Result |
| --- | --- |
| 1 | PARTIAL for the full clause: sandbox sending and returned native payments are not implemented or proved. Four repair outcomes pass through public doors as listed above. |
| 2 | PASS for repair scope: seeded private notes, explicit unsafe refusals, issued invoice preservation and exact money checks. |
| 3 | PASS for repair scope: push Verify 42232911157 completed SUCCESS on 91bbcc9a7741c2ce4f248f832a4931a29e143456, including the registered accounting journeys. |
| 4 | PASS: all local proof was repeated on the exact committed candidate, including the rebuilt browser journey and all six registered API tests. |
| 5 | INSPECTED: existing clause already names DATA-002, OPS-001, PAY-007, RPT-004, AUTO-005 and DATA-003 duties. No inheritance rewrite. |
| 6 | PASS mechanically: generator write and check succeeded; main judgments and generated views remain untouched. |
| 7 | PASS: no acceptance text or IDs changed. |
| 8 | PASS for repair scope: current account authority is exercised both ways; owner-only connection and review authority is retained. Broader finance delegation remains owed. |
| 9 | HONEST BOUNDARY: controlled network-edge fixtures establish no live provider receipt or provider deletion. |
| 10 | No new default. Existing owner-only floor remains PARTIAL. |
| 11 | PENDING LANDER: main equality, complete publication scan and exact-main Run site are not claimed. |

Pre-ready: the covering tests retain prior assertions; current grant narrowing refuses data and updates; existing erasure, archive restore and independent revocation assertions pass in the accounting journey. Existing changed screens remain under Settings and use the seed components; no icon-only control was introduced. Browser checks retain text and control assertions. Source lock is fresh. Publication scanning and Run site remain lander duties.

Scan text: commit=91bbcc9a7741c2ce4f248f832a4931a29e143456 complete=false historyScanned=false findings=unestablished status=NOT_RUN_IN_CLOUD. No COMPLETE or zero-finding scan is claimed. Remote main was 7f9f666c0fa53f81729bdb99e74e5834f3263ca4; it does not equal this unlanded candidate.

## Probes and mechanical receipt

PROBE INT-003 Privacy: entitled finance reads a seeded task note, then account scope changes -> note absent from HTTP and CSV, foreign update returns 404, assignment refused, task unchanged.
PROBE INT-003 OAuth: signed-in owner redeems granular read-only scopes -> HTTP 303; missing permissions or financial write scopes -> XERO_SCOPE with no connection.
PROBE INT-003 Account: reference page includes an active account without Code -> page accepted and AccountID mapping explicitly reviewed.
PROBE INT-003 Void: matched source invoice becomes VOIDED -> 13000-cent dated conflict, original source link, one owned open task, native invoice unchanged.
MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock then check exit=0; views=node scripts/contract-docs.mjs write then check exit=0; ledger=none (no repair migration change) exit=0

No product blocker remains from the four findings. CI status and publication custody are separate from this local result. The actual packet is published only to the evidence ref.

Earlier development logs are retained as `BEFORE-scopes.log`, `BEFORE-findings.log` and `AFTER-xero.log`. The first privacy probe hit a duplicate-company fixture precondition; the corrected four-finding reproduction and final exact-SHA probe are the authoritative results.

Final CI: exact-SHA branch Verify SUCCESS, run 42232911157, event push. GitHub API use: five calls including the two reference reads, one discovery and two status reads at least 300 seconds apart. No dispatch, rerun or PR was created. Publication scan and Run site remain guarded lander duties.
