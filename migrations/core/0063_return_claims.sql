CREATE TABLE bw_return_claims (
 id TEXT PRIMARY KEY,
 account_id TEXT NOT NULL,
 order_id TEXT NOT NULL,
 value_json TEXT NOT NULL,
 revision TEXT NOT NULL
);
CREATE INDEX bw_return_claims_order ON bw_return_claims(order_id);
CREATE TABLE bw_return_claim_epoch (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL);
INSERT INTO bw_return_claim_epoch VALUES(1,0);
