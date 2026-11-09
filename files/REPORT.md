# sx-barrow-c-harness-1 report

Repository: just-every/run-barrow
Branch: cloud/sx-barrow-c-harness-1
Final product head: cae70103a3d4f4f11cdf6bb8acf10fad1b2124f9
Base main head: 1e9500dae212205e743995f3ba1138519e8db4d0
PR: none; the fleet owns branch admission and landing.
Blockers for the requested harness fix: none.

## Plan and implementation

The full plan and its approval-synchronization follow-up are in PLAN.md. Refreshed the launcher, installed the required decrypted-bundle Git helper, guarded push entrypoint and commit-message hooks, and cloned Barrow with full history. The pinned Pier source was read through gh api as an immutable tarball at 60fde60ffa1f44c2ae6a3ef47225117f36cf546a; no other repository was cloned or written.

The product limiter keys its unchanged admission bucket on CF-Connecting-IP. Changed tests/journeys/browser-helpers.mjs to give each signed browser context a stable synthetic IP in the benchmark test network. Independent contexts represent independent browser actors or call groups; repeated requests within one context retain the same bucket. Direct HTTP harness calls retain their existing behavior. The shared helper serves 36 registered journey files and additional proof utilities.

Extended the existing atomic per-IP limiter test in tests/api/validation.test.mjs. It now opens two real browser contexts with the journey helper, sets their existing fixture buckets at the existing boundary, proves one client's repeated requests still reach 429, and proves the second browser client and the direct HTTP client remain admitted. The original cross-door, atomicity, expiry and privacy assertions remain. This test uses HTTPS for native secure browser cookies. No registration was added.

The initial five-case run exposed a separate synchronization race: the owner clicked Approve & reserve stock, then the existing 5-second rendered assertion ran while the approval HTTP request was still pending. The final storefront journey waits for that single order.approve response, requires HTTP 200, then executes the unchanged rendered approved assertion. This makes no additional request and adds no retry, sleep or product change.

Regenerated sources.lock.json last and checked it. The final changed paths are tests/api/validation.test.mjs, tests/journeys/browser-helpers.mjs, tests/journeys/storefront-branding.test.mjs and sources.lock.json. See candidate.diff. No src/**, CONTRACT.md, generated contract view, product threshold, retry, sleep or skip was changed. Direct test registrations: 200 before, 200 after. Clause/status changes: none. No DONE claim or landing is made.

## Before and after evidence

1. The unchanged storefront-branding journey passed locally once on the main source: 1 pass, 0 failures, 218611.566882 ms. The reported main failure is timing-dependent and did not naturally reproduce in that run. before.log preserves the actual result.
2. Controlled reproduction with origin/main's browser helper failed the added independent-client assertion: the second browser client received 429 instead of 200. control-before.log preserves that failure.
3. The identical controlled check with the isolated helper passed: 1 pass, 0 failures, 0 skips, 17596.117019 ms. control-after.log preserves it, including the deliberate 429 proving the product limit still enforces one client's bucket.
4. The first five-case proof on 9b6a81cd794d5404cddb870554ceeef094e26cbd recorded 20 distinct browser clients and zero HTTP 429 responses. Four repetitions passed; one failed the pending-approval rendered assertion described above. storefront-five-initial.log and repeat-storefront-initial.mjs preserve that complete attempt. That head passed Verify run 42597524801.
5. The final complete storefront journey ran five times serially in one Node 22.20.0 process (PID 6578) on cae70103a3d4f4f11cdf6bb8acf10fad1b2124f9: 5 passes, 0 failures, 0 skips, 20 distinct browser contexts/client IPs, and zero HTTP 429 responses. Duration: 761005.51877 ms. storefront-five.log and repeat-storefront.mjs preserve the complete proof. No RATE_LIMIT failure occurred.
6. The entire touched validation file passed all 5 tests on pinned Node 22.20.0: 0 failures/skips, 139426.8137 ms. validation-full.log preserves the run. The covered validation/helper bytes are unchanged on the final head.
7. Final-head typecheck passed. Edition source lock check passed. The candidate diff passed whitespace and path-scope checks. All existing test registrations and assertions remain.

The repetition command was `cloud_run node --test --test-concurrency=1 ../packet/repeat-storefront.mjs`, after sourcing /tmp/rer-cloud-toolchain.sh, selecting the repository's pinned Node 22.20.0, setting BARROW_PIER_SOURCE to the immutable extracted source, BARROW_CHROMIUM_PATH=/usr/bin/chromium, and an external BARROW_JOURNEY_EVIDENCE directory. The external runner imports the complete journey five times in one test process, retains the shared harness/helper modules, counts all browser 429 responses and requires 20 distinct client addresses. Screens at the journey's existing 1440/390 widths remain outside the product repository; there is no product UI change.

## Publication and CI custody

The three product commits are 4526a8b8005d350102469f5d9b7c7c7bec0402a0 (save, skip CI), 9b6a81cd794d5404cddb870554ceeef094e26cbd (limiter regression), and cae70103a3d4f4f11cdf6bb8acf10fad1b2124f9 (approval synchronization). Every author and committer is Run Edit Run fleet with fleet@runeditrun.com; trailers are absent. Inspected every candidate commit, including side parents, before each push. Every product push used cloud-push.py and succeeded; no force push or default-branch push occurred. After the published save, fresh main was merged without rewriting published history and was already up to date. The first pre-save rebase attempt refused the dirty worktree; it changed no history, and that fetched main tip matched the base above.

Final exact-SHA Verify: completed/success, run 42598945289, head cae70103a3d4f4f11cdf6bb8acf10fad1b2124f9.
https://github.com/just-every/run-barrow/actions/runs/42598945289
Previous exact-SHA Verify: completed/success, run 42597524801, head 9b6a81cd794d5404cddb870554ceeef094e26cbd.
https://github.com/just-every/run-barrow/actions/runs/42597524801

Used one REST watcher per head and at least 300 seconds between checks for each run. Eight explicit GitHub command calls were recorded, including the pinned Pier source read; no rerun or dispatch was requested. Actual discovery, status and call ledger files are included.

Base's complete publication scan is deferred to the fleet landing machine under the cloud override. Local scope, identities, trailers and additions were reviewed. The cloud did not land, deploy or change main. Evidence publication is a separate report-only transfer and does not establish acceptance or landing.

## Environment limitation retained honestly

The required rer setup built successfully and applied 80 local migrations, then failed its development listener readiness handshake. The independent Miniflare HTTP/D1/browser harness works, as the actual passing local runs and exact-SHA CI prove. No product setup code was changed. Node 24.19.0 was used in the initial local runs; the final complete proof, full validation run and final typecheck used pinned Node 22.20.0.

The packet contains actual non-secret reports and receipts only. It excludes credentials, environment dumps, private held-out material, symlinks and private sign-in links. It is published only to evidence/sx-barrow-c-harness-1, outside the product branch. receipt.json and the transfer manifest bind the results to the final product head. The fleet owns the remaining publication scan and landing gates.
