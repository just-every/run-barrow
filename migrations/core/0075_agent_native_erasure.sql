-- Adopt Base native subject redaction; preserve the native account restore fence.
DROP TRIGGER IF EXISTS bw_agent_custody_before_erasure;
DROP TRIGGER IF EXISTS bw_agent_custody_before_account_delete;
DROP TRIGGER IF EXISTS bw_agent_custody_client_capture;
DROP TRIGGER IF EXISTS bw_agent_custody_account_capture;
DROP TRIGGER IF EXISTS bw_agent_custody_retire_account;
DROP TRIGGER IF EXISTS bw_agent_custody_retire_client;
DROP TRIGGER IF EXISTS bw_custody_agent_door_calls_insert;
DROP TRIGGER IF EXISTS bw_custody_agent_door_calls_update;
DROP TRIGGER IF EXISTS bw_custody_agent_door_approvals_insert;
DROP TRIGGER IF EXISTS bw_custody_agent_door_approvals_update;
DROP TRIGGER IF EXISTS bw_custody_agent_door_reviews_insert;
DROP TRIGGER IF EXISTS bw_custody_agent_door_reviews_update;
DROP TRIGGER IF EXISTS bw_custody_agent_door_events_insert;
DROP TRIGGER IF EXISTS bw_custody_agent_door_events_update;
DROP TRIGGER IF EXISTS bw_custody_audit_insert;
DROP TRIGGER IF EXISTS bw_custody_agents_insert;
DROP TRIGGER IF EXISTS bw_custody_usage_insert;
DROP TRIGGER IF EXISTS bw_custody_audit_update;
DROP TRIGGER IF EXISTS bw_custody_agents_update;
DROP TRIGGER IF EXISTS bw_custody_usage_update;
DROP TRIGGER IF EXISTS bw_agent_custody_before_capture;
DROP TABLE bw_agent_custody;
DROP TABLE bw_agent_account_clients;
DROP TABLE bw_agent_erased_clients;
DROP TABLE bw_agent_erased_artifacts;
CREATE TRIGGER bw_agent_account_erasure AFTER INSERT ON bw_account_erasure_journal
WHEN coalesce(json_extract(NEW.receipt_json,'$.mode'),'erase')<>'revoke'
BEGIN INSERT OR IGNORE INTO bw_agent_erased_accounts VALUES(NEW.account_id); END;
CREATE TRIGGER bw_agent_account_delete BEFORE DELETE ON bw_accounts
BEGIN INSERT OR IGNORE INTO bw_agent_erased_accounts VALUES(OLD.id); END;
ALTER TABLE agent_door_agents ADD COLUMN tombstone TEXT;
ALTER TABLE agent_door_calls ADD COLUMN expires_at INTEGER;
UPDATE agent_door_calls SET expires_at=created_at+30*24*60*60*1000 WHERE state NOT IN ('running','pending');
CREATE INDEX agent_door_calls_expiry ON agent_door_calls(expires_at);
-- Installation-private replay custody, never included in an archive or export.
-- The call's fixed replay horizon bounds the alias; deletion is atomic below.
CREATE TABLE IF NOT EXISTS agent_door_replay_aliases (
  agent TEXT NOT NULL, alias TEXT NOT NULL, call_id TEXT NOT NULL, tombstone TEXT NOT NULL,
  PRIMARY KEY(agent,alias)
);

CREATE TRIGGER IF NOT EXISTS agent_door_delete_replay_aliases AFTER DELETE ON agent_door_calls
BEGIN
  DELETE FROM agent_door_replay_aliases WHERE agent=OLD.agent AND call_id=OLD.decision_id;
END;
CREATE INDEX IF NOT EXISTS agent_door_replay_aliases_call ON agent_door_replay_aliases(agent,call_id);
