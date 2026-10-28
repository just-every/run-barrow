-- Preserve receipt identities while admitting separately reviewed invoice instalments.
CREATE TABLE bw_card_payments_next (
 id TEXT PRIMARY KEY,
 account_id TEXT NOT NULL,
 order_id TEXT NOT NULL,
 value_json TEXT NOT NULL,
 revision TEXT NOT NULL
);
INSERT INTO bw_card_payments_next SELECT * FROM bw_card_payments;
DROP TABLE bw_card_payments;
ALTER TABLE bw_card_payments_next RENAME TO bw_card_payments;
CREATE INDEX bw_card_payment_order ON bw_card_payments(order_id);
