import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {unstable_splitSqlQuery} from 'wrangler';
import {returnClaimsFixture} from './return-claims-fixture.mjs';
import {activateStaff,archive,installation,restore} from './harness.mjs';

// Part of the existing native return sanity journey: notices follow the same original order and decisions.
export async function proveOrderNotices(t) {
 await proveUpgradedOrderNotices(t);
 const f=await returnClaimsFixture(t),{h,pier,buyer,other,product,order}=f;
 const notices=async(who={})=>(await h.api('/api/barrow/order-notices',undefined,who)).notices;
 const source=(notice,who={})=>h.api(notice.sourcePath,undefined,who);
 const initial=await notices(buyer);
 assert.deepEqual(initial.map(row=>row.kind).sort(),['accepted','shipment','stock']);
 const accepted=initial.find(row=>row.kind==='accepted'),shipment=initial.find(row=>row.kind==='shipment');
 assert.equal(shipment.sourceId,f.shipment.id);assert.equal(shipment.sourceRevision,f.shipment.createdAt);
 assert.equal((await source(shipment,buyer)).current.lines[0].quantity,'6');
 assert.equal((await source(accepted,buyer)).current.status,'approved');
 assert.equal(JSON.stringify(initial).includes('Cents'),false);assert.equal(JSON.stringify(initial).includes('invoice'),false);
 const mailed=h.mail.requests.length;
 const concurrent=await Promise.all([notices(buyer),notices(buyer)]);
 assert.deepEqual(concurrent[0].map(row=>row.id),initial.map(row=>row.id));assert.deepEqual(concurrent[1],concurrent[0]);
 await h.command('order.approve',{orderId:order.id});assert.deepEqual((await notices(buyer)).map(row=>row.id),initial.map(row=>row.id));
 assert.equal(h.mail.requests.length,mailed,'notice reads never send email');
 // Only the current person is changed, even when a caller supplies somebody else's identity.
 const owner=(await h.api('/api/barrow/state')).actor.id;
 await Promise.all([1,2].map(()=>h.command('order-notice.read',{id:accepted.id,userId:owner},buyer)));
 assert.ok((await notices(buyer)).find(row=>row.id===accepted.id).readAt);
 assert.equal((await notices()).find(row=>row.id===accepted.id).readAt,null);
 await h.command('order-notice.preferences',{accountId:'cedar',kind:'shipment',enabled:false,userId:owner},buyer);
 assert.ok(!(await notices(buyer)).some(row=>row.kind==='shipment'));assert.ok((await notices()).some(row=>row.kind==='shipment'));
 assert.equal((await h.api('/api/barrow/order-notice-preferences',undefined,buyer)).accounts.find(row=>row.id==='cedar').kinds.find(row=>row.kind==='shipment').enabled,false);
 await h.command('order-notice.preferences',{accountId:'cedar',kind:'shipment',enabled:true},buyer);
 await h.command('order-notice.preferences',{accountId:'cedar',kind:'shipment',enabled:false},{...other,status:404});
 assert.deepEqual(await notices(other),[]);await source(accepted,{...other,status:404});
 await h.command('order-notice.read',{id:accepted.id},{...other,status:404});
 const {token}=await h.api('/api/barrow/agent-token',{});
 await h.api('/api/barrow/order-notices',undefined,{headers:{authorization:'Bearer '+token},status:403});
 let claim=await f.request();
 claim=await h.command('return.decide',{id:claim.id,revision:claim.revision,orderRevision:order.revision,quantity:2,instructions:'Bring authorized units to the supplier returns desk.',reason:'Authorize two units; the remainder stays disputed.'});
 const decided=(await notices(buyer)).filter(row=>row.kind==='return');assert.equal(decided.length,1);assert.equal(decided[0].sourceId,claim.id);assert.equal(decided[0].sourceRevision,claim.revision);
 assert.deepEqual((await source(decided[0],buyer)).current,{revision:claim.revision,requested:3,approved:2,restored:false});
 const received=await f.receive(2);claim=await h.command('return.reconcile',{id:claim.id,revision:claim.revision,receipts:[{returnId:received.id,quantity:2}]});
 assert.equal((await notices(buyer)).filter(row=>row.kind==='return').length,1);assert.equal((await source(decided[0],buyer)).current.revision,claim.revision,'source read follows the current record, not the captured revision');
 const {who:operations,grant}=await activateStaff(h,['synthetic-barrow-1171','example.test'].join('@'),{role:'operations',accounts:['cedar'],warehouses:'all',reports:['fulfillment'],discountLimitCents:0,stockExceptionLimitCents:0});
 assert.ok((await notices(operations)).some(row=>row.id===accepted.id));assert.ok(!(await notices(operations)).some(row=>row.kind==='return'));
 await source(decided[0],{...operations,status:404});
 await h.command('staff.revoke',{userId:grant.userId,revision:grant.revision,reason:'Withdraw notice access.'});
 await h.api(accepted.sourcePath,undefined,{...operations,status:404});
 // Two actual pinned-Pier dispatches retain two source identities, once each, even on parallel reads.
 let split=await h.command('order.prepare',{accountId:'cedar',reference:'synthetic-barrow-1172',lines:[{sku:'OAT-1',quantity:10}]},buyer);
 await h.command('order.submit',{orderId:split.id},buyer);split=await h.command('order.approve',{orderId:split.id});
 const upstream=(await pier.api('/api/pier/state')).orders.find(row=>row.id===split.pierOrderId),dispatches=[];
 for(const quantity of ['4','6'])dispatches.push(await pier.command('dispatch.create',{orderId:upstream.id,shipmentReference:'synthetic-barrow-1173-'+quantity,lines:[{orderLineId:upstream.lines[0].id,quantity}]}));
 const parallel=await Promise.all([notices(buyer),notices(buyer)]),splits=parallel[0].filter(row=>row.orderId===split.id&&row.kind==='shipment');
 assert.equal(splits.length,2);assert.deepEqual(new Set(splits.map(row=>row.sourceId)),new Set(dispatches.map(row=>row.id)));
 assert.deepEqual(parallel[0].map(row=>row.id),parallel[1].map(row=>row.id));
 assert.deepEqual((await Promise.all(splits.map(row=>source(row,buyer)))).map(row=>row.current.lines[0].quantity).sort(),['4','6']);
 // Real contention after buyer submission records the shortfall, then a real receipt fills it.
 let short=await h.command('order.prepare',{accountId:'cedar',reference:'synthetic-barrow-1174',lines:[{sku:'OAT-1',quantity:6}]},buyer);
 await h.command('order.submit',{orderId:short.id},buyer);
 await pier.command('order.create',{customerId:product.customer.id,lines:[{itemId:product.item.id,quantity:'180'}]});
 short=await h.command('order.approve',{orderId:short.id});assert.equal(short.status,'shortfall');
 const shortNotices=async()=>(await notices(buyer)).filter(row=>row.orderId===short.id&&row.kind==='stock');
 assert.equal((await shortNotices()).length,1);assert.equal((await shortNotices())[0].details.lines[0].backorder,'2');
 await h.command('order.refresh',{orderId:short.id});await h.command('order.refresh',{orderId:short.id});assert.equal((await shortNotices()).length,1);
 const incoming=await pier.command('po.draft',{supplierId:product.supplier.id,promiseDate:'2031-01-16',reason:'Replenish the actual shortfall',lines:[{itemId:product.item.id,quantity:'2',price:'20.00'}]});
 await pier.command('po.approve',{poId:incoming.id,version:incoming.version});await pier.command('po.commit',{poId:incoming.id,version:incoming.version});
 const receipt=await pier.command('receipt.create',{poId:incoming.id,supplierReference:'synthetic-barrow-1175',lines:[{poLineId:incoming.lines[0].id,locationId:product.location.id,quantity:'2',cost:'20.00'}]});
 const fill=await pier.command('backorder.prepare',{receiptId:receipt.id,warehouse:'New York',reason:'Review source allocations.'});await pier.command('backorder.release',{releaseId:fill.id,version:fill.version,reason:'Approve source allocations.'});
 short=await h.command('order.refresh',{orderId:short.id});assert.equal(short.status,'approved');assert.equal((await shortNotices()).length,2);
 assert.equal((await source((await shortNotices())[0],buyer)).current.status,'approved');
 // The source link refuses unavailable dispatch evidence rather than serving its old capture as current.
 await h.configure({PIER_SESSION:undefined});await source(shipment,{...buyer,status:409});assert.equal((await notices(buyer)).filter(row=>row.kind==='shipment').length,3);
 await h.configure({PIER_SESSION:pier.cookie});
 const mine=await h.api('/api/barrow/export.json',undefined,buyer);assert.ok(mine.ordernotices.some(row=>row.id===accepted.id&&row.readAt));assert.ok(mine.ordernotices.some(row=>row.id===decided[0].id));
 assert.deepEqual((await h.api('/api/barrow/export.json',undefined,other)).ordernotices,[]);
 assert.ok(mine.ordernoticepreferences.some(row=>row.accountId==='cedar'&&row.kind==='shipment'&&row.enabled));
 assert.ok(!(await h.api('/api/barrow/export.json',undefined,other)).ordernoticepreferences.some(row=>row.accountId==='cedar'));
 const csv=await(await h.request('/api/barrow/export/ordernotices.csv',buyer)).text();assert.ok(csv.includes(shipment.sourceId));assert.ok(csv.includes(shipment.sourceRevision));assert.ok(!csv.includes('Cents'));
 // Location loss is rechecked on lists, direct links and exports, including captured notice IDs.
 let member=(await h.api('/api/barrow/company/members?accountId=cedar')).members.find(row=>row.userId===order.preparedBy);
 const unrelatedLocation=await h.command('location.save',{accountId:'cedar',kind:'ship-to',value:{name:'Different delivery location',line1:'12 Market Street',city:'New York',state:'NY',zip:'10001'}});
 const policy={rights:member.rights,locations:[unrelatedLocation.id],perOrderLimitCents:member.perOrderLimitCents,approvalLimitCents:member.approvalLimitCents};
 await h.command('company.update',{accountId:'cedar',memberId:member.id,revision:member.revision,policy,reason:'Restrict current delivery locations.'});
 assert.deepEqual(await notices(buyer),[]);await source(accepted,{...buyer,status:403});assert.deepEqual((await h.api('/api/barrow/export.json',undefined,buyer)).ordernotices,[]);
 member=(await h.api('/api/barrow/company/members?accountId=cedar')).members.find(row=>row.id===member.id);
 await h.command('company.update',{accountId:'cedar',memberId:member.id,revision:member.revision,policy:{...policy,locations:'all'},reason:'Restore reviewed locations.'});
 // Restore preserves history but cannot deliver old notices or recapture retained order sources.
 const saved=await archive(h),restored=await installation();t.after(()=>restored.close());await restore(restored,saved);
 assert.deepEqual((await restored.api('/api/barrow/order-notices')).notices,[]);
 assert.ok((await restored.api('/api/barrow/export.json')).ordernotices.every(row=>row.restored));
 await restored.command('order-notice.read',{id:accepted.id},{status:404});
 await restored.command('order-notice.preferences',{accountId:'cedar',kind:'shipment',enabled:true},{status:409});
 // Reviewed account erasure removes personal notice state and fences source replay, including later restore.
 await h.command('retention.request',{accountId:'cedar',requester:'Buyer',channel:'Verified request',verificationNote:'Supplier verified the request.',held:false,reason:'Erase account notice history.'});
 const preview=await h.command('retention.preview',{accountId:'cedar'});assert.ok(preview.items.some(row=>row.id==='order-notices:cedar'));
 await h.command('retention.erase-account',{accountId:'cedar',accountRevision:preview.accountRevision,requestRevision:preview.requestRevision,policyRevision:preview.policyRevision,reviewHash:preview.reviewHash,confirm:'ERASE',reason:'Erase personal notice state and facts.'});
 assert.deepEqual(await notices(),[]);assert.deepEqual((await h.api('/api/barrow/export.json')).ordernotices,[]);await source(accepted,{...buyer,status:401});
 const later=await installation();t.after(()=>later.close());await restore(later,saved,{journalSource:h});assert.deepEqual((await later.api('/api/barrow/export.json')).ordernotices,[]);assert.deepEqual((await later.api('/api/barrow/order-notices')).notices,[]);
 console.log('PROBE AUTO-004 native: accepted order, changed shortfall, split dispatches and partial return decision -> durable source-linked facts; concurrent replay creates no duplicates.');
 console.log('PROBE AUTO-004 authority: personal preference and read state, foreign account, revoked staff and removed locations -> isolated state and refused captured links; no finance fields.');
 console.log('PROBE AUTO-004 custody: scoped JSON and CSV, owner-reviewed erasure and later-journal restore -> complete authorized facts, then empty and inert notice state.');
}

async function proveUpgradedOrderNotices(t) {
 const {h,pier,buyer,other}=await returnClaimsFixture(t);
 let order=await h.command('order.prepare',{accountId:'cedar',reference:'synthetic-barrow-1176',lines:[{sku:'OAT-1',quantity:10}]},buyer);
 await h.command('order.submit',{orderId:order.id},buyer);order=await h.command('order.approve',{orderId:order.id});
 // Keep the native account and approved order, then apply the notice schema as an upgrade.
 await h.db.batch(['bw_order_notice_reads','bw_order_notice_preferences','bw_order_notices','bw_order_notice_accounts'].map(table=>h.db.prepare(`DROP TABLE ${table}`)));
 const migration=await readFile(new URL('../../migrations/core/0080_order_notices.sql',import.meta.url),'utf8');
 await h.db.batch(unstable_splitSqlQuery(migration).map(sql=>h.db.prepare(sql)));
 const upstream=(await pier.api('/api/pier/state')).orders.find(row=>row.id===order.pierOrderId),dispatches=[];
 for(const quantity of ['4','6'])dispatches.push(await pier.command('dispatch.create',{orderId:upstream.id,shipmentReference:'synthetic-barrow-1177-'+quantity,lines:[{orderLineId:upstream.lines[0].id,quantity}]}));
 const notices=async(who=buyer)=>(await h.api('/api/barrow/order-notices',undefined,who)).notices.filter(row=>row.orderId===order.id&&row.kind==='shipment');
 const [first,concurrent]=await Promise.all([notices(),notices()]);
 assert.equal(first.length,2,'an order approved before the notice migration must receive both acknowledged split dispatch notices');
 assert.deepEqual(new Set(first.map(row=>row.sourceId)),new Set(dispatches.map(row=>row.id)));
 assert.deepEqual(concurrent,first);assert.deepEqual(await notices(),first);
 for(const row of first) {
  const expected=dispatches.find(dispatch=>dispatch.id===row.sourceId);
  assert.equal(row.sourceRevision,expected.createdAt);
  assert.equal((await h.api(row.sourcePath,undefined,buyer)).current.lines[0].quantity,expected.lines[0].quantity);
  await h.api(row.sourcePath,undefined,{...other,status:404});
 }
 assert.deepEqual(await notices(other),[]);
 const saved=await archive(h),restored=await installation();t.after(()=>restored.close());await restore(restored,saved);
 await restored.configure({PIER_ORIGIN:pier.origin,PIER_SESSION:pier.cookie});
 assert.deepEqual((await restored.api('/api/barrow/order-notices')).notices,[],'restoring upgraded accounts must keep dispatch capture inactive');
 console.log('PROBE AUTO-004 A: existing approved order, notice migration, two real Pier dispatches, concurrent and repeated HTTP reads -> two distinct source-linked notices, foreign links refused, restored capture inactive.');
}
