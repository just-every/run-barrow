-- AUTO-002: in-app approval notices. One row per person per waiting step of one company-approval request (the order's
-- companyRequestedAt), so reruns, retries and restores never notify anyone twice. A notice closes when its step is
-- decided, the request is released, voided, withdrawn or superseded, or the person can no longer decide it.
CREATE TABLE bw_approval_notices (
 id TEXT PRIMARY KEY,
 order_id TEXT NOT NULL,
 account_id TEXT NOT NULL,
 request_key TEXT NOT NULL,
 step INTEGER NOT NULL CHECK(step >= 1),
 recipient_id TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('approver','delegate','escalation')),
 delegated_from TEXT,
 cause TEXT NOT NULL,
 created_at TEXT NOT NULL,
 closed_at TEXT,
 closed_reason TEXT,
 UNIQUE(order_id, request_key, step, recipient_id)
);
CREATE INDEX bw_approval_notices_recipient ON bw_approval_notices(recipient_id, closed_at);
CREATE INDEX bw_approval_notices_order ON bw_approval_notices(order_id, closed_at);
