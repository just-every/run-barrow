import type { Bindings } from '../auth.server'
import { createDeliveryEventIntake, createD1EventStore } from './quote-mail-base.mjs'
import { recordWebhookIntake } from './webhook-incoming'

/** Base verifies provider signatures, installation binding and immutable event replay. */
export async function campaignMailWebhook(request:Request,env:Bindings){
 if(request.method!=='POST')return new Response(null,{status:405})
 if(env.MAIL_PROVIDER!=='resend'||!env.MAIL_WEBHOOK_SECRET||!env.MAIL_EVENT_TENANT)return Response.json({error:'Campaign delivery intake is not configured.'},{status:503})
 try{
  const reader=request.body?.getReader();if(!reader)return new Response(null,{status:400})
  const parts:Uint8Array[]=[];let size=0
  for(;;){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>1024*1024){await reader.cancel();return new Response(null,{status:413})}parts.push(next.value)}
  const rawBody=new Uint8Array(size);let offset=0;for(const part of parts){rawBody.set(part,offset);offset+=part.length}
  const intake=createDeliveryEventIntake({provider:'resend',key:env.MAIL_WEBHOOK_SECRET,tenantId:env.MAIL_EVENT_TENANT,eventNamespace:'campaigns',toleranceSeconds:300,store:createD1EventStore({db:env.DB}),authorize:async(event:any)=>{
   if(event.tenantId!==env.MAIL_EVENT_TENANT)return false
   for(const recipient of event.recipients)if(!await env.DB.prepare('SELECT d.id FROM bw_campaign_deliveries d JOIN oa_operators p ON p.id=d.recipient_id WHERE d.provider_message_id=? AND p.email=? AND p.status=\'active\'').bind(event.providerMessageId,recipient).first())return false
   return true
  }})
  const outcomes=await intake.ingestWebhook({rawBody,headers:request.headers})
  await recordWebhookIntake(env,'campaigns',Date.parse(JSON.parse(new TextDecoder().decode(rawBody)).created_at),outcomes)
  // Reconcile only this verified receipt, including a replay after an interrupted projection.
  const eventIds=outcomes.map((outcome:any)=>outcome.eventId)
  const rows=(await env.DB.prepare(`SELECT d.id,e.status,e.event_id,e.occurred_at FROM bw_campaign_deliveries d JOIN oa_operators p ON p.id=d.recipient_id JOIN rer_mail_event_states e ON e.provider='resend' AND e.tenant_id=? AND e.event_namespace='campaigns' AND e.provider_message_id=d.provider_message_id AND e.recipient=p.email WHERE e.event_id IN (SELECT value FROM json_each(?))`).bind(env.MAIL_EVENT_TENANT,JSON.stringify(eventIds)).all<any>()).results
  for(const row of rows)if(['delivered','bounced','complained','rejected','failed'].includes(row.status))await env.DB.prepare('UPDATE bw_campaign_deliveries SET status=?,reason=?,updated_at=? WHERE id=? AND status<>?').bind(row.status,'Verified provider event '+row.event_id,new Date(row.occurred_at).toISOString(),row.id,row.status).run()
  return Response.json({recorded:true})
 }catch{return Response.json({error:'Campaign delivery event refused.'},{status:400})}
}
