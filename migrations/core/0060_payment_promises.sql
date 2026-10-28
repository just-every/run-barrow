CREATE TABLE bw_payment_promises (
 id TEXT PRIMARY KEY,
 account_id TEXT NOT NULL,
 order_id TEXT NOT NULL UNIQUE,
 value_json TEXT NOT NULL,
 revision TEXT NOT NULL
);
CREATE INDEX bw_payment_promises_account ON bw_payment_promises(account_id);
