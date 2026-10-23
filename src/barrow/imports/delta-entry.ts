import {fail} from '../model'
import {now} from '../clock'

const blocking=`EXISTS(SELECT 1 FROM bw_delta_cutovers d,json_each(d.scope_json) s WHERE s.value=? AND (d.state IN ('rehearsal','inactive') OR (d.state='signedoff' AND d.cutoff_at>?)))`
/** Both the public error and the transaction fence use the same scoped hold. */
export async function deltaEntryGuard(db:D1Database,accountId:string) {
 const at=(await now()).toISOString()
 const held=await db.prepare(`SELECT 1 AS held WHERE ${blocking}`).bind(accountId,at).first()
 if(held)fail('CUTOVER_ENTRY_HELD','The owner paused new order entry for this account. Complete cutoff sign-off, or explicitly roll back to native Pier-only entry before continuing.')
 return db.prepare(`INSERT INTO bw_guard(value) SELECT CASE WHEN NOT ${blocking} THEN 1 ELSE 0 END`).bind(accountId,at)
}

/** Keep the exact native revision stable while its retained file is in flight. */
export async function deltaMutationGuard(db:D1Database,accountId:string) {
 const blocked=`EXISTS(SELECT 1 FROM bw_delta_cutovers d,json_each(d.scope_json) s WHERE s.value=? AND d.io_until>?)`
 if(await db.prepare(`SELECT 1 AS held WHERE ${blocked}`).bind(accountId,Date.now()).first())fail('CUTOVER_IO_BUSY','A cutover destination run is using this account snapshot. Retry the order change after it completes.')
 return db.prepare(`INSERT INTO bw_guard(value) SELECT CASE WHEN NOT ${blocked} THEN 1 ELSE 0 END`).bind(accountId,Date.now())
}
