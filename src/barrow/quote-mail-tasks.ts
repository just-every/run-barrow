import type { Bindings } from '../auth.server'
import { calendarDate, reportZone } from './report-zone'
// Failure identity is the delivery, not the quote: acceptance never resolves a failed contact.
export async function recordMailFailure(env:Bindings,row:any) {
 const owner=await env.DB.prepare("SELECT id FROM oa_operators WHERE status='active' AND role='owner' ORDER BY id LIMIT 1").first<{id:string}>()
 if(!owner)return
 const at=new Date().toISOString(),id=`quote-mail:${row.id}`
 const value={id,kind:'quote-mail',accountId:row.account_id,sourceId:row.quote_id,sourcePath:`/api/barrow/quotes/${row.quote_id}`,title:`Failed quote contact ${row.quote_id}`,reason:`Quote email to ${row.recipient} was not confirmed delivered. Review the delivery and contact the participant.`,priority:1,createdAt:at,ownerId:owner.id,nextContactDate:calendarDate(new Date(at),await reportZone(env.DB)),status:'open',contacts:[]}
 await env.DB.prepare('INSERT OR IGNORE INTO bw_followups(id,account_id,value_json,revision) VALUES(?,?,?,?)').bind(id,row.account_id,JSON.stringify(value),crypto.randomUUID()).run()
}
