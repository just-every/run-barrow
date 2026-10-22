import type { Bindings } from '../auth.server'
import { commercialAuditEvent } from './audit-event'
import { openWebhookSecret,signWebhook,webhookEndpoint } from './webhook-security'
export const webhookRateSeconds=10
const maxCycleAttempts=6
export async function dispatchWebhooks(env:Bindings) {
 const endpoints=(await env.DB.prepare("SELECT id FROM bw_webhook_subscriptions WHERE state='active' AND secret_cipher IS NOT NULL ORDER BY next_delivery_at,id LIMIT 20").all<{id:string}>()).results
 for(const endpoint of endpoints)await deliverEndpoint(env,endpoint.id)
}
async function deliverEndpoint(env:Bindings,id:string) {
 const now=Date.now(),at=new Date(now).toISOString(),lease=now+30000
 // A per-endpoint lease serializes all workers and all its events, including manual dispatch/replay.
 const subscription=await env.DB.prepare("UPDATE bw_webhook_subscriptions SET lease_until=?,next_delivery_at=? WHERE id=? AND state='active' AND secret_cipher IS NOT NULL AND lease_until<=? AND next_delivery_at<=? RETURNING *").bind(lease,now+webhookRateSeconds*1000,id,now,now).first<any>()
 if(!subscription)return
 try {
  const delivery=await env.DB.prepare("UPDATE bw_webhook_deliveries SET state='sending',lease_until=?,attempts=attempts+1,cycle_attempts=cycle_attempts+1,updated_at=? WHERE id=(SELECT id FROM bw_webhook_deliveries WHERE subscription_id=? AND state IN ('queued','retrying','sending') AND next_attempt_at<=? AND lease_until<=? ORDER BY created_at,id LIMIT 1) RETURNING *").bind(lease,at,id,now,now).first<any>()
  if(!delivery)return
  const event=await env.DB.prepare('SELECT envelope FROM bw_webhook_events WHERE id=?').bind(delivery.event_id).first<{envelope:string}>()
  if(!event)throw new Error('Retained event missing')
  const attemptId=crypto.randomUUID()
  // A crashed sender retains its unfinished attempt rather than claiming a rejection or acceptance.
  await env.DB.batch([
   env.DB.prepare("UPDATE bw_webhook_attempts SET finished_at=?,result='unknown: sender lease expired before result was recorded' WHERE delivery_id=? AND finished_at IS NULL").bind(at,delivery.id),
   env.DB.prepare("INSERT INTO bw_webhook_attempts(id,delivery_id,event_id,number,signing_revision,started_at,result) VALUES(?,?,?,?,?,?,'sending: external acceptance not known')").bind(attemptId,delivery.id,delivery.event_id,delivery.attempts,subscription.revision,at),
  ])
  let status:number|null=null,result='Transport failed or timed out; external acceptance unknown',retryAfter=0
  try {
   const url=webhookEndpoint(subscription.endpoint),secret=await openWebhookSecret(env,id,subscription.secret_cipher),timestamp=String(Math.floor(now/1000))
   // Recheck active revision immediately before using decrypted custody. Revocation stops later sends;
   // an already in-flight request cannot be recalled and retains its actual result.
   const active=await env.DB.prepare("SELECT 1 FROM bw_webhook_subscriptions WHERE id=? AND revision=? AND state='active' AND lease_until=?").bind(id,subscription.revision,lease).first()
   if(!active)result='Subscription revoked or rotated before send; no request made'
   else {
    const response=await fetch(url,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(10000),headers:{'content-type':'application/json','webhook-id':delivery.event_id,'webhook-timestamp':timestamp,'webhook-signature':await signWebhook(secret,delivery.event_id,timestamp,event.envelope),'webhook-key-revision':subscription.revision,'idempotency-key':delivery.event_id},body:event.envelope})
    status=response.status
    result=response.ok?'Acknowledged external acceptance (HTTP 2xx)':status>=300&&status<400?'Redirect refused; external acceptance not acknowledged':`HTTP ${status}; external acceptance not acknowledged`
    const raw=response.headers.get('retry-after')
    if(status===429&&raw){const seconds=/^\d+$/.test(raw)?Number(raw):Math.ceil((Date.parse(raw)-now)/1000);if(Number.isFinite(seconds))retryAfter=Math.max(0,Math.min(seconds,86400))*1000}
    // Never retain response bodies or redirect locations: they may contain private provider data.
    await response.body?.cancel()
   }
  }catch{/* No exception text: URLs, decrypted custody and provider responses stay private. */}
  const acknowledged=status!==null&&status>=200&&status<300,dead=!acknowledged&&delivery.cycle_attempts>=maxCycleAttempts
  const finished=new Date().toISOString(),next=Date.now()+Math.max(30000*2**Math.min(delivery.cycle_attempts-1,7),retryAfter)
  const audit=commercialAuditEvent('system:webhooks',delivery.id,acknowledged?'webhook.acknowledged':dead?'webhook.dead-lettered':'webhook.attempt-failed',{revision:String(delivery.attempts),source:'webhook.dispatch',reason:`${result}; event ${delivery.event_id}; attempt ${delivery.attempts}.`})
  await env.DB.batch([
   env.DB.prepare('UPDATE bw_webhook_attempts SET finished_at=?,http_status=?,result=? WHERE id=? AND finished_at IS NULL').bind(finished,status,result,attemptId),
   env.DB.prepare('UPDATE bw_webhook_deliveries SET state=?,next_attempt_at=?,lease_until=0,acknowledged_at=CASE WHEN ? THEN ? ELSE acknowledged_at END,last_result=?,updated_at=? WHERE id=? AND lease_until=?').bind(acknowledged?'acknowledged':dead?'dead-letter':'retrying',next,acknowledged?1:0,finished,result,finished,delivery.id,lease),
   // A 429 delays the endpoint as a whole, not merely the rejected event.
   env.DB.prepare('UPDATE bw_webhook_subscriptions SET next_delivery_at=MAX(next_delivery_at,?) WHERE id=?').bind(Date.now()+retryAfter,id),
   env.DB.prepare(audit.sql).bind(...audit.params),
  ])
 }finally{await env.DB.prepare('UPDATE bw_webhook_subscriptions SET lease_until=0 WHERE id=? AND lease_until=?').bind(id,lease).run()}
}
