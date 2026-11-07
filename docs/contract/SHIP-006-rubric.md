# SHIP-006 frozen rubric

Frozen by ct on 4 November 2026 under RL-101, following the SHIP-005 f34/f35 two-FIX loop and `sx-barrow-c-f35` gate-1 blocking B. This is a future build and judgment requirement; no implementation or passing proof is claimed.

Use the owner account-erasure door, service export and case read with nonempty service and original-order fixtures. Include distinct, nonempty purchaser acceptance names and every other personal field held in each service snapshot, so missing or empty snapshots cannot satisfy the rubric.

1. **Post-retention allowed erasure:** erase an eligible account as its owner after the retention period has expired. Inspect the original order and all linked service snapshots: the purchaser acceptance name and every other personal snapshot field are redacted together with the original order.
2. **Service export and case read after erasure:** exercise both doors for the erased account. Neither returns the erased personal values. Each unsafe export or read is refused or returns redacted values and changes nothing.
3. **Retained-period refusal and no-change control:** attempt owner account erasure for a separate account whose retention period has not expired, with nonempty order and service snapshots. The attempt is refused. The account, original order and service snapshots remain unchanged, including their personal values; service export and case read retain the authorized pre-attempt values.

SHIP-005 and its two blocking A findings remain unchanged. This rubric excludes no seed-provable outcome as field proof and releases neither the `sx-barrow-c-f35` landing nor the supported hold pending independent Opus review.
