CREATE TABLE bw_confirmations (
 order_id TEXT NOT NULL,
 number INTEGER NOT NULL,
 stage TEXT NOT NULL,
 created_at TEXT NOT NULL,
 value_json TEXT NOT NULL,
 PRIMARY KEY(order_id,number),
 UNIQUE(order_id,stage)
);
