-- ORD-004: negotiated wholesale quotes. order_id links the one order an accepted quote converted into.
CREATE TABLE bw_quotes (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, value_json TEXT NOT NULL CHECK(json_valid(value_json)), revision TEXT NOT NULL, order_id TEXT UNIQUE);
CREATE INDEX bw_quotes_account ON bw_quotes(account_id);
