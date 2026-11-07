-- QBO credentials are installation configuration, excluded from portable archives.
CREATE TABLE bw_qbo_connection(singleton INTEGER PRIMARY KEY CHECK(singleton=1), realm TEXT NOT NULL, mode TEXT NOT NULL, state TEXT NOT NULL, secret_cipher TEXT NOT NULL, expires_at INTEGER NOT NULL, revision TEXT NOT NULL, owner_id TEXT NOT NULL);
CREATE TABLE bw_qbo_oauth(digest TEXT PRIMARY KEY, owner_id TEXT NOT NULL, session_id TEXT NOT NULL, realm TEXT NOT NULL, mode TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE bw_qbo_refs(realm TEXT NOT NULL, kind TEXT NOT NULL, source_id TEXT NOT NULL, token TEXT NOT NULL, active INTEGER NOT NULL, PRIMARY KEY(realm,kind,source_id));
CREATE TABLE bw_qbo_maps(realm TEXT NOT NULL, kind TEXT NOT NULL, source_id TEXT NOT NULL, token TEXT NOT NULL, native_id TEXT NOT NULL, native_revision TEXT NOT NULL, revision TEXT NOT NULL, PRIMARY KEY(realm,kind,source_id));
CREATE UNIQUE INDEX bw_qbo_customer_target ON bw_qbo_maps(realm,native_id) WHERE kind='Customer';
CREATE TABLE bw_qbo_runs(id TEXT PRIMARY KEY, realm TEXT NOT NULL, connection_revision TEXT NOT NULL, mapping_hash TEXT NOT NULL, as_of TEXT NOT NULL, position INTEGER NOT NULL, state TEXT NOT NULL, error TEXT NOT NULL, owner_id TEXT NOT NULL, updated_at TEXT NOT NULL, revision TEXT NOT NULL);
CREATE TABLE bw_qbo_invoices(id TEXT PRIMARY KEY, account_id TEXT NOT NULL, order_id TEXT NOT NULL, value_json TEXT NOT NULL, revision TEXT NOT NULL);
CREATE TABLE bw_qbo_links(realm TEXT NOT NULL, source_id TEXT NOT NULL, order_id TEXT NOT NULL, account_id TEXT NOT NULL, revision TEXT NOT NULL, PRIMARY KEY(realm,source_id), UNIQUE(realm,order_id));
CREATE TABLE bw_qbo_erased(realm TEXT NOT NULL, customer_id TEXT NOT NULL, PRIMARY KEY(realm,customer_id));
