CREATE TABLE bw_applications(id TEXT PRIMARY KEY,value_json TEXT NOT NULL,revision TEXT NOT NULL,state TEXT NOT NULL,account_id TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE bw_application_intake(id TEXT PRIMARY KEY,value_json TEXT NOT NULL,revision TEXT NOT NULL,state TEXT NOT NULL,account_id TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE bw_application_codes(application_id TEXT PRIMARY KEY,code_hash TEXT NOT NULL,expires_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0);
CREATE TABLE bw_application_sessions(digest TEXT PRIMARY KEY,application_id TEXT NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE bw_application_documents(id TEXT PRIMARY KEY,application_id TEXT NOT NULL,name TEXT NOT NULL,type TEXT NOT NULL,size INTEGER NOT NULL,sha256 TEXT NOT NULL,content_base64 TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE bw_application_history(id TEXT PRIMARY KEY,application_id TEXT NOT NULL,state TEXT NOT NULL,reason TEXT NOT NULL,actor_id TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE bw_application_rates(digest TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE bw_usage_terms(version INTEGER PRIMARY KEY,title TEXT NOT NULL,body TEXT NOT NULL,sha256 TEXT NOT NULL,pdf_json TEXT,created_by TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE bw_usage_acceptances(user_id TEXT NOT NULL,version INTEGER NOT NULL,sha256 TEXT NOT NULL,accepted_at TEXT NOT NULL,PRIMARY KEY(user_id,version));
