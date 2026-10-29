CREATE TABLE bw_credit_notes(id TEXT PRIMARY KEY,account_id TEXT NOT NULL,order_id TEXT NOT NULL,return_id TEXT NOT NULL UNIQUE,value_json TEXT NOT NULL,revision TEXT NOT NULL);
CREATE TABLE bw_credit_applications(id TEXT PRIMARY KEY,account_id TEXT NOT NULL,order_id TEXT NOT NULL,credit_id TEXT NOT NULL,value_json TEXT NOT NULL,revision TEXT NOT NULL);
CREATE TABLE bw_card_allocations(id TEXT PRIMARY KEY,account_id TEXT NOT NULL,order_id TEXT NOT NULL,payment_id TEXT NOT NULL UNIQUE,value_json TEXT NOT NULL,revision TEXT NOT NULL);
CREATE TABLE bw_credit_refunds(id TEXT PRIMARY KEY,account_id TEXT NOT NULL,order_id TEXT NOT NULL,credit_id TEXT NOT NULL UNIQUE,value_json TEXT NOT NULL,revision TEXT NOT NULL);
CREATE TABLE bw_refund_events(id TEXT PRIMARY KEY,refund_id TEXT NOT NULL,created_at TEXT NOT NULL,value_json TEXT NOT NULL);
CREATE INDEX bw_credits_account ON bw_credit_notes(account_id);
CREATE INDEX bw_credit_applications_order ON bw_credit_applications(order_id);
CREATE INDEX bw_refunds_account ON bw_credit_refunds(account_id);
