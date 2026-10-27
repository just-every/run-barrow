import test from 'node:test';
import assert from 'node:assert/strict';
import {creditFixture} from './credit-fixture.mjs';
import {activateStaff,archive,installation,restore} from './harness.mjs';

test('one linked partial-return credit applies to an unpaid invoice and refunds the paid remainder once with exact dated balances and frozen commission reversals',async t=>{
 const {h,pier,buyer,other,edge,source,payment,returned,credit,order}=await creditFixture(t);
 assert.equal(credit.amountCents,6500);assert.equal(credit.lines[0].basis.lineCents,13000);assert.equal(credit.lines[0].quantity,1);assert.equal(credit.currency,source.currency);assert.equal(credit.orderRevision,source.revision);
 const snapshot=await h.api('/api/barrow/orders/'+source.id),inventory=(await pier.api('/api/pier/state')).orders;
 const beforeCommission=(await h.api('/api/barrow/reports/commissions')).rows.filter(row=>row.orderId===source.id);assert.deepEqual(beforeCommission.map(row=>[row.rep,row.grossCents,row.reversedCents]),[['avery',780,390],['blair',520,260]]);
 const second=await order('Unpaid invoice receiving part of the return credit');
 await h.command('credit.apply',{creditId:credit.id,revision:credit.revision,orderId:second.id,amountCents:2500,reason:'Apply part of returned paid merchandise to the new unpaid invoice.'});
 let current=await h.api('/api/barrow/credits/'+credit.id);assert.equal(current.availableCents,4000);
 const payload={creditId:credit.id,revision:current.revision,paymentId:payment.id,amountCents:4000,consent:true,reason:'Return the unused paid credit to the original card.'};
 edge.loseRefund();await h.command('refund.request',payload,{status:409});let report=await h.api('/api/barrow/credits?orderId='+second.id);assert.equal(report.refunds[0].status,'requested');assert.equal(report.credits[0].availableCents,0);assert.equal(report.outstandingCents,10500);
 let statement=await h.api('/api/barrow/statements/cedar?to=2100-12-31',undefined,buyer);assert.equal(statement.sections[0].closingCents,6500);assert.equal(statement.sections[0].entries.filter(row=>row.kind==='refund').length,0);
 let refund=await h.command('refund.request',payload);assert.equal(refund.status,'pending');assert.equal(edge.refunds.size,1);
 let finance=await h.api('/api/barrow/reports/finance?asOf=2100-12-31');assert.equal(finance.rows.find(row=>row.orderId===second.id).outstandingCents,10500);assert.equal(finance.refundStatus[0].status,'pending');
 edge.refunds.get(refund.providerRefundId).status='succeeded';const signed=await edge.refundEvent(h,refund);assert.equal(signed.response.status,200);
 const replay=await h.raw('/api/barrow/card-webhook',{method:'POST',headers:{'stripe-signature':signed.signature},body:signed.body});assert.equal((await replay.json()).duplicate,true);
 refund=await h.command('refund.refresh',{refundId:refund.id});assert.equal(refund.status,'succeeded');assert.equal(edge.refunds.size,1);
 await h.command('credit.issue',{orderId:source.id,returnId:returned.id,lines:[{line:1,quantity:1}],reason:'Credit one received unit at its original approved price.'});assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM bw_credit_notes').first()).n,1);
 statement=await h.api('/api/barrow/statements/cedar?to=2100-12-31',undefined,buyer);const section=statement.sections[0];assert.equal(section.creditedCents,6500);assert.equal(section.refundedCents,4000);assert.equal(section.closingCents,10500);assert.equal(section.entries.filter(row=>row.kind==='credit-note').length,1);assert.equal(section.entries.filter(row=>row.kind==='refund').length,1);
 for(const entry of section.entries.filter(row=>['credit-note','refund'].includes(row.kind)))assert.equal((await h.request(entry.paymentPath,buyer)).status,200);
 const nextDay=new Date(section.entries.find(row=>row.kind==='refund').date+'T12:00:00Z');nextDay.setUTCDate(nextDay.getUTCDate()+1);const later=await h.api('/api/barrow/statements/cedar?from='+nextDay.toISOString().slice(0,10)+'&to=2100-12-31',undefined,buyer);assert.equal(later.sections[0].openingCents,10500);assert.equal(later.sections[0].entries.length,0);
 for(const format of ['csv','pdf']){const text=await(await h.request('/api/barrow/statements/cedar.'+format+'?to=2100-12-31',buyer)).text();for(const id of [credit.id,refund.id])assert.ok(text.includes(id));assert.ok(text.includes(format==='csv'?'10500':'105.00'))}
 const sales=await h.api('/api/barrow/reports/sales?from=2000-01-01&to=2100-12-31');assert.equal(sales.rows.find(row=>row.orderId===source.id).creditedCents,6500);assert.equal(sales.rows.find(row=>row.orderId===second.id).outstandingCents,10500);
 finance=await h.api('/api/barrow/reports/finance?asOf=2100-12-31');assert.equal(finance.refundStatus[0].status,'succeeded');assert.equal(finance.totals[0].totalCents,10500);
 for(const path of ['/api/barrow/reports/sales.csv?from=2000-01-01&to=2100-12-31','/api/barrow/reports/finance.csv?asOf=2100-12-31']){const text=await(await h.request(path)).text();assert.ok(text.includes(credit.id));assert.ok(text.includes('10500'))}
 const commissions=(await h.api('/api/barrow/reports/commissions')).rows.filter(row=>row.orderId===source.id);assert.deepEqual(commissions.map(row=>[row.rep,row.grossCents,row.reversedCents]),beforeCommission.map(row=>[row.rep,row.grossCents,row.reversedCents]));assert.ok(commissions.every(row=>row.creditIds.includes(credit.id)&&row.refundIds.includes(refund.id)&&row.returnIds.includes(returned.id)));
 assert.deepEqual(await h.api('/api/barrow/orders/'+source.id),snapshot);assert.deepEqual((await pier.api('/api/pier/state')).orders.filter(row=>row.id===source.pierOrderId),inventory.filter(row=>row.id===source.pierOrderId));
 const exported=await h.api('/api/barrow/export.json',undefined,buyer);for(const kind of ['creditnotes','creditlines','creditapplications','cardallocations','refunds','refundevents']){assert.equal(exported.manifest.counts[kind],exported[kind].length);assert.ok(exported[kind].length>0);const csv=await(await h.request('/api/barrow/export/'+kind+'.csv',buyer)).text();assert.ok(csv.includes(source.id)||kind==='creditapplications'&&csv.includes(second.id));assert.equal((await h.api('/api/barrow/export.json',undefined,other))[kind].length,0)}
 const total=exported.manifest.totals.find(row=>row.currency==='USD');assert.equal(total.creditCents,6500);assert.equal(total.appliedCreditCents,2500);assert.equal(total.allocatedCardCents,13000);assert.equal(total.refundedCents,4000);assert.ok(!JSON.stringify(exported).includes('commissionSnapshot'));
 for(const action of ['credit.issued','credit.applied','refund.requested','refund.succeeded']){const query='?orderId='+(action==='credit.applied'?second.id:source.id),audit=await h.api('/api/barrow/audit'+query);assert.ok(audit.events.every(row=>row.orderId===(action==='credit.applied'?second.id:source.id)));assert.ok(audit.events.some(row=>row.action===action&&row.actorId&&row.actorKind&&row.revision&&row.source&&row.reason&&row.createdAt));assert.ok((await(await h.request('/api/barrow/audit.csv'+query)).text()).includes(action))}
 for(const actor of [buyer,other]){assert.equal((await h.request('/api/barrow/audit',actor)).status,403);await h.command('refund.request',payload,{...actor,status:403})}
 assert.equal((await h.request('/api/barrow/credits/'+credit.id,other)).status,404);assert.equal((await h.request('/api/barrow/refunds/'+refund.id,other)).status,404);
 const {token}=await h.api('/api/barrow/agent-token',{}),agent={as:'',headers:{authorization:`Bearer ${token}`}};for(const path of ['/api/barrow/credits/'+credit.id,'/api/barrow/refunds/'+refund.id,'/api/barrow/export.json','/api/barrow/audit'])assert.equal((await h.request(path,agent)).status,403);
 assert.equal((await h.request('/api/barrow/audit',{method:'DELETE',body:{id:credit.id}})).status,404);
 const restored=await installation({networkEdge:edge.networkEdge});t.after(()=>restored.close());await restore(restored,await archive(h));assert.equal((await restored.api('/api/barrow/refunds/'+refund.id)).status,'succeeded');await restored.command('refund.refresh',{refundId:refund.id},{status:409});
});

test('unpaid returned principal is applied before refundable cash; invalid returns, over-credit, stale applications and cross-company effects are refused',async t=>{
 const {h,pier,buyer,other,edge,source,payment,returned,credit,order}=await creditFixture(t);
 await h.command('credit.issue',{orderId:source.id,returnId:'synthetic-barrow-501',lines:[{line:1,quantity:1}],reason:'Unverified receipt cannot create credit.'},{status:409});
 const third=await order('Unpaid original return');const upstream=(await pier.api('/api/pier/state')).orders.find(row=>row.id===third.pierOrderId),shipment=await pier.command('dispatch.create',{orderId:upstream.id,shipmentReference:'Unpaid return shipment',lines:[{orderLineId:upstream.lines[0].id,quantity:'2'}]});const received=await pier.command('return.create',{shipmentId:shipment.id,shipmentLineId:shipment.lines[0].id,locationId:(await pier.api('/api/pier/state')).locations.find(row=>row.kind==='bin').id,quantity:'1',reason:'Physically received unpaid merchandise.'});
 await h.command('credit.issue',{orderId:third.id,returnId:received.id,lines:[{line:1,quantity:2}],reason:'Cannot over-credit physical receipt.'},{status:409});
 const unpaid=await h.command('credit.issue',{orderId:third.id,returnId:received.id,lines:[{line:1,quantity:1}],reason:'First reduce the original unpaid invoice.'});assert.equal((await h.api('/api/barrow/credits/'+unpaid.id)).availableCents,0);assert.equal((await h.api('/api/barrow/credits?orderId='+third.id)).outstandingCents,6500);
 const current=await h.api('/api/barrow/credits/'+credit.id);
 await h.command('credit.apply',{creditId:credit.id,revision:'synthetic-barrow-502',orderId:third.id,amountCents:1,reason:'Stale reviewer refused.'},{status:409});
 await h.command('credit.apply',{creditId:credit.id,revision:current.revision,orderId:third.id,amountCents:6501,reason:'Exceeds unused credit.'},{status:409});
 await h.command('refund.request',{creditId:credit.id,revision:current.revision,paymentId:payment.id,amountCents:6501,consent:true,reason:'Exceeds credited paid principal.'},{status:409});assert.equal(edge.refunds.size,0);
 await h.command('refund.request',{creditId:credit.id,revision:current.revision,paymentId:payment.id,amountCents:6500,reason:'No explicit exact-amount consent.'},{status:400});
 const failed=await h.command('refund.request',{creditId:credit.id,revision:current.revision,paymentId:payment.id,amountCents:6500,consent:true,reason:'Provider pending refund.'});edge.refunds.get(failed.providerRefundId).status='failed';await edge.refundEvent(h,failed,{type:'refund.failed'});const finance=await h.api('/api/barrow/reports/finance?asOf=2100-12-31');assert.equal(finance.refundStatus[0].status,'failed');assert.equal(finance.rows.find(row=>row.orderId===third.id).outstandingCents,6500);assert.equal((await h.api('/api/barrow/statements/cedar?to=2100-12-31')).sections[0].refundedCents,0);
 const another=await h.command('order.prepare',{accountId:'wren',reference:'Foreign invoice',lines:[{sku:'OAT-1',quantity:2}]},other);await h.command('order.submit',{orderId:another.id},other);await h.command('order.approve',{orderId:another.id});await h.command('credit.apply',{creditId:credit.id,revision:(await h.api('/api/barrow/credits/'+credit.id)).revision,orderId:another.id,amountCents:1,reason:'Cannot move credit to another company.'},{status:409});
});


test('finance allowances bound source-priced corrections and refunds; confirmed cancellations credit the original invoice and freight without inventing tax or reversing commission twice',async t=>{
 const {h,buyer,credit,payment,edge}=await creditFixture(t);
 const initialPolicy={role:'finance',accounts:['cedar'],warehouses:[],reports:['finance'],discountLimitCents:0,stockExceptionLimitCents:0,creditLimitCents:1000,refundLimitCents:500};
 const {who:finance,id}=await activateStaff(h,'bounded-finance@example.test',initialPolicy);
 const method={id:'original-freight',name:'Original freight',kind:'parcel',accountIds:[],states:[],warehouses:[],minCents:0,maxCents:null,baseCents:1000,handlingCents:250,freeOverCents:null,transitMinDays:1,transitMaxDays:3,quoteRequired:false};
 await h.command('shipping.settings',{revision:(await h.api('/api/barrow/shipping/settings')).revision,methods:[method]});
 const place=async reference=>{const draft=await h.command('order.prepare',{accountId:'cedar',reference,lines:[{sku:'OAT-1',quantity:2}]},buyer),offer=(await h.api('/api/barrow/shipping/options?orderId='+draft.id,undefined,buyer)).options[0];await h.command('shipping.select',{orderId:draft.id,...offer},buyer);await h.command('order.submit',{orderId:draft.id,deliveryAcknowledged:true},buyer);return h.command('order.approve',{orderId:draft.id})};
 const order=await place('Original-priced correction'),snapshot=await h.api('/api/barrow/orders/'+order.id);
 await h.command('shipping.settings',{revision:(await h.api('/api/barrow/shipping/settings')).revision,methods:[{...method,baseCents:10000}]});
 const correction={orderId:order.id,kind:'price-correction',sourceReference:'Supplier approved price difference',lines:[{line:1,quantity:1,amountCents:500}],freightCents:500,reason:'Correct original merchandise and accepted freight only.'};
 await h.command('credit.issue',{...correction,sourceReference:'Over allowance',lines:[{line:1,quantity:1,amountCents:501}]},{...finance,status:403});
 await h.command('credit.issue',{...correction,sourceReference:'Unverified tax',taxCents:1},{status:409});await h.command('credit.issue',{...correction,sourceReference:'New freight cannot rewrite old basis',freightCents:1251},{status:409});
 const note=await h.command('credit.issue',correction,finance);assert.equal(note.amountCents,1000);assert.equal(note.freightCents,500);assert.deepEqual(note.freightBasis,order.delivery);assert.equal(note.taxBasis,'not recorded');assert.equal((await h.api('/api/barrow/credits?orderId='+order.id)).outstandingCents,13250);
 assert.deepEqual(await h.api('/api/barrow/orders/'+order.id),snapshot);let rows=(await h.api('/api/barrow/reports/commissions')).rows.filter(row=>row.orderId===order.id);assert.deepEqual(rows.map(row=>[row.rep,row.reversedCents]),[['avery',30],['blair',20]]);assert.ok(rows.every(row=>row.creditIds.includes(note.id)));
 const current=await h.api('/api/barrow/credits/'+credit.id),refundPayload={creditId:credit.id,revision:current.revision,paymentId:payment.id,amountCents:501,consent:true,reason:'Finance returns unused paid credit.'};await h.command('refund.request',refundPayload,{...finance,status:403});const refund=await h.command('refund.request',{...refundPayload,amountCents:500},finance);assert.equal(refund.status,'pending');
 const financeAudit=await h.api('/api/barrow/audit?orderId='+order.id,undefined,finance);assert.ok(financeAudit.events.some(row=>row.subjectId===note.id&&row.actorId===id&&row.actorKind==='human'&&row.source&&row.reason&&row.createdAt&&row.revision));assert.ok(financeAudit.events.every(row=>row.actorId===id&&row.orderId===order.id));assert.ok((await(await h.request('/api/barrow/audit.csv?orderId='+order.id,finance)).text()).includes(note.id));
 const grant=(await h.api('/api/barrow/staff/members')).members.find(row=>row.userId===id);await h.command('staff.update',{userId:id,revision:grant.revision,policy:{...initialPolicy,creditLimitCents:0,refundLimitCents:0},reason:'Owner withdraws both financial allowances.'});await h.command('refund.refresh',{refundId:refund.id},{...finance,status:403});await h.command('credit.issue',{...correction,sourceReference:'No remaining credit allowance'},{...finance,status:403});
 await h.command('shipping.settings',{revision:(await h.api('/api/barrow/shipping/settings')).revision,methods:[method]});const cancelled=await place('Confirmed cancellation credit');await h.command('order.cancel',{orderId:cancelled.id,reason:'Supplier confirmed the whole unshipped cancellation.'});
 const cancellation=await h.command('credit.issue',{orderId:cancelled.id,kind:'cancellation',lines:[{line:1,quantity:2}],freightCents:1250,reason:'Credit cancelled original merchandise and original accepted freight.'});assert.equal(cancellation.amountCents,14250);assert.equal((await h.api('/api/barrow/credits?orderId='+cancelled.id)).outstandingCents,0);
 const statement=await h.api('/api/barrow/statements/cedar?to=2100-12-31');assert.equal(statement.sections[0].entries.find(row=>row.kind==='invoice'&&row.orderId===cancelled.id).amountCents,14250);assert.equal(statement.sections[0].entries.find(row=>row.kind==='credit-note'&&row.id===cancellation.id).amountCents,-14250);const invoice=await(await h.request('/api/barrow/invoices/'+cancelled.id+'.csv',buyer)).text();assert.ok(invoice.includes('withdrawn; original preserved with linked credit'));assert.ok(invoice.includes('14250'));
 rows=(await h.api('/api/barrow/reports/commissions')).rows.filter(row=>row.orderId===cancelled.id);assert.ok(rows.every(row=>row.reversedCents===row.grossCents&&row.netCents===0&&row.creditIds.includes(cancellation.id)));
 const sales=await h.api('/api/barrow/reports/sales?from=2000-01-01&to=2100-12-31');assert.equal(sales.rows.find(row=>row.orderId===cancelled.id).creditedFreightCents,1250);assert.equal(sales.rows.find(row=>row.orderId===cancelled.id).outstandingCents,0);
 const refusedCredit=await h.command('credit.issue',{orderId:credit.orderId,kind:'price-correction',sourceReference:'Separate paid correction',lines:[{line:1,quantity:1,amountCents:100}],reason:'Correct the remaining paid original merchandise.'});edge.refuseRefund();const refused=await h.command('refund.request',{creditId:refusedCredit.id,revision:refusedCredit.revision,paymentId:payment.id,amountCents:100,consent:true,reason:'Explicit request that Stripe refuses before creation.'});assert.equal(refused.status,'failed');assert.equal(refused.providerRefundId,undefined);assert.equal((await h.api('/api/barrow/credits/'+refusedCredit.id)).availableCents,100);

});

test('net terms credit exposure blocks commitments and quotes, recalculates verified principal, revalidates drafts and binds private audited exceptions',async t=>{
 const {exposureFixture}=await import('./credit-exposure-fixture.mjs');
 // Revision and substitution commitments must fail before changing commercial or inventory state.
 {
  const {h,pier,buyer,draft,owed}=await exposureFixture(t);
  let submitted=await draft(3,'Submitted credit revision');submitted=await h.command('order.submit',{orderId:submitted.id},buyer);
  const inventory=(await pier.api('/api/pier/state')).orders;
  const revise=quantity=>({orderId:submitted.id,revision:submitted.revision,changes:[{line:0,quantity}]});
  assert.equal((await h.command('order.revise',revise(8),{...buyer,status:409})).error.code,'CREDIT_LIMIT');
  assert.deepEqual(await h.api('/api/barrow/orders/'+submitted.id),submitted);
  submitted=await h.command('order.revise',revise(2),buyer);assert.equal(submitted.totalCents,200000);
  const propose=async quantity=>h.command('substitution.propose',{orderId:owed.id,orderRevision:(await h.api('/api/barrow/orders/'+owed.id)).revision,lines:[{fromSku:'OAT-1',sku:'OAT-1',quantity}],reason:'Buyer reviews a replacement within current credit.'});
  let offered=await propose(16);
  assert.equal((await h.command('substitution.accept',{orderId:owed.id,number:offered.substitutions.at(-1).number,acknowledged:true},{...buyer,status:409})).error.code,'CREDIT_LIMIT');
  assert.equal((await h.api('/api/barrow/orders/'+owed.id)).substitutions.at(-1).status,'offered');
  assert.equal((await h.api('/api/barrow/state')).orders.length,3);
  assert.deepEqual((await pier.api('/api/pier/state')).orders,inventory);
  offered=await propose(4);const accepted=await h.command('substitution.accept',{orderId:owed.id,number:offered.substitutions.at(-1).number,acknowledged:true},buyer),offer=accepted.substitutions.at(-1);
  assert.equal((await h.api('/api/barrow/orders/'+offer.replacementId)).totalCents,400000);
  const finance=await activateStaff(h,'source-finance@example.test',{role:'finance',accounts:['cedar'],warehouses:[],reports:['finance'],discountLimitCents:0,stockExceptionLimitCents:0,creditLimitCents:1000000,refundLimitCents:0});
  const currentCredit=(await h.api('/api/barrow/reports/finance?accountId=cedar',undefined,finance.who)).creditAccounts;
  assert.equal(currentCredit.length,1);assert.deepEqual([currentCredit[0].limitCents,currentCredit[0].exposureCents,currentCredit[0].availableCents],[1000000,900000,100000]);
  const sources=currentCredit[0].rows;
  assert.deepEqual(sources.map(row=>row.orderId),[owed.id,submitted.id,offer.replacementId]);
  for(const row of sources)assert.equal((await h.api(row.path,undefined,finance.who)).id,row.orderId);

  let competitor=await draft(3,'Later explicitly authorized commitment');competitor=await h.command('order.credit-exception',{orderId:competitor.id,revision:competitor.revision,reason:'Owner approves this separate current excess.'});competitor=await h.command('order.submit',{orderId:competitor.id},buyer);
  assert.equal((await h.command('substitution.execute',{orderId:owed.id,number:offer.number},{status:409})).error.code,'CREDIT_LIMIT');
  assert.deepEqual((await pier.api('/api/pier/state')).orders,inventory);
  assert.equal((await h.api('/api/barrow/orders/'+owed.id)).status,'approved');
  assert.equal((await h.api('/api/barrow/orders/'+offer.replacementId)).status,'submitted');
  await h.command('order.revise',{orderId:competitor.id,revision:competitor.revision,changes:[{line:0,quantity:1}]},buyer);
  const executed=await h.command('substitution.execute',{orderId:owed.id,number:offer.number});assert.equal(executed.status,'approved');assert.equal(executed.totalCents,400000);assert.ok((await h.api('/api/barrow/orders/'+owed.id)).release.confirmedAt);
 }
 const {h,pier,buyer,other,account,draft,owed,candidate,pay}=await exposureFixture(t);
 assert.equal(account.value.termsDays,30);assert.deepEqual(account.value.credit,{currency:'USD',limitCents:1000000});
 const read=()=>h.api('/api/barrow/credit-exposure?accountId=cedar',undefined,buyer);
 let balance=await read();assert.deepEqual([balance.exposureCents,balance.availableCents],[300000,700000]);assert.deepEqual(balance.rows.map(row=>row.orderId),[owed.id]);
 const refused=await h.command('order.submit',{orderId:candidate.id},{...buyer,status:409});assert.equal(refused.error.code,'CREDIT_LIMIT');assert.match(refused.error.message,/700000.*800000.*300000/);
 assert.equal((await h.api('/api/barrow/orders/'+candidate.id,undefined,buyer)).status,'draft');assert.equal((await pier.api('/api/pier/state')).orders.length,1);
 const contender=await draft(3,'Draft before credit is consumed');
 const payment=await pay();assert.equal((await read()).availableCents,700000); // An unapplied capture is not guessed into an account receipt.
 await h.command('card.allocate',{paymentId:payment.id,orderId:owed.id,amountCents:100000,reason:'Apply one thousand verified principal to the existing invoice.'});
 balance=await read();assert.deepEqual([balance.exposureCents,balance.availableCents],[200000,800000]);assert.equal(balance.rows[0].paymentSources[0].path,'/api/barrow/payments/'+payment.id);
 await h.command('order.submit',{orderId:candidate.id},buyer);const approved=await h.command('order.approve',{orderId:candidate.id});
 assert.deepEqual([approved.totalCents,approved.currency,approved.termsDays,approved.lines[0].unitCents,approved.lines[0].quantity],[800000,'USD',30,100000,8]);assert.ok(approved.submittedBy);assert.ok(approved.approvedBy);assert.ok(approved.approvedAt);assert.equal(approved.status,'approved');
 assert.equal((await h.command('order.approve',{orderId:candidate.id})).pierOrderId,approved.pierOrderId);assert.equal((await pier.api('/api/pier/state')).orders.length,2);
 assert.deepEqual([(await read()).exposureCents,(await read()).availableCents],[1000000,0]);
 assert.equal((await h.command('order.submit',{orderId:contender.id},{...buyer,status:409})).error.code,'CREDIT_LIMIT');
 let quote=await h.command('quote.request',{accountId:'cedar',lines:[{sku:'OAT-1',quantity:1}]},buyer);
 quote=await h.command('quote.propose',{quoteId:quote.id,revision:quote.revision,validUntil:'2099-12-31',termsDays:30,lines:[{sku:'OAT-1',quantity:1}]});
 assert.equal((await h.command('quote.accept',{quoteId:quote.id,number:1},{...buyer,status:409})).error.code,'CREDIT_LIMIT');
 const policy={accountId:'cedar',revision:account.revision,termsDays:30,currency:'USD',limitCents:2000000,reason:'An unauthorized buyer cannot raise their own ceiling.'};
 await h.command('credit.policy',policy,{...buyer,status:403});await h.api('/api/barrow/credit-exposure?accountId=cedar',undefined,{...other,status:404});
 const {token}=await h.api('/api/barrow/agent-token',{}),agent={as:'',headers:{authorization:'Bearer '+token}};
 await h.command('order.credit-exception',{orderId:contender.id,revision:contender.revision,reason:'Agents cannot authorize credit.'},{...agent,status:403});
 await h.command('order.credit-exception',{orderId:contender.id,revision:contender.revision,reason:'Buyers cannot authorize their own excess.'},{...buyer,status:403});
 const finance=await activateStaff(h,'credit-finance@example.test',{role:'finance',accounts:['cedar'],warehouses:[],reports:['finance'],discountLimitCents:0,stockExceptionLimitCents:0,creditLimitCents:200000,refundLimitCents:0});
 const financeExposure=await h.api('/api/barrow/credit-exposure?accountId=cedar',undefined,finance.who);
 assert.deepEqual(financeExposure.rows.map(row=>row.orderId),[owed.id,approved.id]);
 for(const row of financeExposure.rows)assert.equal((await h.api(row.path,undefined,finance.who)).id,row.orderId);
 await h.api('/api/barrow/orders/'+contender.id,undefined,{...finance.who,status:404});
 await h.command('order.credit-exception',{orderId:contender.id,revision:contender.revision,reason:'Current excess exceeds this finance allowance.'},{...finance.who,status:403});
 await h.command('order.credit-exception',{orderId:approved.id,revision:approved.revision,reason:'Approved orders cannot gain a retrospective exception.'},{status:409});
 await h.command('order.credit-exception',{orderId:contender.id,revision:'stale',reason:'A stale commercial revision cannot be approved.'},{status:409});
 const enlarged=await h.command('staff.update',{userId:finance.id,revision:finance.grant.revision,policy:{role:'finance',accounts:['cedar'],warehouses:[],reports:['finance'],discountLimitCents:0,stockExceptionLimitCents:0,creditLimitCents:400000,refundLimitCents:0},reason:'Owner authorizes the current excess.'});
 let reviewed=await h.command('order.credit-exception',{orderId:contender.id,revision:contender.revision,reason:'Finance reviews the exact current excess.'},finance.who);
 await h.command('staff.revoke',{userId:finance.id,revision:enlarged.revision,reason:'Owner withdraws the finance authority before buyer submission.'});
 assert.equal((await h.command('order.submit',{orderId:reviewed.id},{...buyer,status:409})).error.code,'CREDIT_LIMIT');
 let exception=await h.command('order.credit-exception',{orderId:contender.id,revision:reviewed.revision,reason:'Owner explicitly accepts the exact three thousand dollar excess.'});
 assert.equal(exception.creditException.excessCents,300000);assert.equal(exception.creditException.reason,'Owner explicitly accepts the exact three thousand dollar excess.');
 await h.command('order.submit',{orderId:exception.id},buyer);assert.equal((await read()).exposureCents,1300000);assert.equal((await h.api('/api/barrow/orders/'+exception.id,undefined,buyer)).creditException,undefined);
 const audit=await h.api('/api/barrow/audit?orderId='+exception.id);const event=audit.events.find(row=>row.action==='order.credit-exception');assert.ok(event);assert.equal(event.actorKind,'human');assert.ok(event.actorId);assert.ok(event.createdAt);assert.ok(event.revision);assert.equal(event.source,'order.command');assert.equal(event.reason,exception.creditException.reason);
 const csv=await (await h.request('/api/barrow/audit.csv?orderId='+exception.id+'&limit=1')).text();assert.ok(csv.includes(event.id));assert.ok(csv.includes(event.reason));
 await h.api('/api/barrow/audit?orderId='+exception.id,undefined,{...buyer,status:403});await h.api('/api/barrow/audit.csv',undefined,{...agent,status:403});await h.api('/api/barrow/audit/'+event.id,undefined,{method:'DELETE',status:404});
 const report=await h.api('/api/barrow/reports/finance');const credit=report.creditAccounts.find(row=>row.accountId==='cedar');assert.deepEqual([credit.currency,credit.limitCents,credit.exposureCents,credit.availableCents],['USD',1000000,1300000,0]);assert.deepEqual(credit.rows.map(row=>row.orderId).sort(),[owed.id,approved.id,exception.id].sort());for(const row of credit.rows)assert.equal((await h.api(row.path)).id,row.orderId);
 const financeCsv=await (await h.request('/api/barrow/reports/finance.csv')).text();assert.ok(financeCsv.includes('"1300000"'));assert.ok(financeCsv.includes(owed.id));assert.ok(financeCsv.includes('"USD"'));
 // A later source-linked credit changes the reviewed basis, so the exception needs fresh review.
 await h.command('credit.issue',{orderId:owed.id,kind:'price-correction',sourceReference:'synthetic-barrow-88',lines:[{line:1,quantity:1,amountCents:100000}],reason:'A verified original-price correction changes the reviewed exposure.'});
 assert.equal((await h.command('order.approve',{orderId:exception.id},{status:409})).error.code,'CREDIT_LIMIT');
 exception=await h.command('order.credit-exception',{orderId:exception.id,revision:(await h.api('/api/barrow/orders/'+exception.id)).revision,reason:'Review the smaller current excess after the new receipt.'});assert.equal(exception.creditException.excessCents,200000);await h.command('order.approve',{orderId:exception.id});
 const updated=await h.command('credit.policy',{...policy,reason:'Owner increases the ceiling after finance review.'});assert.equal(updated.value.credit.limitCents,2000000);
 const converted=await h.command('quote.accept',{quoteId:quote.id,number:1},buyer);assert.equal(converted.order.totalCents,100000);assert.equal(converted.order.currency,'USD');assert.equal(converted.order.termsDays,30);
 const first=await draft(4,'Concurrent credit commitment one'),second=await draft(4,'Concurrent credit commitment two');
 const results=await Promise.all([first,second].map(row=>h.request('/api/barrow/commands',{method:'POST',as:buyer.as,body:{type:'order.submit',payload:{orderId:row.id}}})));assert.deepEqual(results.map(row=>row.status).sort(),[200,409]);assert.equal((await read()).exposureCents,1700000);
 const sourceCsv='accountId,name,email,pierCustomerId,termsDays,minimumCents,sku,unitCents,minQty\n'+`cedar,${account.value.name},${account.value.email},${account.value.pierCustomerId},30,0,OAT-1,100000,1\n`;
 const preview=await h.api('/api/barrow/imports/preview',{csv:sourceCsv});await h.api('/api/barrow/imports/apply',{csv:sourceCsv,fingerprint:preview.fingerprint},{status:409});assert.equal((await h.api('/api/barrow/accounts/by-id/cedar')).value.credit.limitCents,2000000);
 const archiveValue=await archive(h);assert.ok(JSON.stringify(archiveValue).includes('Owner explicitly accepts the exact three thousand dollar excess.'));
 const currentAccount=await h.api('/api/barrow/accounts/by-id/cedar');
 const cadAccount=await h.command('account.save',{id:'cedar',revision:currentAccount.revision,value:{...currentAccount.value,currency:'CAD'}});
 await h.command('credit.policy',{accountId:'cedar',revision:cadAccount.revision,termsDays:30,currency:'CAD',limitCents:2000000,reason:'Finance records a separate currency without converting existing debt.'});
 assert.equal((await read()).foreign,true);const foreignDraft=await draft(1,'Foreign debt cannot disappear through currency selection');assert.equal(foreignDraft.currency,'CAD');
 assert.equal((await h.command('order.submit',{orderId:foreignDraft.id},{...buyer,status:409})).error.code,'CREDIT_CURRENCY');
 const location=await h.command('location.save',{accountId:'cedar',kind:'ship-to',value:{name:'Restricted store',line1:'101 Main Street',city:'Columbia',state:'SC',zip:'29201'}},buyer);
 const member=(await h.api('/api/barrow/state',undefined,buyer)).actor.company;
 await h.command('company.update',{accountId:'cedar',memberId:member.id,revision:member.revision,policy:{rights:member.rights,locations:[location.id],perOrderLimitCents:null,approvalLimitCents:null},reason:'Company administrator narrows their own purchasing locations.'},buyer);
 const privateBalance=await read();assert.deepEqual(privateBalance.rows,[]);assert.equal(privateBalance.foreign,true);
 await h.api('/api/barrow/credit-exposure?accountId=cedar&orderId='+owed.id,undefined,{...buyer,status:403});

});
