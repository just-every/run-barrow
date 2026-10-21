-- ACC-002 authority belongs to Barrow, never to a broader Base member role.
CREATE TABLE bw_company_members (
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES bw_accounts(id),
 user_id TEXT NOT NULL, email TEXT NOT NULL, email_key TEXT NOT NULL, display_name TEXT NOT NULL,
 policy_json TEXT NOT NULL CHECK(json_valid(policy_json)),
 state TEXT NOT NULL CHECK(state IN ('invited','active','removed')),
 revision TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, erased_at TEXT
);
CREATE UNIQUE INDEX bw_company_person ON bw_company_members(user_id) WHERE state IN ('invited','active');
CREATE UNIQUE INDEX bw_company_email ON bw_company_members(email_key) WHERE state IN ('invited','active');
CREATE INDEX bw_company_account ON bw_company_members(account_id,state);
-- This marker prevents a removed legacy administrator from being re-created on sign-in.
CREATE TABLE bw_company_legacy_accounts (account_id TEXT PRIMARY KEY REFERENCES bw_accounts(id));
CREATE TABLE bw_company_invites (
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES bw_accounts(id), member_id TEXT,
 email TEXT NOT NULL, email_key TEXT NOT NULL, display_name TEXT NOT NULL,
 token_hash TEXT UNIQUE, policy_json TEXT NOT NULL CHECK(json_valid(policy_json)),
 status TEXT NOT NULL CHECK(status IN ('requested','collision','accepted','revoked','expired')),
 collision_reason TEXT, expires_at INTEGER NOT NULL, accepted_by TEXT,
 created_by TEXT NOT NULL, issuer_version INTEGER NOT NULL, issuer_member_revision TEXT,
 created_at TEXT NOT NULL, reason TEXT NOT NULL, revision TEXT NOT NULL,
 delivery_status TEXT NOT NULL DEFAULT 'pending'
);
CREATE INDEX bw_company_invite_account ON bw_company_invites(account_id,created_at);
CREATE INDEX bw_company_invite_email ON bw_company_invites(email_key,status);
-- ASCII legacy accounts migrate in the installation transaction. Runtime bootstrap
-- also handles Unicode normalization and buyers invited after this migration.
INSERT INTO bw_company_members(id,account_id,user_id,email,email_key,display_name,policy_json,state,revision,created_at,updated_at)
SELECT 'legacy:'||p.id,a.id,p.id,p.email,lower(trim(p.email)),p.display_name,
 '{"rights":["administrator","purchaser","approver","finance"],"locations":"all","perOrderLimitCents":null,"approvalLimitCents":null}',
 'active',lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM bw_accounts a JOIN oa_operators p ON p.email=json_extract(a.value_json,'$.email') COLLATE BINARY
WHERE p.status='active' AND p.role='member';
INSERT INTO bw_company_legacy_accounts(account_id) SELECT account_id FROM bw_company_members;
-- In-app notices are side-wide today; recipient mail remains exact-user custody.
DROP TRIGGER bw_quote_notice_mail;
CREATE TRIGGER bw_quote_notice_mail AFTER INSERT ON bw_quote_notices WHEN NEW.mail_eligible=1
BEGIN
 INSERT INTO bw_quote_mail(id,notice_id,quote_id,account_id,audience,recipient_id,recipient,summary,actor_id,created_at,updated_at)
 SELECT lower(hex(randomblob(16))),NEW.id,NEW.quote_id,NEW.account_id,NEW.audience,p.id,p.email,NEW.summary,NEW.actor_id,NEW.created_at,NEW.created_at
 FROM oa_operators p WHERE p.status='active' AND (
  (NEW.audience='supplier' AND p.role IN ('owner','admin') AND p.id<>NEW.actor_id) OR
  (NEW.audience='buyer' AND p.role='member' AND EXISTS(SELECT 1 FROM bw_company_members cm
   WHERE cm.user_id=p.id AND cm.account_id=NEW.account_id AND cm.state='active' AND cm.erased_at IS NULL
   AND EXISTS(SELECT 1 FROM json_each(cm.policy_json,'$.rights') r WHERE r.value IN ('purchaser','approver'))))
 );
 INSERT INTO bw_quote_mail(id,notice_id,quote_id,account_id,audience,recipient_id,recipient,summary,actor_id,status,reason,created_at,updated_at)
 SELECT lower(hex(randomblob(16))),NEW.id,NEW.quote_id,NEW.account_id,'buyer',NULL,NULL,NEW.summary,NEW.actor_id,'withdrawn','no authorized buyer recipient',NEW.created_at,NEW.created_at
 WHERE NEW.audience='buyer' AND NOT EXISTS(SELECT 1 FROM oa_operators p JOIN bw_company_members cm ON cm.user_id=p.id
  WHERE p.status='active' AND p.role='member' AND cm.account_id=NEW.account_id AND cm.state='active' AND cm.erased_at IS NULL
  AND EXISTS(SELECT 1 FROM json_each(cm.policy_json,'$.rights') r WHERE r.value IN ('purchaser','approver')));
END;
