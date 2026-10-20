// AUTO-003: durable delivery of the existing ORD-005 notice audiences.
import type { Bindings } from '../auth.server'
import { operatorMail } from '../mail.server.mjs'
import { fail, requirePerson, requireSupplier, supplierDate, type Actor } from './model'
import { now } from './clock'
import { reconcileMailEvents } from './quote-mail-events'
import { recordMailFailure } from './quote-mail-tasks'

export async function queueQuoteMail(env: Bindings) {
 const at = await now(), today = supplierDate(at)
 const quotes = (await env.DB.prepare("SELECT value_json FROM bw_quotes WHERE json_extract(value_json,'$.status')='proposed'").all<{value_json:string}>()).results
 for (const row of quotes) {
  const quote = JSON.parse(row.value_json), latest = quote.revisions.at(-1)
  if (latest?.validUntil !== today) continue
  // The existing revision kind carries an expiry reminder; deterministic identity prevents repeated reminders.
  await env.DB.prepare("INSERT OR IGNORE INTO bw_quote_notices(id,quote_id,account_id,audience,kind,summary,actor_id,created_at,mail_eligible) VALUES(?,?,?,?,'revision',?,'system',?,1)").bind(`expiry:${quote.id}:${latest.number}:buyer`,quote.id,quote.accountId,'buyer',`${quote.id} revision ${latest.number} expires after today (America/New_York).`,at.toISOString()).run()
  await env.DB.prepare("INSERT OR IGNORE INTO bw_quote_notices(id,quote_id,account_id,audience,kind,summary,actor_id,created_at,mail_eligible) VALUES(?,?,?,?,'revision',?,'system',?,1)").bind(`expiry:${quote.id}:${latest.number}:supplier`,quote.id,quote.accountId,'supplier',`${quote.id} revision ${latest.number} expires after today (America/New_York).`,at.toISOString()).run()
 }
 const notices = (await env.DB.prepare('SELECT n.* FROM bw_quote_notices n WHERE n.mail_eligible=1 AND NOT EXISTS(SELECT 1 FROM bw_quote_mail_notices m WHERE m.id=n.id) ORDER BY n.rowid LIMIT 100').all<any>()).results
 for (const n of notices) {
  const recipients = (await env.DB.prepare(n.audience==='supplier'
   ? "SELECT id,email FROM oa_operators WHERE status='active' AND role IN ('owner','admin') AND id<>?"
   : "SELECT p.id,p.email FROM oa_operators p JOIN bw_accounts a ON p.email=json_extract(a.value_json,'$.email') WHERE a.id=? AND p.status='active' AND p.id<>?").bind(...(n.audience==='supplier'?[n.actor_id]:[n.account_id,n.actor_id])).all<{id:string;email:string}>()).results
  // One transaction snapshots the recipients once, even if two dispatchers discover the notice.
  await env.DB.batch([...recipients.map(person=>env.DB.prepare("INSERT OR IGNORE INTO bw_quote_mail(id,notice_id,quote_id,account_id,audience,recipient_id,recipient,summary,updated_at) SELECT ?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM bw_quote_mail_notices WHERE id=?)").bind(crypto.randomUUID(),n.id,n.quote_id,n.account_id,n.audience,person.id,person.email,n.summary,at.toISOString(),n.id)),env.DB.prepare('INSERT OR IGNORE INTO bw_quote_mail_notices VALUES(?)').bind(n.id)])
 }
}
export async function dispatchQuoteMail(env: Bindings) {
 await reconcileMailEvents(env)
 await queueQuoteMail(env)
 const rows=(await env.DB.prepare("SELECT * FROM bw_quote_mail WHERE status IN ('pending','sending') AND lease_until<? ORDER BY rowid LIMIT 50").bind(Date.now()).all<any>()).results
 for (const row of rows) {
  if(row.notice_id.startsWith('expiry:')) {
   const q=await env.DB.prepare('SELECT value_json FROM bw_quotes WHERE id=?').bind(row.quote_id).first<{value_json:string}>()
   const quote=q?JSON.parse(q.value_json):null,latest=quote?.revisions.at(-1)
   if(quote?.status!=='proposed'||row.notice_id!==`expiry:${row.quote_id}:${latest?.number}:${row.audience}`||latest?.validUntil!==supplierDate(await now())) {
    await env.DB.prepare("UPDATE bw_quote_mail SET status='superseded' WHERE id=?").bind(row.id).run();continue
   }
  }
  const permit=await env.DB.prepare("SELECT p.id FROM oa_operators p WHERE p.id=? AND p.email=? AND p.status='active' AND ((?='supplier' AND p.role IN ('owner','admin')) OR (?='buyer' AND EXISTS(SELECT 1 FROM bw_accounts a WHERE a.id=? AND json_extract(a.value_json,'$.email')=p.email)))").bind(row.recipient_id,row.recipient,row.audience,row.audience,row.account_id).first()
  if(!permit) {await env.DB.prepare("UPDATE bw_quote_mail SET status='suppressed' WHERE id=?").bind(row.id).run();continue}
  const claimed=await env.DB.prepare("UPDATE bw_quote_mail SET status='sending',lease_until=?,attempts=attempts+1 WHERE id=? AND status IN ('pending','sending') AND lease_until<? RETURNING id").bind(Date.now()+120000,row.id,Date.now()).all()
  if(!claimed.results.length)continue
  let result:any
  try { result=await operatorMail(env)?.send({deliveryId:row.id,from:env.MAIL_FROM??'',to:[row.recipient],subject:`Barrow quote ${row.quote_id}`,headers:{},html:`<p>Quote activity. <a href="${env.AUTH_ORIGIN}/api/barrow/quotes/${row.quote_id}">Open your quote</a>.</p>`,text:`${row.summary}\n\nOpen the quote using your own Barrow sign-in:\n${env.AUTH_ORIGIN}/api/barrow/quotes/${row.quote_id}`}) } catch { result={status:'failed'} }
  const status=result?.status==='accepted'?'accepted':result?.status==='development'?'suppressed':'failed'
  await env.DB.prepare('UPDATE bw_quote_mail SET status=?,provider_message_id=?,lease_until=0,updated_at=? WHERE id=?').bind(status,result?.providerMessageId??null,new Date().toISOString(),row.id).run()
  if(status==='failed')await recordMailFailure(env,row)
 }
 // Reconcile durable failures after a crash between the result write and task insertion.
 const failed=(await env.DB.prepare("SELECT * FROM bw_quote_mail WHERE status IN ('failed','bounced','rejected','complained','deferred')").all<any>()).results
 for(const row of failed)await recordMailFailure(env,row)
}
export async function quoteMailCommand(env:Bindings,actor:Actor,type:string,p:any) {
 requirePerson(actor);requireSupplier(actor)
 if(type==='quote-mail.dispatch') {await dispatchQuoteMail(env);return {deliveries:(await env.DB.prepare('SELECT id,quote_id,recipient,status,attempts,updated_at FROM bw_quote_mail ORDER BY rowid').all()).results}}
 fail('COMMAND','Unknown quote delivery command.',404)
}
