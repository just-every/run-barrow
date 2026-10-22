import type { Bindings } from '../auth.server'
import { supplierDate } from './model'
import { repRecipientSql, supplierToday } from './rep-scope'
import { commercialAuditEvent } from './audit-event'
// One persistent contact obligation per quote and exact recipient user; a missing buyer is explicit.
export async function recordMailFailure(env:Bindings,row:any) {
 if(row.restored===1||!await env.DB.prepare("SELECT 1 FROM bw_accounts WHERE id=? AND json_extract(value_json,'$.email') NOT LIKE '%@erased.invalid'").bind(row.account_id).first())return
 const at=row.updated_at??new Date().toISOString(),id=`quote-mail:${row.quote_id}:${row.recipient_id??'no-buyer'}`
 const owner=await env.DB.prepare("SELECT id FROM oa_operators WHERE status='active' AND role='owner' ORDER BY email=? DESC,created_at,id LIMIT 1").bind(env.OWNER_EMAIL).first<{id:string}>()
 if(!owner)return
 let ownerId=owner.id
 if(row.audience==='buyer') {
  const quote=await env.DB.prepare('SELECT value_json FROM bw_quotes WHERE id=?').bind(row.quote_id).first<{value_json:string}>()
  const proposer=quote?JSON.parse(quote.value_json).revisions.at(-1)?.proposedBy:null
  // The proposer owns the task while still an owner/admin, or a rep who holds the account today (ACC-006).
  if(proposer&&await env.DB.prepare(`SELECT p.id FROM oa_operators p WHERE p.id=? AND p.status='active' AND (p.role IN ('owner','admin') OR ${repRecipientSql('p','?',await supplierToday())})`).bind(proposer,row.account_id).first())ownerId=proposer
 }
 const prior=await env.DB.prepare('SELECT value_json,revision FROM bw_followups WHERE id=?').bind(id).first<{value_json:string;revision:string}>()
 const before=prior?JSON.parse(prior.value_json):null
 if(before?.failureDeliveryIds?.includes(row.id)) {await env.DB.prepare('UPDATE bw_quote_mail SET task_id=? WHERE id=?').bind(id,row.id).run();return}
 const value={...(before??{}),id,kind:'quote-mail',accountId:row.account_id,sourceId:row.quote_id,sourcePath:`/app?quote=${row.quote_id}`,title:`Failed quote contact ${row.quote_id}`,reason:row.recipient?`Quote email to ${row.recipient}: ${row.status}. ${row.reason??'Review the delivery and contact this participant.'}`:'No authorized buyer recipient; review the account and invitation before contact.',priority:1,createdAt:before?.createdAt??at,ownerId:before?.ownerId??ownerId,nextContactDate:supplierDate(new Date(at)),status:'open',contacts:before?.contacts??[],failureDeliveryIds:[...(before?.failureDeliveryIds??[]),row.id]}
 delete value.resolution
 const revision=crypto.randomUUID(),event=commercialAuditEvent('system:quote-mail',id,'quote-mail.contact-opened',{accountId:row.account_id,revision,source:'quote-mail.failure',reason:`Opened owned failed quote contact for ${row.quote_id}; delivery ${row.id}; no outreach inferred.`})
 const write=prior?env.DB.prepare('UPDATE bw_followups SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify(value),revision,id,prior.revision):env.DB.prepare('INSERT OR IGNORE INTO bw_followups(id,account_id,value_json,revision) VALUES(?,?,?,?)').bind(id,row.account_id,JSON.stringify(value),revision)
 await env.DB.batch([env.DB.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_accounts a JOIN bw_quote_mail m ON m.account_id=a.id WHERE a.id=? AND m.id=? AND json_extract(a.value_json,'$.email') NOT LIKE '%@erased.invalid' AND m.summary<>'[Erased notice]' AND m.restored=0) THEN 1 ELSE 0 END").bind(row.account_id,row.id),write,env.DB.prepare(event.sql.replace('VALUES(?,?,?,?,?,?)','SELECT ?,?,?,?,?,? WHERE changes()=1')).bind(...event.params),env.DB.prepare('UPDATE bw_quote_mail SET task_id=? WHERE id=?').bind(id,row.id),env.DB.prepare('DELETE FROM bw_guard')])
}
