# Retention review API

DATA-003 remains partial. Only the signed-in owner can use these HTTP doors. They use the existing same-origin session checks; agents, admins and buyers are refused.

`GET /api/barrow/retention` returns policy, PO review candidates, account hold requests, receipts and separate custody labels. Reading never deletes. Null retention days mean no age-based nomination. Media, messages and commercial-history policy values are recorded for future workflows; this door only erases local PO bytes.

POST `/api/barrow/commands` with `{type, payload}`:

- `retention.settings`: `revision` from the current policy (null initially), `days` with all four keys `poDocuments`, `media`, `messages`, `commercialHistory` (null or whole days 1–36500), and `reason`.
- `retention.request`: `accountId`, current request `revision` when updating, boolean `held`, and `reason`. Holding preserves history and blocks account and PO erasure; releasing records the owner and reason and deletes nothing.
- `retention.erase-document`: `orderId`, `revision`, `sha256`, `policyRevision` from the review list, `confirm: "ERASE"`, and `reason`. Only a currently eligible unheld document is erased. A receipt records actor, time and hash; order metadata and history remain.

Expiry is strictly after the configured elapsed 24-hour days from recorded upload. Commercial PO evidence keeps at least seven calendar years after the latest recorded preparation, approval or invoice issue, in UTC (February 29 clamps to February 28). Settings cannot shorten that floor. Future financial sources must extend it before shipping. An unrecorded upload date is never eligible.

After erasure, make a newer archive. Restore an older archive only with the newer erasure journal, through the existing documented restore door; it refuses the pre-erasure archive. Base identities, inventory, accounting and delivered mail remain in separate custody and are never reported erased by this operation.
