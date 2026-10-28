import test from 'node:test';
import assert from 'node:assert/strict';
import {cardFixture} from './card-fixture.mjs';
import {activateStaff,archive,installation,restore} from './harness.mjs';

const policy={role:'finance',accounts:['cedar'],warehouses:[],reports:['finance'],discountLimitCents:0,stockExceptionLimitCents:0};
const email=name=>[name,'example.test'].join('@');

test('finance records and revises buyer promises; supplier-calendar misses stay owned until matching verified allocations or an attributed resolution, with scoped authority and inert restore',async t=>{
 const {h,buyer,other,order,edge}=await cardFixture(t,{bindings:{BARROW_TEST_CLOCK:'2026-11-01T04:30:00Z'}});
 await h.configure({BARROW_TEST_CLOCK:'2026-11-01T04:30:00Z'});
 const invoice=await order('Promise with partial allocation'),invoice2=await order('Promise satisfied by a complete allocation'),invoice3=await order('Explicit finance resolution');
 const {who:finance,id:financeId}=await activateStaff(h,email('promise-finance'),policy);
 const view=()=>h.api('/api/barrow/payment-promises?accountId=cedar',undefined,finance);
 let data=await view(),source=data.invoices.find(row=>row.orderId===invoice.id),buyerId=source.buyers[0].id;
 const payload=(row,amountCents=10000)=>({accountId:'cedar',orderId:row.orderId,sourceRevision:row.sourceRevision,buyerId,amountCents,currency:row.currency,dueDate:'2026-11-01',revision:null,reason:'Buyer committed this invoice principal on the recorded supplier date.'});
 const baseline=payload(source);
 for(const patch of [{currency:'CAD'},{sourceRevision:'synthetic-barrow-701'},{amountCents:13001},{buyerId:'synthetic-barrow-702'},{dueDate:'2026-02-30'}])await h.command('promise.record',{...baseline,...patch},{...finance,status:patch.buyerId||patch.dueDate?400:409});
 assert.equal((await view()).promises.length,0);
 for(const who of [buyer,other]){assert.equal((await h.request('/api/barrow/payment-promises?accountId=cedar',who)).status,403);await h.command('promise.record',baseline,{...who,status:403})}
 const {token}=await h.api('/api/barrow/agent-token',{}),agent={as:'',headers:{authorization:'Bearer '+token}};await h.command('promise.record',baseline,{...agent,status:403});assert.equal((await h.request('/api/barrow/payment-promises?accountId=cedar',agent)).status,403);
 const {who:rep}=await activateStaff(h,email('promise-rep'),{...policy,role:'rep',reports:[]});await h.command('promise.record',baseline,{...rep,status:403});
 const {who:foreign}=await activateStaff(h,email('promise-foreign'),{...policy,accounts:['wren']});await h.command('promise.record',baseline,{...foreign,status:404});assert.equal((await h.request('/api/barrow/payment-promises?accountId=cedar',foreign)).status,404);
 let promise=await h.command('promise.record',baseline,finance);assert.equal(promise.history[0].by,financeId);assert.equal(promise.history[0].buyerId,buyerId);assert.equal(promise.sourceRevision,invoice.revision);assert.equal(promise.timeZone,'America/New_York');
 const readPromise=async id=>(await view()).promises.find(row=>row.id===id);
 const taskFor=async id=>(await h.api('/api/barrow/followups?view=all',undefined,finance)).tasks.find(row=>row.sourceId===id);
 let task=await taskFor(promise.id);assert.ok(task.ownerId);assert.equal(task.status,'open');
 await h.command('followup.update',{id:task.id,revision:task.revision,ownerId:financeId,nextContactDate:'2026-11-03'},finance);
 await h.command('promise.revise',{...baseline,revision:'synthetic-barrow-703',amountCents:9000},{...finance,status:409});
 promise=await h.command('promise.revise',{...baseline,revision:promise.revision,amountCents:9000,reason:'Buyer revises the amount; original commitment remains inspectable.'},finance);assert.deepEqual(promise.history.map(row=>row.amountCents),[10000,9000]);
 promise=await h.command('promise.pause',{accountId:'cedar',orderId:invoice.id,revision:promise.revision,pause:{until:'2026-11-04'},reason:'Finance approved a temporary collection pause.'},finance);assert.equal(promise.pause.by,financeId);
 const p2source=data.invoices.find(row=>row.orderId===invoice2.id),p3source=data.invoices.find(row=>row.orderId===invoice3.id);
 let second=await h.command('promise.record',payload(p2source,13000),finance),third=await h.command('promise.record',payload(p3source,5000),finance);
 const requests=h.mail.requests.length;
 await h.configure({BARROW_TEST_CLOCK:'2026-11-02T04:59:59Z'});await h.command('promise.refresh',{accountId:'cedar'},finance);assert.equal((await readPromise(promise.id)).state,'open','the entire supplier day includes the DST boundary');
 await h.configure({BARROW_TEST_CLOCK:'2026-11-02T05:00:00Z'});
 await Promise.all([h.command('promise.refresh',{accountId:'cedar'},finance),h.command('promise.refresh',{accountId:'cedar'},finance)]);
 await h.command('followup.refresh',{},finance);promise=await readPromise(promise.id);task=await taskFor(promise.id);assert.equal(promise.state,'missed');assert.equal(task.priority,1);assert.equal(task.ownerId,financeId);assert.equal(task.nextContactDate,'2026-11-03');assert.match(task.title,/Missed promise/);assert.equal(promise.history.filter(row=>row.action==='promise.missed').length,1);assert.equal(h.mail.requests.length,requests);
 await h.command('followup.update',{id:task.id,revision:task.revision,contact:{outcome:'reached',note:'Buyer was reached; no payment evidence.'}},finance);task=await taskFor(promise.id);await h.command('followup.update',{id:task.id,revision:task.revision,close:true,resolution:'A contact is not a settlement.'},{...finance,status:409});assert.equal((await readPromise(promise.id)).state,'missed');
 const capture=async issued=>{let payment=await h.command('card.prepare',{orderId:issued.id},buyer);edge.complete(payment);payment=await h.command('card.refresh',{paymentId:payment.id},buyer);payment=await h.command('card.authorize',{paymentId:payment.id,consent:true,amountCents:payment.amountCents,surchargeCents:payment.surchargeCents},buyer);return h.command('card.capture',{paymentId:payment.id,reason:'Finance captures the exact agreed invoice principal.'})};
 const paid=await capture(invoice);await h.command('promise.refresh',{accountId:'cedar'},finance);assert.equal((await readPromise(promise.id)).state,'missed','captured but unallocated principal is not payment of this promise');
 await h.command('card.allocate',{orderId:invoice.id,paymentId:paid.id,amountCents:5000,reason:'Allocate only part of the promised invoice amount.'});await h.command('promise.refresh',{accountId:'cedar'},finance);assert.equal((await readPromise(promise.id)).state,'missed');assert.equal((await taskFor(promise.id)).status,'open');
 const full=await capture(invoice2);await h.command('card.allocate',{orderId:invoice2.id,paymentId:full.id,amountCents:13000,reason:'Allocate verified principal in full to its named invoice.'});await h.command('promise.refresh',{accountId:'cedar'},finance);second=await readPromise(second.id);assert.equal(second.state,'satisfied');assert.equal((await taskFor(second.id)).status,'closed');assert.equal(second.history.at(-1).allocationIds.length,1);assert.equal((await readPromise(promise.id)).state,'missed','another invoice allocation cannot satisfy this promise');
 // Existing allocations are a reviewed baseline when a replacement promise is recorded.
 promise=await h.command('promise.revise',{...baseline,sourceRevision:(await h.api('/api/barrow/orders/'+invoice.id)).revision,revision:promise.revision,amountCents:4000,dueDate:'2026-11-03',reason:'A new buyer commitment covers remaining principal after the partial allocation.'},finance);await h.command('promise.refresh',{accountId:'cedar'},finance);assert.equal((await readPromise(promise.id)).state,'open');assert.equal(promise.baselineAllocationIds.length,1);
 third=await readPromise(third.id);third=await h.command('promise.resolve',{accountId:'cedar',orderId:invoice3.id,revision:third.revision,reason:'Finance explicitly resolved this promise after a reviewed offline agreement.'},finance);assert.equal(third.state,'resolved');assert.equal(third.history.at(-1).by,financeId);assert.equal((await taskFor(third.id)).status,'closed');
 const audit=await h.api('/api/barrow/audit?orderId='+invoice3.id,undefined,finance);assert.ok(audit.events.some(row=>row.action==='promise.resolve'&&row.actorId===financeId&&row.reason&&row.source&&row.revision));assert.ok((await(await h.request('/api/barrow/audit.csv?orderId='+invoice3.id,finance)).text()).includes('promise.resolve'));
 const report=await h.api('/api/barrow/reports/finance?accountId=cedar',undefined,finance);assert.equal(report.promises.find(row=>row.id===promise.id).pause.by,financeId);assert.ok((await(await h.request('/api/barrow/reports/finance.csv?accountId=cedar',finance)).text()).includes(promise.id));
 const lines=await archive(h),restored=await installation({networkEdge:edge.networkEdge});t.after(()=>restored.close());await restore(restored,lines);const restoredView=await restored.api('/api/barrow/payment-promises?accountId=cedar');assert.ok(restoredView.promises.every(row=>row.restored));await restored.command('promise.refresh',{accountId:'cedar'});assert.deepEqual((await restored.api('/api/barrow/payment-promises?accountId=cedar')).promises,restoredView.promises);await restored.command('promise.resolve',{accountId:'cedar',orderId:invoice.id,revision:promise.revision,reason:'Restored work cannot silently resume.'},{status:409});
 const grant=(await h.api('/api/barrow/staff/members')).members.find(row=>row.userId===financeId);await h.command('staff.update',{userId:financeId,revision:grant.revision,policy:{...policy,accounts:[]},reason:'Owner removes the account grant.'});await h.command('promise.withdraw',{accountId:'cedar',orderId:invoice.id,revision:promise.revision,reason:'Revoked finance cannot withdraw.'},{...finance,status:404});assert.equal((await h.request('/api/barrow/payment-promises?accountId=cedar',finance)).status,404);
 await h.command('promise.refresh',{accountId:'cedar'});const owned=(await h.api('/api/barrow/followups?view=all')).tasks.find(row=>row.sourceId===promise.id);assert.notEqual(owned.ownerId,financeId);assert.equal(owned.status,'open');
 promise=(await h.api('/api/barrow/payment-promises?accountId=cedar')).promises.find(row=>row.id===promise.id);promise=await h.command('promise.withdraw',{accountId:'cedar',orderId:invoice.id,revision:promise.revision,reason:'Buyer withdrew; finance records the attributed withdrawal.'});assert.equal(promise.state,'withdrawn');assert.equal(promise.history[0].amountCents,10000);
});
