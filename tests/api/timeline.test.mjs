import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { installation, stock, accountValue } from './harness.mjs';

test('ORD-012: the buyer timeline shows recorded Barrow and real Pier events, split shipments and a return, never infers delivery, and is account-scoped', async t => {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 const products = await stock(pier, '40');
 let down = false;
 // Network fault only: while down, Pier's state read fails; otherwise the real Worker answers.
 const proxy = createServer(async (request, response) => {
  try {
   const chunks = []; for await (const chunk of request) chunks.push(chunk);
   const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
   if (down && request.url === '/api/pier/state') { response.destroy(); return; }
   const upstream = await pier.request(request.url, { method: request.method, ...(body ? { body } : {}) });
   response.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'application/json' }); response.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) { response.destroy(error); }
 });
 proxy.listen(0, '127.0.0.1'); await once(proxy, 'listening');
 t.after(async () => { proxy.closeAllConnections(); await new Promise(resolve => proxy.close(resolve)); });
 const h = await installation({ bindings: { PIER_ORIGIN: `http://127.0.0.1:${proxy.address().port}`, PIER_SESSION: pier.cookie } }); t.after(() => h.close());
 const birch = await pier.command('party.save', { name: 'Birch Lane Grocer', kind: 'customer' });
 await h.command('account.save', { id: 'cedar', value: accountValue(products.customer.id) });
 await h.command('account.save', { id: 'birch', value: { ...accountValue(birch.id, 'other@example.test'), name: 'Birch Lane Grocer' } });
 const buyer = await h.signIn('buyer@example.test'), other = await h.signIn('other@example.test');
 const draft = await h.command('order.prepare', { accountId: 'cedar', reference: 'PO-TL-1', lines: [{ sku: 'OAT-1', quantity: 10 }] }, { as: buyer });
 await h.command('order.submit', { orderId: draft.id }, { as: buyer });
 const timeline = (as = buyer) => h.api(`/api/barrow/orders/${draft.id}/timeline`, undefined, { as });
 let seen = await timeline();
 assert.deepEqual(seen.entries.map(entry => entry.state), ['Draft prepared', 'Order confirmation recorded', 'Submitted: approval pending']);
 assert.ok(seen.entries.every(entry => entry.source === 'Barrow' && entry.owner === 'Trade buyer'));
 const order = await h.command('order.approve', { orderId: draft.id });
 // Two real Pier dispatches split the shipment; one unit comes back from the first.
 const upstream = (await pier.api('/api/pier/state')).orders.find(item => item.id === order.pierOrderId);
 const first = await pier.command('dispatch.create', { orderId: upstream.id, shipmentReference: 'SHIP-1', lines: [{ orderLineId: upstream.lines[0].id, quantity: '6' }] });
 await pier.command('dispatch.create', { orderId: upstream.id, shipmentReference: 'SHIP-2', lines: [{ orderLineId: upstream.lines[0].id, quantity: '4' }] });
 await pier.command('return.create', { shipmentId: first.id, shipmentLineId: first.lines[0].id, locationId: products.location.id, quantity: '1', reason: 'Crushed case' });
 seen = await timeline();
 assert.deepEqual(seen.entries.map(entry => [entry.state, entry.source]), [
  ['Draft prepared', 'Barrow'], ['Order confirmation recorded', 'Barrow'], ['Submitted: approval pending', 'Barrow'], ['Order confirmation recorded', 'Barrow'], ['Accepted by the supplier', 'Barrow'], ['Allocated: every unit reserved', 'Barrow'],
  ['Shipped', 'Pier'], ['Shipped', 'Pier'], ['Return received: in quarantine', 'Pier'],
 ]);
 assert.deepEqual(seen.entries.filter(entry => entry.source === 'Pier').map(entry => entry.detail), ['SHIP-1: 6 OAT-1', 'SHIP-2: 4 OAT-1', '1 OAT-1: Crushed case']);
 assert.equal(seen.entries[4].owner, 'Supplier'); assert.equal(seen.revision, order.revision); assert.equal(seen.pier, 'read');
 assert.deepEqual(seen.unrecorded.map(item => item.state), ['Delivered', 'Held', 'Closed']);
 assert.ok(!seen.entries.some(entry => /deliver/i.test(entry.state)));
 // The supplier reads the same recorded timeline.
 assert.deepEqual((await h.api(`/api/barrow/orders/${draft.id}/timeline`)).entries, seen.entries);
 // Unknown upstream state stays unknown when Pier does not answer.
 down = true;
 const unknown = await timeline();
 assert.equal(unknown.pier, 'unavailable'); assert.ok(unknown.entries.every(entry => entry.source === 'Barrow'));
 down = false;
 assert.equal((await h.api(`/api/barrow/orders/${draft.id}/timeline`, undefined, { as: other, status: 404 })).error.code, 'NOT_FOUND');
});
