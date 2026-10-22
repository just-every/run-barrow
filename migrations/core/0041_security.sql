-- Deployment credentials remain in encrypted platform bindings, never the archive or audit.
CREATE TABLE bw_connector_config (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, revision TEXT NOT NULL);
-- Per-installation keyed IP digests, bounded to their short fixed window.
CREATE TABLE bw_request_rates (digest TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX bw_request_rates_expiry ON bw_request_rates(expires_at);
