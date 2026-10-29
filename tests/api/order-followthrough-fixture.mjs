import assert from 'node:assert/strict';
import {cardFixture,cardEdge} from './card-fixture.mjs';
import {activateStaff,archive,installation,restore} from './harness.mjs';

export async function orderFollowthroughFixture(t,{built=false}={}) {
 const edge=cardEdge(),stripe=edge.networkEdge;let pier,lose=false;
 edge.networkEdge=async request=>{
  const response=await stripe(request);if(response)return response;
  if(lose&&new URL(request.url).pathname==='/api/pier/commands'){
   const body=await request.clone().json();
   if(body.type===lose){
    lose=false;
    const real=await pier.request('/api/pier/commands',{method:'POST',body});assert.equal(real.status,200);
    throw Error('Synthetic lost acknowledgment after the native inventory command completed');
   }
  }
 };
 const f=await cardFixture(t,{edge,built,https:built});pier=f.pier;
 return {...f,loseAck(){lose='order.create'},loseRelease(){lose='order.cancel'},trace:(order,who={})=>f.h.api(`/api/barrow/orders/${order.id}/followthrough`,undefined,who)};
}

export async function pendingOrder(f,reference='synthetic-barrow-910',quantity=2){
 const draft=await f.h.command('order.prepare',{accountId:'cedar',reference,requestedDate:'2031-01-15',lines:[{sku:'OAT-1',quantity}]},f.buyer);
 await f.h.command('order.submit',{orderId:draft.id},f.buyer);return draft;
}

export async function proveOrderFollowthrough(t,f){
 const {h,pier,buyer,other,product,edge}=f;f.buyerEmail=(await h.api('/api/barrow/accounts/by-id/cedar')).value.email;const owner=(await h.api('/api/barrow/state')).actor;
 const lost=await pendingOrder(f);f.loseAck();await h.command('order.approve',{orderId:lost.id},{status:503});
 let trace=await f.trace(lost);assert.equal(trace.acknowledgment,null);assert.equal(trace.invoice,null);assert.equal(trace.stock.status,'unknown');assert.equal(trace.reservationIdentity,'barrow-'+lost.id);
 await h.command('followup.refresh',{});trace=await f.trace(lost);
 let task=trace.tasks.find(task=>task.id==='order-ack:'+lost.id);assert.ok(task.ownerId&&task.nextContactDate&&task.reason&&task.sourcePath);assert.equal((await h.request(task.sourcePath)).status,200);
 const date='2031-01-17',draft='Review the original inventory acknowledgment and confirm the source before discussing a revised promise.';
 await h.command('followup.update',{id:task.id,revision:task.revision,nextActionDraft:{body:draft,reviewed:false}},{status:400});
 const mail=h.mail.deliveries.length;
 task=await h.command('followup.update',{id:task.id,revision:task.revision,nextContactDate:date,contact:{outcome:'failed',note:'No answer; keep assigned.'},nextActionDraft:{body:draft,reviewed:true}});
 assert.equal(task.nextActionDraft.reviewedBy,owner.id);assert.ok(task.nextActionDraft.reviewedAt);assert.equal(task.status,'open');assert.equal(h.mail.deliveries.length,mail);
 await h.command('followup.update',{id:task.id,revision:'stale',nextActionDraft:{body:'Stale replacement',reviewed:true}},{status:409});
 await h.configure({PIER_SESSION:undefined});await h.command('followup.refresh',{});trace=await f.trace(lost);assert.equal(trace.tasks[0].status,'open');assert.equal(trace.tasks[0].ownerId,task.ownerId);assert.equal(trace.tasks[0].nextContactDate,date);
 await h.configure({PIER_SESSION:pier.cookie});
 for(const who of [buyer,other])await f.trace(lost,{...who,status:403});
 const grant=await h.api('/api/barrow/agent-token',{}),agent={as:'',headers:{authorization:'Bearer '+grant.token}};
 await f.trace(lost,{...agent,status:403});
 const operations=await activateStaff(h,buyerEmail(f,'synthetic-barrow-911'),{role:'operations',accounts:['cedar'],warehouses:['New York'],reports:[],discountLimitCents:0,stockExceptionLimitCents:0});
 const restricted=await f.trace(lost,operations.who);assert.equal(restricted.canRecover,false);assert.deepEqual(restricted.tasks,[]);
 await h.command('order.approve',{orderId:lost.id},{...operations.who,status:403});
 const manager=await activateStaff(h,buyerEmail(f,'synthetic-barrow-912'),{role:'sales-manager',accounts:['cedar'],warehouses:'all',reports:[],discountLimitCents:0,stockExceptionLimitCents:0});
 const foreign=await h.command('order.prepare',{accountId:'wren',reference:'synthetic-barrow-917',lines:[{sku:'OAT-1',quantity:2}]},other);await h.command('order.submit',{orderId:foreign.id},other);await h.command('order.approve',{orderId:foreign.id});await f.trace(foreign,{...manager.who,status:404});await f.trace(foreign,{...operations.who,status:404});
 const originalOrders=(await pier.api('/api/pier/state')).orders;
 const recovered=await h.command('order.approve',{orderId:lost.id},manager.who);assert.equal(recovered.status,'approved');assert.ok(recovered.invoice);
 assert.equal((await pier.api('/api/pier/state')).orders.length,originalOrders.length);assert.ok(originalOrders.some(order=>order.id===recovered.pierOrderId));
 await h.command('followup.refresh',{});trace=await f.trace(lost);assert.equal(trace.tasks.find(row=>row.id===task.id).status,'closed');assert.equal(trace.acknowledgment,recovered.pierOrderId);assert.equal(trace.requestedDate,'2031-01-15');assert.equal(trace.stock.lines[0].promisedDate,'2031-01-15');assert.equal(trace.invoice.amountCents,13000);
 f.loseRelease();await h.command('order.cancel',{orderId:lost.id,reason:'Supplier approved cancelling the unshipped order.'},{status:503});
 await h.command('followup.refresh',{});trace=await f.trace(lost);assert.equal(trace.tasks.find(row=>row.id==='order-release:'+lost.id).status,'open');assert.equal(trace.releaseIdentity,'barrow-release-'+lost.id);assert.ok(trace.nextActions.some(action=>action.type==='order.cancel'));
 const released=await h.command('order.cancel',{orderId:lost.id},manager.who);assert.equal(released.status,'cancelled');await h.command('followup.refresh',{});trace=await f.trace(lost);assert.equal(trace.tasks.find(row=>row.id==='order-release:'+lost.id).status,'closed');assert.ok(trace.releaseAcknowledgedAt);assert.equal(trace.job,'unresolved');
 await h.command('staff.revoke',{userId:manager.id,revision:manager.grant.revision,reason:'Owner withdrew recovery authority.'});
 await f.trace(lost,{...manager.who,status:403});await h.command('order.approve',{orderId:lost.id},{...manager.who,status:404});
 // Two real valid submissions contend after their stock checks. No fabricated inventory rows.
 const free=Number((await pier.api('/api/pier/state')).positions[0].available);
 const first=await pendingOrder(f,'synthetic-barrow-913',free),second=await pendingOrder(f,'synthetic-barrow-914',free),third=await pendingOrder(f,'synthetic-barrow-915',free);
 await h.command('order.approve',{orderId:first.id});const short=await h.command('order.approve',{orderId:second.id});assert.equal(short.status,'shortfall');await h.command('order.approve',{orderId:third.id});
 await h.command('followup.refresh',{});trace=await f.trace(second);task=trace.tasks.find(task=>task.id==='order-shortfall:'+second.id);assert.ok(task);assert.equal(trace.stock.lines[0].backordered,String(free));assert.equal(trace.invoice,null);
 await h.configure({PIER_SESSION:undefined});await h.command('followup.refresh',{});trace=await f.trace(second);assert.equal(trace.stock.status,'unknown');assert.equal(trace.tasks[0].status,'open');
 await h.configure({PIER_SESSION:pier.cookie});
 const resolved=await h.command('followup.update',{id:task.id,revision:task.revision,close:true,resolution:'Supplier spoke with the buyer; retain the backorder under explicit human exception.'});
 assert.equal(resolved.resolvedBy,owner.id);assert.ok(resolved.resolvedAt);await h.command('followup.refresh',{});trace=await f.trace(second);assert.equal(trace.tasks[0].status,'closed');assert.equal(trace.job,'unresolved');assert.equal(trace.delivery,'unknown');assert.equal(trace.settlement,'unknown');
 const incoming=await pier.command('po.draft',{supplierId:product.supplier.id,promiseDate:'2031-01-16',reason:'Supplier replenishes the actual backorders',lines:[{itemId:product.item.id,quantity:String(free*2),price:'20.00'}]});
 await pier.command('po.approve',{poId:incoming.id,version:incoming.version});await pier.command('po.commit',{poId:incoming.id,version:incoming.version});
 const receipt=await pier.command('receipt.create',{poId:incoming.id,supplierReference:'synthetic-barrow-916',lines:[{poLineId:incoming.lines[0].id,locationId:product.location.id,quantity:String(free*2),cost:'20.00'}]});
 await h.command('followup.refresh',{});assert.equal((await f.trace(third)).tasks[0].status,'open');
 const fill=await pier.command('backorder.prepare',{receiptId:receipt.id,warehouse:'New York',reason:'Operator reviews source backorder allocations.'});await pier.command('backorder.release',{releaseId:fill.id,version:fill.version,reason:'Operator approves current source allocations.'});
 const filled=await h.command('order.refresh',{orderId:third.id});assert.equal(filled.status,'approved');await h.command('followup.refresh',{});const filledTrace=await f.trace(third);assert.equal(filledTrace.tasks[0].status,'closed');assert.equal(filledTrace.tasks[0].id,'order-shortfall:'+third.id);assert.equal(filledTrace.stock.lines[0].backordered,'0');assert.ok(filledTrace.invoice);assert.equal(filledTrace.delivery,'unknown');
 const exported=await h.api('/api/barrow/export.json');assert.equal(exported.followups.find(row=>row.id===task.id).resolvedBy,owner.id);assert.ok((await(await h.request('/api/barrow/export/followups.csv')).text()).includes(draft));
 const audit=await h.api('/api/barrow/audit?accountId=cedar');assert.ok(JSON.stringify(audit).includes('Reviewed a next-action draft'));
 const saved=await archive(h),target=await installation();t.after(()=>target.close());await restore(target,saved);const restored=await target.api(`/api/barrow/orders/${second.id}/followthrough`);assert.equal(restored.stock.status,'unknown');assert.equal(restored.tasks[0].resolvedBy,owner.id);assert.equal(restored.job,'unresolved');assert.equal(target.mail.deliveries.length,0);
 assert.equal((await h.api('/api/barrow/quotes?accountId=cedar')).quotes.length,0);
 const {verifiedRequest,erasurePreview,erasurePayload}=await import('./retention-fixture.mjs');
 await verifiedRequest(h);await h.command('retention.erase-account',erasurePayload(await erasurePreview(h)));
 assert.equal((await h.request('/api/barrow/orders/'+lost.id+'/followthrough',buyer)).status,401);
 await h.command('followup.refresh',{});assert.equal(JSON.stringify(await f.trace(lost)).includes(draft),false);
 const fenced=await installation();t.after(()=>fenced.close());await restore(fenced,saved,{journalSource:h});assert.equal(JSON.stringify(await fenced.api('/api/barrow/orders/'+lost.id+'/followthrough')).includes(draft),false);assert.equal((await fenced.request('/api/barrow/state',buyer)).status,401);assert.equal(fenced.mail.deliveries.length,0);

}
const buyerEmail=(f,name)=>f.buyerEmail.replace('buyer',name);
