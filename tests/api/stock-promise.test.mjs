import test from 'node:test';
import assert from 'node:assert/strict';
import { installation, accountValue } from './harness.mjs';

test('STK-002 / PRI-007: Pier stock by warehouse and incoming promise dates, account warehouse rules and a stale-stock limit with refresh or recorded exception', async t => {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 const item = await pier.command('item.save', { sku: 'OAT-1', name: 'Toasted oat granola', unit: 'case', packSize: '1' });
 const mill = await pier.command('party.save', { name: 'Mill House Foods', kind: 'supplier' });
 const customer = await pier.command('party.save', { name: 'Cedar Street Pantry', kind: 'customer' });
 const purchase = async (promiseDate, quantity, locationId) => {
  const po = await pier.command('po.draft', { supplierId: mill.id, promiseDate, reason: 'Stock', lines: [{ itemId: item.id, quantity, price: '20.00' }] });
  await pier.command('po.approve', { poId: po.id, version: po.version });
  await pier.command('po.commit', { poId: po.id, version: po.version });
  if (locationId) await pier.command('receipt.create', { poId: po.id, supplierReference: 'Delivery', lines: [{ poLineId: po.lines[0].id, locationId, quantity, cost: '20.00' }] });
 };
 const york = await pier.command('location.save', { name: 'Shelf A1', warehouse: 'New York', kind: 'bin' });
 const newark = await pier.command('location.save', { name: 'Shelf B1', warehouse: 'Newark', kind: 'bin' });
 await purchase('2026-10-01', '30', york.id); await purchase('2026-10-01', '20', newark.id);
 await purchase('2026-11-15', '40'); // committed, not yet received

 const h = await installation({ bindings: { PIER_ORIGIN: pier.origin, PIER_SESSION: pier.cookie } }); t.after(() => h.close());
 let account = await h.command('account.save', { id: 'cedar', value: { ...accountValue(customer.id), minimumCents: 0 } });
 const as = { as: await h.signIn(account.value.email) };
 const offer = async () => (await h.api('/api/barrow/catalogue?accountId=cedar', undefined, as)).items[0];
 const prepare = (quantity, extra = {}, opts = as) => h.command('order.prepare', { accountId: 'cedar', lines: [{ sku: 'OAT-1', quantity }], ...extra }, opts);

 // Immediate stock per warehouse versus incoming supply on its PO promise date, which is shown but never promised.
 let stock = await offer();
 assert.equal(stock.available, '50');
 assert.deepEqual(stock.warehouses, [{ warehouse: 'New York', available: '30', promised: true }, { warehouse: 'Newark', available: '20', promised: true }]);
 assert.deepEqual(stock.incoming, [{ date: '2026-11-15', quantity: '40' }]);
 assert.equal((await prepare(60, { requestedDate: '2026-11-20' }, { ...as, status: 409 })).error.code, 'STOCK');

 // An account limited to one warehouse is promised only that warehouse's stock.
 account = await h.command('account.save', { id: 'cedar', revision: account.revision, value: { ...account.value, warehouses: ['New York'] } });
 stock = await offer();
 assert.equal(stock.available, '30'); assert.equal(stock.warehouses.find(row => row.warehouse === 'Newark').promised, false);
 assert.equal((await prepare(40, {}, { ...as, status: 409 })).error.code, 'STOCK');
 assert.equal((await h.command('account.save', { id: 'cedar', revision: account.revision, value: { ...account.value, warehouses: ['New York', 'New York'] } }, { status: 409 })).error.code, 'ACCOUNT_WAREHOUSES');

 // The merchant's freshness limit: only the supplier sets it.
 assert.equal((await h.command('settings.save', { stockFreshnessMinutes: 15 }, { ...as, status: 403 })).error.code, 'FORBIDDEN');
 await h.command('settings.save', { stockFreshnessMinutes: 15 });
 assert.deepEqual((await h.api('/api/barrow/state')).settings, { stockFreshnessMinutes: 15 });
 const fresh = await prepare(10);
 assert.equal((await h.command('order.submit', { orderId: fresh.id }, as)).status, 'submitted');

 // A draft whose stock was observed 20 minutes ago (test data standing in for the clock) is refused with its source.
 const age = async order => {
  const value = { ...order, preparedAt: new Date(Date.now() - 20 * 60000).toISOString() }; delete value.revision;
  await h.db.prepare('UPDATE bw_orders SET value_json=? WHERE id=?').bind(JSON.stringify(value), order.id).run();
 };
 const stale = await prepare(10, { reference: 'PO-STALE' }); await age(stale);
 const refused = await h.command('order.submit', { orderId: stale.id }, { ...as, status: 409 });
 assert.equal(refused.error.code, 'STOCK_STALE'); assert.match(refused.error.message, /Pier stock for this draft was observed .* more than the 15-minute freshness limit ago/);
 // A valid refresh: preparing it again at live stock replaces the stale draft, which then submits.
 const refreshed = await prepare(10, { reference: 'PO-STALE', replaces: stale.id });
 assert.equal((await h.command('order.submit', { orderId: refreshed.id }, as)).status, 'submitted');

 // An explicit exception: only the supplier records it, with a reason that lands in the audit.
 const other = await prepare(5, { reference: 'PO-EXCEPTION' }); await age(other);
 assert.equal((await h.command('order.stock-exception', { orderId: other.id, reason: 'Counted by hand' }, { ...as, status: 403 })).error.code, 'FORBIDDEN');
 const excepted = await h.command('order.stock-exception', { orderId: other.id, reason: 'Counted the shelf by hand at 9:40' });
 assert.equal(excepted.stockException.reason, 'Counted the shelf by hand at 9:40');
 assert.equal((await h.command('order.submit', { orderId: other.id }, as)).status, 'submitted');
 const events = (await h.api(`/api/barrow/audit?orderId=${other.id}`)).events;
 assert.ok(events.some(event => event.action === 'order.stock-exception' && /Counted the shelf by hand/.test(event.reason)));
 // Approval reserves at live Pier stock, from the promised warehouse total.
 assert.equal((await h.command('order.approve', { orderId: other.id })).status, 'approved');

 // Interrupted sync: with Pier unreachable nothing is promised and no draft can be prepared.
 const cut = await installation({ bindings: { PIER_ORIGIN: 'http://127.0.0.1:9', PIER_SESSION: 'pier=offline' } }); t.after(() => cut.close());
 await cut.command('account.save', { id: 'cedar', value: { ...accountValue(customer.id), minimumCents: 0 } });
 assert.equal((await cut.api('/api/barrow/catalogue?accountId=cedar', undefined, { status: 503 })).error.code, 'PIER_UNAVAILABLE');
 assert.equal((await cut.command('order.prepare', { accountId: 'cedar', lines: [{ sku: 'OAT-1', quantity: 1 }] }, { status: 503 })).error.code, 'PIER_UNAVAILABLE');
});

test('scheduled stock synchronization resumes an interrupted ACK, sends one requested private notice on replay, and retains an owned persistent exception',async t=>{
 const {syncFixture}=await import('./stock-sync-fixture.mjs');
 const f=await syncFixture(t),{h,buyer}=f;
 await f.ready();
 await h.command('stock.watch',{accountId:f.account.id,sku:'OAT-1'},buyer);
 assert.equal((await f.read()).notices.length,0);
 const before=(await h.api('/api/barrow/stock-sync')).sync;
 await f.restock();f.interruptAck();
 const interrupted=await f.sync();assert.equal(interrupted.checkpoint,before.checkpoint);assert.equal(interrupted.completed_at,before.completed_at);assert.ok(interrupted.pending);assert.equal((await f.read()).notices.length,1);
 const replay1=await f.pier.api('/api/pier/stock-changes?'+new URLSearchParams({consumer:interrupted.consumer,limit:'2',checkpoint:interrupted.checkpoint}));
 const replay2=await f.pier.api('/api/pier/stock-changes?'+new URLSearchParams({consumer:interrupted.consumer,limit:'2',checkpoint:interrupted.checkpoint}));
 assert.deepEqual(replay1.events.map(row=>row.eventId),replay2.events.map(row=>row.eventId));
 const resumed=await f.sync();assert.equal(resumed.failures,0);assert.equal(resumed.completed_at,resumed.observed_at);assert.ok(resumed.completed_at);assert.equal(resumed.pending,null);assert.equal(resumed.has_more,0);assert.equal((await f.read()).notices.length,1);
 assert.equal((await f.read()).watches[0].active,0);
 await h.command('stock.watch',{accountId:f.account.id,sku:'OAT-1',kind:'prebook'},buyer);
 const at=Date.now();
 await h.command('stock.window',{sku:'OAT-1',opensAt:new Date(at+3600000).toISOString(),closesAt:new Date(at+7200000).toISOString(),reason:'Owner scheduled the next prebook notice window.'});
 await f.sync();assert.equal((await f.read()).notices.filter(row=>row.kind==='prebook').length,0);
 await h.command('stock.window',{sku:'OAT-1',opensAt:new Date(at-3600000).toISOString(),closesAt:new Date(at+3600000).toISOString(),reason:'Owner opened the current prebook window.'});
 await f.sync();await f.sync();assert.equal((await f.read()).notices.filter(row=>row.kind==='prebook').length,1);
 await h.command('stock.sync',{}, {...buyer,status:403});
 const other={as:await h.signIn('synthetic-barrow-902@example.test')};
 await h.api('/api/barrow/stock-watches?accountId='+f.account.id,undefined,{...other,status:404});
 f.failure(true);for(let n=0;n<3;n++)await f.sync();
 const failed=(await h.api('/api/barrow/stock-sync')).sync;assert.equal(failed.task_status,'open');assert.equal(failed.task_owner,(await h.api('/api/barrow/state')).actor.id);
 f.failure(false);const recovered=await f.sync();assert.equal(recovered.task_status,'open');assert.equal(recovered.task_owner,failed.task_owner);
 const closed=await h.command('stock.sync-resolve',{reason:'Owner reconnected Pier and checked the completed reconciliation.'});assert.equal(closed.sync.task_status,'closed');assert.ok(closed.sync.resolution);
 const restarted=await h.command('stock.sync-reset',{confirm:'RESET',reason:'Owner renewed the native Pier session and requested complete reconciliation.'});assert.notEqual(restarted.sync.consumer,closed.sync.consumer);assert.equal(restarted.sync.checkpoint,null);await f.sync();assert.equal((await f.read()).notices.length,2);
 const {archive,restore}=await import('./harness.mjs');
 await h.command('stock.watch',{accountId:f.account.id,sku:'OAT-1',kind:'prebook'},buyer);
 const snapshot=await archive(h),restored=await installation({bindings:{PIER_ORIGIN:f.pier.origin,PIER_SESSION:f.pier.cookie}});t.after(()=>restored.close());
 await restore(restored,snapshot);const restoredSync=(await restored.api('/api/barrow/stock-sync')).sync;assert.equal(restoredSync.enabled,0);const enabled=await restored.command('stock.sync-settings',{enabled:true,pageSize:2});assert.notEqual(enabled.sync.consumer,restoredSync.consumer);assert.equal(enabled.sync.checkpoint,null);assert.ok((await restored.api('/api/barrow/export.json')).stockwatches.every(row=>row.active===0));
 await h.command('account.erase',{accountId:f.account.id,confirm:'ERASE'});let exported=await h.api('/api/barrow/export.json');assert.equal(exported.stockwatches.length,0);assert.equal(exported.stocknotices.length,0);
 const rewound=await installation({bindings:{PIER_ORIGIN:f.pier.origin,PIER_SESSION:f.pier.cookie}});t.after(()=>rewound.close());await restore(rewound,snapshot);exported=await rewound.api('/api/barrow/export.json');assert.equal(exported.stockwatches.length,0);assert.equal(exported.stocknotices.length,0);
});

test('seasonal prebooks bind published windows, live incoming capacity and exact deposits; closing, release and delayed commitments reconcile without booking twice',async t=>{
 const {prebookFixture}=await import('./prebook-fixture.mjs');
 const {h,pier,product,po,account,buyer,publication,publish,input,prepare,submit,accept,deposit}=await prebookFixture(t);
 await h.command('account.save',{id:account.id,revision:account.revision,value:{...account.value,assignedRep:'Season rep'}});
 await h.command('commission.settings',{revision:null,rules:[{id:'season-commission',rep:'Season rep',from:'2027-01-01',rateBps:1000,basis:'acceptance',splits:[{rep:'Season rep',shareBps:10000}]}],reason:'Supplier approved the original seasonal commission.'});
 await h.command('credit-policy.save',{accountId:'cedar',revision:null,currency:'USD',limitCents:70000,termsDays:30,reason:'Finance approves the complete seasonal commitment once.'});
 await publish();
 const current=await h.api('/api/barrow/prebook-seasons?accountId=cedar',undefined,buyer);assert.equal(current.seasons[0].depositBps,3000);assert.deepEqual(current.seasons[0].windows,publication.windows);
 const draft=await prepare();assert.equal(draft.season,'Spring 2027');assert.equal(draft.totalCents,70000);assert.equal(draft.prebook.depositCents,21000);assert.equal(draft.prebook.currency,'USD');
 assert.deepEqual(draft.lines.map(line=>[line.sku,line.quantity,line.requestedDate,line.cancelAfter]),[['OAT-1',8,'2027-03-05','2027-03-20'],['RYE-1',6,'2027-03-10','2027-03-30']]);
 assert.deepEqual(draft.prebook.supply.filter(row=>row.sku==='OAT-1').map(row=>[row.date,row.quantity,row.warehouse,row.sourceId]),[['2027-03-01','30','New York',po.id]]);
 let order=await accept(await submit(draft));assert.equal(order.status,'approved');assert.equal(order.pierOrderId,undefined);assert.equal(order.invoice,undefined);assert.equal((await pier.api('/api/pier/state')).orders.length,0);
 assert.equal((await h.api('/api/barrow/account-credit?accountId=cedar')).exposureCents,70000);
 const confirmationPath='/api/barrow/orders/'+order.id+'/confirmations';const confirmation=(await h.api(confirmationPath,undefined,buyer)).confirmations.at(-1);assert.deepEqual(confirmation.snapshot.prebook,{seasonId:publication.id,depositCents:21000,currency:'USD'});
 const pdf=Buffer.from(await (await h.request(confirmationPath+'/'+confirmation.number+'.pdf',buyer)).arrayBuffer()).toString();assert.ok(pdf.includes('Prebook deposit requirement: USD 210.00'));
 assert.deepEqual((await h.api('/api/barrow/reports/commissions')).rows,[]);
 const changedAccount=await h.api('/api/barrow/accounts/by-id/cedar');await h.command('account.save',{id:'cedar',revision:changedAccount.revision,value:{...changedAccount.value,assignedRep:'New rep',prices:[{sku:'OAT-1',unitCents:9999,minQty:1},{sku:'RYE-1',unitCents:4000,minQty:1}]}});
 const pay=await deposit(order);assert.equal(pay.amountCents,21000);assert.equal(pay.state,'captured');assert.equal((await h.api('/api/barrow/statements/cedar?to=2027-12-31')).sections[0].receivedCents,21000);
 await h.command('card.capture',{paymentId:pay.id,reason:'Repeat capture after a lost confirmation.'});assert.equal((await h.api('/api/barrow/payments?orderId='+order.id,undefined,buyer)).payments.length,1);
 assert.equal((await h.command('prebook.release',{orderId:order.id,windowId:'first',revision:order.revision,reason:'Captured deposit does not bypass open intake.'},{status:409})).error.code,'SEASON_OPEN');
 const closed=await h.command('prebook.close',{id:publication.id,revision:current.revision,reason:'Spring intake complete.'});assert.equal(closed.seasons[0].state,'closed');
 assert.equal((await h.command('order.prepare',input,{...buyer,status:409})).error.code,'SEASON_CLOSED');
 const stored=await h.api('/api/barrow/orders/'+order.id,undefined,buyer);assert.equal(stored.prebook.depositCents,21000);
 const report=await h.api('/api/barrow/reports/fulfillment?accountId=cedar');assert.deepEqual(report.prebooks.map(row=>[row.sku,row.committed,row.released,row.outstanding]),[['OAT-1','8','0','8'],['RYE-1','6','0','6']]);
 // A received PO feeds the first release; Pier remains the only allocator.
 await pier.command('receipt.create',{poId:po.id,supplierReference:'Spring first delivery',lines:[{poLineId:po.lines[0].id,locationId:product.location.id,quantity:'12',cost:'20.00'}]});
 const currentCredit=await h.api('/api/barrow/account-credit?accountId=cedar');await h.command('credit-policy.save',{accountId:'cedar',revision:currentCredit.revision,currency:'USD',limitCents:80000,termsDays:30,reason:'Finance extends the current limit before fulfillment without changing the commitment.'});
 const released=await h.command('prebook.release',{orderId:order.id,windowId:'first',revision:order.revision,reason:'First promised shipment is ready.'});
 assert.equal((await h.api('/api/barrow/account-credit?accountId=cedar')).exposureCents,70000);
 assert.equal(released.releaseId,order.id+'-W1');assert.equal((await h.command('prebook.release',{orderId:order.id,windowId:'first',revision:order.revision,reason:'Retry after lost response.'})).releaseId,released.releaseId);
 await pier.command('location.save',{name:'Other receiving shelf',warehouse:'Newark',kind:'bin'});
 const route=async warehouses=>{let rule=await pier.command('routing.save',{source:'manual',mode:'rules',shortage:'split',zones:[],defaultEligible:warehouses});rule=await pier.command('routing.preview',{ruleId:rule.id,version:rule.version});await pier.command('routing.activate',{ruleId:rule.id,version:rule.version})};
 await route(['New York','Newark']);assert.equal((await h.command('order.approve',{orderId:released.releaseId},{status:409})).error.code,'PREBOOK_WAREHOUSE');assert.equal((await pier.api('/api/pier/state')).orders.length,0);
 await route(['New York']);
 const child=await h.command('order.approve',{orderId:released.releaseId});assert.equal(child.status,'approved');assert.equal(child.totalCents,52000);assert.equal(child.prebookRelease.orderId,order.id);assert.equal(child.prebookRelease.windowId,'first');assert.deepEqual(child.lines.map(line=>[line.sku,line.quantity]),[['OAT-1',8]]);
 const parentTrace=await h.api('/api/barrow/orders/'+order.id+'/followthrough'),releaseTrace=await h.api('/api/barrow/orders/'+child.id+'/followthrough');assert.deepEqual(parentTrace.linked.map(row=>[row.id,row.acknowledgment,row.invoice.number]),[[child.id,child.pierOrderId,child.invoice.number]]);assert.equal(parentTrace.payments[0].id,pay.id);assert.equal(releaseTrace.linked[0].id,order.id);assert.equal(releaseTrace.stock.lines[0].ordered,'8');assert.equal(parentTrace.job,'unresolved');
 assert.equal((await h.api('/api/barrow/account-credit?accountId=cedar')).exposureCents,70000);
 assert.equal((await pier.api('/api/pier/state')).orders.length,1);assert.deepEqual((await h.api('/api/barrow/reports/commissions')).rows.map(row=>[row.orderId,row.rep,row.grossCents,row.netCents]),[[child.id,'Season rep',5200,5200]]);
 order=(await h.command('prebook.delay',{orderId:order.id,windowId:'second',revision:released.order.revision,estimatedDate:'2027-03-15',reason:'Source supplier delayed the rye style.'})).order;
 assert.equal((await h.api('/api/barrow/orders/'+order.id+'/followthrough')).windows.find(row=>row.id==='second').promisedDate,'2027-03-15');
 const after=await h.api('/api/barrow/reports/fulfillment?accountId=cedar');assert.deepEqual(after.prebooks.map(row=>[row.sku,row.committed,row.released,row.outstanding,row.backordered]),[['OAT-1','8','8','0',false],['RYE-1','6','0','6',true]]);
 assert.deepEqual(after.prebooks[1].history.map(row=>[row.from,row.to,row.reason]),[['2027-03-10','2027-03-15','Source supplier delayed the rye style.']]);
 assert.deepEqual((await h.api(confirmationPath,undefined,buyer)).confirmations.at(-1),confirmation);
 const buyerOrder=await h.api('/api/barrow/orders/'+order.id,undefined,buyer);assert.equal(buyerOrder.prebook.windows[1].estimatedDate,'2027-03-15');assert.equal(buyerOrder.prebook.windows[0].releaseId,child.id);
 const sales=await h.api('/api/barrow/reports/sales?from=2027-01-01&to=2027-12-31');assert.deepEqual(sales.rows.map(row=>[row.bookingType,row.season,row.windowId,row.bookedCents]),[['prebook','Spring 2027','first',52000],['prebook','Spring 2027','second',18000],['prebook-release','Spring 2027','first',0]]);assert.equal(sales.totals[0].bookedCents,70000);assert.equal(sales.totals[0].invoicedCents,52000);
 assert.equal((await h.request('/api/barrow/reports/sales.csv?from=2027-01-01&to=2027-12-31')).status,200);
 const events=(await h.api('/api/barrow/audit?limit=200')).events.filter(event=>event.action.startsWith('prebook.'));assert.deepEqual(events.map(event=>event.action).sort(),['prebook.close','prebook.delay','prebook.publish','prebook.release','prebook.release-created']);
 for(const event of events){assert.equal(event.actorKind,'human');assert.equal(event.actorId,(await h.api('/api/barrow/state')).actor.id);assert.ok(event.revision);assert.ok(event.source);assert.ok(event.createdAt);assert.ok(event.reason)}
 const scoped=(await h.api('/api/barrow/audit?orderId='+order.id+'&limit=200')).events.filter(event=>event.action.startsWith('prebook.'));assert.deepEqual(scoped.map(event=>event.action).sort(),['prebook.delay','prebook.release']);
 const auditCsv=await (await h.request('/api/barrow/audit.csv?orderId='+order.id)).text();for(const event of scoped)assert.ok(auditCsv.includes(event.id));
});

test('seasonal admissions refuse closed dates, insufficient or changed source capacity, wrong currency and warehouses, stale observations and invalid windows',async t=>{
 const {prebookFixture}=await import('./prebook-fixture.mjs');
 const {h,pier,product,po,account,buyer,publication,publish,input,prepare,submit,day}=await prebookFixture(t);
 await publish();
 const command=(extra,status=409)=>h.command('order.prepare',{...input,...extra},{...buyer,status});
 await day('2027-02-28T23:59:59Z');assert.equal((await command({})).error.code,'SEASON_CLOSED');
 await day('2027-03-01T00:00:00Z');assert.equal((await prepare({reference:'Opening instant'})).prebook.season.id,publication.id);
 await day('2027-03-06T00:00:00Z');assert.equal((await command({})).error.code,'SEASON_CLOSED');await day('2027-03-05T15:00:00Z');
 assert.equal((await command({lines:[{sku:'OAT-1',quantity:1}],prebook:{seasonId:publication.id,windowIds:['first']}})).error.code,'MINIMUM');
 assert.equal((await command({prebook:{seasonId:publication.id,windowIds:['missing','second']}},400)).error.code,'PREBOOK_WINDOW');
 const late=await pier.command('po.draft',{supplierId:product.supplier.id,promiseDate:'2027-03-25',destinationWarehouse:'New York',reason:'Later supply cannot cover an earlier spring promise.',lines:[{itemId:product.item.id,quantity:'10',price:'20.00'}]});await pier.command('po.approve',{poId:late.id,version:late.version});await pier.command('po.commit',{poId:late.id,version:late.version});
 assert.equal((await command({lines:[{sku:'OAT-1',quantity:31},{sku:'RYE-1',quantity:6}]})).error.code,'PREBOOK_CAPACITY');
 const draft=await prepare();await submit(draft);
 assert.equal((await command({lines:[{sku:'OAT-1',quantity:23},{sku:'RYE-1',quantity:6}]})).error.code,'PREBOOK_CAPACITY');
 // Ordinary immediate orders still cannot sell unreceived incoming supply.
 assert.equal((await command({prebook:undefined})).error.code,'STOCK');
 const stale=await prepare({reference:'STALE'});
 const old={...stale,preparedAt:'2027-03-05T14:00:00Z'};
 await h.db.prepare('UPDATE bw_orders SET value_json=? WHERE id=?').bind(JSON.stringify(old),stale.id).run();
 await h.command('settings.save',{stockFreshnessMinutes:15});assert.equal((await h.command('order.submit',{orderId:stale.id},{...buyer,status:409})).error.code,'STOCK_STALE');
 // A valid incoming PO in another warehouse never covers this account's commitment.
 const restricted=await h.command('account.save',{id:account.id,revision:account.revision,value:{...account.value,warehouses:['Newark']}});
 assert.equal((await command({})).error.code,'PREBOOK_CAPACITY');
 const unrestricted=await h.command('account.save',{id:account.id,revision:restricted.revision,value:account.value});
 // Live supplier revision, rather than the old draft observation, controls admission.
 const unsubmitted=await prepare({reference:'CAPACITY-CHANGED'});
 await pier.command('receipt.create',{poId:po.id,supplierReference:'Incoming fully received',lines:[{poLineId:po.lines[0].id,locationId:product.location.id,quantity:'30',cost:'20.00'}]});
 assert.equal((await h.command('order.submit',{orderId:unsubmitted.id},{...buyer,status:409})).error.code,'PREBOOK_CAPACITY');
 // Currency and warehouse admission use current account configuration, never relabeled amounts.
 let updated=await h.command('account.save',{id:account.id,revision:unrestricted.revision,value:{...account.value,currency:'CAD'}});
 assert.equal((await command({})).error.code,'PREBOOK_CURRENCY');
 updated=await h.command('account.save',{id:account.id,revision:updated.revision,value:account.value});
 const publicationState=await h.api('/api/barrow/prebook-seasons');
 await h.command('prebook.publish',{...publication,id:'future-intake',opensAt:'2027-03-06T00:00:00Z',closesAt:'2027-03-07T00:00:00Z',windows:[{id:'later',name:'Later',shipDate:'2027-03-10',cancelAfter:'2027-03-30'}],revision:publicationState.revision});
 assert.equal((await command({prebook:{seasonId:'future-intake',windowIds:['later','later']}})).error.code,'SEASON_CLOSED');
 await h.command('prebook.publish',{...publication,id:'expired-intake',opensAt:'2027-03-01T00:00:00Z',closesAt:'2027-03-04T00:00:00Z',revision:(await h.api('/api/barrow/prebook-seasons')).revision});
 assert.equal((await command({prebook:{seasonId:'expired-intake',windowIds:['first','second']}})).error.code,'SEASON_CLOSED');
});

test('seasonal authority, deposit gates, promise bounds and restore fences preserve original commitments and refuse replayed effects',async t=>{
 const {prebookFixture}=await import('./prebook-fixture.mjs');
 const {h,pier,edge,account,buyer,publication,publish,input,prepare,submit,accept,deposit,day}=await prebookFixture(t);
 const {activateStaff,archive,restore}=await import('./harness.mjs');
 await h.command('prebook.publish',{...publication,revision:null},{...buyer,status:403});await publish();
 const agent=await h.api('/api/barrow/agent-token',{}),credential={as:'',headers:{authorization:`Bearer ${agent.token}`}};
 await h.api('/api/barrow/prebook-seasons',undefined,{...credential,status:403});
 const draft=await prepare();await h.command('prebook.release',{orderId:draft.id,windowId:'first',revision:draft.revision,reason:'Unaccepted commitment cannot release.'},{status:409});
 let order=await accept(await submit(draft));
 const transition={orderId:order.id,windowId:'first',revision:order.revision,reason:'Reviewed window release.'};
 assert.equal((await h.command('prebook.release',transition,{...buyer,status:403})).error.code,'FORBIDDEN');
 await h.command('prebook.release',transition,{...credential,status:403});
 assert.equal((await h.command('prebook.release',transition,{status:409})).error.code,'SEASON_OPEN');
 await h.command('prebook.close',{id:publication.id,revision:(await h.api('/api/barrow/prebook-seasons')).revision,reason:'Intake finished before fulfillment starts.'});
 assert.equal((await h.command('prebook.release',transition,{status:409})).error.code,'PREBOOK_DEPOSIT');
 await day('2027-03-21T15:00:00Z');assert.equal((await h.command('prebook.release',transition,{status:409})).error.code,'PREBOOK_DATE');await day('2027-03-05T15:00:00Z');
 assert.equal((await h.command('prebook.release',{...transition,windowId:'second'},{status:409})).error.code,'PREBOOK_DATE');
 assert.equal((await h.command('prebook.delay',{...transition,estimatedDate:'2027-03-21'},{status:409})).error.code,'PREBOOK_DATE');
 const ops=await activateStaff(h,'synthetic-barrow-701'+'@example.test',{role:'operations',accounts:[account.id],warehouses:'all',reports:['fulfillment'],discountLimitCents:0,stockExceptionLimitCents:0});
 await h.command('prebook.publish',{...publication,id:'forbidden',revision:(await h.api('/api/barrow/prebook-seasons')).revision},{...ops.who,status:403});
 const rep=await activateStaff(h,'synthetic-barrow-702'+'@example.test',{role:'rep',accounts:[account.id],warehouses:'all',reports:['sales'],discountLimitCents:0,stockExceptionLimitCents:0,commissionRep:'Rep'});
 await h.command('prebook.release',transition,{...rep.who,status:403});
 const captured=await deposit(order);assert.equal(captured.amountCents,21000);assert.equal(edge.captures,1);
 await edge.event(h,captured);await edge.event(h,captured);assert.equal((await h.api('/api/barrow/statements/cedar?to=2027-12-31')).sections[0].receivedCents,21000);
 const released=await h.command('prebook.release',transition,ops.who);assert.equal(released.releaseId,order.id+'-W1');
 const revoked=await h.command('staff.revoke',{userId:ops.grant.userId,revision:ops.grant.revision,reason:'Owner ended seasonal fulfillment access.'});
 await h.command('prebook.delay',{orderId:order.id,windowId:'second',revision:released.order.revision,estimatedDate:'2027-03-15',reason:'Revoked staff must not revise.'},{...ops.who,status:404});
 await h.api('/api/barrow/agent-token/revoke',{});await h.api('/api/barrow/orders/'+order.id,undefined,{...credential,status:401});
 const copy=await archive(h),target=await installation({bindings:{PIER_ORIGIN:pier.origin,PIER_SESSION:pier.cookie}});t.after(()=>target.close());await restore(target,copy);
 const preserved=await target.api('/api/barrow/orders/'+order.id);assert.equal(preserved.prebook.depositCents,21000);assert.equal(preserved.prebook.windows[0].releaseId,released.releaseId);assert.equal((await target.api('/api/barrow/prebook-seasons')).seasons[0].state,'closed');
 assert.equal((await target.command('prebook.release',{...transition,revision:preserved.revision},{status:409})).error.code,'RESTORED');
 assert.equal((await target.command('order.approve',{orderId:released.releaseId},{status:409})).error.code,'RESTORED');
 assert.equal(edge.captures,1);
 const successor='synthetic-barrow-703'+'@example.test';
 await h.command('company.invite',{accountId:'cedar',email:successor,name:'Successor administrator',policy:{rights:['administrator'],locations:'all',perOrderLimitCents:null,approvalLimitCents:null},reason:'Company retained an administrator before purchaser erasure.'});
 const invitation=h.mail.requests.findLast(row=>row.message.subject==='Your company buyer invitation'&&row.message.to.includes(successor)).message,link=new URL(invitation.text.match(/https?:\/\/[^\s<>]+\/app\?[^\s<>]+/)[0]);
 await h.command('company.accept',{invitationId:link.searchParams.get('companyInvitation'),token:link.searchParams.get('companyToken')},{as:await h.signIn(successor,'existing')});
 const member=(await h.api('/api/barrow/company/members?accountId=cedar')).members.find(row=>row.email===account.value.email);
 await h.command('company.erase',{memberId:member.id,revision:member.revision,confirm:'ERASE',reason:'Owner reviewed erasure of this company purchaser.'});
 await h.api('/api/barrow/orders/'+order.id,undefined,{...buyer,status:401});
 await edge.event(h,captured);assert.equal(edge.captures,1);
 const rewound=await installation();t.after(()=>rewound.close());await restore(rewound,copy);
 // The complete independent journal reapplies user redaction before serving an older archive.
 const erasedMember=(await rewound.api('/api/barrow/company/members?accountId=cedar')).members.find(row=>row.userId===member.userId);assert.equal(erasedMember.state,'removed');assert.ok(erasedMember.erasedAt);assert.notEqual(erasedMember.email,account.value.email);
 await rewound.api('/api/barrow/orders/'+order.id,undefined,{...buyer,status:401});assert.equal((await rewound.api('/api/barrow/orders/'+order.id)).prebook.depositCents,21000);
});
