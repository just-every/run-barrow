CREATE TABLE bw_prebook_seasons (
 id TEXT PRIMARY KEY,
 value_json TEXT NOT NULL CHECK(json_valid(value_json)),
 revision TEXT NOT NULL
);
CREATE TABLE bw_prebooks (
 id TEXT PRIMARY KEY,
 account_id TEXT NOT NULL REFERENCES bw_accounts(id),
 value_json TEXT NOT NULL CHECK(json_valid(value_json)),
 revision TEXT NOT NULL
);
CREATE INDEX bw_prebook_account ON bw_prebooks(account_id);
CREATE TABLE bw_prebook_frontier (singleton INTEGER PRIMARY KEY CHECK(singleton=1), revision INTEGER NOT NULL);
INSERT INTO bw_prebook_frontier VALUES(1,0);
