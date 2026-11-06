# sx-barrow-f70fix1 plan

Scope: repair only blocking A from sx-barrow-c-f70-gate-1, based on product commit 15d3b6af52f73b3f1413bcd9bf463e2c6e0461ec. CAT-005 inherits PRI-008: the storefront price-display setting also applies when the buyer opens Order by selling unit. Merchant visual acceptance remains with the BR and Opus hold.

1. Inspect the complete target clause, inherited price requirement, current source, and existing journey. Reproduce the Retail-only option-price failure through the built native buyer page. Keep the current contract statuses and acceptance text.
2. Replace direct wholesale option labels with the existing shared configured-price formatter. Convert recorded optional variant MSRP to the chosen selling-unit basis using the existing exact quantity-price calculation. Preserve wholesale cart and draft accounting.
3. Extend the existing storefront journey, without a new test registration, to inspect retail, wholesale and both display modes, missing MSRP, exact margins and a prepared wholesale-only draft. Capture the affected dialog at 1440 and 390. Run the affected journey, relevant selling-unit API coverage and the typecheck. Keep all pre-existing assertions.
4. Integrate current main under the unpublished-branch rules, regenerate and check contract views, restore generated views from main, regenerate and check the source lock last. Check every candidate commit identity and trailer, push only cloud/sx-barrow-f70fix1 through the fleet guard, inspect exact-SHA Verify, and publish the selected non-secret packet separately on the evidence ref. Leave landing and publication scanning to the Mac lander.

No other clause, acceptance point, homepage, design direction, Base pin, workflow, provider or migration is in scope. No DONE status claim or hold release is proposed.
