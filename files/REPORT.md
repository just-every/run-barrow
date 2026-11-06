# sx-barrow-c-f69-fix1 — original INT-002 blockers

Product repository: just-every/run-barrow  
Product branch: cloud/sx-barrow-c-f69-fix1  
Candidate: ecaf41b2c02723ca6949c4d4952f6500e9b92b1e  
Original refused source: 892803c0552e47aaf5c77d9e2f576a3db398d1f7  
Mechanically regenerated source and fresh main: 297b78740b0037045e0da786340b24bb8079ca57

This is INT-002 lifetime FIX 1 of 2, repairing only the three A/B findings in the original gate. The original and regenerated product source is identical: only ACCEPTANCE.md, docs/CLAIMS.md and sources.lock.json differ. No acceptance of that prior candidate is claimed.

## Plan and bounded implementation

The full plan is in PLAN.md. Reproduce the supplied original public-door cases before editing; repair the shared account-scope admission, current reconciliation work and provider-only erased-account custody; extend the existing accounting API journey; run only touched API checks, typecheck and documented mechanical checks; restore generated views, regenerate source lock last; audit and push only the named branch; observe exact-SHA Verify and publish reports separately; clean owned runtime/dependencies/clones after successful publication.

- `src/barrow/staff-access.ts`: QBO tasks now pass the current account-scope predicate before the finance role decision. The existing read, CSV, refresh, assignment, contact and resolution doors share this admission. The tests exercise narrowing, positive Cedar finance access, foreign mutation refusal and unchanged foreign task state.
- `src/barrow/accounting/reconciliation.ts`: QBO exception identity includes actual native financial, native account, link and relevant reviewed-reference revisions plus the actual comparison facts. A repeated read with unchanged facts keeps the same task. A new discrepancy or stale mapping creates current owned work; a changed source supersedes previous open work with an explicit unresolved/superseded explanation, leaving one current open task. Issued invoices and native credits stay unchanged. Linking retained erased observations is refused.
- `src/barrow/followups.ts`: an automatically closed QBO task can become current owned work again if the same discrepancy recurs; obsolete resolution text is removed, with a still-authorized owner preserved or current authorized actor used. A person's acknowledgment remains attributed and closed for its exact state.
- `src/barrow/accounting/custody.ts`, `accounts.ts`, `legacy-erasure-journal.ts`, `account-erasure.ts`: capture opaque customer custody from both mappings and retained observations in the independent journal; atomically tombstone customer identities, revoke mapping/link authority and detach live native-account admission on both erasure paths and independent replay. Exact retained observation JSON, provider facts and financial times remain unchanged, under their existing floor. A reused native ID cannot read, export or compare the previous company's observation, nor remap or relink that erased source. Journal IDs also fence an older archive in which provider mappings are deliberately absent. No provider deletion or financial write is sent or claimed.
- `tests/api/qbo-accounting.mjs`: extend the existing statement/accounting journey with these original cases plus refresh idempotence, current owned work, truthful supersession, immutable invoice and credit detail, mapping/link refusals and independent-journal restore. No registrations added or removed; no existing assertion narrowed, removed or skipped.
- `CONTRACT.md`: append the bounded repair evidence to INT-002 only. `sources.lock.json`: regenerate from the final tracked sources after restoring generated views.

## Same-case before/after proof

Both runs use the real application API, Native authentication, actual D1 migrations, native issued orders and credits, actual pinned Pier source and independent journal/portability doors. Only external QBO and mail provider edges are faked. The original fixture and supplied first three public-door tests and separate financial-conflict test are unchanged between runs; the fourth screen-only case is excluded exactly as instructed. Probe file hashes and source identities are in source-provenance.json; actual commands, exits and final product identity are in RECEIPT.json.

| Original finding/case | Before, exit 1 (0/4 passed) | After, exit 0 (4/4 passed) |
| --- | --- | --- |
| B: Wren-only finance follow-up scope | Cedar task returned; CSV leaked Cedar; refresh returned foreign task; direct observation already refused | No exposed task; CSV false; foreign refresh false; direct observation still refused |
| A: newly stale mapping | Only old closed task with match resolution | Current owned open task for stale mapping; no stale resolution on that task |
| A: native USD55 correction then USD5 correction | Native 7000 vs provider 7500, Balance differs, but only closed task | Same real balances/conflict, with current open owned work |
| B: provider-only erasure then ID reuse | Replacement buyer HTTP 200, old customer 10 / invoice 100 / 13000 cents | Replacement buyer HTTP 404 |

Actual probe output is in before.log and after.log. The committed extension additionally passed unchanged financial facts, scoped CSV/refresh/update, no duplicate current task across repeated reads, changed provider source supersession, replacement buyer statement/export refusal, erased remapping/relink refusal and an older-archive restore with current independent journal.

## Local validation

- Touched files: statements, followups, staff and retention API checks. Initial combined run: 12/13 passed; the new test compared a credit creation response with the richer detail response, a test expectation error. Corrected the new comparison to capture the detail response before the next correction and compare the same public detail afterward. Focused statement/accounting rerun: 1/1 passed. Therefore all 13 touched registrations passed, with all existing assertions intact. Both actual logs and the correction receipt are retained.
- Sole-tsconfig typecheck: `pnpm exec tsc --project tsconfig.json --incremental --tsBuildInfoFile /tmp/barrow-fix1-typecheck.tsbuildinfo`, exit 0.
- `node scripts/contract-docs.mjs write`, then `check`: exit 0, counts 73/44/37/154. Restored ACCEPTANCE.md and docs/CLAIMS.md whole from fresh origin/main; neither is committed. Candidate Verify is expected to detect only those deliberately stale generated views.
- Source lock generated LAST using `node scripts/edition-authoring/cli.mjs lock`, followed by `check`: exit 0.
- `git diff --check --cached`: exit 0. All 77 published migration byte streams match fresh main. No migration added or edited.
- Final source hashes match the successfully tested working source, byte for byte. Actual receipt files contain source hashes and process IDs. The runtime used Node v24.19.0 and pnpm 10.12.4 through the supplied cloud toolchain; no full local Verify or unrelated suite ran. No UI changes or browser proof needed for this repair.

## Contract, custody and remaining dependencies

Before/after counts: 73 done, 44 partial, 37 missing, total 154. INT-002 remains PARTIAL. The entire prior Gap is byte-identical, every other CONTRACT.md line is unchanged, including separate design/Opus obligations. Full functional reconciliation delegation, live sandbox consent and full invoice/partial-payment/return-credit/replay/revocation receipt, provider financial writes, verified payment/credit synchronization and complete receiving obligations remain owed. This repair does not add acceptance points or claim completion of those dependencies. Both original and repair protections remain pending ONE original-blocker re-gate; no hold release or self-submission occurred.

Fresh origin/main was fetched and merged before candidate publication; it remained 297b78740b0037045e0da786340b24bb8079ca57, already up to date. Fleet commit hooks remained active, all candidate authors/committers/trailers passed audit. One product push succeeded on attempt 1 through cloud-push.py; no main push, force push, workflow dispatch/rerun or PR was performed. The Mac lander retains publication scan, final exact-SHA checks and landing/site custody; the cloud adaptation does not run the Mac publication scan. The exact staged diff was reviewed for credential-shaped new values and contains only synthetic test identities.

CI result, evidence publication and cleanup receipts follow in the finalized packet. Evidence publication is separate from product READY and conveys no acceptance or landing.

Public report selection excludes the supplied one-off gate-probe source files; their local copies remain outside product commits, with immutable hashes and full actual public-door output in this packet. No undisclosed held-out material is selected.

Cleanup so far: all owned cloud_run subreapers and API Workers exited normally, no browser was launched and no process was signaled. Pinned Pier API archive/source/dependencies and product node_modules are deleted. The product clone is retained only until the required evidence publisher reads its branch/HEAD/origin, then removed at task end. See cleanup.json.

## Exact-SHA Verify result

Verify run 42212947907: https://github.com/just-every/run-barrow/actions/runs/42212947907, completed/failure on exact candidate ecaf41b2c02723ca6949c4d4952f6500e9b92b1e. All eight shards passed setup and the edition source-lock freshness check. All eight stopped at their first verification command, `node scripts/contract-docs.mjs check`, solely because ACCEPTANCE.md is intentionally stale. The aggregate verify job reflects those same failures. All nine failed job logs were inspected from the complete run archive retrieved successfully by `gh run view 42212947907 --repo just-every/run-barrow --job 127875871085 --log-failed`; this command was called once, and the cached full archive supplied every remaining failed-job log without further provider calls or forbidden job-log blob downloads. Actual relevant logs and hashes are in ci-logs/ and CI-RECEIPT.json. No product assertion failure or other job failure was observed. No retry or workflow dispatch occurred.

The explicit generated-view-only exception therefore applies to READY. This is not a claim of ordinary green Verify or acceptance: the Mac lander regenerates the two views and requires its final exact-SHA CI before landing. No real product blocker remains in this bounded repair; ONE independent original-blocker re-gate remains required, with the original and FIX protections retained.

Five GitHub CLI invocations including pinned Pier acquisition were used. The first workflow discovery mistakenly used an abbreviated SHA and returned an empty list; the corrected full-SHA discovery waited the required 300 seconds, then found the completed exact-SHA run. The metadata and archive calls after completion were diagnostic reads, not status polling. No further workflow watcher exists.
