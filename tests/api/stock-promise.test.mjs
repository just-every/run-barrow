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
 const interrupted=await f.sync();assert.equal(interrupted.checkpoint,before.checkpoint);assert.ok(interrupted.pending);assert.equal((await f.read()).notices.length,1);
 const replay1=await f.pier.api('/api/pier/stock-changes?'+new URLSearchParams({consumer:interrupted.consumer,limit:'2',checkpoint:interrupted.checkpoint}));
 const replay2=await f.pier.api('/api/pier/stock-changes?'+new URLSearchParams({consumer:interrupted.consumer,limit:'2',checkpoint:interrupted.checkpoint}));
 assert.deepEqual(replay1.events.map(row=>row.eventId),replay2.events.map(row=>row.eventId));
 const resumed=await f.sync();assert.equal(resumed.failures,0);assert.equal(resumed.pending,null);assert.equal(resumed.has_more,0);assert.equal((await f.read()).notices.length,1);
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
});
