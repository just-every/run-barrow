-- ACC-005 authority is seed-owned. Native members remain members; invitations
-- confer no effective supplier authority until Native confirmation activates them.
CREATE TABLE bw_staff_members (
 user_id TEXT PRIMARY KEY,
 policy_json TEXT NOT NULL CHECK(json_valid(policy_json)),
 state TEXT NOT NULL CHECK(state IN ('active','revoked')),
 revision TEXT NOT NULL,
 native_version INTEGER NOT NULL CHECK(native_version > 0),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
-- Preserve saved owner/admin recipients while admitting version-pinned functional
-- members. Nullable revision is only valid for the existing native supplier roles.
DROP TRIGGER bw_report_operator_revoked;
CREATE TABLE bw_report_recipients_next (
 schedule_id TEXT NOT NULL REFERENCES bw_report_schedules(id), operator_id TEXT NOT NULL,
 operator_version INTEGER NOT NULL, role TEXT NOT NULL CHECK(role IN ('owner','admin','member')), removed_at TEXT,
 staff_grant_revision TEXT,
 PRIMARY KEY(schedule_id,operator_id),
 CHECK(role<>'member' OR staff_grant_revision IS NOT NULL)
);
INSERT INTO bw_report_recipients_next(schedule_id,operator_id,operator_version,role,removed_at)
 SELECT schedule_id,operator_id,operator_version,role,removed_at FROM bw_report_recipients;
DROP TABLE bw_report_recipients;
ALTER TABLE bw_report_recipients_next RENAME TO bw_report_recipients;
CREATE TRIGGER bw_report_operator_revoked AFTER UPDATE OF role,status,version ON oa_operators
WHEN NEW.role<>OLD.role OR NEW.status<>OLD.status OR NEW.version<>OLD.version
BEGIN
 UPDATE bw_report_deliveries SET status='cancelled',reason='recipient identity, role or account version changed',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE operator_id=NEW.id AND status IN ('queued','not configured');
 INSERT INTO bw_audit(id,subject_id,actor_id,action,created_at,context_json)
 SELECT lower(hex(randomblob(16))),NEW.id,'system:reports','report.recipient-revoked',strftime('%Y-%m-%dT%H:%M:%fZ','now'),
 json_object('revision',CAST(NEW.version AS TEXT),'source','operator.update','reason','Recipient identity, role or account version changed; queued reports cancelled and downloads recheck entitlement.')
 WHERE EXISTS(SELECT 1 FROM bw_report_recipients WHERE operator_id=NEW.id);
END;
-- A queued snapshot must never outlive the seed authority that admitted it.
CREATE TRIGGER bw_report_staff_revoked AFTER UPDATE OF revision,state,native_version ON bw_staff_members
WHEN NEW.revision<>OLD.revision OR NEW.state<>OLD.state OR NEW.native_version<>OLD.native_version
BEGIN
 UPDATE bw_report_deliveries SET status='cancelled',reason='recipient staff grant changed',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE operator_id=NEW.user_id AND status IN ('queued','not configured');
END;
