-- ORD-014: an order may record any number of revised confirmations; submitted and accepted stay once per order.
CREATE TABLE bw_confirmations_revised (
 order_id TEXT NOT NULL,
 number INTEGER NOT NULL,
 stage TEXT NOT NULL,
 created_at TEXT NOT NULL,
 value_json TEXT NOT NULL,
 PRIMARY KEY(order_id,number)
);
INSERT INTO bw_confirmations_revised(order_id,number,stage,created_at,value_json) SELECT order_id,number,stage,created_at,value_json FROM bw_confirmations;
DROP TABLE bw_confirmations;
ALTER TABLE bw_confirmations_revised RENAME TO bw_confirmations;
CREATE UNIQUE INDEX bw_confirmations_once ON bw_confirmations(order_id,stage) WHERE stage IN ('submitted','accepted');
