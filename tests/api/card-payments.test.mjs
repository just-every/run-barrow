import test from 'node:test';
import assert from 'node:assert/strict';
import {cardFixture,cardEdge,assertFinancialFloor} from './card-fixture.mjs';
import {archive,installation,restore} from './harness.mjs';



test('hosted card review preserves the approved order, exact surcharge and authorization; lost capture and signed replay reconcile one receipt in every statement format',async t=>{
 const {h,pier,buyer,other,edge,prepared}=await cardFixture(t);
 const unpaid=await h.command('order.prepare',{accountId:'cedar',reference:'Not supplier approved',lines:[{sku:'OAT-1',quantity:2}]},buyer);await h.command('card.prepare',{orderId:unpaid.id},{...buyer,status:409});await h.command('order.submit',{orderId:unpaid.id},buyer);await h.command('card.prepare',{orderId:unpaid.id},{...buyer,status:409});
 const {order,payment}=await prepared();assert.equal(payment.surchargeCents,260);assert.equal(payment.card.funding,'credit');
 const snapshot=await h.api('/api/barrow/orders/'+order.id),inventory=(await pier.api('/api/pier/state')).orders;
 assert.equal(payment.amountCents,order.totalCents);assert.equal(payment.currency,order.currency);
 await h.command('card.authorize',{paymentId:payment.id},{...buyer,status:400});
 await h.command('card.authorize',{paymentId:payment.id,consent:true,amountCents:1,surchargeCents:payment.surchargeCents},{...buyer,status:400});
 assert.equal(edge.requests.filter(row=>row.path==='/payment_intents').length,0);
 let authorized=await h.command('card.authorize',{paymentId:payment.id,consent:true,amountCents:payment.amountCents,surchargeCents:payment.surchargeCents},buyer);assert.equal(authorized.state,'authorized');await assertFinancialFloor(h,authorized);
 const query='?from=2000-01-01&to=2100-12-31';let statement=await h.api('/api/barrow/statements/cedar'+query,undefined,buyer);assert.equal(statement.sections[0].receivedCents,0);
 await h.command('card.capture',{paymentId:payment.id,reason:'Buyer cannot capture their own card'},{...buyer,status:403});
 edge.loseCapture();await h.command('card.capture',{paymentId:payment.id,reason:'Supplier approved capture after authorization.'},{status:409});
 const captured=await h.command('card.refresh',{paymentId:payment.id},buyer);assert.equal(captured.state,'captured');await assertFinancialFloor(h,captured);
 assert.equal((await h.command('card.capture',{paymentId:payment.id,reason:'Reconcile the lost response.'})).state,'captured');assert.equal(edge.captures,1);
 const signed=await edge.event(h,captured);assert.equal(signed.response.status,200);
 const replay=await h.raw('/api/barrow/card-webhook',{method:'POST',headers:{'stripe-signature':signed.signature},body:signed.body});assert.equal((await replay.json()).duplicate,true);
 assert.equal((await edge.event(h,captured,{tamper:true})).response.status,400);
 assert.deepEqual(await h.api('/api/barrow/orders/'+order.id),snapshot);assert.deepEqual((await pier.api('/api/pier/state')).orders,inventory);
 statement=await h.api('/api/barrow/statements/cedar'+query,undefined,buyer);const section=statement.sections[0];assert.equal(section.receivedCents,13260);assert.equal(section.surchargedCents,260);assert.equal(section.closingCents,0);assert.equal(section.entries.find(row=>row.kind==='card-surcharge').amountCents,260);
 const receipt=section.entries.find(row=>row.kind==='card-payment');assert.equal(receipt.amountCents,-13260);assert.equal((await h.request(receipt.paymentPath,buyer)).status,200);
 for(const suffix of ['.csv','.pdf']){const text=await(await h.request('/api/barrow/statements/cedar'+suffix+query,buyer)).text();assert.ok(text.includes(captured.id));assert.ok(text.includes(suffix==='.csv'?'-13260':'132.60'))}
 const day=receipt.date,after=new Date(day+'T12:00:00Z');after.setUTCDate(after.getUTCDate()+1);const later=await h.api('/api/barrow/statements/cedar?from='+after.toISOString().slice(0,10)+'&to=2100-12-31',undefined,buyer);assert.equal(later.sections[0].openingCents,0);assert.equal(later.sections[0].entries.length,0);
 assert.equal((await h.request('/api/barrow/payments/'+captured.id,other)).status,404);
 const exported=await h.api('/api/barrow/export.json',undefined,buyer);assert.equal(exported.cardpayments[0].id,captured.id);assert.equal(exported.cardpayments[0].amountCents,13000);assert.ok(!JSON.stringify(exported).includes('"synthetic-barrow-1"'));
 for(const kind of ['cardpayments','cardevents']){const csv=await(await h.request('/api/barrow/export/'+kind+'.csv',buyer)).text();assert.ok(csv.includes(captured.id));assert.equal((await h.request('/api/barrow/export/'+kind+'.csv',other)).status,200);assert.ok(!(await(await h.request('/api/barrow/export/'+kind+'.csv',other)).text()).includes(captured.id))}
 const custody=await h.api('/api/barrow/retention');assert.match(custody.custody.stripe,/Stripe/);
 const eventRows=await h.db.prepare('SELECT created_at FROM bw_card_events WHERE payment_id=?').bind(payment.id).all();const latest=eventRows.results.map(row=>row.created_at).sort().at(-1),date=new Date(latest),year=date.getUTCFullYear()+7,month=date.getUTCMonth(),last=new Date(Date.UTC(year,month+1,0)).getUTCDate();date.setUTCFullYear(year,month,Math.min(date.getUTCDate(),last));
 assert.equal(custody.documents.find(row=>row.orderId===order.id)?.commercialMinimumUntil??(await h.command('retention.preview',{accountId:'cedar'})).items.find(row=>row.id==='order:'+order.id).floorUntil,date.toISOString());
 const saved=await archive(h),target=await installation({networkEdge:edge.networkEdge});t.after(()=>target.close());await restore(target,saved);
 assert.equal((await target.api('/api/barrow/card-settings')).configured,false);await target.command('card.refresh',{paymentId:payment.id},{status:409});
 assert.equal((await target.api('/api/barrow/payments/'+payment.id)).state,'captured');
});


test('card surcharge is calculated only for verified credit funding and an explicitly permitted matching state',async t=>{
 const {prepared,h}=await cardFixture(t);
 for(const state of ['MA','CT','ME','PR']){const refused=await h.command('card.connect',{secretKey:'synthetic-barrow-1',consent:true,mode:'test',reason:'Refuse prohibited state surcharge.',surchargeBps:200,allowedStates:[state]},{status:400});assert.equal(refused.error.code,'SURCHARGE')}
 for(const options of [{funding:'debit'},{funding:'prepaid'},{funding:'unknown'},{state:'MA'},{state:'CT'},{state:'CA'}]){const {payment}=await prepared(options);assert.equal(payment.surchargeCents,0)}
 const {payment}=await prepared();assert.equal(payment.surchargeCents,260);
});


test('two installations under one Stripe merchant keep customer, checkout, idempotency and signed event effects separate',async t=>{
 const edge=cardEdge(),first=await cardFixture(t,{edge}),second=await cardFixture(t,{edge});
 const a=(await first.prepared()).payment,b=(await second.prepared()).payment;
 assert.equal(a.id,b.id);assert.notEqual(a.installationId,b.installationId);assert.equal('providerCustomerId' in a,false);assert.equal('providerCustomerId' in b,false);assert.equal(new Set([...edge.sessions.values()].map(s=>s.customer)).size,2);assert.equal(edge.sessions.size,2);
 const authorize=(h,p,buyer)=>h.command('card.authorize',{paymentId:p.id,consent:true,amountCents:p.amountCents,surchargeCents:p.surchargeCents},buyer);
 const one=await authorize(first.h,a,first.buyer),two=await authorize(second.h,b,second.buyer);assert.notEqual(one.providerPaymentId,two.providerPaymentId);
 edge.intents.get(one.providerPaymentId).status='succeeded';edge.intents.get(one.providerPaymentId).amount_received=one.amountCents+one.surchargeCents;
 assert.equal((await edge.event(second.h,one)).response.status,200);
 assert.equal((await second.h.api('/api/barrow/payments/'+two.id)).state,'authorized');assert.equal((await second.h.api('/api/barrow/statements/cedar?to=2100-12-31')).sections[0].receivedCents,0);
 assert.equal((await second.h.db.prepare('SELECT COUNT(*) AS n FROM bw_card_events WHERE id NOT LIKE ?').bind('api:%').first()).n,0);
 const keys=edge.requests.filter(row=>row.path==='/payment_intents').map(row=>row.key);assert.equal(new Set(keys).size,2);
});


test('saved company card needs separate exact-amount authorization, withdrawal fences later charges and keeps receipts without exposing reusable tokens',async t=>{
 const {h,pier,buyer,other,edge,prepared,order}=await cardFixture(t);
 const initial=await prepared(),source=initial.payment;
 await h.command('saved-card.save',{paymentId:source.id,reason:'Save for this company location.'},{...buyer,status:400});
 await h.command('saved-card.save',{paymentId:source.id,consent:true,reason:'Supplier cannot grant buyer consent.'},{status:403});
 const saved=await h.command('saved-card.save',{paymentId:source.id,consent:true,reason:'Company finance permits later separately authorized balances at this delivery location.'},buyer);
 assert.equal(saved.status,'active');assert.equal(saved.last4,'4242');
 const second=await order('Later saved-card balance'),snapshot=await h.api('/api/barrow/orders/'+second.id),inventory=(await pier.api('/api/pier/state')).orders;
 let payment=await h.command('saved-card.prepare',{orderId:second.id,methodId:saved.id,revision:saved.revision},buyer);
 assert.equal(edge.intents.size,0);assert.equal(payment.amountCents,second.totalCents);assert.equal(payment.surchargeCents,260);
 await h.command('card.authorize',{paymentId:payment.id,consent:true,amountCents:1,surchargeCents:260},{...buyer,status:400});
 payment=await h.command('card.authorize',{paymentId:payment.id,consent:true,amountCents:payment.amountCents,surchargeCents:payment.surchargeCents},buyer);
 assert.equal(payment.state,'authorized');assert.equal(edge.requests.findLast(row=>row.path==='/payment_intents').body.get('off_session'),'true');
 payment=await h.command('card.capture',{paymentId:payment.id,reason:'Capture explicitly authorized later balance.'});assert.equal(payment.state,'captured');
 const third=await order('Prepared before withdrawal'),pending=await h.command('saved-card.prepare',{orderId:third.id,methodId:saved.id,revision:saved.revision},buyer);
 const revoked=await h.command('saved-card.revoke',{methodId:saved.id,revision:saved.revision,reason:'Buyer withdraws future company collection consent.'},buyer);assert.equal(revoked.status,'revoked');
 const requests=edge.requests.filter(row=>row.path==='/payment_intents').length;
 await h.command('card.authorize',{paymentId:pending.id,consent:true,amountCents:pending.amountCents,surchargeCents:pending.surchargeCents},{...buyer,status:409});
 await h.command('saved-card.prepare',{orderId:third.id,methodId:saved.id,revision:saved.revision},{...buyer,status:409});
 await h.command('saved-card.save',{paymentId:source.id,consent:true,reason:'Cannot silently restore withdrawn consent.'},{...buyer,status:409});
 assert.equal(edge.requests.filter(row=>row.path==='/payment_intents').length,requests);
 assert.equal((await h.api('/api/barrow/payments/'+payment.id,undefined,buyer)).state,'captured');
 assert.deepEqual(await h.api('/api/barrow/orders/'+second.id),snapshot);assert.deepEqual((await pier.api('/api/pier/state')).orders.filter(o=>o.id===second.pierOrderId),inventory.filter(o=>o.id===second.pierOrderId));
 assert.equal((await h.request('/api/barrow/saved-cards?orderId='+second.id,other)).status,404);
 const {token}=await h.api('/api/barrow/agent-token',{}),agent={as:'',headers:{authorization:`Bearer ${token}`}};
 assert.equal((await h.request('/api/barrow/saved-cards?orderId='+second.id,agent)).status,403);
 const stored=JSON.parse((await h.db.prepare('SELECT value_json FROM bw_card_payments WHERE id=?').bind(payment.id).first()).value_json);
 for(const actor of [buyer,{}])for(const path of ['/api/barrow/payments/'+payment.id,'/api/barrow/payments?orderId='+second.id,'/api/barrow/saved-cards?orderId='+second.id,'/api/barrow/export.json']){
  const response=JSON.stringify(await h.api(path,undefined,actor));for(const token of [stored.paymentMethodId,stored.providerCustomerId])assert.ok(!response.includes(token));
 }
 assert.equal((await h.db.prepare('SELECT method_cipher FROM bw_saved_cards WHERE id=?').bind(saved.id).first()).method_cipher,'');
 const snapshotArchive=await archive(h);assert.ok(!JSON.stringify(snapshotArchive).includes(stored.providerCustomerId));assert.ok(!JSON.stringify(snapshotArchive).includes(stored.paymentMethodId));for(const part of snapshotArchive)for(const item of part.items??[])if(item.table==='bw_card_payments'){const row=JSON.parse(item.row.value_json);assert.equal('paymentMethodId' in row,false);assert.equal('providerCustomerId' in row,false);assert.equal('setupSessionId' in row,false)}
 const target=await installation({networkEdge:edge.networkEdge});t.after(()=>target.close());await restore(target,snapshotArchive);
 assert.equal((await target.db.prepare('SELECT COUNT(*) AS n FROM bw_saved_cards').first()).n,0);
 assert.equal((await target.api('/api/barrow/payments/'+payment.id)).state,'captured');
});

test('saved consent is bound to company delivery location and current company finance authority',async t=>{
 const {h,buyer,edge,prepared,order}=await cardFixture(t);
 const first=await h.command('location.save',{accountId:'cedar',kind:'ship-to',value:{name:'New York shop',line1:'101 Main Street',city:'New York',state:'NY',zip:'10001'}});
 const {payment}=await prepared(),saved=await h.command('saved-card.save',{paymentId:payment.id,consent:true,reason:'Company finance permits later charges for the New York shop.'},buyer);
 const second=await h.command('location.save',{accountId:'cedar',kind:'ship-to',makeDefault:true,value:{name:'Second shop',line1:'202 Main Street',city:'New York',state:'NY',zip:'10001'}});
 const elsewhere=await order('Different delivery location');
 await h.command('saved-card.prepare',{orderId:elsewhere.id,methodId:saved.id,revision:saved.revision},{...buyer,status:403});
 assert.deepEqual((await h.api('/api/barrow/saved-cards?orderId='+elsewhere.id,undefined,buyer)).methods,[]);
 const members=await h.api('/api/barrow/company/members?accountId=cedar'),member=members.members.find(m=>m.email==='buyer@example.test');
 await h.command('company.update',{accountId:'cedar',memberId:member.id,revision:member.revision,reason:'Restrict the buyer to purchasing at the second shop.',policy:{rights:['administrator','purchaser'],locations:[second.id],perOrderLimitCents:null,approvalLimitCents:null}});
 assert.equal((await h.request('/api/barrow/saved-cards?orderId='+payment.orderId,buyer)).status,403);
 await h.command('saved-card.revoke',{methodId:saved.id,revision:saved.revision,reason:'No current finance authority.'},{...buyer,status:403});
 assert.equal(edge.intents.size,0);assert.equal(saved.locationId,first.id);
});
