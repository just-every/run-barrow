# Barrow contract

**BAR-001 — Accounts and access.** All product HTTP handlers authenticate the current native session or a revocable agent grant. Supplier actions require owner/admin; customer access is bound to the exact account email. Mutations require same origin for browser sessions and current SQL authority at writes. Agent credentials prepare drafts only.

**BAR-002 — Orders and invoices.** Barrow stores price/term snapshots and approval identities, then submits one idempotent order command to the recorded Pier origin. Pier remains the stock authority. A partial reservation is explicit; an invoice export requires every ordered unit reserved. Amounts use integer AUD cents, with no tax calculation or money movement.

**BAR-003 — Agent preparation.** Revocable, seven-day credentials read catalogues and prepare drafts. People submit and approve; the server records each identity. Agents cannot approve, export, import or erase.

**BAR-004 — Account move-in.** Base import-kit retains reviewed plans, source custody and undo. Native edits and order dependencies block strict undo. 

**BAR-005 — Export, restore and erasure.** Owner exports restore commercial records while excluding authentication and connection credentials. Erasing an unused account retires its import custody and commits the portability redaction checkpoint atomically; later journals fence old backups. Ordered accounts retain commercial history. Authentication and Pier data have separate custody.

Hono owns health/API; TanStack Start serves application documents. Base supplies sign-in, first-run setup, theme, command lifecycle and portability. Applied migrations and deployment identities are preserved.
