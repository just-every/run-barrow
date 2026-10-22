-- DATA-003: receipts carry opaque attribution and counts, never erased values.
ALTER TABLE bw_retention_requests ADD COLUMN requester TEXT NOT NULL DEFAULT 'Signed-in owner';
ALTER TABLE bw_retention_requests ADD COLUMN channel TEXT NOT NULL DEFAULT 'Owner review';
ALTER TABLE bw_retention_requests ADD COLUMN verification_note TEXT NOT NULL DEFAULT 'Verified through the current owner session';
CREATE TABLE bw_account_erasure_journal (
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL, fingerprint TEXT NOT NULL,
 receipt_json TEXT NOT NULL CHECK(json_valid(receipt_json))
);
