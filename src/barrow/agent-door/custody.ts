/** Native record revision and restore fence. Retained door artifacts are owned
 * by Base's identifier-linked erasure map, not by a second client-wide ledger. */
export async function retainAgentAccount(db:D1Database,accountId:string,revision:string,_agentId:string) {
 await db.batch([
  db.prepare(`INSERT INTO bw_guard(value) SELECT CASE WHEN
   EXISTS(SELECT 1 FROM bw_accounts WHERE id=? AND revision=?)
   AND NOT EXISTS(SELECT 1 FROM bw_agent_erased_accounts WHERE account_id=?)
   THEN 1 ELSE 0 END`).bind(accountId,revision,accountId),
  db.prepare('DELETE FROM bw_guard')])
}
