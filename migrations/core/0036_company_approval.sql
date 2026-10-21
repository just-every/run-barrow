-- ACC-007: company approval routes, their saved revisions and dated delegations. Orders freeze the route they start
-- with in their own record, so these tables only ever govern requests that have not yet begun.
CREATE TABLE bw_company_routes (
 account_id TEXT PRIMARY KEY REFERENCES bw_accounts(id),
 policy_json TEXT NOT NULL CHECK(json_valid(policy_json)),
 revision TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE bw_company_route_versions (
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES bw_accounts(id), revision TEXT NOT NULL,
 policy_json TEXT NOT NULL CHECK(json_valid(policy_json)), saved_by TEXT NOT NULL, saved_at TEXT NOT NULL, reason TEXT NOT NULL
);
CREATE INDEX bw_company_route_versions_account ON bw_company_route_versions(account_id,saved_at);
CREATE TABLE bw_company_delegations (
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES bw_accounts(id),
 delegator_id TEXT NOT NULL, delegate_id TEXT NOT NULL,
 starts_on TEXT NOT NULL CHECK(starts_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
 ends_on TEXT NOT NULL CHECK(ends_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
 state TEXT NOT NULL CHECK(state IN ('active','ended')), revision TEXT NOT NULL, reason TEXT NOT NULL,
 created_by TEXT NOT NULL, created_at TEXT NOT NULL,
 CHECK(ends_on>=starts_on), CHECK(delegator_id<>delegate_id)
);
CREATE INDEX bw_company_delegations_account ON bw_company_delegations(account_id,state);
