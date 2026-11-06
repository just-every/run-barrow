# sx-barrow-f74fix1 results

Repository: just-every/run-barrow.
Branch: cloud/sx-barrow-f74fix1.
Candidate: 691ad35e6c90865c156483d6836fd017f2a796a9.
Original stacked parent: 9989fb9634182f840a0791ee5ae8276c965fddf0.
Main integrated before publication: 7f9f666c0fa53f81729bdb99e74e5834f3263ca4.

All four findings in sx-barrow-c-f74-gate-1 are repaired. This is a bounded FIX round, not an INT-003 completion claim. INT-003 remains a partial read-only foundation. No other clause work, homepage work, dependency upgrade, new acceptance point or new policy was added.

## Completed plan

The full ordered plan is in PLAN.md. The run read the target and existing journeys, reproduced each gate finding through HTTP, repaired the four paths, extended the existing statement and pricing journeys, ran touched checks, integrated main, generated contract documents, restored generated views, regenerated the source lock, pushed the named product branch and prepared a separate evidence transfer. No test registration was added or removed; the existing 200-test cap remains unchanged.

The rebase replay initially carried the preceding round's INT-003 Status edit. That unpublished replay was corrected to preserve main's entire CONTRACT.md. The original base and replay were preserved in a verified bundle outside the product clone. No published ref was rewritten or force-pushed. The final candidate has no CONTRACT.md, ACCEPTANCE.md or docs/CLAIMS.md difference against main. All four candidate commits have fleet author and committer identities, with no trailers.

## Gate findings and proof

| Finding | Change and observable result | Registered proof |
| --- | --- | --- |
| B: account-scoped finance follow-ups expose another account's private notes | Accounting tasks require both the finance role and current account scope. Permitted finance sees its private note; foreign finance does not see its task or note in follow-ups, JSON export or CSV. Foreign updates return 404 with unchanged task state. Removed account access takes effect immediately. | tests/api/xero-accounting.mjs, xeroAccounting, lines 78–93, invoked by the existing PAY-007 test in tests/api/statements.test.mjs. |
| A: newly registered Xero applications fail with XERO_SCOPE | OAuth now requests accounting.invoices.read with the required contact, settings and offline reads. Token validation accepts current reads plus the provider's additive legacy read grant during migration. Missing invoice reads and writable invoice permissions are refused before a connection is stored. Owner-session and tenant binding remain enforced. | tests/api/xero-accounting.mjs, xeroAccounting, lines 8–23; tests/journeys/xero-accounting.mjs, xeroBrowser, lines 14–19. |
| A: a valid account without Code rejects the whole page | Optional Code falls back to the provider AccountID. A mixed page retains all three accounts and permits explicit review of the active uncoded account; inactive mapping remains refused. | tests/api/xero-accounting.mjs, xeroAccounting, lines 24–32; tests/journeys/xero-accounting.mjs, xeroBrowser, lines 20–28. |
| A: upstream invoice void has no source link or owned exception | Bounded reads include VOIDED receivables. The retained status yields zero provider receivable and an explicit upstream-void conflict. Native USD 130.00 remains issued, source 100 and its native order stay linked, and the difference is USD 130.00. One owned task survives refresh and failed contact; relinking a void as a matched issued invoice is refused. Statement JSON, CSV, PDF, finance JSON, CSV and the built buyer page retain the conflict. | tests/api/xero-accounting.mjs, xeroAccounting, lines 54–67; tests/journeys/xero-accounting.mjs, xeroBrowser, lines 37–40. |

The two existing registered sanity tests are:

- tests/api/statements.test.mjs — PAY-007: a dated statement of invoices with opening and closing balances by currency, as JSON, CSV and PDF, for the buyer even after hold and close.
- tests/journeys/pricing.test.mjs — supplier schedules a complete book and dated USD basis, buyer keeps CAD documents, and reports show the recorded conversion without changing cents.

The first invokes both existing accounting HTTP journeys; the second invokes both existing accounting browser journeys. Assertions retain the original behaviors. Counts concerning Xero task history exclude the additional explicitly checked void task where they previously counted the original conflict alone. No assertion was removed, skipped or made conditional on viewport width. Browser reference-option count now accounts for the extra legitimate bank-account fixture.

## Reproduction and runtime probes

The ordinary baseline statement journey passed on the original parent. Four independent repair probes against that parent's source then failed as the gate described. gate-reproduced.log records:

- Granular OAuth callback: HTTP 409, XERO_SCOPE.
- Uncoded account page: XERO_RESPONSE, “Xero omitted a required source identity.”
- Foreign private-note exposure: true from both the HTTP follow-up reader and follow-up CSV.
- Voided matched invoice: the 13000-cent difference has no source 100 in its source list.

The temporary probe script is published as gate-probes.mjs solely as reproduction evidence. Its registrations are not part of the product suite. The first draft privacy reproduction encountered duplicate-company review because its fixture reused a name; that setup was corrected before the complete four-failure reproduction. privacy-reproduced.log separately captures the corrected privacy failure. No repair was guessed from an unreproduced assertion.

PROBE INT-003 privacy: current finance with foreign account scope reads populated follow-ups and CSV -> private note absent; entitled finance sees it; foreign update returns 404 and changes nothing.
PROBE INT-003 oauth: owner callback with current granular read permissions -> HTTP 303 and connected tenant; missing or writable permissions -> XERO_SCOPE with no stored connection.
PROBE INT-003 accounts: mixed coded and uncoded Account reference page -> all records retained; active AccountID can be reviewed; inactive account mapping refused.
PROBE INT-003 void: linked source invoice 100 becomes VOIDED -> native 13000 cents, provider zero, difference 13000, source link and one persistent owned task; native invoice unchanged.

VERIFY_REPRODUCED {"head":"9989fb9634182f840a0791ee5ae8276c965fddf0","job":"sx-barrow-c-f74-gate-1 blocking findings; local HTTP reproduction","command":"BARROW_PIER_SOURCE=/tmp/barrow-pier timeout 300 node --test --test-concurrency=1 /tmp/barrow-gate-probes.mjs","test":"granular OAuth; uncoded account reference page; account-scoped private follow-ups; voided matched invoice retains an owned source conflict","exit":1,"failure":"XERO_SCOPE; XERO_RESPONSE; foreign note exposure through HTTP and CSV; undefined sourceId instead of 100"}

## Local validation and browser proof

- Touched statement HTTP sanity journey: PASS on the exact committed head, one registered test, including existing QBO proof, four repairs, source revocation, erasure, retention and restore.
- Typecheck: PASS.
- Production application build through the pinned rer CLI: PASS.
- First-party command-contract check: PASS, exit 0 with no output.
- Pricing browser sanity journey: PASS on the exact committed head, one registered test, including both existing accounting browser journeys.
- Contract generator write and check: PASS. Generated views were restored from origin/main; none is committed by this round.
- Source lock regeneration and check: PASS, after the final source changes and main integration.
- Migration ledger: not applicable to the repair; no migration was added or edited. Existing stacked migrations are exercised by the ordinary HTTP installation harness.
- Diff whitespace check: PASS. Newly added text has zero email-shaped literals; slash tokens introduced by tests are actual API paths, not prose repository references.

The browser used /usr/bin/chromium with --no-sandbox, ordinary fresh test contexts and synthetic accounts. Business assertions run at 1440; captures show the same screens once at 1440 and 390. Relevant Xero captures include consent, reviewed references, interrupted reads, linking, matched buyer statement, finance comparison, balance conflict, void conflict and revocation. The phone void-conflict capture was inspected directly. Text remains at least 13 pixels in the inspected regions; there are no icon-only controls lacking descriptions in those regions. No new interface or visual design was created. The browser log includes local test-certificate warnings; the journey completed successfully.

Provider proof uses only the Xero network boundary. The actual pinned Pier Worker is sourced through gh api, without cloning or writing any other repository. No live Xero credential, external tenant or provider-held record is included in these reports. The provider FAQ states that applications created from 2 March 2026 use granular scopes; its scope documentation maps legacy transaction reads to granular invoice reads. The provider Account schema makes Code optional and exposes AccountID. These public references informed the two compatibility repairs.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock and node scripts/edition-authoring/cli.mjs check exit=0; views=node scripts/contract-docs.mjs write and node scripts/contract-docs.mjs check exit=0; ledger=none exit=0.

## Clause, riders and handoff boundaries

No complete acceptance sentence is newly claimed DONE. The four repair outcomes are proven; the complete live order, Xero payment allocation and native synchronization journey remains outside this FIX round. The existing owner-only connector floor is unchanged; no new policy default was adopted.

| DONE-RIDERS row | Result for this partial claim |
| --- | --- |
| 1 | PARTIAL: four gate outcomes have populated public-door proof; the full original live-provider journey is still owed. |
| 2 | PASS for the repair: allowed and refused permission cases, missing and writable OAuth scopes, inactive mapping and refused void linking are exercised. |
| 3 | Exact-head push Verify is recorded in ci-discovery.json; final observed state is in receipt.json. No success is inferred from another SHA. |
| 4 | The registered HTTP and browser sanity journeys were rerun successfully on the exact committed candidate; the independent four probes also pass on that head. |
| 5 | INSPECTED: receiving contract obligations are unchanged; no inheritance or completion was added. |
| 6 | PASS mechanically: generation and check pass; main's Status, Gap, Evidence and summary counts are retained. |
| 7 | PASS: no acceptance text changed. |
| 8 | PASS for touched scope: foreign finance reads and updates are refused without mutation; revoked source authority and erased subjects remain covered by the existing journey. |
| 9 | PARTIAL honestly: synthetic provider-edge observations establish no live sandbox, native payment synchronization or provider erasure. |
| 10 | No new policy default; existing conservative owner-only connector admission remains unchanged. |
| 11 | Pending guarded landing. This cloud has not changed main, run the Mac publication scan or obtained main Run site proof. |

PRE-READY self-check: all four finding outcomes are exercised through public HTTP doors, with the dangerous paths both ways. Existing assertions remain; privacy, revocation, erasure and replay proof remain active. Changed screen data is captured at desktop and phone widths. Source lock and contract generation pass. Exact-SHA Verify is reported honestly; publication scan and Run site remain the fleet lander's independent gates.

Publication scan result: commit=691ad35e6c90865c156483d6836fd017f2a796a9, complete=not-run-in-cloud, historyScanned=not-established, findings=not-established. No scan success or zero-finding claim is made. Main equality: false at handoff; only the named cloud branch was pushed. Run site: not run for this product branch. PR: none required; push starts Verify here.

Main counts before and after this round: 73 DONE, 44 PARTIAL, 37 MISSING, total 154. The stacked parent's unlanded counts were 73 DONE, 45 PARTIAL, 36 MISSING; this round keeps main's judgments and does not restore that inherited Status change. INT-003 is reported PARTIAL without a builder Status edit. Plan rows to relay: INT-003 evidence only, with the four repaired findings and this candidate SHA. No other row or campaign order changes.

GAP INT-003: complete live sandbox order, payment allocation, native synchronization, credit mappings and the broader receiving obligations remain owed; this FIX round only repairs the four frozen blockers.

No unresolved product blocker was found in this FIX scope. Product publication, CI custody and evidence publication are separate; the exact product and evidence identities are recorded in the final handoff and receipt.json.

Final CI observation: push Verify run 42232865637 remains in_progress, conclusion null, on exact head 691ad35e6c90865c156483d6836fd017f2a796a9 at 2026-11-06T14:24:41Z. Four GitHub API calls were used. No workflow was dispatched or rerun. The cloud handoff does not claim CI success; the guarded lander must await the exact-head run and perform its independent publication scan and Run site gates.
