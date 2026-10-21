-- RPT-006: immutable saved definitions and one frozen result per schedule/period.
CREATE TABLE bw_report_schedules (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, report_type TEXT NOT NULL CHECK(report_type IN ('sales','finance')),
 filters_json TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, next_at TEXT NOT NULL,
 restored INTEGER NOT NULL DEFAULT 0 CHECK(restored IN (0,1))
);
CREATE TABLE bw_report_recipients (
 schedule_id TEXT NOT NULL REFERENCES bw_report_schedules(id), operator_id TEXT NOT NULL,
 operator_version INTEGER NOT NULL, role TEXT NOT NULL CHECK(role IN ('owner','admin')), removed_at TEXT,
 PRIMARY KEY(schedule_id,operator_id)
);
CREATE TABLE bw_report_runs (
 id TEXT PRIMARY KEY, schedule_id TEXT NOT NULL REFERENCES bw_report_schedules(id), period TEXT NOT NULL,
 from_date TEXT NOT NULL, to_date TEXT NOT NULL, as_of TEXT NOT NULL, expires_at TEXT NOT NULL,
 snapshot_json TEXT NOT NULL, UNIQUE(schedule_id,period)
);
CREATE TABLE bw_report_deliveries (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES bw_report_runs(id), operator_id TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'queued', reason TEXT, provider_message_id TEXT, recipient TEXT,
 updated_at TEXT NOT NULL, UNIQUE(run_id,operator_id)
);
CREATE INDEX bw_report_dispatch ON bw_report_deliveries(status);
-- Identity revocation cancels unsent deliveries in the same transaction as the native change.
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
