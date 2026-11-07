-- XERO credentials are installation configuration, excluded from portable archives.
CREATE TABLE bw_xero_connection(singleton INTEGER PRIMARY KEY CHECK(singleton=1), tenant TEXT NOT NULL, mode TEXT NOT NULL, state TEXT NOT NULL, secret_cipher TEXT NOT NULL, expires_at INTEGER NOT NULL, revision TEXT NOT NULL, owner_id TEXT NOT NULL);
CREATE TABLE bw_xero_oauth(digest TEXT PRIMARY KEY, owner_id TEXT NOT NULL, session_id TEXT NOT NULL, tenant TEXT NOT NULL, mode TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE bw_xero_refs(tenant TEXT NOT NULL, kind TEXT NOT NULL, source_id TEXT NOT NULL, token TEXT NOT NULL, active INTEGER NOT NULL, PRIMARY KEY(tenant,kind,source_id));
CREATE TABLE bw_xero_maps(tenant TEXT NOT NULL, kind TEXT NOT NULL, source_id TEXT NOT NULL, token TEXT NOT NULL, native_id TEXT NOT NULL, native_revision TEXT NOT NULL, revision TEXT NOT NULL, PRIMARY KEY(tenant,kind,source_id));
CREATE UNIQUE INDEX bw_xero_customer_target ON bw_xero_maps(tenant,native_id) WHERE kind='Contact';
CREATE TABLE bw_xero_runs(id TEXT PRIMARY KEY, tenant TEXT NOT NULL, connection_revision TEXT NOT NULL, mapping_hash TEXT NOT NULL, as_of TEXT NOT NULL, position INTEGER NOT NULL, state TEXT NOT NULL, error TEXT NOT NULL, owner_id TEXT NOT NULL, updated_at TEXT NOT NULL, revision TEXT NOT NULL);
CREATE TABLE bw_xero_invoices(id TEXT PRIMARY KEY, account_id TEXT NOT NULL, order_id TEXT NOT NULL, value_json TEXT NOT NULL, revision TEXT NOT NULL);
CREATE TABLE bw_xero_links(tenant TEXT NOT NULL, source_id TEXT NOT NULL, order_id TEXT NOT NULL, account_id TEXT NOT NULL, revision TEXT NOT NULL, PRIMARY KEY(tenant,source_id), UNIQUE(tenant,order_id));
CREATE TABLE bw_xero_erased(tenant TEXT NOT NULL, contact_id TEXT NOT NULL, PRIMARY KEY(tenant,contact_id));
