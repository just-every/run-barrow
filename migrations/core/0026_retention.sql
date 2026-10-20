CREATE TABLE bw_retention_requests (
 id TEXT PRIMARY KEY,
 account_id TEXT NOT NULL,
 reason TEXT NOT NULL,
 held INTEGER NOT NULL CHECK(held IN (0,1)),
 revision TEXT NOT NULL,
 requested_by TEXT NOT NULL,
 requested_at TEXT NOT NULL
);
CREATE TABLE bw_erasure_receipts (
 id TEXT PRIMARY KEY,
 order_id TEXT NOT NULL,
 account_id TEXT NOT NULL,
 document_sha256 TEXT NOT NULL,
 actor_id TEXT NOT NULL,
 erased_at TEXT NOT NULL,
 reason TEXT NOT NULL
);
