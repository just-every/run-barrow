CREATE TABLE bw_tracking_packages (
 id TEXT PRIMARY KEY,
 order_id TEXT NOT NULL REFERENCES bw_orders(id),
 account_id TEXT NOT NULL,
 tracker_id TEXT NOT NULL UNIQUE,
 value_json TEXT NOT NULL,
 revision TEXT NOT NULL
);
CREATE INDEX bw_tracking_order ON bw_tracking_packages(order_id);
CREATE TABLE bw_tracking_epoch (singleton INTEGER PRIMARY KEY CHECK(singleton=1), value INTEGER NOT NULL);
INSERT INTO bw_tracking_epoch VALUES(1,0);
