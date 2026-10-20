ALTER TABLE bw_quote_notices ADD COLUMN mail_eligible INTEGER NOT NULL DEFAULT 0;
-- AUTO-003: durable recipient snapshots; provider acceptance is not delivery.
CREATE TABLE bw_quote_mail_notices (id TEXT PRIMARY KEY);
CREATE TABLE bw_quote_mail (
 id TEXT PRIMARY KEY, notice_id TEXT NOT NULL, quote_id TEXT NOT NULL, account_id TEXT NOT NULL,
 audience TEXT NOT NULL, recipient_id TEXT NOT NULL, recipient TEXT NOT NULL, summary TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending', provider_message_id TEXT, attempts INTEGER NOT NULL DEFAULT 0,
 lease_until INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL,
 UNIQUE(notice_id,recipient_id)
);
-- Additive migration. Never drop existing delivery receipts or state.
CREATE TABLE IF NOT EXISTS rer_mail_event_receipts (
  provider TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  event_namespace TEXT NOT NULL,
  event_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  event_json TEXT NOT NULL,
  commit_token TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  conflict INTEGER NOT NULL DEFAULT 0 CONSTRAINT rer_mail_event_identity_conflict CHECK (conflict = 0),
  PRIMARY KEY (provider, tenant_id, event_namespace, event_id)
);
CREATE TABLE IF NOT EXISTS rer_mail_event_states (
  provider TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  event_namespace TEXT NOT NULL,
  provider_message_id TEXT NOT NULL,
  recipient TEXT NOT NULL,
  status TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  event_id TEXT NOT NULL,
  terminal INTEGER NOT NULL CHECK (terminal IN (0, 1)),
  PRIMARY KEY (provider, tenant_id, event_namespace, provider_message_id, recipient)
);
