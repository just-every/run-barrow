CREATE TABLE bw_service_cases (
 id TEXT PRIMARY KEY,
 account_id TEXT NOT NULL,
 order_id TEXT NOT NULL,
 request_key TEXT NOT NULL UNIQUE,
 value_json TEXT NOT NULL,
 revision TEXT NOT NULL
);
CREATE INDEX bw_service_cases_order ON bw_service_cases(order_id);
CREATE TABLE bw_service_epoch (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL);
INSERT INTO bw_service_epoch VALUES(1,0);
