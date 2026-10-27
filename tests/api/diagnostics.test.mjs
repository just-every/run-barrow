import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { installation, stock, accountValue } from './harness.mjs';

test('OPS-001: owner diagnostics show live Pier health and each interrupted handoff by correlation ID until the same order resumes; export holds no secrets', async t => {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 const products = await stock(pier, '30');
 let down = false; const drop = new Set();
 // Network faults only: the real Pier Worker executes every command that reaches it.
 const proxy = createServer(async (request, response) => {
  try {
   const chunks = []; for await (const chunk of request) chunks.push(chunk);
   const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
   if (down) { response.destroy(); return; }
   const upstream = await pier.request(request.url, { method: request.method, ...(body ? { body } : {}) });
   const bytes = Buffer.from(await upstream.arrayBuffer());
   if (body && drop.delete(body.type)) { response.destroy(); return; }
   response.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'application/json' }); response.end(bytes);
  } catch (error) { response.destroy(error); }
 });
 proxy.listen(0, '127.0.0.1'); await once(proxy, 'listening');
 t.after(async () => { proxy.closeAllConnections(); await new Promise(resolve => proxy.close(resolve)); });
 const h = await installation({ bindings: { PIER_ORIGIN: `http://127.0.0.1:${proxy.address().port}`, PIER_SESSION: pier.cookie } }); t.after(() => h.close());
 await h.command('account.save', { id: 'cedar', value: accountValue(products.customer.id) });
 const buyer = await h.signIn('buyer@example.test');
 const place = async () => { const draft = await h.command('order.prepare', { accountId: 'cedar', lines: [{ sku: 'OAT-1', quantity: 3 }] }, { as: buyer }); await h.command('order.submit', { orderId: draft.id }, { as: buyer }); return draft; };
 let seen = await h.api('/api/barrow/diagnostics');
 assert.equal(seen.pier.state, 'ok'); assert.deepEqual(seen.handoffs, []); assert.equal(seen.notifications.recorded, true); assert.deepEqual(seen.notifications.deliveries, []);

 // Interrupt a reservation and a release; both stay visible with their durable IDs and owner.
 const reserving = await place(); drop.add('order.create');
 await h.command('order.approve', { orderId: reserving.id }, { status: 503 });
 const releasing = await place(); await h.command('order.approve', { orderId: releasing.id });
 drop.add('order.cancel'); await h.command('order.cancel', { orderId: releasing.id, reason: 'Duplicate' }, { status: 503 });
 down = true;
 seen = await h.api('/api/barrow/diagnostics');
 assert.equal(seen.pier.state, 'failed'); assert.match(seen.pier.message, /^Pier (did not answer|refused the request)/);
 assert.deepEqual(seen.handoffs.map(item => [item.orderId, item.correlationId, item.state, item.owner, item.action]), [
  [reserving.id, `barrow-${reserving.id}`, 'Reservation sent, not confirmed', 'Supplier', 'Retry stock reservation'],
  [releasing.id, `barrow-release-${releasing.id}`, 'Release sent, not confirmed', 'Supplier', 'Retry stock release'],
 ]);
 const exported = await h.request('/api/barrow/diagnostics.json');
 assert.equal(exported.status, 200); assert.match(exported.headers.get('content-disposition'), /attachment; filename="barrow-diagnostics.json"/);
 const text = await exported.text();
 assert.deepEqual(JSON.parse(text).handoffs, seen.handoffs);
 for (const secret of [pier.cookie, h.cookie, ...pier.cookie.split('; ').map(part => part.split('=')[1]), ...h.cookie.split('; ').map(part => part.split('=')[1])]) assert.ok(!text.includes(secret));
 assert.doesNotMatch(text, /cookie|session|token|PIER_SESSION/i);

 // Resuming the same orders with their existing commands clears each handoff only on acknowledgment.
 down = false;
 assert.equal((await h.command('order.approve', { orderId: reserving.id })).status, 'approved');
 assert.equal((await h.command('order.cancel', { orderId: releasing.id })).status, 'cancelled');
 seen = await h.api('/api/barrow/diagnostics');
 assert.equal(seen.pier.state, 'ok'); assert.deepEqual(seen.handoffs, []);
 assert.equal((await pier.api('/api/pier/state')).orders.length, 2);

 // Only supplier people read diagnostics.
 assert.equal((await h.api('/api/barrow/diagnostics', undefined, { as: buyer, status: 403 })).error.code, 'FORBIDDEN');
 const { token } = await h.api('/api/barrow/agent-token', {});
 assert.equal((await h.request('/api/barrow/diagnostics', { as: '', headers: { authorization: `Bearer ${token}` } })).status, 403);
});

test('owner inspects connector samples, repairs missing mappings, retains exact source differences and private audit after credential revocation', async t => {
 const pier=await installation({pier:true});t.after(()=>pier.close());const source=await stock(pier,'30');
 const h=await installation({bindings:{PIER_ORIGIN:pier.origin,PIER_SESSION:pier.cookie}});t.after(()=>h.close());
 let account=await h.command('account.save',{id:'cedar',value:{...accountValue(source.customer.id),prices:[{sku:'OAT-1',unitCents:6500,minQty:1},{sku:'MISSING-1',unitCents:100,minQty:1}]}});
 const owner=(await h.api('/api/barrow/state')).actor;
 assert.deepEqual(await h.api('/api/barrow/connectors'),{review:null,revision:null});
 const inspect=revision=>h.api('/api/barrow/connectors/inspect',{revision,reason:'Owner reviewed source mappings and quantities before operating the connector.'});
 let result=await inspect(null);
 assert.deepEqual(result.review.pier.samples.map(row=>[row.sku,row.available]),[['OAT-1','30']]);
 assert.deepEqual(result.review.pier.counts,{sourceItems:1,sourceCustomers:1,mappedAccounts:1,sourceOrders:0,nativeOrders:0});
 assert.deepEqual(result.review.issues.map(row=>[row.record,row.kind,row.owner]),[['cedar:MISSING-1','unmapped-item',owner.id]]);
 await h.command('stock.sync-settings',{enabled:true},{status:409});
 assert.equal((await h.api('/api/barrow/stock-sync')).sync,null);
 assert.equal(result.review.pier.authority.stock,'Pier');assert.equal(result.review.pier.authority.commerce,'Barrow');
 await h.api('/api/barrow/connectors/inspect',{revision:null,reason:'Stale review'},{status:409});
 account=await h.command('account.save',{id:account.id,revision:account.revision,value:{...account.value,prices:[account.value.prices[0]]}});
 result=await inspect(result.revision);assert.deepEqual(result.review.issues,[]);
 let duplicate=await h.command('account.save',{id:'birch',duplicateReviews:[{id:account.id,revision:account.revision}],value:{...account.value,name:'Birch Lane Pantry',email:'birch@example.test'}});
 result=await inspect(result.revision);assert.deepEqual(result.review.issues.map(row=>[row.record,row.kind]),[[source.customer.id,'duplicate-customer']]);
 assert.equal((await h.command('stock.sync-settings',{enabled:true})).sync.enabled,1);await h.command('stock.sync-settings',{enabled:false});
 duplicate=await h.command('account.save',{id:duplicate.id,revision:duplicate.revision,value:{...duplicate.value,pierCustomerId:'synthetic-barrow-missing'}});
 result=await inspect(result.revision);assert.deepEqual(result.review.issues.map(row=>[row.record,row.kind]),[['birch','unmapped-customer']]);
 await h.command('account.erase',{accountId:'birch',confirm:'ERASE'});
 result=await inspect(result.revision);assert.deepEqual(result.review.issues,[]);
 const enabled=await h.command('stock.sync-settings',{enabled:true});assert.equal(enabled.sync.enabled,1);
 await h.db.prepare('UPDATE bw_stock_sync SET completed_at=?,observed_at=?,pending=?').bind(new Date(Date.now()-600000).toISOString(),new Date().toISOString(),'synthetic-barrow-pending').run();
 result=await inspect(result.revision);assert.ok(result.review.sync.lagSeconds>=600&&result.review.sync.lagSeconds<620);assert.equal(result.review.sync.pending,'synthetic-barrow-pending');

 await h.command('stock.sync-settings',{enabled:false});
 const buyer={as:await h.signIn('buyer@example.test')};
 let order=await h.command('order.prepare',{accountId:'cedar',lines:[{sku:'OAT-1',quantity:2}]},buyer);await h.command('order.submit',{orderId:order.id},buyer);order=await h.command('order.approve',{orderId:order.id});
 // A damaged retained snapshot is a reconciliation fixture, never a production stock source.
 await h.db.prepare("UPDATE bw_orders SET value_json=json_set(value_json,'$.lines[0].quantity',3,'$.lines[0].baseQuantity','3') WHERE id=?").bind(order.id).run();
 result=await inspect(result.revision);
 assert.deepEqual(result.review.issues.map(row=>[row.record,row.kind,row.message]),[[`${order.id}:${source.item.id}`,'quantity-difference','Native ordered 3; Pier ordered 2 base units.']]);
 assert.equal((await pier.api('/api/pier/state')).orders[0].lines[0].quantity,'2');
 await h.command('stock.sync-settings',{enabled:true},{status:409});assert.equal((await h.api('/api/barrow/stock-sync')).sync.enabled,0);
 await h.db.prepare("UPDATE bw_orders SET value_json=? WHERE id=?").bind(JSON.stringify(order),order.id).run();
 result=await inspect(result.revision);assert.deepEqual(result.review.issues,[]);
 const successful=result.review.pier.lastSuccessfulAt,samples=result.review.pier.samples;
 const readOnly=await pier.signIn('synthetic-barrow-viewer@example.test');await h.configure({PIER_SESSION:readOnly});
 result=await inspect(result.revision);assert.equal(result.review.pier.state,'unavailable');await h.command('stock.sync-settings',{enabled:true},{status:409});
 await h.configure({PIER_SESSION:pier.cookie});
 await h.configure({PIER_SESSION:undefined});
 result=await inspect(result.revision);assert.equal(result.review.pier.state,'unavailable');assert.equal(result.review.pier.lastSuccessfulAt,successful);assert.deepEqual(result.review.pier.samples,samples);
 assert.deepEqual(result.review.issues.map(row=>[row.record,row.kind]),[['pier','connection']]);
 await h.command('stock.sync-settings',{enabled:true},{status:503});
 assert.equal((await h.api('/api/barrow/orders/'+order.id)).id,order.id);
 assert.deepEqual((await h.api('/api/barrow/connectors')).review,result.review);
 const admin={as:await h.signIn('synthetic-barrow-40@example.test','admin')};const {token}=await h.api('/api/barrow/agent-token',{}),agent={as:'',headers:{authorization:`Bearer ${token}`}};
 for(const who of [buyer,admin,agent])for(const [path,body] of [['/api/barrow/connectors',undefined],['/api/barrow/connectors/inspect',{revision:result.revision,reason:'Unauthorized'}]])await h.api(path,body,{...who,status:403});
 for(const who of [buyer,agent])for(const path of ['/api/barrow/audit','/api/barrow/audit.csv'])assert.equal((await h.request(path,who)).status,403);
 const events=(await h.api('/api/barrow/audit?person='+encodeURIComponent(owner.id))).events.filter(row=>row.action==='connector.inspected');assert.equal(events.length,10);
 for(const event of events){assert.equal(event.actorId,owner.id);assert.equal(event.actorKind,'human');assert.equal(event.source,'connector.review');assert.ok(event.revision);assert.ok(event.createdAt);assert.equal(event.reason,'Owner reviewed source mappings and quantities before operating the connector.')}
 const csv=await (await h.request('/api/barrow/audit.csv?person='+encodeURIComponent(owner.id))).text();for(const event of events)assert.ok(csv.includes(event.id));
 for(const secret of [pier.cookie,h.cookie,token])assert.equal(JSON.stringify(result).includes(secret)||csv.includes(secret),false);
 await h.api('/api/barrow/audit/'+events[0].id,undefined,{method:'DELETE',status:404});
 assert.equal((await h.api('/api/barrow/audit?person='+encodeURIComponent(owner.id))).events.filter(row=>row.action==='connector.inspected').length,10);
});
