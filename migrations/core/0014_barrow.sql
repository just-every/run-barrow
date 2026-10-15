CREATE TABLE bw_accounts (id TEXT PRIMARY KEY, value_json TEXT NOT NULL CHECK(json_valid(value_json)), revision TEXT NOT NULL);
CREATE UNIQUE INDEX bw_account_email ON bw_accounts(json_extract(value_json,'$.email'));
CREATE TABLE bw_orders (id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES bw_accounts(id), value_json TEXT NOT NULL CHECK(json_valid(value_json)), revision TEXT NOT NULL);
CREATE INDEX bw_order_account ON bw_orders(account_id);
CREATE TABLE bw_audit (id TEXT PRIMARY KEY, subject_id TEXT NOT NULL, actor_id TEXT NOT NULL, action TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE bw_agent_tokens (id TEXT PRIMARY KEY, digest TEXT NOT NULL UNIQUE, actor_id TEXT NOT NULL REFERENCES oa_operators(id), actor_version INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE bw_guard (value INTEGER NOT NULL CHECK(value=1));
