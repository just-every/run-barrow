-- STK-002: installation-wide merchant policies, one JSON value per key (stock freshness limit first).
CREATE TABLE bw_settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL CHECK(json_valid(value_json)), revision TEXT NOT NULL);
