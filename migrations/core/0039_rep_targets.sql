-- RPT-005: owner/admin activity goals for an exact Native rep, never a commission label.
-- No foreign key to Native identity: commercial history retains its original opaque user ID after erasure/restore.
CREATE TABLE bw_rep_targets (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL CHECK(length(user_id)>0),
 from_on TEXT NOT NULL CHECK(from_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
 to_on TEXT NOT NULL CHECK(to_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
 time_zone TEXT NOT NULL,
 completed_visits INTEGER NOT NULL CHECK(typeof(completed_visits)='integer' AND completed_visits>=0 AND completed_visits<=1000000000),
 new_accounts INTEGER NOT NULL CHECK(typeof(new_accounts)='integer' AND new_accounts>=0 AND new_accounts<=1000000000),
 revision TEXT NOT NULL,
 reason TEXT NOT NULL CHECK(length(trim(reason))>0),
 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_by TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(user_id,from_on,to_on),
 CHECK(from_on<=to_on)
);
