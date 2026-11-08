-- Native in-app facts contain controlled labels and quantities, never message narratives or financial values.
CREATE TABLE bw_order_notice_accounts(account_id TEXT PRIMARY KEY,active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)));
-- Existing approved orders receive later dispatch notices without another native order change.
-- Closed accounts remain inactive; restored markers are separately fenced by portability policy.
INSERT INTO bw_order_notice_accounts(account_id,active)
 SELECT id,CASE WHEN json_extract(value_json,'$.lifecycle')='closed' THEN 0 ELSE 1 END FROM bw_accounts;
CREATE TABLE bw_order_notices(
 id TEXT PRIMARY KEY,account_id TEXT NOT NULL,order_id TEXT NOT NULL,kind TEXT NOT NULL,
 source_id TEXT NOT NULL,source_revision TEXT NOT NULL,source_origin TEXT NOT NULL,
 details_json TEXT NOT NULL,created_at TEXT NOT NULL,restored INTEGER NOT NULL DEFAULT 0,
 UNIQUE(order_id,kind,source_id,source_revision)
);
CREATE INDEX bw_order_notices_account ON bw_order_notices(account_id,order_id);
CREATE TABLE bw_order_notice_reads(user_id TEXT NOT NULL,notice_id TEXT NOT NULL,read_at TEXT NOT NULL,PRIMARY KEY(user_id,notice_id));
CREATE TABLE bw_order_notice_preferences(user_id TEXT NOT NULL,account_id TEXT NOT NULL,kind TEXT NOT NULL,enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),PRIMARY KEY(user_id,account_id,kind));
