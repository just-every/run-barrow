import assert from 'node:assert/strict';
import {shipmentTrackingFixture,trackedReplacement} from './shipment-tracking-fixture.mjs';
import {activateStaff,archive,installation,restore,accountValue} from './harness.mjs';
import {verifiedRequest,erasurePayload} from './retention-fixture.mjs';

export async function proveShipmentTracking(t) {
 await proveWarehouseTrackingReport(t);
 const f=await shipmentTrackingFixture(t),{h,pier,buyer,order,bind,view,set,event,refresh}=f;
 const before=await h.api('/api/barrow/orders/'+order.id),confirmations=await h.api(`/api/barrow/orders/${order.id}/confirmations`);
 await h.command('followup.refresh',{});assert.ok((await h.api('/api/barrow/followups?view=all')).tasks.some(t=>t.id==='tracking-missing:'+f.shipment.id));
 const {token}=await h.api('/api/barrow/agent-token',{}),agent={as:'',headers:{authorization:`Bearer ${token}`}};assert.equal((await h.request(`/api/barrow/orders/${order.id}/tracking`,agent)).status,403);await bind(1,'4',{...agent,status:403});
 await bind(1,'4', {...buyer,status:403});
 await bind(1,'4');await bind(2,'7',{status:409});assert.equal((await view()).packages.length,1);
 const attempts=await Promise.all([1,2].map(()=>h.request('/api/barrow/commands',{method:'POST',body:{type:'tracking.bind',payload:{orderId:order.id,shipmentId:f.shipment.id,trackerId:'trk_syntheticbarrow2',carrier:'UPS',code:'synthetic-barrow-2',lines:[{itemId:f.product.item.id,quantity:'6'}]}}})));assert.deepEqual(attempts.map(r=>r.status).sort(),[200,409]);
 // Provider identity and missing source responses cannot manufacture package custody.
 assert.equal((await view()).packages.length,2);
 let current=await view(),first=current.packages.find(p=>p.trackerId.endsWith('1')),second=current.packages.find(p=>p.trackerId.endsWith('2'));
 assert.equal(second.status,'pre_transit');assert.equal(second.deliveredAt,null);assert.equal(first.lines[0].quantity,'4');assert.deepEqual(first.warehouses,['New York']);assert.ok(first.checkedAt&&first.link);
 let report=(await h.api('/api/barrow/reports/fulfillment')).lines[0];assert.deepEqual([report.shipped,report.trackedQuantity,report.deliveredQuantity,report.onTimeDeliveredQuantity],['10','10','0','0']);
 set(1,[event('delivered','2031-01-15T10:00:00Z','Carrier confirmed delivery'),event('in_transit','2031-01-15T07:00:00Z','Older delay','delayed')]);await refresh(1);
 current=await refresh(1);first=current.packages.find(p=>p.id===first.id);assert.equal(first.status,'delivered');assert.equal(first.events.length,3);assert.equal(current.tasks.find(t=>t.id==='carrier:'+first.id).status,'closed');
 set(1,[event('in_transit','2031-01-15T06:00:00Z','Old scan')]);await refresh(1);assert.equal((await view()).packages.find(p=>p.id===first.id).status,'delivered');
 set(2,[event('failure','2031-01-15T09:00:00Z','Delivery attempt failed')]);await refresh(2);assert.equal((await view()).packages.find(p=>p.id===second.id).status,'failure');assert.equal((await view()).tasks.find(t=>t.id==='carrier:'+second.id).status,'open');
 set(2,[event('in_transit','2031-01-15T11:00:00Z','Delayed parcel','delayed')]);await refresh(2);
 current=await view();second=current.packages.find(p=>p.id===second.id);
 await h.command('tracking.dispute',{orderId:order.id,packageId:second.id,revision:second.revision,reason:'Package not received; synthetic-barrow-314 needs supplier review.'},buyer);
 await h.command('followup.refresh',{});await refresh(2);current=await view();let dispute=current.tasks.find(t=>t.id==='dispute:'+second.id);assert.equal(dispute.status,'open');assert.ok(dispute.ownerId&&dispute.nextContactDate);assert.equal((await h.request(dispute.sourcePath)).status,200);assert.equal(current.tasks.find(t=>t.id==='carrier:'+second.id).status,'open');
 // A delivered package may also be disputed; replay of its earlier carrier receipt must leave that dispute open.
 first=current.packages.find(p=>p.id===first.id);await h.command('tracking.dispute',{orderId:order.id,packageId:first.id,revision:first.revision,reason:'Buyer contests the older delivery scan.'},buyer);set(1,[event('delivered','2031-01-15T10:00:00Z','Carrier confirmed delivery')]);await refresh(1);assert.equal((await view()).tasks.find(t=>t.id==='dispute:'+first.id).status,'open');
 await h.command('followup.update',{id:dispute.id,revision:dispute.revision,contact:{outcome:'reached',note:'Buyer contacted; still missing.'}});assert.equal((await view()).tasks.find(t=>t.id===dispute.id).status,'open');
 const unchanged=await h.api('/api/barrow/orders/'+order.id);assert.deepEqual(unchanged,before);assert.deepEqual(await h.api(`/api/barrow/orders/${order.id}/confirmations`),confirmations);
 report=(await h.api('/api/barrow/reports/fulfillment')).lines[0];assert.deepEqual([report.shipped,report.deliveredQuantity,report.onTimeDeliveredQuantity,report.delivery],['10','4','4','partially verified']);
 const timeline=await h.api(`/api/barrow/orders/${order.id}/timeline`,undefined,buyer);assert.ok(timeline.entries.some(e=>e.state==='Carrier delivered'&&e.source==='EasyPost'&&e.at==='2031-01-15T10:00:00.000Z'));
 const count=first.events.length;f.foreign(true);await refresh(1,{status:502});f.foreign(false);assert.equal((await view()).packages.find(p=>p.id===first.id).events.length,count);
 assert.equal((await h.request('/api/barrow/tracking/webhook',{method:'POST',as:'',body:{status:'delivered'}})).status,401);
 const foreignBuyer={as:await h.signIn(['synthetic-barrow-315','example.test'].join('@'))};assert.equal((await h.request(`/api/barrow/orders/${order.id}/tracking`,foreignBuyer)).status,404);
 const policy={role:'operations',accounts:['cedar'],warehouses:['New York'],reports:['fulfillment'],discountLimitCents:0,stockExceptionLimitCents:0};
 const scoped=await activateStaff(h,['synthetic-barrow-316','example.test'].join('@'),policy);assert.equal((await h.request(`/api/barrow/orders/${order.id}/tracking`,scoped.who)).status,200);
 assert.ok((await h.api('/api/barrow/followups?view=all',undefined,scoped.who)).tasks.some(t=>t.id===dispute.id));
 const outside=await activateStaff(h,['synthetic-barrow-317','example.test'].join('@'),{...policy,warehouses:['Elsewhere']});await refresh(2,{...outside.who,status:403});
 await h.command('staff.revoke',{userId:scoped.id,revision:scoped.grant.revision,reason:'Owner withdrew tracking authority.'});await refresh(2,{...scoped.who,status:404});
 await h.configure({EASYPOST_API_KEY:undefined});const reads=f.calls.length;await refresh(2,{status:503});assert.equal(f.calls.length,reads);await h.configure({EASYPOST_API_KEY:'synthetic-barrow-310'});
 f.down(true);await refresh(2,{status:503});assert.equal((await view()).tasks.find(t=>t.id===dispute.id).status,'open');f.down(false);
 await h.configure({PIER_SESSION:undefined});await refresh(2,{status:409});assert.equal((await view()).sourceAvailable,false);await h.command('followup.refresh',{});assert.equal((await view()).tasks.find(t=>t.id===dispute.id).status,'open');await h.configure({PIER_SESSION:pier.cookie});
 const related=await trackedReplacement(f);const linkedTimeline=await h.api(`/api/barrow/orders/${related.original.id}/timeline`,undefined,buyer);assert.ok(linkedTimeline.entries.some(e=>e.state==='Carrier delivered'&&e.detail.includes(related.replacement.id)));assert.deepEqual((await h.api('/api/barrow/orders/'+related.original.id)).substitutions.at(-1).carrierDelivery.original,[]);
 const exported=await h.api('/api/barrow/export.json',undefined,buyer);assert.equal(exported.tracking.length,3);assert.equal(exported.tracking.filter(p=>p.orderId===order.id).length,2);assert.match(await (await h.request('/api/barrow/export/tracking.csv')).text(),/synthetic-barrow-2/);
 const older=await archive(h),target=await installation({bindings:{PIER_ORIGIN:pier.origin,PIER_SESSION:pier.cookie,EASYPOST_API_KEY:'synthetic-barrow-310'},networkEdge:()=>{throw Error('Restored tracking must not retrieve carrier data')}});t.after(()=>target.close());await restore(target,older);const restored=await target.api(`/api/barrow/orders/${order.id}/tracking`);assert.equal(restored.packages.length,2);const rp=restored.packages[0];await target.command('tracking.refresh',{orderId:order.id,packageId:rp.id,revision:rp.revision},{status:409});
 dispute=(await view()).tasks.find(t=>t.id===dispute.id);const resolved=await h.command('followup.update',{id:dispute.id,revision:dispute.revision,close:true,resolution:'Supplier verified a replacement handoff with the buyer; this is a human dispute decision, not carrier delivery.'});assert.ok(resolved.resolvedBy&&resolved.resolvedAt);assert.equal((await view()).packages.find(p=>p.id===second.id).deliveredAt,null);
 await h.configure({BARROW_TEST_CLOCK:'2031-01-15T14:00:00.000Z'});set(1,[event('delivered','2031-01-15T13:00:00Z','Carrier verified delivery after buyer review')]);await refresh(1);assert.equal((await view()).tasks.find(t=>t.id==='dispute:'+first.id).status,'closed');assert.match((await view()).tasks.find(t=>t.id==='dispute:'+first.id).resolution,/2031-01-15T13:00/);
 await verifiedRequest(h,'cedar',false);const preview=await h.command('retention.preview',{accountId:'cedar'});assert.equal(preview.classes.find(c=>c.kind==='carrier tracking').count,3);await h.command('retention.erase-account',erasurePayload(preview));assert.equal((await view()).packages.length,0);const retained=await h.api('/api/barrow/orders/'+order.id);assert.deepEqual([retained.currency,retained.lines,retained.totalCents,retained.invoice],[before.currency,before.lines,before.totalCents,before.invoice]);assert.equal((await h.request(`/api/barrow/orders/${order.id}/tracking`,buyer)).status,401);await bind(1,'4',{status:409});
 const fenced=await installation();t.after(()=>fenced.close());await restore(fenced,older);assert.equal((await fenced.api(`/api/barrow/orders/${order.id}/tracking`)).packages.length,0);
}

async function proveWarehouseTrackingReport(t) {
 const f=await shipmentTrackingFixture(t),{h,pier,product,buyer,event,set}=f;
 const item=await pier.command('item.save',{sku:'NUT-1',name:'Roasted nuts',unit:'case',packSize:'1'});
 const location=await pier.command('location.save',{name:'Shelf B1',warehouse:'Los Angeles',kind:'bin'});
 const po=await pier.command('po.draft',{supplierId:product.supplier.id,promiseDate:'2031-01-15',reason:'Mixed warehouse source stock',lines:[{itemId:item.id,quantity:'12',price:'20.00'}]});
 await pier.command('po.approve',{poId:po.id,version:po.version});await pier.command('po.commit',{poId:po.id,version:po.version});
 await pier.command('receipt.create',{poId:po.id,supplierReference:'synthetic-barrow-320',lines:[{poLineId:po.lines[0].id,locationId:location.id,quantity:'12',cost:'20.00'}]});
 let rule=await pier.command('routing.save',{source:'manual',mode:'rules',shortage:'split',zones:[],defaultEligible:['New York','Los Angeles']});
 rule=await pier.command('routing.preview',{ruleId:rule.id,version:rule.version});await pier.command('routing.activate',{ruleId:rule.id,version:rule.version});
 const account={...accountValue(product.customer.id,f.email),currency:'USD'};account.prices.push({sku:'NUT-1',unitCents:6500,minQty:2});
 const currentAccount=await h.api('/api/barrow/accounts/by-id/cedar');
 await h.command('account.save',{id:'cedar',revision:currentAccount.revision,value:account});
 const place=async reference=>{
  const order=await h.command('order.prepare',{accountId:'cedar',reference,requestedDate:'2031-01-15',lines:[{sku:'OAT-1',quantity:2},{sku:'NUT-1',quantity:2}]},buyer);
  await h.command('order.submit',{orderId:order.id},buyer);return h.command('order.approve',{orderId:order.id});
 };
 const order=await place('synthetic-barrow-321'),before=await h.api('/api/barrow/orders/'+order.id);
 const dispatch=async(order,items,reference)=>{
  const upstream=(await pier.api('/api/pier/state')).orders.find(row=>row.id===order.pierOrderId);
  return pier.command('dispatch.create',{orderId:upstream.id,warehouse:items[0].id===product.item.id?'New York':'Los Angeles',shipmentReference:reference,lines:items.map(item=>({orderLineId:upstream.lines.find(line=>line.itemId===item.id).id,quantity:'2'}))});
 };
 const bind=async(order,shipment,items,n,status)=>{
  set(n,[event(status,'2031-01-15T10:00:00Z')]);
  return h.command('tracking.bind',{orderId:order.id,shipmentId:shipment.id,trackerId:'trk_syntheticbarrow'+n,carrier:'UPS',code:'synthetic-barrow-'+n,lines:items.map(item=>({itemId:item.id,quantity:'2'}))});
 };
 await bind(order,await dispatch(order,[product.item],'synthetic-barrow-322'),[product.item],4,'delivered');
 await bind(order,await dispatch(order,[item],'synthetic-barrow-323'),[item],5,'failure');
 const policy={role:'operations',accounts:['cedar'],warehouses:['New York'],reports:['fulfillment'],discountLimitCents:0,stockExceptionLimitCents:0};
 const scoped=await activateStaff(h,['synthetic-barrow-324','example.test'].join('@'),policy);
 assert.equal((await h.request(`/api/barrow/orders/${order.id}/tracking`,scoped.who)).status,403);
 const path='/api/barrow/reports/fulfillment?accountId=cedar&warehouse=New+York';
 const report=await h.api(path,undefined,scoped.who),line=report.lines.find(row=>row.orderId===order.id);
 assert.ok(line,'The permitted warehouse line remains available');
 assert.equal(line.tracking,'UPS synthetic-barrow-4: delivered','A New York report must exclude another SKU’s Los Angeles tracking code and status');
 assert.deepEqual([line.trackedQuantity,line.deliveredQuantity,line.onTimeDeliveredQuantity],['2','2','2']);
 assert.ok(!JSON.stringify(report).includes('synthetic-barrow-5'),'Neither report representation exposes the foreign package');
 const full=await activateStaff(h,['synthetic-barrow-325','example.test'].join('@'),{...policy,warehouses:'all'});
 for(const who of [{},full.who]) {
  const all=await h.api('/api/barrow/reports/fulfillment?accountId=cedar',undefined,who);
  assert.equal(all.lines.find(row=>row.orderId===order.id&&row.sku==='OAT-1').tracking,'UPS synthetic-barrow-4: delivered');
  assert.equal(all.lines.find(row=>row.orderId===order.id&&row.sku==='NUT-1').tracking,'UPS synthetic-barrow-5: failure');
 }
 const refused=await h.api('/api/barrow/reports/fulfillment?accountId=cedar&warehouse=Los+Angeles',undefined,{...scoped.who,status:403});assert.equal(refused.error.code,'FORBIDDEN');
 assert.ok(!JSON.stringify(refused).includes('synthetic-barrow-5'));
 assert.deepEqual(await h.api('/api/barrow/orders/'+order.id),before,'Reporting changes no agreed order snapshot');
 await h.command('staff.revoke',{userId:scoped.id,revision:scoped.grant.revision,reason:'Owner withdrew warehouse report authority.'});
 assert.equal((await h.request(path,scoped.who)).status,403);
}
