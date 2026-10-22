import { recordWebhookIntake } from './webhook-incoming'
import type { Bindings } from '../auth.server'
import { createDeliveryEventIntake, createD1EventStore } from './quote-mail-base.mjs'
import { reportAudit } from './report-access'

/** Same unmodified Base signature/receipt intake as quote mail, isolated report namespace. */
export async function reportMailWebhook(request: Request, env: Bindings) {
 if(request.method!=='POST')return new Response(null,{status:405})
 if(env.MAIL_PROVIDER!=='resend'||!env.MAIL_WEBHOOK_SECRET||!env.MAIL_EVENT_TENANT)return Response.json({error:'Report delivery webhook is not configured.'},{status:503})
 try {
  const reader=request.body?.getReader(),parts:Uint8Array[]=[];let size=0
  if(!reader)return new Response(null,{status:400})
  for(;;){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>1024*1024){await reader.cancel();return new Response(null,{status:413})}parts.push(next.value)}
  const rawBody=new Uint8Array(size);let offset=0;for(const part of parts){rawBody.set(part,offset);offset+=part.length}
  const intake=createDeliveryEventIntake({provider:'resend',key:env.MAIL_WEBHOOK_SECRET,tenantId:env.MAIL_EVENT_TENANT,eventNamespace:'reports',toleranceSeconds:300,store:createD1EventStore({db:env.DB}),authorize:async(event:any)=>{
   if(event.tenantId!==env.MAIL_EVENT_TENANT)return false
   for(const recipient of event.recipients)if(!await env.DB.prepare('SELECT id FROM bw_report_deliveries WHERE provider_message_id=? AND recipient=?').bind(event.providerMessageId,recipient).first())return false
   return true
  }})
  const outcomes=await intake.ingestWebhook({rawBody,headers:request.headers})
  await recordWebhookIntake(env,'reports',Date.parse(JSON.parse(new TextDecoder().decode(rawBody)).created_at),outcomes)
  const rows=(await env.DB.prepare(`SELECT d.id,d.operator_id,d.status,e.status AS event_status,e.event_id FROM bw_report_deliveries d JOIN rer_mail_event_states e
   ON e.provider='resend' AND e.tenant_id=? AND e.event_namespace='reports' AND e.provider_message_id=d.provider_message_id AND e.recipient=d.recipient`).bind(env.MAIL_EVENT_TENANT).all<any>()).results
  for(const row of rows) {
   await env.DB.batch([
    env.DB.prepare('UPDATE bw_report_deliveries SET status=?,reason=?,updated_at=? WHERE id=? AND status<>?').bind(row.event_status,'Verified provider event '+row.event_id,new Date().toISOString(),row.id,row.event_status),
    reportAudit(env,'system:reports',row.id,'delivery-event',`Verified ${row.event_status} event ${row.event_id}; no message content in audit.`,true),
   ])
  }
  return Response.json({recorded:true})
 }catch{return Response.json({error:'Delivery event refused.'},{status:400})}
}
