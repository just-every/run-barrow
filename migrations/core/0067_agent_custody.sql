-- A native account cannot be erased while retained door evidence can expose it.
-- This is an explicit closed custody boundary, not an erasure claim.
CREATE TABLE bw_agent_custody (account_id TEXT PRIMARY KEY);
CREATE TRIGGER bw_agent_custody_before_erasure
BEFORE INSERT ON bw_account_erasure_journal
WHEN EXISTS(SELECT 1 FROM bw_agent_custody WHERE account_id=NEW.account_id) AND coalesce(json_extract(NEW.receipt_json,'$.mode'),'erase')<>'revoke'
BEGIN SELECT RAISE(ABORT,'AGENT_CUSTODY'); END;
CREATE TRIGGER bw_agent_custody_before_capture
BEFORE INSERT ON bw_agent_custody
WHEN EXISTS(SELECT 1 FROM bw_account_erasure_journal WHERE account_id=NEW.account_id)
BEGIN SELECT RAISE(ABORT,'AGENT_CUSTODY'); END;
CREATE TRIGGER bw_agent_custody_before_account_delete
BEFORE DELETE ON bw_accounts
WHEN EXISTS(SELECT 1 FROM bw_agent_custody WHERE account_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'AGENT_CUSTODY'); END;
