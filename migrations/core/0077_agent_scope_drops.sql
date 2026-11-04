-- Current agent authority may shrink after a signed token was issued.
-- This is live credential state, excluded from portable archives.
CREATE TABLE bw_agent_scope_drops (
 agent_id TEXT NOT NULL,
 scope TEXT NOT NULL,
 PRIMARY KEY(agent_id,scope)
);
