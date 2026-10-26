import type { Bindings } from '../auth.server'
import { connection,provider } from './card-provider'
import { openWebhookSecret } from './webhook-security'
import { reconcileCard } from './card-ledger'
import { fail } from './model'
export async function cardWebhook(request:Request,env:Bindings) {
 if(request.method!=='POST')return new Response(null,{status:405})
 const config=await connection(env),signature=request.headers.get('stripe-signature')??'',parts=signature.split(','),timestamp=parts.find(p=>p.startsWith('t='))?.slice(2)
 if(!timestamp||!/^\d+$/.test(timestamp)||Math.abs(Date.now()/1000-Number(timestamp))>300)fail('STRIPE_SIGNATURE','Stripe signature is missing or expired.',400)
 const body=await request.text()
 if(new TextEncoder().encode(body).byteLength>256000)fail('BODY','Stripe event is too large.',413)
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(await openWebhookSecret(env,'stripe:webhook',config.webhook_cipher)),{name:'HMAC',hash:'SHA-256'},false,['verify'])
 let verified=false
 for(const part of parts.filter(p=>p.startsWith('v1='))) {
  const hex=part.slice(3);if(!/^[a-f0-9]{64}$/.test(hex))continue
  if(await crypto.subtle.verify('HMAC',key,Uint8Array.from(hex.match(/../g)!,c=>parseInt(c,16)),new TextEncoder().encode(`${timestamp}.${body}`)))verified=true
 }
 if(!verified)fail('STRIPE_SIGNATURE','Stripe signature could not be verified.',400)
 let event:any;try{event=JSON.parse(body)}catch{fail('STRIPE_EVENT','Stripe event is malformed.',400)}
 if(event.livemode!==!!config.livemode||typeof event.id!=='string'||!Number.isInteger(event.created)||event.created>Math.floor(Date.now()/1000)+300)fail('STRIPE_EVENT','The Stripe event must match the connected merchant mode.',400)
 if(!['payment_intent.amount_capturable_updated','payment_intent.succeeded','payment_intent.payment_failed','payment_intent.canceled'].includes(event.type))return Response.json({received:true})
 if(await env.DB.prepare('SELECT 1 FROM bw_card_events WHERE id=?').bind(event.id).first())return Response.json({received:true,duplicate:true})
 const object=event.data?.object,id=object?.metadata?.barrowPaymentId
 if(typeof id!=='string')return Response.json({received:true})
 const payment=await env.DB.prepare('SELECT value_json FROM bw_card_payments WHERE id=?').bind(id).first<{value_json:string}>()
 if(!payment||JSON.parse(payment.value_json).installationId!==object.metadata?.barrowInstallationId)return Response.json({received:true})
 const stripe=await provider(env,config),intent=await stripe.call(`/payment_intents/${encodeURIComponent(object.id)}?expand[]=latest_charge`)
 await reconcileCard(env,id,intent,{id:event.id,type:event.type,created:event.created})
 return Response.json({received:true})
}
