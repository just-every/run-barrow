-- Outbound subscriptions are explicit installation settings and never portable credentials.
CREATE TABLE bw_webhook_subscriptions (
 id TEXT PRIMARY KEY, endpoint TEXT NOT NULL, event_types TEXT NOT NULL,
 secret_cipher TEXT, revision TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('active','revoked')),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 lease_until INTEGER NOT NULL DEFAULT 0, next_delivery_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE bw_webhook_events (
 id TEXT PRIMARY KEY, envelope TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE bw_webhook_deliveries (
 id TEXT PRIMARY KEY, subscription_id TEXT NOT NULL, event_id TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','sending','retrying','dead-letter','acknowledged')),
 attempts INTEGER NOT NULL DEFAULT 0, cycle_attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0,
 acknowledged_at TEXT, last_result TEXT NOT NULL DEFAULT 'Locally queued; no external acceptance',
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(subscription_id,event_id)
);
CREATE INDEX bw_webhook_due ON bw_webhook_deliveries(subscription_id,state,next_attempt_at);
CREATE TABLE bw_webhook_attempts (
 id TEXT PRIMARY KEY, delivery_id TEXT NOT NULL, event_id TEXT NOT NULL,
 number INTEGER NOT NULL, signing_revision TEXT NOT NULL, started_at TEXT NOT NULL,
 finished_at TEXT, http_status INTEGER, result TEXT NOT NULL,
 UNIQUE(delivery_id,number)
);
CREATE TRIGGER bw_webhook_event_immutable_update BEFORE UPDATE ON bw_webhook_events BEGIN SELECT RAISE(ABORT,'immutable_webhook_event'); END;
CREATE TRIGGER bw_webhook_event_immutable_delete BEFORE DELETE ON bw_webhook_events BEGIN SELECT RAISE(ABORT,'immutable_webhook_event'); END;
CREATE TRIGGER bw_webhook_attempt_retained BEFORE DELETE ON bw_webhook_attempts BEGIN SELECT RAISE(ABORT,'retained_webhook_attempt'); END;
CREATE TRIGGER bw_webhook_attempt_final BEFORE UPDATE ON bw_webhook_attempts
WHEN OLD.finished_at IS NOT NULL OR NEW.id<>OLD.id OR NEW.delivery_id<>OLD.delivery_id OR NEW.event_id<>OLD.event_id OR NEW.number<>OLD.number OR NEW.signing_revision<>OLD.signing_revision OR NEW.started_at<>OLD.started_at
BEGIN SELECT RAISE(ABORT,'immutable_webhook_attempt'); END;
-- Same transaction as the business audit. No names, addresses, prices, body, reason or documents.
-- A revision is the monotonically increasing local audit ordinal, not arbitrary context text.
CREATE TRIGGER bw_audit_outbound AFTER INSERT ON bw_audit
WHEN NEW.action IN ('account.saved','order.submitted','order.approved','quote.requested','quote.accepted')
 AND EXISTS(SELECT 1 FROM bw_webhook_subscriptions s WHERE s.state='active' AND s.secret_cipher IS NOT NULL AND NEW.action IN (SELECT value FROM json_each(s.event_types)))
BEGIN
 INSERT INTO bw_webhook_events(id,envelope,created_at) VALUES(NEW.id,json_object('schema','barrow.event.v1','id',NEW.id,'type',NEW.action,'occurredAt',NEW.created_at,'revision',NEW.rowid),NEW.created_at);
 INSERT INTO bw_webhook_deliveries(id,subscription_id,event_id,created_at,updated_at)
 SELECT lower(hex(randomblob(16))),s.id,NEW.id,NEW.created_at,NEW.created_at FROM bw_webhook_subscriptions s
 WHERE s.state='active' AND s.secret_cipher IS NOT NULL AND NEW.action IN (SELECT value FROM json_each(s.event_types));
END;
-- Receipt outcomes describe authenticated current provider doors, with no address/body copy.
CREATE TABLE bw_webhook_incoming (
 id TEXT PRIMARY KEY, provider TEXT NOT NULL, namespace TEXT NOT NULL, event_id TEXT NOT NULL,
 occurred_at INTEGER NOT NULL, received_at TEXT NOT NULL,
 outcome TEXT NOT NULL CHECK(outcome IN ('stored','duplicate')), applied INTEGER NOT NULL CHECK(applied IN (0,1))
);
CREATE INDEX bw_webhook_incoming_identity ON bw_webhook_incoming(provider,namespace,event_id);
CREATE TRIGGER bw_webhook_incoming_immutable_update BEFORE UPDATE ON bw_webhook_incoming BEGIN SELECT RAISE(ABORT,'immutable_webhook_intake'); END;
CREATE TRIGGER bw_webhook_incoming_immutable_delete BEFORE DELETE ON bw_webhook_incoming BEGIN SELECT RAISE(ABORT,'immutable_webhook_intake'); END;
CREATE TRIGGER bw_webhook_delivery_retained BEFORE DELETE ON bw_webhook_deliveries BEGIN SELECT RAISE(ABORT,'retained_webhook_delivery'); END;
CREATE TRIGGER bw_webhook_delivery_identity BEFORE UPDATE ON bw_webhook_deliveries
WHEN NEW.id<>OLD.id OR NEW.subscription_id<>OLD.subscription_id OR NEW.event_id<>OLD.event_id OR NEW.created_at<>OLD.created_at
BEGIN SELECT RAISE(ABORT,'immutable_webhook_delivery_identity'); END;
