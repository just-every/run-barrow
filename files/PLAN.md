# FIX A plan

Scope: only the gate finding for CAT-005 inherited PRI-008 display in Order by selling unit. CAT-005 remains partial; no acceptance or policy changes.

1. Reproduce the retail-only unit selector showing wholesale and omitting MSRP through the existing built storefront journey.
2. Use the existing shared price-display formatter for unit choices and the selected unit. Convert informational variant MSRP onto the selected unit's base quantity with the existing exact quantity arithmetic. Preserve wholesale order calculations and command payloads.
3. Extend the same journey, without a new registration, to cover retail, both and wholesale modes, missing MSRP, account isolation and a unit draft whose commercial cents stay wholesale. Capture the changed panel at 1440 and 390.
4. Run the touched journey and relevant unit API test, typecheck and first-party command check. Regenerate contract views, check, restore generated files from main, then lock and check.
5. Reconcile main without rewriting published history, inspect every candidate identity and trailer, push the named branch once, discover exact-SHA Verify, and publish actual reports and receipts only on the evidence ref.
