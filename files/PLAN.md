# sx-barrow-c-harness-1 plan

Repository: just-every/run-barrow. Product branch: cloud/sx-barrow-c-harness-1.
Scope: tests/** journey and harness changes only, plus regenerated sources.lock.json if needed. No src/**, CONTRACT.md, generated contract views, product limits, retries, sleeps or skips.

1. Configure fleet identity, decrypted-bundle Git helper, publication hooks and guarded product pushes; use a fresh full-history clone from origin/main.
2. Read the repository rules, storefront journey, shared HTTP/browser harness and the production request-limiter key without changing production code.
3. Run the unchanged storefront-branding journey and preserve the actual result. Use the exact pinned Pier source obtained only through gh api, with Chromium at /usr/bin/chromium.
4. Give each signed browser context a stable synthetic client IP so browser actors and direct harness calls do not share the loopback admission bucket. Extend the existing atomic limiter test to prove stable per-context enforcement and isolation through real browser HTTP requests. Preserve every existing assertion and registration; the repository is at its cap of 200 direct test registrations.
5. Run the failing storefront journey after the fix, then repeat the complete storefront journey five times serially in a single Node process. Run relevant harness/public-door checks and typecheck, count registrations, regenerate/check sources.lock.json last.
6. Commit with fleet identity and hooks, inspect all candidate authors/committers/trailers, and push only the named branch using cloud-push.py. Merge fresh origin/main after any published save; never rewrite published history.
7. Discover and poll exact-SHA Verify through gh api, no more than once per 300 seconds per run and within ten GitHub calls. Preserve actual check receipts and publish explicitly selected non-secret reports only to evidence/sx-barrow-c-harness-1. Leave landing to the fleet.

No clause status changes or DONE claims are intended. Publication scan is performed by the fleet on its landing machine, per the cloud override; this VM will review its candidate diff for credential-shaped additions.

## Approval synchronization follow-up

The first five-case proof showed zero HTTP 429 responses and four passing journeys. One case reached the rendered approved assertion before the real order.approve HTTP response completed. Preserve that complete initial log, wait for that specific response with status 200 before the original assertion, then repeat all five journeys on the new committed head using the pinned Node 22.20.0 runtime. This is one awaited public operation, with no retries, sleeps or product-limit change.
