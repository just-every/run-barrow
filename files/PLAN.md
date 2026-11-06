# sx-barrow-c-f75 repair plan

Scope is the four findings from sx-barrow-c-f74-gate-1 only. INT-003 remains PARTIAL; no acceptance, Status, Gap or Evidence cells will change.

1. Reproduce the privacy exposure through account-scoped finance follow-up HTTP and CSV reads, then enforce account scope before financial task admission. Cover allowed and foreign reads, private contact notes, updates and assignment.
2. Confirm current Xero granular read scopes from the provider reference. Request only the minimum reviewed read permissions; reject missing or write permissions on callback and credential rotation. Retain owner and tenant consent checks.
3. Handle valid account reference rows whose optional Code is absent, without losing the rest of a bounded page. Keep durable account identity distinct from optional invoice line codes, and bind reviewed mappings to stable provider identity.
4. Retain source-linked voided invoice observations so a formerly matched native invoice becomes an owned reconciliation conflict instead of an unexplained aggregate difference. Keep native money and issued records unchanged.
5. Extend existing public-door accounting coverage within the 200-registration cap. Run covering tests and typecheck; run generator write and check, restore generated views, regenerate and check source lock last.
6. Integrate current main while preserving newer contract judgments. Audit every outgoing commit identity and trailer, push only cloud/sx-barrow-c-f75 through the guard, record exact-SHA CI honestly, and publish the separate report packet.
