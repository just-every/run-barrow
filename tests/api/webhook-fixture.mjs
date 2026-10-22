import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
export const webhookReason='Owner authorized the synthetic receiver for minimal event notifications.';
export const webhookSecret='synthetic-barrow-123456789';
export function webhookReceiver() {
 const edge={status:503,secret:webhookSecret,requests:[],effects:new Set(),retryAfter:null};
 edge.fetch=async request=>{
  if(new URL(request.url).hostname!=='receiver.synthetic-barrow.com')return null;
  const body=await request.text(),headers=Object.fromEntries(request.headers),event=JSON.parse(body);
  const expected='v1,'+createHmac('sha256',edge.secret).update(`${headers['webhook-id']}.${headers['webhook-timestamp']}.${body}`).digest('base64');
  assert.equal(headers['webhook-signature'],expected,'Receiver verifies the original signed bytes');
  assert.equal(headers['webhook-id'],event.id);assert.equal(headers['idempotency-key'],event.id);
  assert.ok(Math.abs(Date.now()/1000-Number(headers['webhook-timestamp']))<300);
  edge.requests.push({body,headers,event});
  if(edge.status>=200&&edge.status<300)edge.effects.add(event.id);
  return new Response(null,{status:edge.status,headers:{...(edge.status===302?{location:'https://private.synthetic-barrow.com/redirect'}:{}),...(edge.retryAfter?{'retry-after':edge.retryAfter}:{})}});
 };
 return edge;
}
export const subscribeWebhook=(h,overrides={})=>h.command('webhook.subscribe',{endpoint:'https://receiver.synthetic-barrow.com/events',eventTypes:['account.saved'],secret:webhookSecret,consent:true,reason:webhookReason,...overrides});
export const dispatchWebhook=h=>h.command('webhook.dispatch',{reason:'Owner checks due handoffs after reviewing the receiver.'});
// Synthetic elapsed-clock fixture, as in quote delivery: no production clock override or retry bypass.
export async function elapseWebhook(h) {
 await h.db.batch([h.db.prepare('UPDATE bw_webhook_subscriptions SET next_delivery_at=0,lease_until=0'),h.db.prepare('UPDATE bw_webhook_deliveries SET next_attempt_at=0,lease_until=0')]);
}
