/** Seed-owned custody mapping. Erasure revokes every agent that captured this
 * account and retires its whole retained artifact set, including aggregate reads.
 * Migration 0074 fences late writes; usage and opaque audit receipts survive. */
export async function retainAgentAccount(db:D1Database,accountId:string,revision:string,agentId:string) {
 await db.batch([
  db.prepare('INSERT OR IGNORE INTO bw_agent_custody(account_id) VALUES(?)').bind(accountId),
  db.prepare('INSERT OR IGNORE INTO bw_agent_account_clients(account_id,agent_id) VALUES(?,?)').bind(accountId,agentId),
  db.prepare(`INSERT INTO bw_guard(value) SELECT CASE WHEN
   EXISTS(SELECT 1 FROM bw_accounts WHERE id=? AND revision=?)
   AND NOT EXISTS(SELECT 1 FROM bw_agent_erased_accounts WHERE account_id=?)
   AND NOT EXISTS(SELECT 1 FROM bw_agent_erased_clients WHERE agent_id=?)
   THEN 1 ELSE 0 END`).bind(accountId,revision,accountId,agentId),
  db.prepare('DELETE FROM bw_guard')])
}
