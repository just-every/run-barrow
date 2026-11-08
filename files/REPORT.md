# sx-barrow-f71fix1 FIX report

Repository: just-every/run-barrow
Product branch: cloud/sx-barrow-f71fix1
Starting candidate: f4ec1c535298a432f19f4a6c973febb16dbee5a4
Merged main: 7459a7c6f841a2530b9744f017374249cbe09806 (already an ancestor on each fetch/merge)
Final product head: 1e9500dae212205e743995f3ba1138519e8db4d0
PR: none; this repository uses the supplied cloud branch and independent fleet landing contract.

## Result

Buyers no longer have a Settings button. Their existing per-account notice preferences remain reachable in Orders → Order notice preferences. Preferences load only when opened; a successful save refreshes the current notice list. Owners and staff retain their Settings navigation and preferences. The existing test helper now opens the buyer disclosure instead of the removed Settings tab; every assertion is preserved.

This fixes only the reported buyer Settings regression while preserving its affected existing notice flow. The round changes five files: `src/barrow/ui/app.tsx`, `src/barrow/ui/order-notices.tsx`, the navigation step in `tests/journeys/order-notices-proof.mjs`, the corresponding sentence in `docs/ORDER-NOTICES.md`, and the regenerated `sources.lock.json`.

No acceptance point, clause Status/Gap/Evidence cell, contract text, generated view, test registration, workflow, Base revision, release or deployment changed. No assertion was weakened or deleted. No publication scan was run, as this FIX brief explicitly forbids one. No new clause completion claim is made.

## Plan and execution

1. Configured fleet identity, refreshed the launcher, installed decrypted-bundle Git authentication, preserving commit hooks and the push guard, and made a fresh full-history clone of the sole declared write repository.
2. Fetched main and the supplied cloud candidate, created the requested branch at the exact starting SHA, and merged main. Main was already included, so its newer tests and whole contract rows remained intact. Later fetch/merge checks also reported already up to date.
3. Ran noninteractive RER setup and built the starting app. Retrieved the immutable pinned Pier source only through `gh api`; no second repository was cloned or written.
4. Ran the existing CAT-005 storefront journey and reproduced the gate's exact failure at `tests/journeys/storefront-branding.test.mjs:72`: the buyer Settings button count expected 0 and observed 1. The initial failing run stopped on Cedar before checking Wren; the after runs reach and pass both buyers.
5. Removed Settings from the buyer tab list, committed, and immediately pushed the first real `[skip ci]` save. The existing two-buyer assertion provided the exact regression coverage; no additional assertion was added.
6. Rebuilt and ran the complete touched storefront journey and typecheck successfully. Regenerated and checked the source lock and pushed the first candidate. Its exact-SHA Verify 42481137438 passed the originally failing barrow-6 job 128733143522, but barrow-4 job 128733143577 failed because the existing notice helper still clicked the removed buyer Settings button.
7. Read that completed job's failed archive exactly once with `gh run view 42481137438 --repo just-every/run-barrow --job 128733143577 --log-failed`. The archive read succeeded. Preserved the existing notice preference behavior inside Orders, retained Settings for owners/staff, and changed only that helper's navigation step. A local assertion caught the need to refresh the notice list in place; the successful-save callback now does so. Lazy loading avoids fetching a closed preference panel.
8. Ran the affected return/notice journey successfully at normal browser speed, including suppression, read-state isolation, current source navigation, return decision quantities, and unchanged money assertions. Ran the full storefront journey successfully with permitted CDP CPU throttling rate 4. One faster local attempt explicitly returned the unchanged 600-requests-per-minute admission limit; another timed out waiting for the unit draft dialog to close. No rate limit, application clock, assertion, timeout or fixture authority was changed. Kept those actual failed receipts too.
9. Fetched and merged main again (already up to date), checked contract documents, regenerated the source lock last, and checked it. Committed and guarded-pushed the final product SHA after touched checks passed. Repeated the notice journey on the final committed HEAD to capture the complete changed screen at both widths; it passed at normal speed. A screenshot-only preload replaced the shared helper's clipped preference images with full-page captures.
10. Checked all candidate authors, committers and messages, including side parents, before every push. Identities are fleet or the supplied owner; no co-author trailers are present. The inherited published merge's Validation prose remains intact. All saves were ordinary forward pushes, with `[skip ci]` on intermediate saves; published history was never rewritten.
11. Observed Verify only by exact-SHA REST with one watcher and the required minimum polling interval, within the ten-call budget. Kept the plan, actual logs, screenshots and receipts outside product Git and selected them explicitly for report-only evidence transport.

## Before and after

| Measure | Before | After |
| --- | --- | --- |
| Buyer Settings buttons | 1 on the observed failing Cedar page | 0 for Cedar and Wren |
| CAT-005 journey passed / failed | 0 / 1 | 1 / 0 |
| Affected notice journey | first candidate CI times out on removed Settings | 1 pass / 0 fail, normal browser speed |
| Test registrations in the two affected journey files | 2 | 2 |
| Assertions added / removed / weakened | 0 / 0 / 0 | 0 / 0 / 0 |
| Contract done / partial / missing / total | 72 / 45 / 37 / 154 | 72 / 45 / 37 / 154 |
| Clause status changes | none | none |

The storefront and return journey files are byte-identical to the starting candidate. The notice helper differs by exactly one navigation locator, from the removed Settings button to the Order notice preferences disclosure. All its assertions are byte-identical. No broader acceptance point is claimed.

## Validation and receipts

- `before-journey.log`: exact initial regression, exit 1, expected 0 / observed 1 at line 72.
- `after-journey.log`: first one-line candidate's full storefront journey, 1 pass / 0 fail.
- `final-storefront-journey.log`: final app bytes, full existing storefront journey, 1 pass / 0 fail, CDP CPU rate 4.
- `final-notice-journey.log`: final committed HEAD, existing return/notice journey, 1 pass / 0 fail at normal speed.
- `final-build.log`, `final-typecheck.log`: successful production build and typecheck. `fast-local-journeys.log` additionally records the passing notice journey and the faster storefront run's later dialog timeout; `interim-journeys.log` records the earlier refresh and rate-limit failures. These superseded failures are retained honestly, not represented as passing checks.
- `final-contract-check.log`: documents match, 72 / 45 / 37 / 154.
- `final-source-lock.log`: documented lock/check commands succeeded; the diff records only four changed source/document/helper hashes.
- `LOCAL-RECEIPT.json`: final machine-readable source identities, check results and before/after counts. Earlier local/CI receipts are explicitly prefixed `first-`.
- `ci-jobs.json` and `ci-barrow-4-failed.log`: actual failed first-candidate metadata and archive. `final-ci-jobs.json`, `final-ci-barrow-6-failed.log` and `CI-RECEIPT.json` record the final exact-SHA failure. Each failed shard archive was read once; both archive reads succeeded.
- `product-diff.patch`: complete final diff from the supplied starting candidate.
- `identity-check.txt`, `candidate-messages.txt`, and the named push logs: identity review and successful product custody.
- `storefront-buyer-validation-{1440,390}.png` and `storefront-second-buyer-{1440,390}.png`: both buyers' native navigation without Settings.
- `order-notices-settings-{1440,390}.png`: native buyer Orders, its preferences disclosure, and the dispatch preference turned off.
- `browser-throttle.mjs` and `capture-preferences.mjs`: actual non-secret local browser timing/capture instrumentation; neither changes a test assertion or application behavior.

Assertions run at the journeys' existing 1440 width; the shared capture helper shows the changed screens at 1440 and 390. Local runtime: Node 24.19.0, pnpm 10.12.4, system Chromium `/usr/bin/chromium` headless with `--no-sandbox`. The supplied toolchain shim keeps newer Node, while CI pins 22.20.0. Native fixture TLS warnings occurred in both failing and passing runs. All browsers and native servers started by the tests closed through their harness/subreaper.

The final storefront run used source commit f530e1e; app and test bytes are identical on final HEAD, whose only subsequent change was the regenerated lock. The final notice/capture run used the final committed HEAD itself. The exact-SHA CI run supplies the full branch verification bar.

## CI and terminal custody

Original gate reference: Verify 42478158158 / job 128724075422 (provided reference; not reused as new proof).
Superseded candidate: 7f3b06953df6b2d82c290539b03e4e774bba0432, Verify 42481137438, failure in barrow-4 job 128733143577; originally failing barrow-6 job 128733143522 passed.
Final product: cloud/sx-barrow-f71fix1 at 1e9500dae212205e743995f3ba1138519e8db4d0, pushed successfully.
Final exact-SHA Verify: 42482404056, https://github.com/just-every/run-barrow/actions/runs/42482404056, completed/failure on 1e9500dae212205e743995f3ba1138519e8db4d0, observed at 2026-11-08T13:12:21Z. Barrow-4 job 128737026188 passed, including the preserved notice preference journey. Barrow-6 job 128737026109 reached the later storefront unit-order dialog assertion at tests/journeys/storefront-branding.test.mjs:193, which expected the dialog to close (0) but observed 1 after 5000 ms. The buyer Settings assertions at line 72 were passed before that later failure.

No product landing or independent gate verdict is claimed. Clause statuses remain unchanged. Terminal status is BLOCKED: final exact-SHA Verify is red at the later storefront unit-order dialog assertion, outside the one buyer Settings item authorized by this FIX brief. The failed log does not establish the underlying response or root cause. A local fast run also timed out there; an earlier fast run explicitly hit request admission, and the unchanged full journey passed with allowed CDP CPU throttling. Those observations are retained without claiming that the CI cause is proven. The ten-call GitHub budget is exhausted; no workflow was rerun or dispatched and no no-op commit was made. The fully pushed product and complete evidence remain available for the lane. Evidence custody is separate from product readiness.
