# sx-barrow-f71fix1 plan

Scope: fix only the buyer Settings tab regression reported against CAT-005 in Verify 42478158158 / job 128724075422. No clause completion claim, contract status edits, generated views, publication scan, release, deployment, or unrelated feature work.

1. Full-history clone just-every/run-barrow, configure fleet identity and preserving commit hooks, start cloud/sx-barrow-f71fix1 at f4ec1c535298a432f19f4a6c973febb16dbee5a4 and merge origin/main. Preserve main's newer tests and complete contract rows.
2. Reproduce the reported buyer Settings count failure through the existing storefront branding browser journey on the starting head. Keep an actual non-secret before receipt outside the product tree.
3. Remove Settings from the buyer branch of the native app tab list. Preserve owner/staff behavior. The existing journey already asserts zero Settings buttons for both buyers, so no additional regression assertion is needed.
4. Regenerate/check the edition source lock last, keep contract and generated views untouched, commit the fix with fleet identity, inspect every candidate author/committer/trailer and immediately preserve the branch through the cloud push guard.
5. Run the same touched storefront journey and typecheck on the committed candidate. Capture the changed buyer screens at 1440 and 390, using system Chromium with --no-sandbox. Do not run the full local suite.
6. Reconcile any changed main using a merge, retain published history, publish any required final candidate after touched checks, and observe its exact-SHA Verify using the REST budget (one watcher, at most one call per 300 seconds per run; ten calls total).
7. Write the complete report and actual receipts in this packet, publish the explicitly selected non-secret files to evidence/sx-barrow-f71fix1, report the product and evidence provenance separately, and relay the lane POST line in the final message.

## CI-driven implementation detail

The first exact-SHA run passed the originally failing CAT-005 shard but exposed an existing notice journey's dependency on the removed buyer Settings button. Preserve that existing behavior via a collapsed Order notice preferences section in Orders, lazily load it, and refresh notices on successful save. Change only the helper's navigation step; preserve every assertion. Run that affected journey as well as storefront branding, retain the failed first-candidate receipt, and publish the corrected final source lock. For the fast local storefront burst's unchanged admission limit, use the rules' permitted CDP CPU rate 4 rather than changing a limit or assertion. No additional product feature or acceptance point is in scope.

## Terminal result

Final Verify 42482404056 passed the Settings assertions and the notice flow but failed the later unit-order dialog assertion at storefront-branding.test.mjs:193. Ten GitHub calls are used. End BLOCKED on that exact-SHA red check, preserving the pushed fix and complete evidence; do not extend the one-item brief into an unrelated acceptance point or claim READY.
