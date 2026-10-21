-- ACC-006: rep territories and temporary coverage. A rep's current accounts come only from these dated rows
-- (plus any exact accounts the owner listed on the grant); profile rep/territory text alone grants nothing.
CREATE TABLE bw_rep_assignments (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('account','territory','rep')),
 target TEXT NOT NULL CHECK(length(target)>0),
 coverage INTEGER NOT NULL CHECK(coverage IN (0,1)),
 starts_on TEXT NOT NULL CHECK(starts_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
 ends_on TEXT CHECK(ends_on IS NULL OR ends_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
 state TEXT NOT NULL CHECK(state IN ('active','ended')),
 revision TEXT NOT NULL,
 reason TEXT NOT NULL,
 transferred_from TEXT,
 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 CHECK(coverage=1 OR kind<>'rep'),
 CHECK(coverage=0 OR ends_on IS NOT NULL),
 CHECK(ends_on IS NULL OR ends_on>=starts_on)
);
CREATE INDEX bw_rep_assignments_user ON bw_rep_assignments(user_id,state);
CREATE INDEX bw_rep_assignments_target ON bw_rep_assignments(kind,target,state);
-- Any assignment change moves the epoch, so a write that read the old scope cannot commit under the new one.
CREATE TABLE bw_rep_epoch (singleton INTEGER PRIMARY KEY CHECK(singleton=1), value INTEGER NOT NULL);
INSERT INTO bw_rep_epoch(singleton,value) VALUES(1,0);
CREATE TRIGGER bw_rep_assignment_epoch_insert AFTER INSERT ON bw_rep_assignments
BEGIN UPDATE bw_rep_epoch SET value=value+1; END;
CREATE TRIGGER bw_rep_assignment_epoch_update AFTER UPDATE ON bw_rep_assignments
BEGIN UPDATE bw_rep_epoch SET value=value+1; END;
-- Ending or shortening an assignment revokes the rep's queued scheduled-report sends at once (RPT-006);
-- links and downloads recheck the current scope when opened.
CREATE TRIGGER bw_rep_assignment_revoked AFTER UPDATE OF state,ends_on,starts_on,target,kind ON bw_rep_assignments
WHEN NEW.state<>OLD.state OR COALESCE(NEW.ends_on,'')<>COALESCE(OLD.ends_on,'') OR NEW.starts_on<>OLD.starts_on OR NEW.target<>OLD.target OR NEW.kind<>OLD.kind
BEGIN
 UPDATE bw_report_deliveries SET status='cancelled',reason='rep assignment changed',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE operator_id=OLD.user_id AND status IN ('queued','not configured');
 INSERT INTO bw_audit(id,subject_id,actor_id,action,created_at,context_json)
 SELECT lower(hex(randomblob(16))),OLD.user_id,'system:reports','report.recipient-revoked',strftime('%Y-%m-%dT%H:%M:%fZ','now'),
 json_object('revision',NEW.revision,'source','rep.assignment','reason','Rep assignment or coverage changed; queued reports cancelled and downloads recheck current account scope.')
 WHERE EXISTS(SELECT 1 FROM bw_report_recipients WHERE operator_id=OLD.user_id);
END;

-- Supplier-side notices may name the exact people they route to (the account's assigned or covering reps).
-- NULL keeps ORD-005's owner/admin audience, used when an account has no current rep and for discount approvals.
ALTER TABLE bw_quote_notices ADD COLUMN recipients_json TEXT CHECK(recipients_json IS NULL OR json_valid(recipients_json));
DROP TRIGGER bw_quote_notice_mail;
CREATE TRIGGER bw_quote_notice_mail AFTER INSERT ON bw_quote_notices WHEN NEW.mail_eligible=1
BEGIN
 INSERT INTO bw_quote_mail(id,notice_id,quote_id,account_id,audience,recipient_id,recipient,summary,actor_id,created_at,updated_at)
 SELECT lower(hex(randomblob(16))),NEW.id,NEW.quote_id,NEW.account_id,NEW.audience,p.id,p.email,NEW.summary,NEW.actor_id,NEW.created_at,NEW.created_at
 FROM oa_operators p WHERE p.status='active' AND (
  (NEW.audience='supplier' AND p.id<>NEW.actor_id AND (
   (NEW.recipients_json IS NULL AND p.role IN ('owner','admin')) OR
   (NEW.recipients_json IS NOT NULL AND p.id IN (SELECT value FROM json_each(NEW.recipients_json))))) OR
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
