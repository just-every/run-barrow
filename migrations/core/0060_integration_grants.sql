-- Credentials are installation-local and excluded from owner archives.
CREATE TABLE bw_integration_grants (
 id TEXT PRIMARY KEY,
 digest TEXT NOT NULL UNIQUE,
 account_id TEXT NOT NULL REFERENCES bw_accounts(id) ON DELETE CASCADE,
 issuer_id TEXT NOT NULL REFERENCES oa_operators(id) ON DELETE CASCADE,
 issuer_version INTEGER NOT NULL,
 scopes_json TEXT NOT NULL CHECK(json_valid(scopes_json)),
 expires_at INTEGER NOT NULL,
 revision TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('active','revoked')),
 reason TEXT NOT NULL
);
CREATE INDEX bw_integration_grants_account ON bw_integration_grants(account_id);
