-- REP-004: immutable approval-time attribution stays with internal supplier records.
CREATE TABLE bw_order_commissions (
 order_id TEXT PRIMARY KEY REFERENCES bw_orders(id),
 value_json TEXT NOT NULL
);
