CREATE TABLE bw_delta_cutovers (
 id TEXT PRIMARY KEY,
 state TEXT NOT NULL CHECK(state IN ('rehearsal','signedoff','rolledback','inactive','erased')),
 revision TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 source_system TEXT NOT NULL,
 scope_json TEXT NOT NULL,
 source_json TEXT NOT NULL,
 report_json TEXT NOT NULL,
 feed_json TEXT NOT NULL DEFAULT '{}',
 authorities_json TEXT NOT NULL DEFAULT '{}',
 cutoff_at TEXT,
 excluded_order_ids_json TEXT NOT NULL DEFAULT '[]',
 native_watermark_json TEXT NOT NULL DEFAULT '{}',
 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 signedoff_by TEXT,
 signedoff_at TEXT,
 reason TEXT NOT NULL
);
CREATE TABLE bw_delta_sources (
 session_id TEXT NOT NULL REFERENCES bw_delta_cutovers(id),
 revision TEXT NOT NULL,
 source_json TEXT NOT NULL,
 report_json TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(session_id,revision)
);
CREATE INDEX bw_delta_state ON bw_delta_cutovers(state,created_at);

CREATE TABLE bw_delta_feed_runs (
 session_id TEXT NOT NULL REFERENCES bw_delta_cutovers(id),
 revision TEXT NOT NULL,
 snapshot_json TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(session_id,revision)
);
