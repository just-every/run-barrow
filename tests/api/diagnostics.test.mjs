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
