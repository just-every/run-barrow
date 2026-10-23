CREATE TABLE bw_cutover_imports (
 id TEXT PRIMARY KEY,
 fingerprint TEXT NOT NULL UNIQUE,
 scope_json TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('active','undone','erased')),
 native_fingerprint TEXT NOT NULL,
 source_json TEXT NOT NULL,
 report_json TEXT NOT NULL,
 approved_by TEXT NOT NULL,
 approved_at TEXT NOT NULL,
 reason TEXT NOT NULL,
 undone_by TEXT,
 undone_at TEXT
);
