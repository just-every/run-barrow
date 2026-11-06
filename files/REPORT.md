# sx-barrow-f70fix1 result

Blocking A is repaired on `cloud/sx-barrow-f70fix1` at `4f2404de76bb73bcff011cab2379de7759e96704` in just-every/run-barrow. The product branch was pushed successfully on the first guarded attempt. No PR was created; this repository starts Verify on branch pushes. Landing remains ordered after the supplied base tag.

CAT-005 remains PARTIAL → PARTIAL. Counts remain 73 DONE, 44 PARTIAL and 37 MISSING. No acceptance sentence, status, Gap, judgment, homepage, workflow, Base pin or migration changed. The BR and Opus visual hold remains. Only CAT-005's plan evidence row needs the new selling-unit proof noted; no other plan row changes.

## Completed plan and product result

The full scoped plan is in PLAN.md. I inspected CAT-005 and inherited PRI-008, reproduced the reported buyer door against the supplied base, repaired the price labels, extended the existing journey, checked the affected behavior and types, checked generation and source integrity, pushed the named branch, and prepared this separate evidence packet. This round addresses only the gate's blocking A finding.

`src/barrow/ui/unit-order.tsx:12` reads the storefront display choice, retaining wholesale as the legacy default. Lines 39–44 reuse the shared configured-price labels for the selling-unit options and a wrapping selected-unit readout. The readout preserves visibility on the phone where a native select may truncate its option text. Optional recorded variant MSRP is converted to the chosen unit basis by the existing exact quantity-price calculation; it is never inferred from a wholesale amount. Both mode uses comparable selling-unit amounts for margin. Missing MSRP remains explicitly absent. Order preparation, line pricing and wholesale totals are unchanged.

The pre-fix public-page probe failed with the actual option text `case · 1 case · USD 65.00 per case` and `pallet · 2 cases per pallet · USD 120.00 per pallet` under Retail only, instead of MSRP USD 130.00 and USD 260.00. The corrected regression test checks those exact MSRP amounts, wholesale-only options, both-mode 50.00% and 53.85% margins, missing MSRP and the selected-unit readout. It observes a USD 240.00 retail-mode cart total, then prepares two pallets under wholesale mode and reads the resulting native order with unitCents 12000, baseQuantity 4 and totalCents 24000. MSRP never changes the charged total.

`tests/journeys/storefront-branding.test.mjs:162` extends the existing named journey “owner publishes and revises merchant identity, unsafe saves change nothing, and two buyers keep exact prices through validation and supplier confirmation”. All existing assertions remain; no test registration was added or deleted. Tests assert at 1440. The affected screen is captured at 1440 and 390, with no horizontal overflow. The selected MSRP is readable in the final phone capture. All controls in the changed dialog have text labels; the added readout uses the existing paragraph styling.

PROBE CAT-005 A: buyer Order by selling unit under Retail only → MSRP USD 130.00 per case and USD 260.00 per pallet, no wholesale option price; missing MSRP stays absent; both mode shows exact margins; two pallets prepare USD 240.00 wholesale.

## Validation and custody

- Build: `cloud_run npx -y @runeditrun/rer build`, exit 0.
- Typecheck: `pnpm run typecheck`, exit 0 on the final source bytes.
- Existing storefront journey: `timeout 1200 node --test --test-concurrency=1 tests/journeys/storefront-branding.test.mjs`, 1 passed, exit 0, rerun on the pushed full SHA above. It remains invoked by push Verify's existing barrow-6 command.
- Relevant selling-unit API journey: `timeout 600 node --test --test-concurrency=1 tests/api/units.test.mjs`, 1 passed, exit 0. It exercises actual mixed units, exact base stock, immutable invoice amounts and measured rounding. No API source changed in this round.
- Command contract: `pnpm exec rer check --profile first-party`, exit 0 on the pushed head.
- Source lock: regenerated last and checked successfully; the committed head's check also exits 0.
- Contract generation: `node scripts/contract-docs.mjs write`, then `check`, both exit 0. ACCEPTANCE.md and docs/CLAIMS.md were restored whole from origin/main and are not included in this round's commit. The subsequent check exits 1 with `ACCEPTANCE.md is stale`, as required by the cloud generated-view exception. The lander regenerates these views before landing.
- No migration was changed, so the migration ledger check is not applicable.
- Both parent and staged CONTRACT.md retain 178 table rows. Every candidate commit, including side parents, has the fleet author and committer identity and no coauthor trailer. Product checkout was clean after push, and the remote branch advertises the exact reported SHA.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock and check exit=0; views=node scripts/contract-docs.mjs write and check exit=0; ledger=none exit=0. Generated views restored after proof; their stale committed view is the permitted exception.

Current origin/main is `297b78740b0037045e0da786340b24bb8079ca57`, already contained in the supplied base `15d3b6af52f73b3f1413bcd9bf463e2c6e0461ec`. The requested rebase attempted to flatten that base's published merge and encountered inherited conflicts. I aborted the rebase without making a replay commit, restored the repair patch, and kept the published base unchanged; merging origin/main was already up to date. A final fetch again confirmed main was contained. No published history was rewritten and no main push occurred.

Local test development had two setup-only failures retained in the packet: the new draft initially changed the subsequent page's reload state, and an overly repetitive draft of the mode transitions exceeded the existing 600-request admission window. The final journey reuses its existing mode publications and reloads, leaves the guard untouched, and passes with all pre-existing assertions. No CI repair, workflow dispatch or rerun was performed.

Exact-SHA push Verify run [42221982436](https://github.com/just-every/run-barrow/actions/runs/42221982436) completed with conclusion `failure`. All eight source-lock steps passed; all eight shard failures occurred in Run this shard, whose first declared command is `node scripts/contract-docs.mjs check`. The storefront shard 127906107617 and agent-door shard 127906107554 logs both confirm `Error: ACCEPTANCE.md is stale; run node scripts/contract-docs.mjs write.` The aggregate verify job 127906388121 consequently failed its selected-coverage check. This is the explicitly permitted generated-view exception, so the pushed candidate is handed off READY; it is not reported as a green workflow. CI did not reach the journeys. Their passing proof is the exact-SHA local run. No CI rerun or workflow edit was used. Seven GitHub invocations were used, including one empty discovery with an incorrect SHA filter; the corrected discovery and final status are bound to the actual full product SHA.

Publication scanning and Run site remain with the Mac lander. No COMPLETE scan, main equality, Run site success, DONE judgment or hold release is claimed here. The round's product repair has no remaining local blocker. Existing whole-clause gaps and holds remain exactly as recorded in CONTRACT.md. This is not a new DONE claim, so no DONE-RIDERS status promotion or judge request is made.

The actual non-secret logs, receipt, complete plan and final captures are selected explicitly for the evidence ref. They are excluded from the product branch. The packet and receipt remain outside the disposable product checkout.

VERIFY_REPRODUCED {"head":"15d3b6af52f73b3f1413bcd9bf463e2c6e0461ec","job":"sx-barrow-c-f70-gate-1 blocking A public-door reproduction","command":"timeout 1200 node --test --test-concurrency=1 tests/journeys/storefront-branding.test.mjs","test":"selling-unit Retail-only options in the existing storefront journey","exit":1,"failure":"Received case USD 65.00 and pallet USD 120.00 instead of MSRP USD 130.00 and USD 260.00"}

The reproduction used the unchanged base application build with the added public-door regression assertions in the working tree; it is gate-finding proof, not a claim that this test extension existed in the base commit.
