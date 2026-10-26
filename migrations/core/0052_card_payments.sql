CREATE TABLE bw_card_connection (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1),
 account_id TEXT NOT NULL,
 country TEXT NOT NULL,
 livemode INTEGER NOT NULL CHECK(livemode IN (0,1)),
 secret_cipher TEXT NOT NULL,
 webhook_cipher TEXT NOT NULL,
 webhook_id TEXT NOT NULL,
 revision TEXT NOT NULL,
 surcharge_bps INTEGER NOT NULL DEFAULT 0,
 allowed_states TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE bw_card_payments (
 id TEXT PRIMARY KEY,
 account_id TEXT NOT NULL,
 order_id TEXT NOT NULL UNIQUE,
 value_json TEXT NOT NULL,
 revision TEXT NOT NULL
);
CREATE TABLE bw_card_events (
 id TEXT PRIMARY KEY,
 payment_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 value_json TEXT NOT NULL
);
CREATE TABLE bw_card_customers (
 account_id TEXT NOT NULL,
 provider_account_id TEXT NOT NULL,
 customer_id TEXT NOT NULL,
 PRIMARY KEY(account_id,provider_account_id)
);
