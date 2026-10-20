import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { installation, stock, accountValue } from './harness.mjs';

const latest = order => order.substitutions.at(-1);
const basket = [
 { fromSku: 'OAT-1', sku: 'MAPLE-1', quantity: 3 },
 { fromSku: 'OAT-1', sku: 'HONEY-1', quantity: 2 },
 { fromSku: 'RYE-1', sku: 'RYE-1', quantity: 2 },
];
const parcel = baseCents => ({ id: 'parcel', name: 'Parcel delivery', kind: 'parcel', accountIds: [], states: [], warehouses: [], minCents: 0, maxCents: null, baseCents, handlingCents: 250, freeOverCents: null, transitMinDays: 2, transitMaxDays: 5, quoteRequired: false });
const csv = text => {
 const rows = []; let row = [], cell = '', quoted = false;
 for (let i = 0; i < text.length; i++) {
  const c = text[i];
  if (c === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
  else if (c === ',' && !quoted) { row.push(cell); cell = ''; }
  else if (c === '\n' && !quoted) { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
  else cell += c;
 }
 if (cell || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
 const [columns, ...values] = rows;
 return values.map(values => Object.fromEntries(columns.map((key, i) => [key, values[i]])));
};
async function refused(h, type, payload, options = {}, statuses = [400, 409]) {
 const response = await h.request('/api/barrow/commands', { method: 'POST', body: { type, payload }, ...options });
 const value = await response.json();
 assert.ok(statuses.includes(response.status), JSON.stringify(value));
 assert.ok(value.error?.code, JSON.stringify(value));
 return value.error;
}
async function fixture(t, { fault = false } = {}) {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 const products = await stock(pier, '12');
 const extra = [];
 for (const [sku, name] of [['RYE-1', 'Rye granola'], ['MAPLE-1', 'Maple granola'], ['HONEY-1', 'Honey granola']]) extra.push(await pier.command('item.save', { sku, name, unit: 'case', packSize: '1' }));
 const quantities = ['2', '20', '20'];
 const po = await pier.command('po.draft', { supplierId: products.supplier.id, promiseDate: '2026-10-20', reason: 'Substitution assortment', lines: extra.map((item, i) => ({ itemId: item.id, quantity: quantities[i], price: '20.00' })) });
 await pier.command('po.approve', { poId: po.id, version: po.version });
 await pier.command('po.commit', { poId: po.id, version: po.version });
 await pier.command('receipt.create', { poId: po.id, supplierReference: 'Substitution assortment receipt', lines: po.lines.map((line, i) => ({ poLineId: line.id, locationId: products.location.id, quantity: quantities[i], cost: '20.00' })) });
 const requests = []; let discard = fault, origin = pier.origin;
 if (fault) {
  // Only the network acknowledgment is faulted; every stock mutation reaches the real pinned Pier.
  const proxy = createServer(async (request, response) => {
   try {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
    const upstream = await pier.request(request.url, { method: request.method, ...(body ? { body } : {}) });
    const bytes = Buffer.from(await upstream.arrayBuffer());
    if (body?.type === 'order.cancel' || body?.type === 'order.create') requests.push({ type: body.type, id: body.commandId });
    if (body?.type === 'order.cancel' && discard) { discard = false; assert.ok(upstream.ok); response.destroy(); return; }
    response.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'application/json' }); response.end(bytes);
   } catch (error) { response.destroy(error); }
  });
  proxy.listen(0, '127.0.0.1'); await once(proxy, 'listening');
  t.after(async () => { proxy.closeAllConnections(); await new Promise(resolve => proxy.close(resolve)); });
  origin = `http://127.0.0.1:${proxy.address().port}`;
 }
 const h = await installation({ bindings: { PIER_ORIGIN: origin, PIER_SESSION: pier.cookie } }); t.after(() => h.close());
 const account = await h.command('account.save', { id: 'cedar', value: { ...accountValue(products.customer.id), minimumCents: 0, prices: [
  { sku: 'OAT-1', unitCents: 6500, minQty: 1 }, { sku: 'RYE-1', unitCents: 4000, minQty: 1 },
  { sku: 'MAPLE-1', unitCents: 4400, minQty: 1, units:[{code:'pair',baseQuantity:'2',unitCents:8000,packContents:'Two cases'}] }, { sku: 'HONEY-1', unitCents: 3100, minQty: 1 },
 ] } });
 const buyer = { as: await h.signIn(account.value.email) };
 const read = (id, opts = {}) => h.api(`/api/barrow/orders/${id}`, undefined, opts);
 const prepare = (lines = [{ sku: 'OAT-1', quantity: 8 }, { sku: 'RYE-1', quantity: 2 }]) => h.command('order.prepare', { accountId: account.id, lines }, buyer);
 const propose = async (order, lines = basket, more = {}) => h.command('substitution.propose', { orderId: order.id, orderRevision: (await read(order.id)).revision, lines, reason: 'Original style unavailable; buyer may choose current alternatives.', ...more });
 return { h, pier, products, extra, account, buyer, read, prepare, propose, requests };
}

test('STK-005: buyer declines then accepts a current-price split substitution; only execution replaces the real stock reservation and exports both links', async t => {
 const { h, pier, products, account: initial, buyer, read, prepare, propose } = await fixture(t);
 await h.command('location.save', { accountId: 'cedar', kind: 'ship-to', value: { name: 'Cedar store', line1: '25 Broadway', city: 'New York', state: 'NY', zip: '10004' } });
 const shipping = await h.api('/api/barrow/shipping/settings');
 await h.command('shipping.settings', { revision: shipping.revision, methods: [parcel(1000)] });
 let original = await prepare();
 const delivery = (await h.api(`/api/barrow/shipping/options?orderId=${original.id}`, undefined, buyer)).options[0];
 await h.command('shipping.select', { orderId: original.id, ...delivery }, buyer);
 await h.command('order.submit', { orderId: original.id, deliveryAcknowledged: true }, buyer);
 // Stock disappears between the buyer's submission and the supplier's reservation.
 await pier.command('order.create', { customerId: products.customer.id, lines: [{ itemId: products.item.id, quantity: '8' }] });
 original = await h.command('order.approve', { orderId: original.id });
 assert.equal(original.status, 'shortfall');
 assert.deepEqual(original.reservation.map(line => line.reserved), ['4', '2']);
 const before = await pier.api('/api/pier/state');
 // Retire the unavailable style from this account and change the alternative's live price.
 const account = await h.command('account.save', { id: initial.id, revision: initial.revision, value: { ...initial.value, prices: initial.value.prices.filter(price => price.sku !== 'OAT-1').map(price => price.sku === 'MAPLE-1' ? { ...price, unitCents: 4200 } : price) } });
 const catalogue = await h.api('/api/barrow/catalogue?accountId=cedar', undefined, buyer);
 assert.equal(catalogue.items.some(item => item.sku === 'OAT-1'), false);
 assert.equal(catalogue.items.find(item => item.sku === 'RYE-1').available, '0');
 const preview = await h.command('substitution.preview', { orderId: original.id, lines: basket });
 assert.deepEqual(preview.lines.map(line => [line.sku, line.quantity, line.unitCents]), [['MAPLE-1', 3, 4200], ['HONEY-1', 2, 3100], ['RYE-1', 2, 4000]]);
 assert.deepEqual(preview.lines.map(line => [line.fromSku, line.fromUnit, line.fromLine]), [['OAT-1', 'case', 1], ['OAT-1', 'case', 1], ['RYE-1', 'case', 2]]);
 assert.match(preview.taxNote, /not (?:calculated|recorded)|no tax/i);
 assert.equal(preview.deliveryOptions.required, true);
 const offeredDelivery = preview.deliveryOptions.options.find(option => option.methodId === 'parcel');
 assert.equal(offeredDelivery.totalCents, 1250);
 await refused(h, 'substitution.propose', { orderId: original.id, orderRevision: original.revision, lines: basket, reason: 'No selected delivery yet' });
 let offered = await propose(original, basket.map((line,i)=>i===0?{...line,quantity:4}:line), { delivery: offeredDelivery });
 assert.equal(latest(offered).status, 'offered'); assert.equal(latest(offered).accountRevision, account.revision);
 assert.equal(latest(offered).totalCents, 32250);
 assert.deepEqual((await pier.api('/api/pier/state')).orders, before.orders);
 const declined = await h.command('substitution.decline', { orderId: original.id, number: latest(offered).number, reason: 'Please keep the requested delivery and revise the selection.' }, buyer);
 assert.equal(latest(declined).status, 'declined');
 assert.match(JSON.stringify(latest(declined)), /Please keep the requested delivery/);
 await refused(h, 'substitution.accept', { orderId: original.id, number: latest(offered).number, acknowledged: true }, buyer);
 const staleRevision = declined.revision;
 offered = await propose(original, basket, { delivery: offeredDelivery });
 assert.equal(offered.substitutions.length, 2);
 assert.equal(offered.substitutions[0].status, 'declined');
 await refused(h, 'substitution.propose', { orderId: original.id, orderRevision: staleRevision, lines: basket, delivery: offeredDelivery, reason: 'Stale proposal editor' });
 await refused(h, 'substitution.accept', { orderId: original.id, number: latest(offered).number }, buyer);
 await refused(h, 'substitution.accept', { orderId: original.id, number: offered.substitutions[0].number, acknowledged: true }, buyer);
 const accepted = await h.command('substitution.accept', { orderId: original.id, number: latest(offered).number, acknowledged: true }, buyer);
 const offer = latest(accepted); assert.equal(offer.status, 'accepted'); assert.ok(offer.replacementId);
 const replacement = await read(offer.replacementId, buyer);
 assert.equal(replacement.status, 'submitted'); assert.equal(replacement.currency, 'USD');
 assert.equal(replacement.totalCents, 28050); assert.equal(replacement.delivery.totalCents, 1250);
 assert.ok(replacement.delivery.acceptedBy && replacement.delivery.acceptedAt);
 assert.deepEqual(replacement.fromSubstitution, { orderId: original.id, number: offer.number });
 assert.deepEqual(replacement.lines.map(line => line.substitutedFrom), [
  { orderId: original.id, line: 1, sku: 'OAT-1', unit: 'case' },
  { orderId: original.id, line: 1, sku: 'OAT-1', unit: 'case' },
  { orderId: original.id, line: 2, sku: 'RYE-1', unit: 'case' },
 ]);
 assert.deepEqual((await pier.api('/api/pier/state')).orders, before.orders);
 assert.equal((await h.command('substitution.accept', { orderId: original.id, number: offer.number, acknowledged: true }, buyer)).substitutions.at(-1).replacementId, replacement.id);
 await refused(h, 'order.approve', { orderId: replacement.id });
 // Accepted shipping is a snapshot, even if the merchant edits the current method before execution.
 await h.command('shipping.settings', { revision: (await h.api('/api/barrow/shipping/settings')).revision, methods: [parcel(3000)] });
 const executed = await h.command('substitution.execute', { orderId: original.id, number: offer.number });
 assert.equal(executed.id, replacement.id); assert.equal(executed.status, 'approved');
 assert.deepEqual(executed.delivery, replacement.delivery); assert.equal(executed.totalCents, replacement.totalCents);
 const source = await read(original.id, buyer);
 assert.equal(source.status, 'cancelled'); assert.ok(source.release.confirmedAt);
 assert.deepEqual(source.lines, original.lines); assert.equal(source.totalCents, original.totalCents);
 assert.deepEqual(source.reservation, original.reservation); assert.equal(latest(source).replacementId, replacement.id);
 const state = await pier.api('/api/pier/state');
 const released = state.orders.find(order => order.id === original.pierOrderId);
 assert.deepEqual(released.lines.map(line => [line.quantity, line.cancelled, line.reserved]), [['8', '8', '0'], ['2', '2', '0']]);
 const reserved = state.orders.find(order => order.id === executed.pierOrderId);
 assert.deepEqual(reserved.lines.map(line => [line.itemId, line.quantity, line.reserved]), executed.lines.map(line => [line.itemId, line.baseQuantity, line.baseQuantity]));
 assert.deepEqual(executed.lines.map(line => [line.sku, line.quantity, line.unitCents, line.lineCents]), [['MAPLE-1', 3, 4200, 12600], ['HONEY-1', 2, 3100, 6200], ['RYE-1', 2, 4000, 8000]]);
 assert.deepEqual(await h.command('substitution.execute', { orderId: original.id, number: offer.number }), executed);
 assert.deepEqual((await pier.api('/api/pier/state')).orders, state.orders);
 const exported = await h.api('/api/barrow/export.json', undefined, buyer);
 const rows = csv(await (await h.request('/api/barrow/export/orders.csv', buyer)).text());
 for (const records of [exported.orders, rows]) {
  const sourceRow = records.find(row => row.id === original.id), replacementRow = records.find(row => row.id === replacement.id);
  assert.equal(JSON.parse(sourceRow.substitutions).at(-1).replacementId, replacement.id);
  assert.deepEqual(JSON.parse(replacementRow.fromSubstitution), replacement.fromSubstitution);
 }
 const exportedLines = exported.lines.filter(line => line.orderId === replacement.id);
 const csvLines = csv(await (await h.request('/api/barrow/export/lines.csv', buyer)).text()).filter(line => line.orderId === replacement.id);
 for (const lines of [exportedLines, csvLines]) assert.deepEqual(lines.map(line => JSON.parse(line.substitutedFrom)), replacement.lines.map(line => line.substitutedFrom));
 const lineRows=csv(await (await h.request('/api/barrow/export/lines.csv',buyer)).text()).filter(row=>row.orderId===replacement.id);
 assert.deepEqual(lineRows.map(row=>JSON.parse(row.substitutedFrom).line),[1,1,2]);
 const timeline=await h.api(`/api/barrow/orders/${original.id}/timeline`,undefined,buyer);
 assert.ok(timeline.entries.some(entry=>entry.state.includes('shortfall')));assert.ok(timeline.entries.some(entry=>entry.state.includes('Substitution declined')));assert.ok(timeline.entries.some(entry=>entry.state.includes('substitution accepted')));
 const invoice = await (await h.request(`/api/barrow/invoices/${replacement.id}.csv`, buyer)).text();
 assert.match(invoice, /MAPLE-1/); assert.match(invoice, /4200/); assert.match(invoice, /28050/);
 assert.equal((await h.request(`/api/barrow/invoices/${original.id}.csv`, buyer)).status, 409);
});

test('STK-005: substitution scope, current account/units/stock, explicit basket and dispatched or legacy source guards refuse without inventory effects', async t => {
 const { h, pier, products, account: initial, buyer, read, prepare, propose } = await fixture(t);
 let original = await prepare(); await h.command('order.submit', { orderId: original.id }, buyer);
 original = await h.command('order.approve', { orderId: original.id });
 const foreign = await pier.command('party.save', { name: 'Birch Stores', kind: 'customer' });
 await h.command('account.save', { id: 'birch', value: { ...accountValue(foreign.id, 'birch@example.test'), name: 'Birch Stores', minimumCents: 0 } });
 const other = { as: await h.signIn('birch@example.test') };
 const { token } = await h.api('/api/barrow/agent-token', {}), agent = { as: '', headers: { authorization: `Bearer ${token}` } };
 const payload = { orderId: original.id, orderRevision: original.revision, lines: basket, reason: 'Alternative selection' };
 await refused(h, 'substitution.propose', payload, buyer, [403]);
 for (const type of ['substitution.preview', 'substitution.propose', 'substitution.accept', 'substitution.decline', 'substitution.execute']) {
  await refused(h, type, { ...payload, number: 1, acknowledged: true }, agent, [403]);
  await refused(h, type, { ...payload, number: 1, acknowledged: true }, other, [404]);
 }
 const unitPreview=await h.command('substitution.preview',{orderId:original.id,lines:basket.map((line,i)=>i===0?{...line,unit:'pair'}:line)});
 assert.deepEqual([unitPreview.lines[0].unit,unitPreview.lines[0].baseQuantity,unitPreview.lines[0].unitCents,unitPreview.lines[0].fromUnit],['pair','6',8000,'case']);
 await refused(h, 'substitution.preview', { orderId: original.id, lines: basket.slice(0, 2) });
 await refused(h, 'substitution.preview', { orderId: original.id, lines: basket.map((line, i) => i === 0 ? { ...line, fromSku: 'UNKNOWN' } : line) });
 await refused(h, 'substitution.preview', { orderId: original.id, lines: basket.map((line, i) => i === 0 ? { ...line, unit: 'undefined-pallet' } : line) });
 await refused(h, 'substitution.preview', { orderId: original.id, lines: basket.map((line, i) => i === 0 ? { ...line, quantity: 21 } : line) });
 await refused(h, 'substitution.propose', { ...payload, orderRevision: undefined });
 let offered = await propose(original);
 await refused(h, 'substitution.accept', { orderId: original.id, number: latest(offered).number, acknowledged: true }, {}, [403]);
 await refused(h, 'substitution.decline', { orderId: original.id, number: latest(offered).number, reason: 'Supplier cannot decide for buyer' }, {}, [403]);
 await refused(h, 'substitution.execute', { orderId: original.id, number: latest(offered).number }, buyer, [403]);
 // Both a price edit and a non-price account revision require a fresh buyer offer.
 let account = await h.command('account.save', { id: initial.id, revision: initial.revision, value: { ...initial.value, prices: initial.value.prices.map(price => price.sku === 'MAPLE-1' ? { ...price, unitCents: 4500 } : price) } });
 await refused(h, 'substitution.accept', { orderId: original.id, number: latest(offered).number, acknowledged: true }, buyer);
 offered = await propose(original);
 account = await h.command('account.save', { id: account.id, revision: account.revision, value: { ...account.value, termsDays: 45 } });
 await refused(h, 'substitution.accept', { orderId: original.id, number: latest(offered).number, acknowledged: true }, buyer);
 assert.equal((await h.api('/api/barrow/state')).orders.length, 1);
 offered=await propose(original);
 const competing=await pier.command('order.create',{customerId:products.customer.id,lines:[{itemId:(await pier.api('/api/pier/state')).items.find(item=>item.sku==='MAPLE-1').id,quantity:'18'}]});
 await refused(h,'substitution.accept',{orderId:original.id,number:latest(offered).number,acknowledged:true},buyer);
 await pier.command('order.cancel',{orderId:competing.id,reason:'Release temporary competing demand'});
 const legacy = { ...original, id: 'legacy-aud-substitution', currency: 'AUD' };
 await h.db.prepare('INSERT INTO bw_orders VALUES(?,?,?,?)').bind(legacy.id, legacy.accountId, JSON.stringify(legacy), legacy.revision).run();
 await refused(h, 'substitution.preview', { orderId: legacy.id, lines: basket });
 await refused(h, 'substitution.propose', { ...payload, orderId: legacy.id });
 assert.equal((await read(legacy.id)).currency, 'AUD'); assert.equal((await read(legacy.id)).totalCents, original.totalCents);
 // Dispatch after buyer acceptance still prevents the source cancellation at execution.
 offered = await propose(original);
 const accepted = await h.command('substitution.accept', { orderId: original.id, number: latest(offered).number, acknowledged: true }, buyer);
 const upstream = (await pier.api('/api/pier/state')).orders.find(order => order.id === original.pierOrderId);
 await pier.command('dispatch.create', { orderId: upstream.id, shipmentReference: 'Already on the truck', lines: [{ orderLineId: upstream.lines[0].id, quantity: '1' }] });
 const before = await pier.api('/api/pier/state');
 assert.equal((await refused(h, 'substitution.execute', { orderId: original.id, number: latest(accepted).number })).code, 'SHIPPED');
 await refused(h, 'substitution.preview', { orderId: original.id, lines: basket });
 assert.equal((await read(original.id)).status, 'approved');
 assert.equal((await read(latest(accepted).replacementId)).status, 'submitted');
 assert.deepEqual((await pier.api('/api/pier/state')).orders, before.orders);
});

test('STK-005: a lost source-release acknowledgment blocks replacement approval until retry confirms one durable release and reservation', async t => {
 const { h, pier, buyer, read, prepare, propose, requests } = await fixture(t, { fault: true });
 let original = await prepare(); await h.command('order.submit', { orderId: original.id }, buyer);
 original = await h.command('order.approve', { orderId: original.id });
 const offered = await propose(original);
 const accepted = await h.command('substitution.accept', { orderId: original.id, number: latest(offered).number, acknowledged: true }, buyer);
 const offer = latest(accepted), before = await pier.api('/api/pier/state');
 assert.equal((await refused(h, 'substitution.execute', { orderId: original.id, number: offer.number }, {}, [503])).code, 'PIER_UNAVAILABLE');
 const source = await read(original.id), replacement = await read(offer.replacementId);
 assert.equal(source.status, 'releasing'); assert.equal(source.release.confirmedAt, undefined);
 assert.equal(replacement.status, 'submitted'); assert.equal(replacement.pierOrderId, undefined);
 const pending = await pier.api('/api/pier/state');
 assert.equal(pending.orders.length, before.orders.length);
 assert.ok(pending.orders.find(order => order.id === original.pierOrderId).lines.every(line => line.reserved === '0'));
 const held=await h.api('/api/barrow/catalogue?accountId=cedar',undefined,buyer);
 assert.deepEqual(held.items.filter(item=>['OAT-1','RYE-1'].includes(item.sku)).map(item=>[item.sku,item.available]),[['OAT-1','4'],['RYE-1','0']]);
 assert.equal(requests.filter(request => request.type === 'order.create').length, 1);
 await refused(h, 'order.approve', { orderId: replacement.id });
 const executed = await h.command('substitution.execute', { orderId: original.id, number: offer.number });
 assert.equal(executed.id, replacement.id); assert.equal(executed.status, 'approved');
 assert.ok((await read(original.id)).release.confirmedAt);
 const releases = requests.filter(request => request.type === 'order.cancel');
 assert.equal(releases.length, 2); assert.equal(new Set(releases.map(request => request.id)).size, 1);
 const creates = requests.filter(request => request.type === 'order.create');
 assert.equal(creates.length, 2); assert.equal(new Set(creates.map(request => request.id)).size, 2);
 const after = await pier.api('/api/pier/state');
 assert.equal(after.orders.length, before.orders.length + 1);
 const count = requests.length;
 assert.deepEqual(await h.command('substitution.execute', { orderId: original.id, number: offer.number }), executed);
 assert.equal(requests.length, count); assert.deepEqual((await pier.api('/api/pier/state')).orders, after.orders);
});
