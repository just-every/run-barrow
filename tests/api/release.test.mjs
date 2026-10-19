import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { installation, stock, accountValue } from './harness.mjs';

test('STK-004: a cancelled allocated order releases once in real Pier, stays unpromised until acknowledged, and shipped orders refuse', async t => {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 const products = await stock(pier, '24');
 const releases = []; let discard = true;
 // Network fault only: the authoritative Pier Worker executes every release; the first acknowledgment is lost.
 const proxy = createServer(async (request, response) => {
  try {
   const chunks = []; for await (const chunk of request) chunks.push(chunk);
   const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
   const upstream = await pier.request(request.url, { method: request.method, ...(body ? { body } : {}) });
   const bytes = Buffer.from(await upstream.arrayBuffer());
   if (body?.type === 'order.cancel') {
    releases.push(body.commandId);
    if (discard) { discard = false; assert.ok(upstream.ok); response.destroy(); return; }
   }
   response.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'application/json' }); response.end(bytes);
  } catch (error) { response.destroy(error); }
 });
 proxy.listen(0, '127.0.0.1'); await once(proxy, 'listening');
 t.after(async () => { proxy.closeAllConnections(); await new Promise(resolve => proxy.close(resolve)); });
 const h = await installation({ bindings: { PIER_ORIGIN: `http://127.0.0.1:${proxy.address().port}`, PIER_SESSION: pier.cookie } }); t.after(() => h.close());
 await h.command('account.save', { id: 'cedar', value: accountValue(products.customer.id) });
 const birch = await pier.command('party.save', { name: 'Birch Lane Grocer', kind: 'customer' });
 await h.command('account.save', { id: 'birch', value: { ...accountValue(birch.id, 'other@example.test'), name: 'Birch Lane Grocer' } });
 const buyer = await h.signIn('buyer@example.test'), other = await h.signIn('other@example.test');
 const promiseable = async (as = other, accountId = 'birch') => (await h.api(`/api/barrow/catalogue?accountId=${accountId}`, undefined, { as })).items.find(item => item.sku === 'OAT-1');
 const place = async quantity => {
  const draft = await h.command('order.prepare', { accountId: 'cedar', lines: [{ sku: 'OAT-1', quantity }] }, { as: buyer });
  await h.command('order.submit', { orderId: draft.id }, { as: buyer });
  return h.command('order.approve', { orderId: draft.id });
 };
 const allocated = await place(5);
 assert.equal(allocated.status, 'approved'); assert.equal((await promiseable()).available, '19');

 // Only a supplier person may cancel, only orders that hold Pier stock, and every cancellation names a reason.
 assert.equal((await h.command('order.cancel', { orderId: allocated.id, reason: 'Buyer called' }, { as: buyer, status: 403 })).error.code, 'FORBIDDEN');
 assert.equal((await h.command('order.cancel', { orderId: allocated.id }, { status: 400 })).error.code, 'INPUT');
 const draft = await h.command('order.prepare', { accountId: 'cedar', lines: [{ sku: 'OAT-1', quantity: 2 }] }, { as: buyer });
 assert.equal((await h.command('order.cancel', { orderId: draft.id, reason: 'Not needed' }, { status: 409 })).error.code, 'CANCEL');
 assert.deepEqual(releases, []);

 // The release response is lost after Pier executes it: Barrow keeps the exception and holds the units out of promise.
 const lost = await h.command('order.cancel', { orderId: allocated.id, reason: 'Store closed for renovation' }, { status: 503 });
 assert.equal(lost.error.code, 'PIER_UNAVAILABLE');
 const upstreamOrder = () => pier.api('/api/pier/state').then(state => state.orders.find(order => order.id === allocated.pierOrderId));
 const executed = await upstreamOrder();
 assert.equal(executed.lines[0].cancelled, '5'); assert.equal(executed.lines[0].reserved, '0');
 let pending = (await h.api('/api/barrow/state')).orders.find(order => order.id === allocated.id);
 assert.equal(pending.status, 'releasing'); assert.equal(pending.release.confirmedAt, undefined);
 assert.deepEqual(pending.release.held, [{ itemId: allocated.lines[0].itemId, quantity: '5' }]);
 assert.equal(pending.release.reason, 'Store closed for renovation');
 assert.equal((await h.request(`/api/barrow/invoices/${allocated.id}.csv`, { as: buyer })).status, 409);
 const held = await promiseable();
 assert.equal(held.available, '19'); assert.equal(held.awaitingRelease, '5');
 assert.equal((await promiseable(buyer, 'cedar')).available, '19');

 // Repeating the cancel reuses the one release identity; Pier replays its outcome and releases nothing twice.
 const confirmed = await h.command('order.cancel', { orderId: allocated.id, reason: 'A different reason is ignored on retry' });
 assert.equal(confirmed.status, 'cancelled'); assert.ok(confirmed.release.confirmedAt);
 assert.equal(confirmed.release.reason, 'Store closed for renovation');
 assert.deepEqual(confirmed.release.lines.map(({ quantity, dispatched, cancelled, reserved }) => ({ quantity, dispatched, cancelled, reserved })), [{ quantity: '5', dispatched: '0', cancelled: '5', reserved: '0' }]);
 assert.deepEqual(releases, [`barrow-release-${allocated.id}`, `barrow-release-${allocated.id}`]);
 assert.deepEqual(await upstreamOrder(), executed);
 assert.deepEqual(await h.command('order.cancel', { orderId: allocated.id, reason: 'again' }), confirmed);
 assert.equal(releases.length, 2);
 const freed = await promiseable();
 assert.equal(freed.available, '24'); assert.equal(freed.awaitingRelease, undefined);
 assert.equal((await h.request(`/api/barrow/invoices/${allocated.id}.csv`, { as: buyer })).status, 409);
 const seen = (await h.api('/api/barrow/state', undefined, { as: buyer })).orders.find(order => order.id === allocated.id);
 assert.equal(seen.status, 'cancelled');
 assert.equal((await h.api('/api/barrow/state', undefined, { as: other })).orders.some(order => order.id === allocated.id), false);
 const trail = (await h.api(`/api/barrow/audit?orderId=${allocated.id}`)).events.map(event => event.action);
 assert.ok(trail.includes('order.release-requested') && trail.includes('order.released'));

 // A Pier-side refresh confirms an executed release without sending another command.
 const second = await place(4);
 discard = true;
 await h.command('order.cancel', { orderId: second.id, reason: 'Duplicate order' }, { status: 503 });
 assert.equal((await promiseable()).available, '20');
 const refreshed = await h.command('order.refresh', { orderId: second.id });
 assert.equal(refreshed.status, 'cancelled'); assert.equal(releases.length, 3);
 assert.equal((await promiseable()).available, '24');

 // Shipped units are never cancelled: a dispatched order refuses before any release is sent.
 const shipped = await place(3);
 const pierOrder = (await pier.api('/api/pier/state')).orders.find(order => order.id === shipped.pierOrderId);
 await pier.command('dispatch.create', { orderId: pierOrder.id, shipmentReference: 'SHIP-1', lines: [{ orderLineId: pierOrder.lines[0].id, quantity: '1' }] });
 assert.equal((await h.command('order.cancel', { orderId: shipped.id, reason: 'Too late' }, { status: 409 })).error.code, 'SHIPPED');
 assert.equal((await h.api('/api/barrow/state')).orders.find(order => order.id === shipped.id).status, 'approved');
 assert.equal(releases.length, 3);
});
