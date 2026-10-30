-- Seed-owned erasure integration for the rer 0.2.91 retained-artifact hook gap.
-- A client can aggregate multiple accounts: retiring its entire artifact set is
-- deliberately conservative. Never reset request windows, usage or native caps.
CREATE TABLE bw_agent_account_clients (account_id TEXT NOT NULL, agent_id TEXT NOT NULL, PRIMARY KEY(account_id,agent_id));
CREATE TABLE bw_agent_erased_accounts (account_id TEXT PRIMARY KEY);
CREATE TABLE bw_agent_erased_clients (agent_id TEXT PRIMARY KEY);
CREATE TABLE bw_agent_erased_artifacts (kind TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY(kind,id));
-- Earlier drafts tracked only the account. Every pre-upgrade client may have
-- read it; preserve that conservative mapping rather than guessing from content.
INSERT INTO bw_agent_account_clients SELECT c.account_id,a.id FROM bw_agent_custody c CROSS JOIN agent_door_agents a;

DROP TRIGGER bw_agent_custody_before_erasure;
DROP TRIGGER bw_agent_custody_before_account_delete;
CREATE TRIGGER bw_agent_custody_before_erasure BEFORE INSERT ON bw_account_erasure_journal
WHEN coalesce(json_extract(NEW.receipt_json,'$.mode'),'erase')<>'revoke'
BEGIN
 INSERT OR IGNORE INTO bw_agent_erased_accounts VALUES(NEW.account_id);
END;
CREATE TRIGGER bw_agent_custody_before_account_delete BEFORE DELETE ON bw_accounts
BEGIN
 INSERT OR IGNORE INTO bw_agent_erased_accounts VALUES(OLD.id);
END;
-- Retain the original capture-after-journal fence, plus tombstones during
-- unused-account deletion and restoration. No client may reacquire erased data.
CREATE TRIGGER bw_agent_custody_client_capture BEFORE INSERT ON bw_agent_account_clients
WHEN EXISTS(SELECT 1 FROM bw_agent_erased_accounts WHERE account_id=NEW.account_id)
 OR EXISTS(SELECT 1 FROM bw_agent_erased_clients WHERE agent_id=NEW.agent_id)
BEGIN SELECT RAISE(ABORT,'AGENT_CUSTODY'); END;
CREATE TRIGGER bw_agent_custody_account_capture BEFORE INSERT ON bw_agent_custody
WHEN EXISTS(SELECT 1 FROM bw_agent_erased_accounts WHERE account_id=NEW.account_id)
BEGIN SELECT RAISE(ABORT,'AGENT_CUSTODY'); END;
CREATE TRIGGER bw_agent_custody_retire_account AFTER INSERT ON bw_agent_erased_accounts
BEGIN
 INSERT OR IGNORE INTO bw_agent_erased_clients SELECT agent_id FROM bw_agent_account_clients WHERE account_id=NEW.account_id;
 -- Replaced by durable erasure tombstones; no live capture association is restored.
 DELETE FROM bw_agent_account_clients WHERE account_id=NEW.account_id;
 DELETE FROM bw_agent_custody WHERE account_id=NEW.account_id;
END;
CREATE TRIGGER bw_agent_custody_retire_client AFTER INSERT ON bw_agent_erased_clients
BEGIN
 UPDATE agent_door_agents SET revoked=1,name='Erased agent',sponsor_name='Erased sponsor',specialist=NULL WHERE id=NEW.agent_id;
 INSERT OR IGNORE INTO bw_agent_erased_artifacts SELECT 'approvals',id FROM agent_door_approvals WHERE json_extract(saved,'$.principal.agent.id')=NEW.agent_id;
 INSERT OR IGNORE INTO bw_agent_erased_artifacts SELECT 'reviews',id FROM agent_door_reviews WHERE json_extract(saved,'$.principal.agent.id')=NEW.agent_id;
 DELETE FROM agent_door_events WHERE json_extract(event,'$.actor.agent.id')=NEW.agent_id
  OR EXISTS(SELECT 1 FROM bw_agent_erased_artifacts a WHERE agent_door_events.uri LIKE '%/agents/'||a.kind||'/'||a.id);
 DELETE FROM agent_door_calls WHERE agent=NEW.agent_id;
 DELETE FROM agent_door_approvals WHERE json_extract(saved,'$.principal.agent.id')=NEW.agent_id;
 DELETE FROM agent_door_reviews WHERE json_extract(saved,'$.principal.agent.id')=NEW.agent_id;
 UPDATE agent_door_usage SET specialist=NULL WHERE agent=NEW.agent_id;
 UPDATE agent_door_audit SET row=json_object('id',json_extract(row,'$.id'),'at',at,'door',json_extract(row,'$.door'),
 'agent',json_object('id',agent,'name','Erased agent','specialist',NULL),
 'sponsor',json_object('id',json_extract(row,'$.sponsor.id'),'name','Erased sponsor'),
 'label','Erased agent for Erased sponsor','operation_id',json_extract(row,'$.operation_id'),
 'scopes',json('[]'),'client_id',NULL,'consent',NULL,'tool',json_extract(row,'$.tool'),
 'resource',NULL,'decision_id',json_extract(row,'$.decision_id'),'classes',json_extract(row,'$.classes'),
 'revision',json_extract(row,'$.revision'),'rules',json_extract(row,'$.rules'),
 'decision',json_extract(row,'$.decision'),'outcome',json_extract(row,'$.outcome'),
 'code',json_extract(row,'$.code'),'approval',json_extract(row,'$.approval'),'review',json_extract(row,'$.review'),
 'idempotency_key',NULL,'trace',NULL,'ignored_arguments',json('[]'),'replay_of',json_extract(row,'$.replay_of'),'erased',json('true')),evidence=NULL WHERE agent=NEW.agent_id;
END;
CREATE TRIGGER bw_custody_agent_door_calls_insert BEFORE INSERT ON agent_door_calls
WHEN EXISTS(SELECT 1 FROM bw_agent_erased_clients WHERE agent_id=NEW.agent)

BEGIN SELECT RAISE(IGNORE); END;
CREATE TRIGGER bw_custody_agent_door_calls_update BEFORE UPDATE ON agent_door_calls
WHEN EXISTS(SELECT 1 FROM bw_agent_erased_clients WHERE agent_id=NEW.agent)

BEGIN SELECT RAISE(IGNORE); END;
CREATE TRIGGER bw_custody_agent_door_approvals_insert BEFORE INSERT ON agent_door_approvals
WHEN EXISTS(SELECT 1 FROM bw_agent_erased_clients WHERE agent_id=json_extract(NEW.saved,'$.principal.agent.id'))

BEGIN SELECT RAISE(IGNORE); END;
CREATE TRIGGER bw_custody_agent_door_approvals_update BEFORE UPDATE ON agent_door_approvals
WHEN EXISTS(SELECT 1 FROM bw_agent_erased_clients WHERE agent_id=json_extract(NEW.saved,'$.principal.agent.id'))

BEGIN SELECT RAISE(IGNORE); END;
CREATE TRIGGER bw_custody_agent_door_reviews_insert BEFORE INSERT ON agent_door_reviews
WHEN EXISTS(SELECT 1 FROM bw_agent_erased_clients WHERE agent_id=json_extract(NEW.saved,'$.principal.agent.id'))

BEGIN SELECT RAISE(IGNORE); END;
CREATE TRIGGER bw_custody_agent_door_reviews_update BEFORE UPDATE ON agent_door_reviews
WHEN EXISTS(SELECT 1 FROM bw_agent_erased_clients WHERE agent_id=json_extract(NEW.saved,'$.principal.agent.id'))

BEGIN SELECT RAISE(IGNORE); END;
CREATE TRIGGER bw_custody_agent_door_events_insert BEFORE INSERT ON agent_door_events
WHEN EXISTS(SELECT 1 FROM bw_agent_erased_clients WHERE agent_id=json_extract(NEW.event,'$.actor.agent.id'))
 OR EXISTS(SELECT 1 FROM bw_agent_erased_artifacts a WHERE NEW.uri LIKE '%/agents/'||a.kind||'/'||a.id)
BEGIN SELECT RAISE(IGNORE); END;
CREATE TRIGGER bw_custody_agent_door_events_update BEFORE UPDATE ON agent_door_events
WHEN EXISTS(SELECT 1 FROM bw_agent_erased_clients WHERE agent_id=json_extract(NEW.event,'$.actor.agent.id'))
 OR EXISTS(SELECT 1 FROM bw_agent_erased_artifacts a WHERE NEW.uri LIKE '%/agents/'||a.kind||'/'||a.id)
BEGIN SELECT RAISE(IGNORE); END;
CREATE TRIGGER bw_custody_audit_insert AFTER INSERT ON agent_door_audit
WHEN EXISTS(SELECT 1 FROM bw_agent_erased_clients WHERE agent_id=NEW.agent)
 AND (NEW.evidence IS NOT NULL OR coalesce(json_extract(NEW.row,'$.erased'),0)<>1)
BEGIN UPDATE agent_door_audit SET row=json_object('id',json_extract(row,'$.id'),'at',at,'door',json_extract(row,'$.door'),
 'agent',json_object('id',agent,'name','Erased agent','specialist',NULL),
 'sponsor',json_object('id',json_extract(row,'$.sponsor.id'),'name','Erased sponsor'),
 'label','Erased agent for Erased sponsor','operation_id',json_extract(row,'$.operation_id'),
 'scopes',json('[]'),'client_id',NULL,'consent',NULL,'tool',json_extract(row,'$.tool'),
 'resource',NULL,'decision_id',json_extract(row,'$.decision_id'),'classes',json_extract(row,'$.classes'),
 'revision',json_extract(row,'$.revision'),'rules',json_extract(row,'$.rules'),
 'decision',json_extract(row,'$.decision'),'outcome',json_extract(row,'$.outcome'),
 'code',json_extract(row,'$.code'),'approval',json_extract(row,'$.approval'),'review',json_extract(row,'$.review'),
 'idempotency_key',NULL,'trace',NULL,'ignored_arguments',json('[]'),'replay_of',json_extract(row,'$.replay_of'),'erased',json('true')),evidence=NULL WHERE id=NEW.id; END;
CREATE TRIGGER bw_custody_agents_insert AFTER INSERT ON agent_door_agents
WHEN EXISTS(SELECT 1 FROM bw_agent_erased_clients WHERE agent_id=NEW.id)
 AND (NEW.revoked<>1 OR NEW.name<>'Erased agent' OR NEW.sponsor_name<>'Erased sponsor' OR NEW.specialist IS NOT NULL)
BEGIN UPDATE agent_door_agents SET revoked=1,name='Erased agent',sponsor_name='Erased sponsor',specialist=NULL WHERE id=NEW.id; END;
CREATE TRIGGER bw_custody_usage_insert AFTER INSERT ON agent_door_usage
WHEN NEW.specialist IS NOT NULL AND EXISTS(SELECT 1 FROM bw_agent_erased_clients WHERE agent_id=NEW.agent)
BEGIN UPDATE agent_door_usage SET specialist=NULL WHERE decision_id=NEW.decision_id; END;
CREATE TRIGGER bw_custody_audit_update AFTER UPDATE ON agent_door_audit
WHEN EXISTS(SELECT 1 FROM bw_agent_erased_clients WHERE agent_id=NEW.agent)
 AND (NEW.evidence IS NOT NULL OR coalesce(json_extract(NEW.row,'$.erased'),0)<>1)
BEGIN UPDATE agent_door_audit SET row=json_object('id',json_extract(row,'$.id'),'at',at,'door',json_extract(row,'$.door'),
 'agent',json_object('id',agent,'name','Erased agent','specialist',NULL),
 'sponsor',json_object('id',json_extract(row,'$.sponsor.id'),'name','Erased sponsor'),
 'label','Erased agent for Erased sponsor','operation_id',json_extract(row,'$.operation_id'),
 'scopes',json('[]'),'client_id',NULL,'consent',NULL,'tool',json_extract(row,'$.tool'),
 'resource',NULL,'decision_id',json_extract(row,'$.decision_id'),'classes',json_extract(row,'$.classes'),
 'revision',json_extract(row,'$.revision'),'rules',json_extract(row,'$.rules'),
 'decision',json_extract(row,'$.decision'),'outcome',json_extract(row,'$.outcome'),
 'code',json_extract(row,'$.code'),'approval',json_extract(row,'$.approval'),'review',json_extract(row,'$.review'),
 'idempotency_key',NULL,'trace',NULL,'ignored_arguments',json('[]'),'replay_of',json_extract(row,'$.replay_of'),'erased',json('true')),evidence=NULL WHERE id=NEW.id; END;
CREATE TRIGGER bw_custody_agents_update AFTER UPDATE ON agent_door_agents
WHEN EXISTS(SELECT 1 FROM bw_agent_erased_clients WHERE agent_id=NEW.id)
 AND (NEW.revoked<>1 OR NEW.name<>'Erased agent' OR NEW.sponsor_name<>'Erased sponsor' OR NEW.specialist IS NOT NULL)
BEGIN UPDATE agent_door_agents SET revoked=1,name='Erased agent',sponsor_name='Erased sponsor',specialist=NULL WHERE id=NEW.id; END;
CREATE TRIGGER bw_custody_usage_update AFTER UPDATE ON agent_door_usage
WHEN NEW.specialist IS NOT NULL AND EXISTS(SELECT 1 FROM bw_agent_erased_clients WHERE agent_id=NEW.agent)
BEGIN UPDATE agent_door_usage SET specialist=NULL WHERE decision_id=NEW.decision_id; END;
