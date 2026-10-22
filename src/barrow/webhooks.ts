import type { Bindings } from '../auth.server'
import { audit,changed,commit } from './access'
import { fail,text,type Actor } from './model'
import { dispatchWebhooks,webhookRateSeconds } from './webhook-delivery'
import { sealWebhookSecret,webhookEndpoint } from './webhook-security'
export const webhookTypes=['account.saved','order.submitted','order.approved','quote.requested','quote.accepted'] as const
function owner(actor:Actor) {if(actor.agent||actor.role!=='owner')fail('FORBIDDEN','Only the signed-in owner may manage outbound webhooks.',403)}
/** Settings return only masked custody; retained envelopes and attempts have no recipient or message body. */
export async function readWebhooks(env:Bindings,actor:Actor) {
 owner(actor)
 const subscriptions=(await env.DB.prepare('SELECT id,endpoint,event_types,revision,state,created_at,updated_at,secret_cipher IS NOT NULL AS secret_configured,next_delivery_at FROM bw_webhook_subscriptions ORDER BY created_at,id').all<any>()).results.map(({event_types,secret_configured,...row})=>({...row,eventTypes:JSON.parse(event_types),secretConfigured:Boolean(secret_configured)}))
 const deliveries=(await env.DB.prepare('SELECT d.*,e.envelope,s.state AS subscription_state FROM bw_webhook_deliveries d JOIN bw_webhook_events e ON e.id=d.event_id LEFT JOIN bw_webhook_subscriptions s ON s.id=d.subscription_id ORDER BY d.created_at DESC,d.id LIMIT 200').all<any>()).results.map(({envelope,...row})=>({...row,event:JSON.parse(envelope)}))
 const attempts=(await env.DB.prepare('SELECT * FROM bw_webhook_attempts WHERE delivery_id IN (SELECT id FROM bw_webhook_deliveries ORDER BY created_at DESC,id LIMIT 200) ORDER BY started_at,number').all<any>()).results
 const unresolved=await env.DB.prepare("SELECT count(*) AS count FROM bw_webhook_deliveries WHERE state<>'acknowledged'").first<{count:number}>()
 // Verified current provider doors use Base receipt identity and terminal/out-of-order state rules.
 const incoming=(await env.DB.prepare("SELECT r.provider,r.event_namespace,r.event_id,(SELECT count(*) FROM bw_webhook_incoming i WHERE i.provider=r.provider AND i.namespace=r.event_namespace AND i.event_id=r.event_id) AS intake_count,(SELECT count(*) FROM bw_webhook_incoming i WHERE i.provider=r.provider AND i.namespace=r.event_namespace AND i.event_id=r.event_id AND i.outcome='duplicate') AS duplicate_count,json_extract(r.event_json,'$.occurredAt') AS occurred_at,json_extract(r.event_json,'$.status') AS status,CASE WHEN EXISTS(SELECT 1 FROM rer_mail_event_states s WHERE s.provider=r.provider AND s.tenant_id=r.tenant_id AND s.event_namespace=r.event_namespace AND s.event_id=r.event_id) THEN 'current provider state' ELSE 'retained receipt; superseded or out of order' END AS result FROM rer_mail_event_receipts r ORDER BY r.rowid DESC LIMIT 100").all<any>()).results
 return {subscriptions,deliveries,attempts,incoming,unresolved:unresolved?.count??0,eventTypes:webhookTypes,rateSeconds:webhookRateSeconds,maxAttempts:6,note:'Local enqueue is not external acceptance. Only HTTP 2xx acknowledges an outbound handoff. Failed and revoked subscriptions retain unresolved queue items; replay retains the same event ID and bytes. Receivers must deduplicate by webhook-id. Use an HTTPS endpoint you control and trust to receive these event IDs, types and times. Incoming quote/report mail receipts describe provider mail only, never inventory or payment state.'}
}
export async function webhookCommand(env:Bindings,actor:Actor,type:string,p:any) {
 owner(actor)
 const reason=text(p.reason,'Webhook change reason',1000),at=new Date().toISOString(),revision=crypto.randomUUID()
 if(type==='webhook.dispatch'){await commit(env.DB,actor,[audit(env.DB,actor,'webhook-dispatch','webhook.dispatch-requested',{revision,source:type,reason})]);await dispatchWebhooks(env);return readWebhooks(env,actor)}
 if(type==='webhook.subscribe') {
  if(p.consent!==true)fail('CONSENT','Explicitly consent to sending these minimal events to this endpoint.',400)
  const endpoint=webhookEndpoint(p.endpoint)
  if(!Array.isArray(p.eventTypes)||!p.eventTypes.length||p.eventTypes.length>webhookTypes.length||p.eventTypes.some((t:unknown)=>!webhookTypes.includes(t as any)))fail('INPUT','Select supported event types.',400)
  if(typeof p.secret!=='string'||p.secret.length<24||p.secret.length>256||/[\r\n]/.test(p.secret))fail('INPUT','Use a shared signing secret of 24 to 256 characters.',400)
  const id=crypto.randomUUID(),cipher=await sealWebhookSecret(env,id,p.secret)
  await commit(env.DB,actor,[env.DB.prepare("INSERT INTO bw_webhook_subscriptions(id,endpoint,event_types,secret_cipher,revision,state,created_at,updated_at) VALUES(?,?,?,?,?,'active',?,?)").bind(id,endpoint,JSON.stringify([...new Set(p.eventTypes)]),cipher,revision,at,at),audit(env.DB,actor,id,'webhook.subscribed',{revision,source:type,reason})])
  return {id,revision,state:'active',secretConfigured:true}
 }
 if(type==='webhook.replay') {
  const delivery=await env.DB.prepare('SELECT * FROM bw_webhook_deliveries WHERE id=?').bind(p.deliveryId??'').first<any>()
  if(!delivery)fail('NOT_FOUND','Webhook delivery not found.',404)
  if(!['dead-letter','acknowledged'].includes(delivery.state))fail('STATE','Automatic backoff is still active. Replay a dead-lettered or acknowledged event.',409)
  const active=await env.DB.prepare("SELECT 1 FROM bw_webhook_subscriptions WHERE id=? AND state='active' AND secret_cipher IS NOT NULL").bind(delivery.subscription_id).first()
  if(!active)fail('STATE','A revoked subscription retains its queue. Create a new subscription for future events; revoked custody cannot be replayed.',409)
  await commit(env.DB,actor,[env.DB.prepare("UPDATE bw_webhook_deliveries SET state='queued',cycle_attempts=0,next_attempt_at=0,lease_until=0,last_result='Replay locally queued; external acceptance pending',updated_at=? WHERE id=? AND state=? AND attempts=?").bind(at,delivery.id,delivery.state,delivery.attempts),changed(env.DB),audit(env.DB,actor,delivery.id,'webhook.replayed',{revision:String(delivery.attempts),source:type,reason})])
  return {id:delivery.id,eventId:delivery.event_id,state:'queued',externalAcceptance:false}
 }
 if(!['webhook.rotate','webhook.revoke'].includes(type))fail('COMMAND','Unknown webhook command.',404)
 const previous=await env.DB.prepare('SELECT revision,state FROM bw_webhook_subscriptions WHERE id=?').bind(p.id??'').first<{revision:string;state:string}>()
 if(!previous)fail('NOT_FOUND','Webhook subscription not found.',404)
 if(previous.revision!==p.revision)fail('REVISION','Refresh the subscription before changing it.',409)
 if(previous.state!=='active')fail('STATE','This subscription is revoked. Create a new consented subscription for future events.',409)
 let cipher:string|null=null
 if(type==='webhook.rotate') {
  if(typeof p.secret!=='string'||p.secret.length<24||p.secret.length>256||/[\r\n]/.test(p.secret))fail('INPUT','Use a shared signing secret of 24 to 256 characters.',400)
  cipher=await sealWebhookSecret(env,p.id,p.secret)
 }
 await commit(env.DB,actor,[env.DB.prepare('UPDATE bw_webhook_subscriptions SET secret_cipher=?,revision=?,state=?,updated_at=? WHERE id=? AND revision=?').bind(cipher,revision,type==='webhook.revoke'?'revoked':'active',at,p.id,previous.revision),changed(env.DB),audit(env.DB,actor,p.id,type==='webhook.revoke'?'webhook.revoked':'webhook.secret-rotated',{revision,source:type,reason})])
 return {id:p.id,revision,state:type==='webhook.revoke'?'revoked':'active',secretConfigured:cipher!==null}
}

export async function webhookHistory(env:Bindings,actor:Actor) {
 owner(actor)
 const [events,deliveries,attempts,incoming]=await Promise.all(['bw_webhook_events','bw_webhook_deliveries','bw_webhook_attempts','bw_webhook_incoming'].map(table=>env.DB.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()))
 return {events:events.results,deliveries:deliveries.results,attempts:attempts.results,incoming:incoming.results,note:'Subscription endpoints and encrypted secrets are excluded. History cannot enable sending in a restored installation.'}
}
