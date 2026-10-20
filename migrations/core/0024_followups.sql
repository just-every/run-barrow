CREATE TABLE bw_followups (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, value_json TEXT NOT NULL CHECK(json_valid(value_json)), revision TEXT NOT NULL);
CREATE INDEX bw_followups_account ON bw_followups(account_id);
