CREATE TABLE bw_campaign_segments(id TEXT PRIMARY KEY,created_by TEXT NOT NULL,value_json TEXT NOT NULL,revision TEXT NOT NULL);
CREATE TABLE bw_campaigns(id TEXT PRIMARY KEY,created_by TEXT NOT NULL,value_json TEXT NOT NULL,revision TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'draft',due_at TEXT,restored INTEGER NOT NULL DEFAULT 0);
CREATE TABLE bw_campaign_deliveries(id TEXT PRIMARY KEY,campaign_id TEXT NOT NULL,account_id TEXT NOT NULL,recipient_id TEXT NOT NULL,recipient_version INTEGER NOT NULL,sheet_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'queued',reason TEXT,provider_message_id TEXT,first_attempt_at TEXT,updated_at TEXT NOT NULL,UNIQUE(campaign_id,recipient_id));
CREATE INDEX bw_campaign_deliveries_campaign ON bw_campaign_deliveries(campaign_id);
