import test from 'node:test';
import assert from 'node:assert/strict';
import {installation,accountValue,archive,restore} from './harness.mjs';
import {webhookReceiver,subscribeWebhook,dispatchWebhook,elapseWebhook,webhookReason,webhookSecret} from './webhook-fixture.mjs';

test('INT-013: signed immutable events retain failed attempts, endpoint backoff/rate limits and dead letters until acknowledged replay with one receiver effect',async t=>{
 const receiver=webhookReceiver(),h=await installation({networkEdge:receiver.fetch});t.after(()=>h.close());
 const subscription=await subscribeWebhook(h);
 await h.command('account.save',{id:'cedar',value:accountValue('synthetic-barrow-1')});
 let state=await h.api('/api/barrow/webhooks');assert.equal(state.unresolved,1);assert.equal(state.deliveries[0].state,'queued');assert.equal(receiver.requests.length,0);
 const event=state.deliveries[0].event,id=state.deliveries[0].id;
 assert.deepEqual(Object.keys(event).sort(),['id','occurredAt','revision','schema','type']);assert.equal(event.type,'account.saved');assert.ok(Number.isInteger(event.revision));
 assert.ok(!JSON.stringify(event).includes('buyer@example.test'));assert.ok(!JSON.stringify(event).includes('Cedar'));
 await dispatchWebhook(h);assert.equal(receiver.requests.length,1);
 state=await dispatchWebhook(h);assert.equal(receiver.requests.length,1);assert.equal(state.unresolved,1);assert.equal(state.deliveries[0].state,'retrying');assert.ok(state.deliveries[0].next_attempt_at>Date.now());
 await h.command('webhook.replay',{deliveryId:id,reason:webhookReason},{status:409});
 // A rate-limited endpoint delays all events; enqueueing a second event cannot bypass it.
 await elapseWebhook(h);receiver.status=429;receiver.retryAfter='120';await dispatchWebhook(h);
 await h.command('account.save',{id:'second',value:accountValue('synthetic-barrow-2','second@example.test')});
 const beforeRate=receiver.requests.length;state=await dispatchWebhook(h);assert.equal(receiver.requests.length,beforeRate);assert.ok(state.subscriptions[0].next_delivery_at>Date.now());
 receiver.status=503;receiver.retryAfter=null;
 // Only the first handoff is due while the second remains durably enqueued.
 await h.db.prepare('UPDATE bw_webhook_deliveries SET next_attempt_at=? WHERE id<>?').bind(Date.now()+86400000,id).run();
 for(let attempt=3;attempt<=6;attempt++){
  await h.db.batch([h.db.prepare('UPDATE bw_webhook_subscriptions SET next_delivery_at=0'),h.db.prepare('UPDATE bw_webhook_deliveries SET next_attempt_at=0 WHERE id=?').bind(id)]);
  await dispatchWebhook(h);
 }
 state=await h.api('/api/barrow/webhooks');let delivery=state.deliveries.find(d=>d.id===id);assert.equal(delivery.state,'dead-letter');assert.equal(delivery.attempts,6);assert.equal(state.attempts.filter(a=>a.delivery_id===id).length,6);assert.equal(state.unresolved,2);assert.equal(receiver.effects.size,0);
 const count=receiver.requests.length;await elapseWebhook(h); // Keep second event future while probing dead-letter dispatch.
 await h.db.prepare('UPDATE bw_webhook_deliveries SET next_attempt_at=? WHERE id<>?').bind(Date.now()+86400000,id).run();
 await dispatchWebhook(h);assert.equal(receiver.requests.length,count);
 const replay=await h.command('webhook.replay',{deliveryId:id,reason:'Receiver repaired; replay the same signed event.'});assert.equal(replay.eventId,event.id);assert.equal(replay.externalAcceptance,false);
 state=await h.api('/api/barrow/webhooks');assert.equal(state.unresolved,2);assert.equal(state.deliveries.find(d=>d.id===id).state,'queued');
 receiver.status=204;await elapseWebhook(h);await h.db.prepare('UPDATE bw_webhook_deliveries SET next_attempt_at=? WHERE id<>?').bind(Date.now()+86400000,id).run();await dispatchWebhook(h);
 state=await h.api('/api/barrow/webhooks');delivery=state.deliveries.find(d=>d.id===id);assert.equal(delivery.state,'acknowledged');assert.equal(delivery.attempts,7);assert.ok(delivery.acknowledged_at);assert.equal(state.unresolved,1);assert.equal(receiver.effects.size,1);
 await h.command('webhook.replay',{deliveryId:id,reason:'Receiver confirms duplicate delivery is safe.'});await elapseWebhook(h);await h.db.prepare('UPDATE bw_webhook_deliveries SET next_attempt_at=? WHERE id<>?').bind(Date.now()+86400000,id).run();await dispatchWebhook(h);
 assert.equal(receiver.effects.size,1);assert.ok(receiver.requests.every(r=>r.event.id===event.id));assert.equal(new Set(receiver.requests.map(r=>r.body)).size,1);
 state=await h.api('/api/barrow/webhooks');assert.equal(state.attempts.filter(a=>a.delivery_id===id).length,8);
 // A redirect is a retained refusal, and no second destination is contacted.
 receiver.status=302;await elapseWebhook(h);await h.db.prepare('UPDATE bw_webhook_deliveries SET next_attempt_at=? WHERE id=?').bind(Date.now()+86400000,id).run();await dispatchWebhook(h);
 state=await h.api('/api/barrow/webhooks');assert.match(state.deliveries.find(d=>d.id!==id).last_result,/Redirect refused/);assert.equal(state.unresolved,1);
 await h.command('webhook.revoke',{id:subscription.id,revision:subscription.revision,reason:'Owner ends processor authorization.'});await elapseWebhook(h);const revokedCount=receiver.requests.length;await dispatchWebhook(h);assert.equal(receiver.requests.length,revokedCount);assert.equal((await h.api('/api/barrow/diagnostics')).webhooks.unresolved,1);
 const history=await h.api('/api/barrow/webhooks.json');assert.equal(history.attempts.length,9);assert.ok(!JSON.stringify(history).includes(webhookSecret));
 const audit=await h.api('/api/barrow/audit?search=webhook');for(const action of ['webhook.subscribed','webhook.replayed','webhook.dead-lettered','webhook.acknowledged','webhook.revoked'])assert.ok(audit.events.some(e=>e.action===action),action);
 const csv=await(await h.request('/api/barrow/audit.csv')).text();assert.ok(csv.includes('Receiver repaired'));assert.ok(csv.includes('system:webhooks'));
});

test('INT-013 / DATA-002 / DATA-003: owner consent, masked encrypted secret rotation and revocation, private doors and inert restored history preserve custody',async t=>{
 const receiver=webhookReceiver(),h=await installation({networkEdge:receiver.fetch});t.after(()=>h.close());
 const buyer={as:await h.signIn('buyer@example.test')},admin={as:await h.signIn('admin@example.test','admin')};
 const {token}=await h.api('/api/barrow/agent-token',{}),agent={as:'',headers:{authorization:`Bearer ${token}`}};
 for(const actor of [buyer,admin,agent]){
  for(const path of ['/api/barrow/webhooks','/api/barrow/webhooks.json'])assert.equal((await h.request(path,actor)).status,403);
  for(const type of ['subscribe','rotate','revoke','replay','dispatch'])await h.command('webhook.'+type,{reason:webhookReason}, {...actor,status:403});
 }
 await h.command('webhook.subscribe',{endpoint:'https://receiver.synthetic-barrow.com/events',eventTypes:['account.saved'],secret:webhookSecret,reason:webhookReason},{status:400});
 for(const endpoint of ['http://receiver.synthetic-barrow.com','https://user:pass@receiver.synthetic-barrow.com','https://receiver.synthetic-barrow.com?token=synthetic-barrow-1','https://127.0.0.1/events','https://[::1]/','https://localhost/events','https://service.internal/events','https://receiver.synthetic-barrow.com:444/events','https://0x7f000001']){
  const response=await h.api('/api/barrow/commands',{type:'webhook.subscribe',payload:{endpoint,consent:true,eventTypes:['account.saved'],secret:webhookSecret,reason:webhookReason}},{status:400});assert.equal(response.error.code,'INPUT');
 }
 const origin=await h.request('/api/barrow/commands',{method:'POST',headers:{origin:'https://foreign.synthetic-barrow.com'},body:{type:'webhook.subscribe',payload:{}}});assert.equal(origin.status,403);
 const sub=await subscribeWebhook(h);await h.command('account.save',{id:'cedar',value:accountValue('synthetic-barrow-1')});await dispatchWebhook(h);
 let state=await h.api('/api/barrow/webhooks');assert.equal(state.subscriptions[0].secretConfigured,true);assert.ok(!JSON.stringify(state).includes(webhookSecret));
 const stored=await h.db.prepare('SELECT secret_cipher FROM bw_webhook_subscriptions WHERE id=?').bind(sub.id).first();assert.ok(stored.secret_cipher&&!stored.secret_cipher.includes(webhookSecret));
 const nextSecret='synthetic-barrow-987654321';const rotated=await h.command('webhook.rotate',{id:sub.id,revision:sub.revision,secret:nextSecret,reason:'Owner coordinated receiver signing-secret rotation.'});
 receiver.secret=nextSecret;receiver.status=204;await elapseWebhook(h);await dispatchWebhook(h);assert.equal(receiver.effects.size,1);
 await h.command('webhook.revoke',{id:sub.id,revision:sub.revision,reason:webhookReason},{status:409});
 const snapshot=await archive(h),serialized=JSON.stringify(snapshot);for(const secret of [webhookSecret,nextSecret,stored.secret_cipher])assert.ok(!serialized.includes(secret));assert.ok(!serialized.includes('https://receiver.synthetic-barrow.com/events'));
 const destinationReceiver=webhookReceiver(),destination=await installation({networkEdge:destinationReceiver.fetch});t.after(()=>destination.close());await restore(destination,snapshot);await dispatchWebhook(destination);
 state=await destination.api('/api/barrow/webhooks');assert.equal(state.subscriptions.length,0);assert.equal(state.deliveries.length,1);assert.equal(state.attempts.length,2);assert.equal(destinationReceiver.requests.length,0);
 await subscribeWebhook(destination);await dispatchWebhook(destination);assert.equal(destinationReceiver.requests.length,0,'Fresh consent covers only future business events, never restored history');
 await h.command('retention.request',{accountId:'cedar',requester:'Verified representative',channel:'Owner review',held:false,verificationNote:'Owner verified the synthetic requester.',reason:'Owner reviewed external processor custody.'});
 const preview=await h.command('retention.preview',{accountId:'cedar'});assert.ok(preview.custody.webhooks.includes('receiver.synthetic-barrow.com'));assert.ok(preview.custody.webhooks.includes('1 installation-wide'));assert.ok(preview.custody.webhooks.includes('no deletion'));
 await h.command('webhook.revoke',{id:sub.id,revision:rotated.revision,reason:'Owner revokes all later outbound traffic.'});
 const audit=await h.api('/api/barrow/audit?search=webhook');for(const action of ['webhook.subscribed','webhook.secret-rotated','webhook.revoked']){const event=audit.events.find(e=>e.action===action);assert.ok(event?.source&&event.reason&&event.revision&&event.createdAt);assert.equal(event.actorKind,'human')}
 const csv=await(await h.request('/api/barrow/audit.csv')).text();for(const secret of [webhookSecret,nextSecret,stored.secret_cipher])assert.ok(!csv.includes(secret));
});
