CREATE TABLE bw_stock_sync (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1), consumer TEXT NOT NULL, origin TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 0, page_limit INTEGER NOT NULL DEFAULT 100, checkpoint TEXT, pending TEXT, lease_until INTEGER NOT NULL DEFAULT 0,
 failures INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0, observed_at TEXT,
 processed INTEGER NOT NULL DEFAULT 0, has_more INTEGER NOT NULL DEFAULT 1,
 task_owner TEXT, task_status TEXT, task_reason TEXT, resolution TEXT
);
CREATE TABLE bw_stock_events (id TEXT PRIMARY KEY, sequence INTEGER NOT NULL, value_json TEXT NOT NULL);
CREATE TABLE bw_stock_watches (
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL, user_id TEXT NOT NULL, sku TEXT NOT NULL,
 active INTEGER NOT NULL, created_at TEXT NOT NULL, UNIQUE(account_id,user_id,sku)
);
CREATE TABLE bw_stock_notices (
 id TEXT PRIMARY KEY, watch_id TEXT NOT NULL, account_id TEXT NOT NULL, user_id TEXT NOT NULL,
 sku TEXT NOT NULL, event_id TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(watch_id,event_id)
);
