# AUTO-004 original blocker A repair — sx-barrow-c-f68-fix1

Repository: just-every/run-barrow. Product branch: cloud/sx-barrow-c-f68-fix1.
Candidate: bf59e18fca09f02c287773d51b8995520646b2f1.
Immutable original source: cf934caa5f4fc87ba7cc4cd8616e0ae76721fdf5.
Fresh main incorporated: ea7da76336fa80405ed3f57d2e93fe19417fa08e (already an ancestor; merge reported already up to date).
Real pinned Pier source: 60fde60ffa1f44c2ae6a3ef47225117f36cf546a, obtained only through gh api tarball, without cloning or modifying Pier.

## Scope and plan execution

Only the original gate sx-barrow-c-f68-gate-1 blocking A was repaired. This remains lifetime FIX1 of2; no new verdict or hold release is claimed. The mechanical integration de9d2d051f2cc7082a0e4df16b0df21984cf26d6 was not used as product proof. PLAN.md records the full plan. No C follow-up or F note was taken into scope. No UI, brand, provider/email/carrier, acceptance wording, workflow, Base refresh, rer pin or broader clause work was performed. Barrow67 design/visual hold remains untouched.

1. Configured fleet identity, refreshed launcher, installed decrypted-bundle Git helper and preserved repository hooks. Started a fresh shallow filtered declared-repository clone and branched at the immutable source.
2. Ran the supplied unchanged original probe before editing. A separate node:test harness initializes the test file and selects /usr/bin/chromium; it does not change the probe body or assertions. The probe's migration fixture empties only the new 0077 notice tables, retaining all real commercial records. This is a fixture state, not evidence of a deployed upgrade.
3. Made the bounded native capture repair, extended the existing public native return journey without adding a registration or weakening assertions, and retained restore fences.
4. Fetched fresh main before candidate commit/push; it was already included. Ran touched regression controls and typecheck, wrote and checked generated views, restored both views from main, and regenerated/checked sources.lock.json last.
5. Audited every candidate author, committer and message, including both inherited product commits. All use Run Edit Run fleet <fleet@runeditrun.com>; no coauthor trailers. Pushed the first real repair commit through the cloud guard on its first attempt. No force, main push, PR, workflow dispatch/rerun, self-submission or hold release.
6. Exact-SHA branch Verify and report-only evidence transport are recorded below once complete. Product readiness and evidence custody are separate.

## Product change

- src/barrow/order-notices.ts: treat an absent account marker as uninitialized, while continuing to refuse explicit active=0. Existing current-person, account, location and functional-staff authority checks run before source capture. The same real Pier origin/identity/quantity validator produces facts. The existing atomic INSERT OR IGNORE initializes the account and retains the unique source revision deduplication constraint, including concurrent reads. The SQL active=1 predicate continues to fence a concurrent erasure.
- src/barrow/model.ts and src/barrow/portability-policy.mjs: mark archived order notice history inert even if that order had no account notice marker when exported. Both dispatch capture and native fact creation honor this flag. Existing seasonal restore transformations remain intact. This prevents missing-marker initialization from reopening archived history, while fresh native orders retain their existing behavior.
- tests/api/order-notices-proof.mjs: extend the existing return journey with the upgrade state, two real split dispatches, concurrent and repeated authorized reads, current source quantities, foreign-account refusal, finance non-disclosure, and marker-free archive restore with the original real Pier connection available.
- sources.lock.json: regenerate after all source and generated-view restoration steps.

No published migration identity changed. CONTRACT.md and migrations/core are byte-identical to the immutable source. ACCEPTANCE.md and docs/CLAIMS.md match fresh main and are absent from the repair diff. The original native notice implementation is preserved in the candidate's ancestry.

## Same-case before/after proof

PROBE A BEFORE: immutable cf934caa5f4fc87ba7cc4cd8616e0ae76721fdf5; exact original probe exit 1; actual split dispatch count 2; repeated native read notice counts [0,0]; expected 2. The assertion fails for the original reason. before.log is the complete actual output, before-summary.log omits only the image transport payload.

PROBE A AFTER: repaired candidate tree; same probe body, harness, fixture and assertions; exit 0; actual split dispatch count 2; repeated native read counts [2,2]; expected 2. after.log is complete actual output. Both runs pass the original buyer/reviewer Orders/current-source/read/order-focus/Settings checks at 1440 and 390; eight screenshots per run are decoded under screens/. The after probe's initial overall count is 1 because it now captures the fixture's earlier genuine shipment as well; the split-order assertion and counts remain exactly two. No historical acceptance or dispatch fact is invented.

## Local checks and actual exits

Complete commands and source identities are in receipt.json; complete selected output is retained in the packet.

| Check | Exit | Result |
| --- | --- | --- |
| cloud_run npx -y @runeditrun/rer setup --owner-email fleet@runeditrun.com --non-interactive | 0 | Source setup and initial build |
| Original public-door probe before edit | 1 | Expected original A failure [0,0] |
| cloud_run npx -y @runeditrun/rer build after repair | 0 | Real built application |
| Same original public-door probe after repair | 0 | A repaired [2,2], screenshots at 1440/390 |
| cloud_run node --test tests/api/return-claims.test.mjs | 0 | Existing native journey: 1 registration, 1 pass, 0 failures/skips; all original notice controls plus upgrade/restore extension |
| cloud_run pnpm run typecheck | 0 | TypeScript build check |
| Selected existing Barrow wholesale public HTTP journey | 0 | Exact export/import/export row equality; existing auth, money and import controls |
| node scripts/contract-docs.mjs write then check | 0 / 0 | 73 done / 44 partial / 37 missing, 154 clauses |
| git checkout origin/main -- ACCEPTANCE.md docs/CLAIMS.md | 0 | Generated views restored and uncommitted |
| node scripts/edition-authoring/cli.mjs lock then check | 0 / 0 | Source lock generated last and matches |
| git diff --check | 0 | No patch whitespace errors |
| Fleet product push | 0 | First attempt successful |

Node 24.19.0 and pnpm 10.12.4 were selected by the supplied toolchain setup; the repository engine pin is 22.20.0. The resulting pnpm engine warning is recorded; no pin was changed. Full local suites and unrelated baselines were not run. Original marker-active regression coverage passes for accepted/stock/return facts, concurrent deduplication, personal preferences/read state, unavailable current source, account/location/staff restrictions, finance non-disclosure, JSON/CSV, reviewed person/account erasure and later-journal inert restore. The additional archive round trip verifies normalization remains stable.

## Counts and clause custody

Fresh main: 73 done, 43 partial, 38 missing (154). Original source and repaired candidate: 73 done, 44 partial, 37 missing (154). The missing-to-partial change is inherited from the original source, not a new FIX judgment. AUTO-004 stays PARTIAL; its complete existing Evidence and wider Gap row is retained verbatim in AUTO-004-status.txt. This repair adds zero test registrations and changes no workflow, command pin, acceptance sentence or unrelated clause. Source and repaired counts are unchanged. No DONE claim, full-clause acceptance or landing is claimed.

## Remaining dependencies

The full AUTO-004 Gap remains, including accepted-order buyer/staff changes and canceled-style drops with ORD-011/ORD-016 and pinned-Pier partial-edit dependency; held Base changes; holds/carrier exceptions and owner-provisioned EasyPost proof; email sender/recipient consent, delivery tracking/suppression, owned bounce handling and complete duplicate-carrier acceptance. None was needed to repair A. The original and repaired source remain independently held until the Mac's original-blocker re-gate. The fleet owns complete full-history publication scanning, final generated views/integration, exact-final Verify and exact-main Run site. A shallow cloud checkout is not a COMPLETE publication-scan receipt and this report claims none. No landing, submission or hold release was attempted.

## CI and cleanup

Verify run 42209444642: https://github.com/just-every/run-barrow/actions/runs/42209444642 on exact bf59e18fca09f02c287773d51b8995520646b2f1 completed with conclusion failure. Plan and source-lock freshness passed. All eight shards stopped at the first command, node scripts/contract-docs.mjs check, because ACCEPTANCE.md is intentionally restored from main. The completed-run archive confirms the same stale-view error in every shard; verify aggregation failed as a consequence and proof jobs skipped. There are no product assertion failures. No claim is made that the product suite executed in CI. The task's explicit generated-view-only exception permits READY; the lander must generate views and require its own exact-final Verify. ci-poll-1.json, ci-jobs.json, ci-failure-summary.log and ci-diagnosis.json preserve actual status and diagnostics without workflow environment blocks. Six GitHub CLI calls were used including the Pier archive read. No duplicate Verify run or rerun was requested.

No product blocker remains in this bounded repair. No PR was created: repository rules use the named fleet branch/lander path. Both source and repaired candidate remain subject to the original-blocker re-gate; no release of their holds was requested.

All test harness resources closed through their owned cleanup functions, and the supplied subreaper completed. No broad stop command was used. Dependency directories, build/runtime state and the read-only Pier archive are removed before evidence transfer; the product clone is removed only after successful report publication, with the pushed product provenance and complete packet retained outside it. Evidence publication is report custody only, not acceptance or landing.
