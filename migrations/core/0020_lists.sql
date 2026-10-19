-- ORD-002: saved shopping lists. Desired SKUs, selling units and quantities only; never prices, stock or promises.
CREATE TABLE bw_lists (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, name TEXT NOT NULL, created_by TEXT NOT NULL, value_json TEXT NOT NULL CHECK(json_valid(value_json)), revision TEXT NOT NULL);
CREATE INDEX bw_lists_account ON bw_lists(account_id, created_by);
