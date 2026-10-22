CREATE TABLE bw_line_sheets (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, value_json TEXT NOT NULL, revision TEXT NOT NULL);
CREATE INDEX bw_line_sheets_account ON bw_line_sheets(account_id);
CREATE TABLE bw_sheet_events (id TEXT PRIMARY KEY, sheet_id TEXT NOT NULL, account_id TEXT NOT NULL, actor_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('open','view')), skus_json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX bw_sheet_events_account ON bw_sheet_events(account_id,created_at);
