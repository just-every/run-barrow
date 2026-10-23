ALTER TABLE bw_agent_tokens ADD COLUMN scope_kind TEXT NOT NULL DEFAULT 'draft' CHECK(scope_kind IN ('draft','proposal'));

-- Grant IDs also identify their bearer rows. No token foreign key: revocation
-- removes the credential while preserving the owner and proposal attribution.
CREATE TABLE bw_agent_proposal_grants (
 id TEXT PRIMARY KEY,
 token_id TEXT NOT NULL UNIQUE,
 authorizer_id TEXT NOT NULL,
 authorizer_version INTEGER NOT NULL,
 account_id TEXT NOT NULL,
 account_revision TEXT NOT NULL,
 allowed_substitutes TEXT NOT NULL CHECK(json_valid(allowed_substitutes) AND json_type(allowed_substitutes)='array'),
 state TEXT NOT NULL CHECK(state IN ('active','revoked')),
 revision TEXT NOT NULL,
 cost_limit_cents INTEGER NOT NULL CHECK(cost_limit_cents BETWEEN 0 AND 9007199254740991),
 spent_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK(spent_cost_cents BETWEEN 0 AND cost_limit_cents),
 contact_limit INTEGER NOT NULL CHECK(contact_limit BETWEEN 0 AND 9007199254740991),
 spent_contacts INTEGER NOT NULL DEFAULT 0 CHECK(spent_contacts BETWEEN 0 AND contact_limit),
 consent_reason TEXT NOT NULL CHECK(length(trim(consent_reason))>0),
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL CHECK(expires_at>created_at AND expires_at<=created_at+604800000),
 revoked_at TEXT,
 revocation_reason TEXT,
 CHECK(id=token_id),
 CHECK((state='active' AND revoked_at IS NULL AND revocation_reason IS NULL)
  OR (state='revoked' AND revoked_at IS NOT NULL AND revocation_reason IS NOT NULL AND length(trim(revocation_reason))>0))
);
CREATE INDEX bw_agent_proposal_grant_account ON bw_agent_proposal_grants(account_id,state);

-- Cost reservations describe self-reported external run costs. Barrow makes no
-- model call and cannot limit inference purchased independently by an agent.
-- Contact reservations count one reviewed buyer offer and two execution emails;
-- these counters do not themselves confer outbound or stock authority.
CREATE TABLE bw_agent_proposals (
 id TEXT NOT NULL,
 number INTEGER NOT NULL CHECK(number>0),
 account_id TEXT NOT NULL,
 order_id TEXT NOT NULL,
 grant_id TEXT NOT NULL,
 state TEXT NOT NULL,
 value_json TEXT NOT NULL CHECK(json_valid(value_json)),
 revision TEXT NOT NULL,
 PRIMARY KEY(id,number)
);
CREATE INDEX bw_agent_proposal_account ON bw_agent_proposals(account_id,order_id);
CREATE INDEX bw_agent_proposal_grant ON bw_agent_proposals(grant_id);

CREATE TABLE bw_agent_proposal_attempts (
 id TEXT PRIMARY KEY,
 proposal_id TEXT NOT NULL,
 proposal_number INTEGER NOT NULL,
 account_id TEXT NOT NULL,
 at TEXT NOT NULL,
 actor_id TEXT NOT NULL,
 code TEXT NOT NULL,
 reason TEXT NOT NULL
);
CREATE INDEX bw_agent_proposal_attempt_history ON bw_agent_proposal_attempts(proposal_id,proposal_number,at);
