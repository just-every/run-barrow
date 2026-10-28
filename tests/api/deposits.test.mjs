import test from 'node:test';
import assert from 'node:assert/strict';
import {releasedDepositFixture} from './prebook-fixture.mjs';
import {activateStaff,archive,installation,restore,accountValue} from './harness.mjs';

test('finance allocates one verified seasonal deposit across two acknowledged release invoices with exact cash, exposure, commission, exports and inert restore',async t=>{
 const {h,pier,buyer,edge,commitment,payment,releases,allocation}=await releasedDepositFixture(t);
 assert.equal(payment.amountCents,21000);assert.deepEqual(releases.map(row=>row.totalCents),[52000,18000]);assert.ok(releases.every(row=>row.invoice&&row.pierOrderId&&row.status==='approved'));
 const inventory=(await pier.api('/api/pier/state')).orders;assert.equal(inventory.length,2);
 let statement=await h.api('/api/barrow/statements/cedar?to=2100-12-31',undefined,buyer);assert.equal(statement.sections[0].unappliedCents,21000);assert.equal(statement.sections[0].closingCents,49000);
 assert.equal((await h.api('/api/barrow/account-credit?accountId=cedar')).exposureCents,70000);
 assert.ok((await h.api('/api/barrow/reports/commissions')).rows.every(row=>row.grossCents===0&&row.netCents===0));
 await h.command('card.allocate',{...allocation(0,15000),sourceRevision:'synthetic-barrow-701'},{status:409});
 await h.command('card.allocate',{...allocation(0,15000),orderRevision:'synthetic-barrow-702'},{status:409});
 await h.command('card.allocate',allocation(0,15000),{...buyer,status:403});
 const {token}=await h.api('/api/barrow/agent-token',{}),agent={as:'',headers:{authorization:`Bearer ${token}`}};await h.command('card.allocate',allocation(0,15000),{...agent,status:403});
 // The provider boundary must still confirm this receipt before any money is allocated.
 const intent=edge.intents.get(payment.providerPaymentId);intent.currency='cad';await h.command('card.allocate',allocation(0,15000),{status:409});intent.currency='usd';
 const results=await Promise.all([0,1].map(index=>h.request('/api/barrow/commands',{method:'POST',body:{type:'card.allocate',payload:allocation(index,15000)}})));
 assert.deepEqual(results.map(row=>row.status).sort(),[200,409]);const winning=results.findIndex(row=>row.status===200),other=1-winning;
 const saved=(await results[winning].json()).result;assert.equal(saved.amountCents,15000);assert.equal(saved.sourceOrderId,commitment.id);assert.equal(saved.providerPaymentId,payment.providerPaymentId);
 assert.deepEqual(await h.command('card.allocate',allocation(winning,15000)),saved);
 await h.command('card.allocate',allocation(winning,14999),{status:409});
 const second=await h.command('card.allocate',allocation(other,6000));assert.equal(second.amountCents,6000);
 for(const release of releases){const credit=await h.api('/api/barrow/credits?orderId='+release.id,undefined,buyer);assert.equal(credit.allocations.length,1);assert.equal(credit.depositReceipts[0].availableCents,0)}
 assert.equal(edge.captures,1);assert.deepEqual((await pier.api('/api/pier/state')).orders,inventory);
 assert.equal((await h.api('/api/barrow/payments/'+payment.id,undefined,buyer)).orderId,commitment.id);
 statement=await h.api('/api/barrow/statements/cedar?to=2100-12-31',undefined,buyer);const section=statement.sections[0];
 assert.deepEqual([section.invoicedCents,section.receivedCents,section.closingCents,section.unappliedCents],[70000,21000,49000,0]);assert.equal(section.entries.filter(row=>row.kind==='card-payment').length,1);assert.equal(section.entries.filter(row=>row.kind==='card-allocation').length,2);assert.equal(section.entries.filter(row=>row.kind==='card-allocation').reduce((sum,row)=>sum+row.appliedCents,0),21000);
 for(const suffix of ['.csv','.pdf']){const body=Buffer.from(await(await h.request('/api/barrow/statements/cedar'+suffix+'?to=2100-12-31',buyer)).arrayBuffer()).toString();for(const value of [saved.id,second.id,payment.providerPaymentId])assert.ok(body.includes(value))}
 const sales=await h.api('/api/barrow/reports/sales?from=2000-01-01&to=2100-12-31'),finance=await h.api('/api/barrow/reports/finance?asOf=2100-12-31');assert.deepEqual([sales.totals[0].bookedCents,sales.totals[0].paidCents,sales.totals[0].outstandingCents],[70000,21000,49000]);assert.deepEqual([finance.totals[0].invoicedCents,finance.totals[0].paidCents,finance.totals[0].totalCents],[70000,21000,49000]);assert.ok(finance.rows.every(row=>row.paymentSources.includes(payment.providerPaymentId)));
 const exposure=await h.api('/api/barrow/account-credit?accountId=cedar');assert.deepEqual([exposure.exposureCents,exposure.unpaidInvoicesCents,exposure.depositsCents],[49000,49000,0]);
 let commissions=await h.api('/api/barrow/reports/commissions');assert.equal(commissions.rows.reduce((sum,row)=>sum+row.grossCents,0),2100);assert.equal(commissions.rows.reduce((sum,row)=>sum+row.netCents,0),2100);assert.ok(commissions.rows.every(row=>row.paymentSources.includes(payment.providerPaymentId)));
 const account=await h.api('/api/barrow/accounts/by-id/cedar');await h.command('account.save',{id:account.id,revision:account.revision,value:{...account.value,assignedRep:'Replacement rep'}});
 const policy=await h.api('/api/barrow/commissions');await h.command('commission.settings',{revision:policy.revision,rules:[],reason:'Later policy cannot rewrite earned deposit allocations.'});assert.deepEqual((await h.api('/api/barrow/reports/commissions')).rows,commissions.rows);
 const exported=await h.api('/api/barrow/export.json',undefined,buyer);assert.equal(exported.records.cardallocations.length,2);assert.equal(exported.manifest.counts.cardallocations,2);assert.ok(exported.records.cardallocations.every(row=>row.sourceOrderId===commitment.id&&row.providerPaymentId===payment.providerPaymentId));
 for(const path of ['/api/barrow/export/cardallocations.csv','/api/barrow/reports/sales.csv?from=2000-01-01&to=2100-12-31','/api/barrow/reports/finance.csv?asOf=2100-12-31','/api/barrow/reports/commissions.csv']){const response=await h.request(path);assert.equal(response.status,200);assert.ok((await response.text()).includes(payment.providerPaymentId))}
 const audit=await h.api('/api/barrow/audit?search=deposit.allocated');assert.equal(audit.events.length,2);assert.ok(audit.events.every(row=>row.actorId&&row.source===payment.id&&row.reason&&row.revision));
 const restored=await installation({networkEdge:edge.networkEdge});t.after(()=>restored.close());await restore(restored,await archive(h));await restored.command('card.allocate',allocation(0,15000),{status:409});assert.equal((await restored.api('/api/barrow/export.json')).records.cardallocations.length,2);assert.equal(edge.captures,1);
});

test('deposit review refuses foreign releases and stale finance authority without changing allocations or provider funds',async t=>{
 const {h,pier,buyer,payment,commitment,releases,allocation,edge}=await releasedDepositFixture(t);
 const policy={role:'finance',accounts:['cedar'],warehouses:[],reports:['finance'],discountLimitCents:0,stockExceptionLimitCents:0,creditLimitCents:1000,refundLimitCents:0};
 const {who:finance,id}=await activateStaff(h,['synthetic-barrow-703','example.test'].join('@'),policy);
 await h.command('card.allocate',allocation(0,1001),{...finance,status:403});const allowed=await h.command('card.allocate',allocation(0,1000),finance);assert.equal(allowed.actorId,id);
 const grant=(await h.api('/api/barrow/staff/members')).members.find(row=>row.userId===id);await h.command('staff.update',{userId:id,revision:grant.revision,policy:{...policy,creditLimitCents:0},reason:'Owner revokes the deposit allocation allowance.'});await h.command('card.allocate',allocation(1,1000),{...finance,status:403});
 const party=await pier.command('party.save',{kind:'customer',name:'Other trade company'}),account=await h.command('account.save',{id:'other-deposit',value:{...accountValue(party.id,['synthetic-barrow-704','example.test'].join('@')),minimumCents:0}});
 const other={as:await h.signIn(account.value.email)};assert.equal((await h.request('/api/barrow/payments/'+payment.id,other)).status,404);assert.equal((await h.request('/api/barrow/credits?orderId='+releases[0].id,other)).status,404);assert.equal((await h.api('/api/barrow/export.json',undefined,other)).records.cardallocations.length,0);
 const foreign=await h.command('order.prepare',{accountId:account.id,reference:'Other company invoice',lines:[{sku:'OAT-1',quantity:2}]},other);await h.command('order.submit',{orderId:foreign.id},other);await h.command('order.approve',{orderId:foreign.id});await h.command('card.allocate',{...allocation(1,1000),orderId:foreign.id},{status:409});
 // Another commitment in the same company is also outside this receipt's immutable source.
 const immediate=await h.command('order.prepare',{accountId:'cedar',reference:'Unrelated immediate invoice',lines:[{sku:'OAT-1',quantity:2}]},buyer);await h.command('order.submit',{orderId:immediate.id},buyer);await h.command('order.approve',{orderId:immediate.id});await h.command('card.allocate',{...allocation(1,1000),orderId:immediate.id},{status:409});
 const after=await h.api('/api/barrow/export.json');assert.equal(after.records.cardallocations.length,1);assert.equal(after.records.cardallocations[0].id,allowed.id);assert.equal(after.records.cardpayments.find(row=>row.id===payment.id).orderId,commitment.id);assert.equal(edge.captures,1);assert.equal(edge.refunds.size,0);
});
