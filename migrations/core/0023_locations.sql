-- ACC-003: an account's bill-to, ship-to and contact records. Edits replace value_json under a new revision; orders keep
-- their own snapshot, so an edit never rewrites an order. Archived records stay for history and cannot be chosen.
CREATE TABLE bw_locations (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('bill-to','ship-to','contact')), value_json TEXT NOT NULL CHECK(json_valid(value_json)), revision TEXT NOT NULL, is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0,1)), archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)));
CREATE INDEX bw_locations_account ON bw_locations(account_id, kind);
CREATE UNIQUE INDEX bw_locations_default ON bw_locations(account_id, kind) WHERE is_default=1;
