-- REP-005: rep visits and appointments with buyer notes, a sample request, its Pier handoff acknowledgment and a show
-- basket turned into a quote or draft order. Pier stays the only stock ledger: a sample moves only through its order.create.
CREATE TABLE bw_visits (
 id TEXT PRIMARY KEY,
 account_id TEXT NOT NULL REFERENCES bw_accounts(id),
 value_json TEXT NOT NULL CHECK(json_valid(value_json)),
 revision TEXT NOT NULL,
 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX bw_visits_account ON bw_visits(account_id, created_at);
