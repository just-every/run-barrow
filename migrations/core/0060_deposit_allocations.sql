-- Preserve existing immutable allocations while admitting one allocation per linked release.
CREATE TABLE bw_card_allocations_next(id TEXT PRIMARY KEY,account_id TEXT NOT NULL,order_id TEXT NOT NULL,payment_id TEXT NOT NULL,value_json TEXT NOT NULL,revision TEXT NOT NULL);
INSERT INTO bw_card_allocations_next SELECT * FROM bw_card_allocations;
DROP TABLE bw_card_allocations;
ALTER TABLE bw_card_allocations_next RENAME TO bw_card_allocations;
CREATE UNIQUE INDEX bw_card_allocation_destination ON bw_card_allocations(payment_id,order_id);
CREATE INDEX bw_card_allocation_order ON bw_card_allocations(order_id);
