# sx-barrow-f71fix1-push-1 — unchanged Barrow fix republication

Repository: just-every/run-barrow
Source branch: cloud/sx-barrow-f71fix1
Destination product branch: cloud/sx-barrow-f71fix1-push-1
Requested and observed source commit: 1e9500dae212205e743995f3ba1138519e8db4d0

## Scope and plan

This task republishes the existing buyers' Settings navigation fix without changing its commit, code, contract, generated views or source lock. The existing notice preferences behavior is preserved by retaining the exact source commit. No clause is promoted and no DONE or landing claim is made.

The full plan is in PLAN.md. Refresh the launcher and configure bundle-only authentication; shallow-filter clone the declared repository and fetch enough history; verify source and successful exact-SHA CI; audit every candidate including merge side parents; push through the required guard; publish the explicit report packet separately; then delete the temporary successful clone.

## Completed checks

- Source head is exactly 1e9500dae212205e743995f3ba1138519e8db4d0. Rehashing the raw commit object gives the same SHA. Source and destination trees compare equal; the worktree is clean.
- The complete candidate range contains 10 commits, including the existing merge and its side parents. No shallow boundary intersects this range. All authors and committers are fleet or the repository owner's identity, corroborated by origin/main. All trailer addresses pass the specified policy; OpenAI/Codex co-authors are absent.
- The requested gh run view 42482404056 -R just-every/run-barrow --json conclusion returned success. REST discovery confirmed Verify 42482404056, attempt 2, status completed, conclusion success, head SHA 1e9500dae212205e743995f3ba1138519e8db4d0. The discovery occurred more than 300 seconds after the prior observation. No workflow was rerun.
- Before/after contract counts are identical: 154 clauses, 72 done, 45 partial, 37 missing. Clause changes: none. New product commits: zero. Product files edited: zero.

No setup, build, browser or test workflow was rerun for this unchanged-commit task. No PR is requested by the brief or required by repository rules. No deployment or main update is performed. Under the cloud adaptation, the Mac lander owns the publication scan and landing checks; neither is claimed here.

## Publication

The supplied cloud-push.py guard published cloud/sx-barrow-f71fix1-push-1 successfully on its first attempt, without force. A separate git ls-remote confirmed both source and destination refs point to the exact requested SHA. Main remains at 7459a7c6f841a2530b9744f017374249cbe09806. The product checkout remains clean at the same SHA.

Verify run: https://github.com/just-every/run-barrow/actions/runs/42482404056 (completed/success, exact SHA, attempt 2).
PR: none; unchanged commit republication needs no PR under this brief.
Blockers: none.
GitHub CLI observations: 2 invocations, within the ten-call budget; the second uses REST and confirms exact-SHA metadata. No failed job archive, workflow rerun or dispatch was requested.

The report packet contains PLAN.md, source-receipt.json, identity-receipt.json, candidate-identity-log.txt, candidate-messages.txt, verify-conclusion.json, verify-runs.json, push-receipt.json, push-log.txt and custody-receipt.json. They hold actual observations, without credentials, environment dumps, private gate material or symlinks. This report is transported only on refs/heads/evidence/sx-barrow-f71fix1-push-1 through the supplied cloud_evidence.py entrypoint. Product READY custody and evidence publication remain separate; no landing or publication-scan claim is made. Clone cleanup follows successful evidence publication and remote custody verification.
