CREATE TABLE bw_saved_cards (
 id TEXT PRIMARY KEY,
 account_id TEXT NOT NULL,
 location_id TEXT NOT NULL,
 source_payment_id TEXT NOT NULL UNIQUE,
 value_json TEXT NOT NULL,
 method_cipher TEXT NOT NULL,
 revision TEXT NOT NULL
);
CREATE INDEX bw_saved_cards_account ON bw_saved_cards(account_id,location_id);
