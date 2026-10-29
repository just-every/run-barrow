import { fail } from '../model.ts'
/** Native erasure stays closed until retained results, approvals and audit have
 * an agreed redaction/retention implementation. SQL triggers fence races. */
export async function assertNoAgentCustody(db:D1Database,accountId:string) {
 if(await db.prepare('SELECT 1 FROM bw_agent_custody WHERE account_id=?').bind(accountId).first())
  fail('AGENT_CUSTODY','Retained company-agent evidence covers this account. Its erasure remains blocked pending the door custody integration.',409)
}
export async function retainAgentAccount(db:D1Database,accountId:string,revision:string) {
 await db.batch([db.prepare('INSERT OR IGNORE INTO bw_agent_custody(account_id) VALUES(?)').bind(accountId),
  db.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_accounts WHERE id=? AND revision=?) THEN 1 ELSE 0 END').bind(accountId,revision),db.prepare('DELETE FROM bw_guard')])
}
