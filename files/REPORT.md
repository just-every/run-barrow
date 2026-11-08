# sx-barrow-ci-limit-1 report

Repository: just-every/run-barrow
Branch: cloud/sx-barrow-ci-limit-1
Head: 81c69462949c548af17d72ccfc56f2831f484380
Base: a465fabc8b49b48e532a02f3364e3bf51373ffb3

## Plan and implementation

1. Clone current main shallowly with blob filtering; retain the fleet identity and commit hooks.
2. Inspect Verify and every caller that controls its shard timeout; sample two or three recent Verify runs, including the named failure and a green run. Read the historical barrow-1 failed log once.
3. Apply the specified measurement rule only to shard governing limits; preserve all tests, assertions, commands, shard membership and short-job limits.
4. Regenerate the source lock last; check workflow permissions, source-lock freshness, exact diff scope, whitespace, identities and trailers. Commit normally and push the named product branch through the fleet push guard.
5. Observe the exact-SHA Verify through REST within ten GitHub calls and at most one observation per five minutes. Classify failures without changing assertions; rerun infrastructure failures once. Publish this separate report packet.

## Measurements

| Run | Job | Shard | Result | Duration |
| --- | --- | --- | --- | --- |
| 42419759766 | 128545476131 | shards (barrow-6) | success | 4m51s |
| 42419759766 | 128545476136 | shards (barrow-5) | cancelled | 12m17s |
| 42419759766 | 128545476152 | shards (barrow-3) | success | 10m25s |
| 42419759766 | 128545476192 | shards (barrow-2) | success | 4m00s |
| 42419759766 | 128545476202 | shards (barrow-4) | success | 8m18s |
| 42419759766 | 128545476205 | shards (barrow-8) | success | 9m30s |
| 42419759766 | 128545476233 | shards (barrow-1) | failure | 4m24s |
| 42419759766 | 128545476304 | shards (agent-door) | success | 7m05s |
| 42324149198 | 128255464086 | shards (${{ matrix.name }}) | skipped | not run |
| 42423519328 | 128556845555 | shards (barrow-8) | success | 7m00s |
| 42423519328 | 128556845560 | shards (barrow-2) | success | 5m31s |
| 42423519328 | 128556845591 | shards (agent-door) | success | 8m17s |
| 42423519328 | 128556845622 | shards (barrow-4) | success | 8m59s |
| 42423519328 | 128556845632 | shards (barrow-6) | success | 7m36s |
| 42423519328 | 128556845634 | shards (barrow-1) | failure | 4m34s |
| 42423519328 | 128556845646 | shards (barrow-5) | success | 11m49s |
| 42423519328 | 128556845654 | shards (barrow-3) | success | 9m43s |

The green main run 42324149198 reused existing proof and did not execute shards. This is reported explicitly rather than treating a skipped job as a timing sample. The third sample is the latest failed Verify, 42423519328.

The longest successful sampled shard was barrow-5 at 11m49s in run 42423519328. The named barrow-5 job in run 42419759766 was cancelled at 12m17s under the 12-minute limit. No sampled shard successfully completed above that limit. Per the brief’s explicit fallback, use the cut as a floor, add eight minutes, and round up: ceil((737 + 480) / 60) = 21 minutes. This is a timeout floor measurement, not proof that 21 minutes is sufficient for every shard.

## Scope and before/after

- workflow_call.inputs.timeout.default: 12 → 21 minutes.
- jobs.shards.timeout-minutes fallback: 12 → 21 minutes.
- Nightly caller retains its explicit 45-minute override.
- Plan, summary and other short jobs retain their original limits.
- Push shards: 8 → 8; verification.json, all test files and assertions unchanged.
- Regenerated sources.lock.json: only the Verify workflow and base-copies.json content hashes changed.
- Clause statuses unchanged; ACCEPTANCE.md and docs/CLAIMS.md untouched.
- Acceptance counts: done 72 → 72; partial 44 → 44; missing 38 → 38; blocked 0 → 0.

## Local validation

Passed: node scripts/verify-ci.mjs --check-workflows; node scripts/edition-authoring/cli.mjs lock; node scripts/edition-authoring/cli.mjs check; git diff --check. An independent scope assertion compared the whole workflow to main with only the two intended substitutions, verified the initial source lock differed only at the workflow hash, and confirmed eight push shards. No application or UI change: no full application setup, build or browser run was needed for these workflow defaults.

All unpublished candidate commits were checked through git log origin/main..HEAD, including parents, with fleet author/committer identities and no co-author trailers. Product push succeeded on the first attempt. No main/default-branch push, history rewrite, PR, or inbox write was performed. Base publication scanning remains with the fleet Mac under the cloud assignment; no cloud scan pass is claimed.

## Historical barrow-1 failure

Run 42419759766, job 128545476233, failed after 4m24s. Executed exactly once:

gh run view 42419759766 --repo just-every/run-barrow --job 128545476233 --log-failed

The command exited 0 with zero output bytes. There was no transport error or HTTP response body to report. No blob URL was followed manually and no second archive call was made. Its assertion/infrastructure classification is unavailable from this response; it is not claimed fixed. Run 42423519328 also records barrow-1 failed after 4m34s; its log was not requested.

## Initial candidate CI

Verify 42425380906: https://github.com/just-every/run-barrow/actions/runs/42425380906
Expected head: e0e247423f19bea79def103efbf372ba5307b12d
Initial run status: completed/failure, with the workflow adaptation mismatch diagnosed and corrected below.

The packet contains non-secret actual reports and receipts. Evidence publication uses only refs/heads/evidence/sx-barrow-ci-limit-1; it does not signal product acceptance or landing.

## Initial candidate failure and correction

Initial head e0e247423f19bea79def103efbf372ba5307b12d failed Verify 42425380906. The required barrow-1 archive read identified verify-base --offline rejecting adaptation-modified for .github/workflows/verify.yml: its acknowledged hash still described the 12-minute defaults. Contract-docs check passed; this was not a generated-view exception or timeout failure. No infrastructure rerun was indicated. Remaining failed-job archives were not downloaded within the ten-call budget; their exact individual causes are not inferred.

Corrected with node scripts/edition-authoring/cli.mjs adapt-base .github/workflows/verify.yml, regenerated sources.lock.json last, then passed check and verify-base --offline with no drift or unrecorded copies. Only the acknowledged workflow hash changed in base-copies.json; its recorded upstream baseline stayed unchanged. A structure-specific scope assertion confirmed this. An earlier overly broad hash-substitution assertion was rejected because the baseline must remain unchanged; the corrected assertion passed without further product changes.

Current main was fetched after the first published save and remained a465fabc8b49b48e532a02f3364e3bf51373ffb3. The correction was committed normally as 81c69462949c548af17d72ccfc56f2831f484380, preserving published history, and pushed successfully through the guard. All candidate identities and trailers were checked again. The product diff from main contains only verify.yml, base-copies.json and sources.lock.json.

Initial-candidate job durations (these early failures are not workload completion measurements):

| Job | Shard | Result | Duration |
| --- | --- | --- | --- |
| 128562469091 | shards (barrow-5) | failure | 42s |
| 128562469100 | shards (barrow-4) | failure | 59s |
| 128562469114 | shards (barrow-8) | failure | 58s |
| 128562469117 | shards (barrow-1) | failure | 49s |
| 128562469120 | shards (barrow-6) | failure | 41s |
| 128562469130 | shards (barrow-3) | failure | 49s |
| 128562469152 | shards (barrow-2) | failure | 50s |
| 128562469213 | shards (agent-door) | failure | 49s |

One final GitHub call is reserved for exact-SHA discovery of the corrected head after its 21-minute job window plus queue/plan margin. Raw CI environment headers are omitted from the selected sanitized log. Original raw downloaded output remains local and is excluded from public evidence.

## Final candidate CI and blocker

Head: 81c69462949c548af17d72ccfc56f2831f484380

Verify run: 42426600897

URL: https://github.com/just-every/run-barrow/actions/runs/42426600897

Exact-SHA REST result: completed / failure. The expected SHA matched exactly.

Custody: BLOCKED. All ten authorized GitHub calls are used. The corrected head’s failed job IDs, assertions and infrastructure diagnostics could not be inspected within the remaining budget. No green result, generated-view exception, infrastructure classification or assertion fix is claimed for this run. No blind rerun was performed. The earlier adaptation failure was a concrete local fix and its offline check now passes, but that does not establish the cause of this later red run. The fleet must inspect run 42426600897 before accepting this candidate; an identified infrastructure failure gets the brief’s single failed-job rerun, and a real unrelated assertion is reported without being fixed in this timeout task.

Both product pushes succeeded and the completed work remains on cloud/sx-barrow-ci-limit-1. No push rescue bundle was needed because no product push was rejected. No READY or acceptance claim is made. Evidence publication transfers the non-secret report and actual receipts only; it does not alter product custody.
