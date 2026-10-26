CREATE TABLE bw_brands (id TEXT PRIMARY KEY,value_json TEXT NOT NULL,revision TEXT NOT NULL);
CREATE TABLE bw_buying_profiles (id TEXT PRIMARY KEY,account_id TEXT NOT NULL,value_json TEXT NOT NULL,revision TEXT NOT NULL);
CREATE INDEX bw_buying_profiles_account ON bw_buying_profiles(account_id,id);
CREATE TABLE bw_profile_approvals (
 profile_id TEXT NOT NULL,user_id TEXT NOT NULL,account_id TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('approved','revoked')),revision TEXT NOT NULL,
 approved_by TEXT NOT NULL,reason TEXT NOT NULL,approved_at TEXT NOT NULL,
 restored INTEGER NOT NULL DEFAULT 0 CHECK(restored IN (0,1)),PRIMARY KEY(profile_id,user_id)
);
