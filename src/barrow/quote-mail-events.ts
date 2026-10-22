// AUTO-003: Base owns signature checks, receipt identity and event ordering.
import type { Bindings } from '../auth.server'
import { verifyWebhook, createDeliveryEventIntake, createD1EventStore } from './quote-mail-base.mjs'
import { recordMailFailure } from './quote-mail-tasks'
import { observeMailConfiguration } from './quote-mail-config'
import { commercialAuditEvent } from './audit-event'
export async function quoteMailWebhook(request:Request,env:Bindings) {
 if(request.method!=='POST')return new Response(null,{status:405})
 if(env.MAIL_PROVIDER!=='resend'||!env.MAIL_WEBHOOK_SECRET||!env.MAIL_EVENT_TENANT)return Response.json({error:'Quote delivery webhook is not configured.'},{status:503})
 try {
  const reader=request.body?.getReader(),parts:Uint8Array[]=[];let size=0
  if(!reader)return new Response(null,{status:400})
  for(;;){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>1024*1024){await reader.cancel();return new Response(null,{status:413})}parts.push(next.value)}
  const rawBody=new Uint8Array(size);let offset=0;for(const part of parts){rawBody.set(part,offset);offset+=part.length}
  // Verify with unmodified Base code, then discard late events for an erased
  // delivery. Neither the old address nor the payload may be stored again.
  if(await verifyWebhook({provider:'resend',rawBody,headers:request.headers,key:env.MAIL_WEBHOOK_SECRET,now:Date.now(),toleranceSeconds:300})) {
   const payload=JSON.parse(new TextDecoder().decode(rawBody)),id=payload?.data?.email_id
   if(typeof id==='string'&&await env.DB.prepare("SELECT 1 FROM bw_quote_mail WHERE provider_message_id=? AND recipient IS NULL AND summary='[Erased notice]' AND restored=1").bind(id).first())return Response.json({recorded:false,ignored:true})
  }
  let admitted:any
  // Base still owns the event transaction. This product guard shares that
  // transaction, so erasure racing authorization cannot resurrect a payload.
  const guardedDb={prepare:env.DB.prepare.bind(env.DB),batch:async(statements:D1PreparedStatement[])=>{
   if(!admitted)throw new Error('Delivery event not authorized')
   const guard=env.DB.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM json_each(?) r WHERE NOT EXISTS(SELECT 1 FROM bw_quote_mail m WHERE m.provider_message_id=? AND m.recipient=r.value AND m.summary<>'[Erased notice]')) THEN 1 ELSE 0 END").bind(JSON.stringify(admitted.recipients),admitted.providerMessageId)
   const results=await env.DB.batch([guard,...statements,env.DB.prepare('DELETE FROM bw_guard')]);return results.slice(1,-1)
  }}
  const intake=createDeliveryEventIntake({provider:'resend',key:env.MAIL_WEBHOOK_SECRET,tenantId:env.MAIL_EVENT_TENANT,eventNamespace:'quotes',toleranceSeconds:300,store:createD1EventStore({db:guardedDb as any}),authorize:async(event:any)=>{
   if(event.tenantId!==env.MAIL_EVENT_TENANT)return false
   for(const recipient of event.recipients)if(!await env.DB.prepare('SELECT id FROM bw_quote_mail WHERE provider_message_id=? AND recipient=?').bind(event.providerMessageId,recipient).first())return false
   admitted=event
   return true
  }})
  await intake.ingestWebhook({rawBody,headers:request.headers})
  await observeMailConfiguration(env)
  await reconcileMailEvents(env)
  return Response.json({recorded:true})
 }catch{return Response.json({error:'Delivery event refused.'},{status:400})}
}
export async function reconcileMailEvents(env:Bindings) {
 if(!env.MAIL_EVENT_TENANT)return
 const rows=(await env.DB.prepare("SELECT m.*,s.status AS event_status,s.event_id,s.occurred_at FROM bw_quote_mail m JOIN rer_mail_event_states s ON s.provider='resend' AND s.tenant_id=? AND s.event_namespace='quotes' AND s.provider_message_id=m.provider_message_id AND s.recipient=m.recipient").bind(env.MAIL_EVENT_TENANT).all<any>()).results
 for(const row of rows){
  const at=new Date(row.occurred_at).toISOString(),event=commercialAuditEvent('system:quote-mail',row.id,'quote-mail.delivery-event',{accountId:row.account_id,revision:row.event_id,source:'quote-mail.verified-resend',reason:`Verified ${row.event_status} delivery event for ${row.quote_id}; no message body retained in audit.`})
  await env.DB.batch([env.DB.prepare("UPDATE bw_quote_mail SET status=?,last_event_id=?,updated_at=? WHERE id=? AND COALESCE(last_event_id,'')<>?").bind(row.event_status,row.event_id,at,row.id,row.event_id),env.DB.prepare(event.sql.replace('VALUES(?,?,?,?,?,?)','SELECT ?,?,?,?,?,? WHERE changes()=1')).bind(...event.params)])
  if(['bounced','failed','rejected','complained'].includes(row.event_status))await recordMailFailure(env,{...row,status:row.event_status,updated_at:at})
 }
}
