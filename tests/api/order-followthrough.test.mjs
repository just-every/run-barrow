import test from 'node:test';
import assert from 'node:assert/strict';
import {cardFixture,assertFinancialFloor} from './card-fixture.mjs';
import {orderFollowthroughFixture,proveOrderFollowthrough} from './order-followthrough-fixture.mjs';

test('native order trace retains inventory and verified card exceptions through reviewed recovery without inferring delivery or settlement',async t=>{
 const f=await orderFollowthroughFixture(t),{h,buyer,edge,prepared}=f;
 const {payment}=await prepared({outcome:'requires_action'});let challenge=await h.command('card.authorize',{paymentId:payment.id,consent:true,amountCents:payment.amountCents,surchargeCents:payment.surchargeCents},buyer);assert.equal(challenge.state,'requires_action');assert.ok(challenge.actionUrl);await assertFinancialFloor(h,challenge);
 await h.command('card.capture',{paymentId:payment.id,reason:'Refuse unverified challenge.'},{status:409});
 edge.intents.get(challenge.providerPaymentId).status='requires_payment_method';challenge=await h.command('card.refresh',{paymentId:payment.id},buyer);assert.equal(challenge.state,'declined');await assertFinancialFloor(h,challenge);
 let task=(await h.api('/api/barrow/followups?view=all')).tasks.find(row=>row.sourceId===payment.id);assert.equal(task.status,'open');assert.ok(task.ownerId&&task.sourcePath&&task.nextContactDate);assert.equal((await h.request(task.sourcePath)).status,200);
 await h.command('followup.update',{id:task.id,revision:task.revision,close:true,resolution:'Unverified close'},{status:409});
 await h.command('followup.refresh',{});task=(await h.api('/api/barrow/followups?view=all')).tasks.find(row=>row.id===task.id);assert.equal(task.status,'open');
 const cancelled=await h.command('card.cancel',{paymentId:payment.id,reason:'Supplier voided the failed payment.'});assert.equal(cancelled.state,'cancelled');await assertFinancialFloor(h,cancelled);
 task=(await h.api('/api/barrow/followups?view=all')).tasks.find(row=>row.id===task.id);assert.equal(task.status,'closed');assert.match(task.resolution,/verified cancelled/);
 const statement=await h.api('/api/barrow/statements/cedar?to=2100-12-31',undefined,buyer);assert.equal(statement.sections[0].receivedCents,0);
 const authorization=edge.requests.find(row=>row.path==='/payment_intents');assert.equal(authorization.body.get('capture_method'),'manual');assert.equal(authorization.body.get('confirm'),'true');

 await proveOrderFollowthrough(t,f);
 {
 const {h,buyer,edge,prepared}=await cardFixture(t,{connect:false});
 const connection={secretKey:'synthetic-barrow-1',consent:true,reason:'Owner reviewed the merchant mode and separate Stripe custody.',surchargeBps:0,allowedStates:[]};
 await h.command('card.connect',{...connection,mode:'live'},{status:400});await h.command('card.connect',{...connection,mode:'test'});
 const {payment}=await prepared({setupFailure:true});assert.equal(payment.state,'declined');assert.ok(!payment.providerPaymentId);
 assert.equal((await h.request('/api/barrow/card-settings',buyer)).status,403);
 let task=(await h.api('/api/barrow/followups?view=all')).tasks.find(row=>row.sourceId===payment.id);assert.equal(task.status,'open');
 const ended=await h.command('card.cancel',{paymentId:payment.id,reason:'Owner ended the verified failed hosted attempt.'});assert.equal(ended.state,'cancelled');
 await h.command('card.authorize',{paymentId:payment.id,consent:true,amountCents:payment.amountCents,surchargeCents:payment.surchargeCents},{...buyer,status:409});
 task=(await h.api('/api/barrow/followups?view=all')).tasks.find(row=>row.id===task.id);assert.equal(task.status,'closed');assert.ok(task.resolution);
 assert.equal(edge.intents.size,0);assert.equal((await h.api('/api/barrow/statements/cedar?to=2100-12-31',undefined,buyer)).sections[0].receivedCents,0);

 }
});
