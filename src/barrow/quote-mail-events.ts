// AUTO-003: use Base's signature verification and durable event-ordering door.
import type { Bindings } from '../auth.server'
import { createDeliveryEventIntake, createD1EventStore } from './quote-mail-base.mjs'
import { recordMailFailure } from './quote-mail-tasks'
export async function quoteMailWebhook(request:Request,env:Bindings) {
 if(request.method!=='POST')return new Response(null,{status:405})
 if(env.MAIL_PROVIDER!=='resend'||!env.MAIL_WEBHOOK_SECRET)return Response.json({error:'Quote delivery webhook is not configured.'},{status:503})
 try {
  const reader=request.body?.getReader(),parts:Uint8Array[]=[];let size=0
  if(!reader)return new Response(null,{status:400})
  for(;;){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>1024*1024){await reader.cancel();return new Response(null,{status:413})}parts.push(next.value)}
  const rawBody=new Uint8Array(size);let offset=0;for(const part of parts){rawBody.set(part,offset);offset+=part.length}
  const intake=createDeliveryEventIntake({provider:'resend',key:env.MAIL_WEBHOOK_SECRET,tenantId:'barrow',eventNamespace:'quotes',store:createD1EventStore({db:env.DB}),authorize:async(event:any)=>{
   for(const recipient of event.recipients)if(!await env.DB.prepare('SELECT id FROM bw_quote_mail WHERE provider_message_id=? AND recipient=?').bind(event.providerMessageId,recipient).first())return false
   return true
  }})
  await intake.ingestWebhook({rawBody,headers:request.headers})
  await reconcileMailEvents(env)
  return Response.json({recorded:true})
 }catch{return Response.json({error:'Delivery event refused.'},{status:400})}
}
export async function reconcileMailEvents(env:Bindings) {
 const rows=(await env.DB.prepare("SELECT m.*,s.status AS event_status FROM bw_quote_mail m JOIN rer_mail_event_states s ON s.provider='resend' AND s.tenant_id='barrow' AND s.event_namespace='quotes' AND s.provider_message_id=m.provider_message_id AND s.recipient=m.recipient").all<any>()).results
 for(const row of rows){
  await env.DB.prepare('UPDATE bw_quote_mail SET status=? WHERE id=?').bind(row.event_status,row.id).run()
  if(['bounced','failed','rejected','complained','deferred'].includes(row.event_status))await recordMailFailure(env,row)
 }
}
