import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { installation, stock, accountValue, archive, restore } from './harness.mjs';

test('STK-003 / ACC-004: lost acknowledgment remains pending, retries reconcile one real Pier order, destination changes refuse', async t => {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 const products = await stock(pier);
 const identities = []; let discard = true;
 // Network fault only: the authoritative Pier Worker executes every request for real.
 const proxy = createServer(async (request, response) => {
  try {
   const chunks = []; for await (const chunk of request) chunks.push(chunk);
   const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
   const upstream = await pier.request(request.url, { method: request.method, ...(body ? { body } : {}) });
   const bytes = Buffer.from(await upstream.arrayBuffer());
   if (body?.type === 'order.create') {
    identities.push(body.commandId);
    if (discard) { discard = false; assert.ok(upstream.ok); response.destroy(); return; }
   }
   response.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'application/json' }); response.end(bytes);
  } catch (error) { response.destroy(error); }
 });
 proxy.listen(0, '127.0.0.1'); await once(proxy, 'listening');
 t.after(async () => { proxy.closeAllConnections(); await new Promise(resolve => proxy.close(resolve)); });
 const origin = `http://127.0.0.1:${proxy.address().port}`;
 const h = await installation({ bindings: { PIER_ORIGIN: origin, PIER_SESSION: pier.cookie } }); t.after(() => h.close());
 const account = await h.command('account.save', { id: 'cedar', value: accountValue(products.customer.id) });
 const buyer = await h.signIn('buyer@example.test');
 const draft = await h.command('order.prepare', { accountId: 'cedar', lines: [{ sku: 'OAT-1', quantity: 3 }] }, { as: buyer });
 await h.command('order.submit', { orderId: draft.id }, { as: buyer });
 const lost = await h.command('order.approve', { orderId: draft.id }, { status: 503 }); assert.equal(lost.error.code, 'PIER_UNAVAILABLE');
 const pending = (await h.api('/api/barrow/state')).orders.find(order => order.id === draft.id);
 assert.equal(pending.status, 'reserving'); assert.equal(pending.pierOrderId, undefined); assert.equal(pending.invoice, undefined);
 assert.equal((await h.request(`/api/barrow/invoices/${draft.id}.csv`, { as: buyer })).status, 409);
 const upstreamBefore = (await pier.api('/api/pier/state')).orders; assert.equal(upstreamBefore.length, 1);
 await h.command('account.save', { id: account.id, revision: account.revision, value: { ...account.value, lifecycle: 'closed' } });
 const accepted = await h.command('order.approve', { orderId: draft.id });
 assert.equal(accepted.status, 'approved'); assert.equal(accepted.pierOrderId, upstreamBefore[0].id); assert.equal(accepted.pierReference, upstreamBefore[0].reference);
 assert.deepEqual(identities, [identities[0], identities[0]]); assert.ok(identities[0]);
 await h.command('order.approve', { orderId: draft.id });
 const upstreamAfter = (await pier.api('/api/pier/state')).orders; assert.deepEqual(upstreamAfter, upstreamBefore);
 const retained = (await h.api('/api/barrow/state', undefined, { as: buyer })).orders.find(order => order.id === draft.id);
 assert.equal(retained.pierOrderId, upstreamBefore[0].id); assert.equal(retained.status, 'approved');
 // Restoring the same commercial record with a different configured origin cannot hand it off again.
 const moved = await installation({ bindings: { PIER_ORIGIN: pier.origin, PIER_SESSION: pier.cookie } }); t.after(() => moved.close());
 await restore(moved, await archive(h));
 const refused = await moved.command('order.approve', { orderId: draft.id }, { status: 409 }); assert.equal(refused.error.code, 'PIER_CHANGED');
 assert.deepEqual((await pier.api('/api/pier/state')).orders, upstreamBefore);
 assert.equal((await moved.api('/api/barrow/state')).orders.find(order => order.id === draft.id).pierOrderId, accepted.pierOrderId);
});
