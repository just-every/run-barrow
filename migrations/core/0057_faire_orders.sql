CREATE TABLE bw_faire_sync (
 brand TEXT PRIMARY KEY,
 revision TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 0,
 cursor TEXT,
 complete INTEGER NOT NULL DEFAULT 0,
 observed_at TEXT
);
CREATE TABLE bw_faire_orders (
 brand TEXT NOT NULL,
 source_id TEXT NOT NULL,
 revision TEXT NOT NULL,
 source_json TEXT NOT NULL CHECK(json_valid(source_json)),
 account_id TEXT REFERENCES bw_accounts(id),
 matched_json TEXT CHECK(matched_json IS NULL OR json_valid(matched_json)),
 state TEXT NOT NULL CHECK(state IN ('review','ingested')),
 PRIMARY KEY(brand,source_id)
);
