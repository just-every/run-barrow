-- Only new native notices can enqueue mail; archive/export notices retain zero.
ALTER TABLE bw_quote_notices ADD COLUMN mail_eligible INTEGER NOT NULL DEFAULT 0 CHECK(mail_eligible IN (0,1));
CREATE TABLE bw_quote_mail (
 id TEXT PRIMARY KEY,
 notice_id TEXT,
 quote_id TEXT NOT NULL,
 account_id TEXT NOT NULL,
 audience TEXT NOT NULL CHECK(audience IN ('buyer','supplier')),
 recipient_id TEXT,
 recipient TEXT,
 summary TEXT NOT NULL,
 kind TEXT NOT NULL DEFAULT 'notice' CHECK(kind IN ('notice','expiry')),
 actor_id TEXT NOT NULL,
 expiry_revision INTEGER,
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','withdrawn','accepted','deferred','delivered','bounced','failed','rejected','complained','suppressed','rate_limited','uncertain','not configured','not sent (development)')),
 reason TEXT,
 provider_message_id TEXT,
 sender_result_json TEXT,
 submission_json TEXT,
 attempts INTEGER NOT NULL DEFAULT 0,
 lease_until INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 first_attempt_at TEXT,
 last_event_id TEXT,
 restored INTEGER NOT NULL DEFAULT 0 CHECK(restored IN (0,1)),
 task_id TEXT,
 CHECK((kind='notice' AND notice_id IS NOT NULL AND expiry_revision IS NULL) OR (kind='expiry' AND notice_id IS NULL AND expiry_revision IS NOT NULL))
);
CREATE UNIQUE INDEX bw_quote_mail_notice_recipient ON bw_quote_mail(notice_id,COALESCE(recipient_id,'')) WHERE kind='notice';
CREATE UNIQUE INDEX bw_quote_mail_expiry_recipient ON bw_quote_mail(quote_id,expiry_revision,kind,COALESCE(recipient_id,'')) WHERE kind='expiry';
CREATE INDEX bw_quote_mail_dispatch ON bw_quote_mail(status,lease_until);
CREATE INDEX bw_quote_mail_provider ON bw_quote_mail(provider_message_id,recipient);
CREATE INDEX bw_quote_mail_suppression ON bw_quote_mail(recipient,status);
-- Fingerprints are private operational metadata, excluded from every archive/export.
CREATE TABLE bw_quote_mail_config (singleton INTEGER PRIMARY KEY CHECK(singleton=1), fingerprint TEXT NOT NULL, revision TEXT NOT NULL);

CREATE TRIGGER bw_quote_notice_internal_insert BEFORE INSERT ON bw_quote_notices
WHEN NEW.kind='internal' AND NEW.audience='buyer'
BEGIN SELECT RAISE(ABORT,'internal_quote_notice_to_buyer'); END;
CREATE TRIGGER bw_quote_notice_internal_update BEFORE UPDATE OF kind,audience ON bw_quote_notices
WHEN NEW.kind='internal' AND NEW.audience='buyer'
BEGIN SELECT RAISE(ABORT,'internal_quote_notice_to_buyer'); END;

-- A trigger shares the notice's transaction, so a native action cannot commit
-- its notice without snapshotting every authorized recipient user ID.
CREATE TRIGGER bw_quote_notice_mail AFTER INSERT ON bw_quote_notices
WHEN NEW.mail_eligible=1
BEGIN
 INSERT INTO bw_quote_mail(id,notice_id,quote_id,account_id,audience,recipient_id,recipient,summary,actor_id,created_at,updated_at)
 SELECT lower(hex(randomblob(16))),NEW.id,NEW.quote_id,NEW.account_id,NEW.audience,p.id,p.email,NEW.summary,NEW.actor_id,NEW.created_at,NEW.created_at
 FROM oa_operators p
 WHERE p.status='active' AND (
  (NEW.audience='supplier' AND p.role IN ('owner','admin') AND p.id<>NEW.actor_id) OR
  (NEW.audience='buyer' AND p.role='member' AND EXISTS (
   SELECT 1 FROM bw_accounts a WHERE a.id=NEW.account_id AND json_extract(a.value_json,'$.email')=p.email COLLATE BINARY
  ))
 );
 INSERT INTO bw_quote_mail(id,notice_id,quote_id,account_id,audience,recipient_id,recipient,summary,actor_id,status,reason,created_at,updated_at)
 SELECT lower(hex(randomblob(16))),NEW.id,NEW.quote_id,NEW.account_id,'buyer',NULL,NULL,NEW.summary,NEW.actor_id,'withdrawn','no authorized buyer recipient',NEW.created_at,NEW.created_at
 WHERE NEW.audience='buyer' AND NOT EXISTS (
  SELECT 1 FROM oa_operators p JOIN bw_accounts a ON a.id=NEW.account_id
  WHERE p.status='active' AND p.role='member' AND json_extract(a.value_json,'$.email')=p.email COLLATE BINARY
 );
END;

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
