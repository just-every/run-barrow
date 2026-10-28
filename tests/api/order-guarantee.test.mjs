import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { installation, stock, accountValue, archive, restore } from './harness.mjs';

const cells = text => {
 const [columns, ...rows] = text.trim().split('\r\n').map(row => row.slice(1, -1).split('","'));
 return rows.map(row => Object.fromEntries(columns.map((key, i) => [key, row[i]])));
};
const invoice = async (h, order) => {
 const response = await h.request(`/api/barrow/invoices/${order.id}.csv`);
 assert.equal(response.status, 200);
 return cells(await response.text());
};

test('ORD-010: USD and legacy AUD orders retain exact human snapshots, one acknowledged Pier handoff, and invoice only fully eligible quantities', async t => {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 const source = await stock(pier, '120');
 const attempts = new Map();
 // The real stock authority executes each command; only the first response is lost.
 const proxy = createServer(async (request, response) => {
  try {
   const chunks = []; for await (const chunk of request) chunks.push(chunk);
   const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
   const upstream = await pier.request(request.url, { method: request.method, ...(body ? { body } : {}) });
   const bytes = Buffer.from(await upstream.arrayBuffer());
   if (body?.type === 'order.create') {
    const count = (attempts.get(body.commandId) ?? 0) + 1; attempts.set(body.commandId, count);
    if (count === 1) { assert.ok(upstream.ok); response.destroy(); return; }
   }
   response.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'application/json' }); response.end(bytes);
  } catch (error) { response.destroy(error); }
 });
 proxy.listen(0, '127.0.0.1'); await once(proxy, 'listening');
 t.after(async () => { proxy.closeAllConnections(); await new Promise(resolve => proxy.close(resolve)); });
 const h = await installation({ bindings: { PIER_ORIGIN: `http://127.0.0.1:${proxy.address().port}`, PIER_SESSION: pier.cookie } }); t.after(() => h.close());
 const accounts = new Map(); let reviewed;
 for (const [id, unitCents] of [['cedar', 6501], ['harbor', 7203]]) {
  const account = await h.command('account.save', { id, duplicateReviews: reviewed ? [{ id: reviewed.id, revision: reviewed.revision }] : [], value: { ...accountValue(source.customer.id, `${id}@example.test`), minimumCents: 0, prices: [{ sku: 'OAT-1', unitCents, minQty: 1 }] } });
  const as = { as: await h.signIn(account.value.email) };
  const catalog = await h.api(`/api/barrow/catalogue?accountId=${id}`, undefined, as);
  assert.equal(catalog.items[0].unitCents, unitCents); assert.equal(catalog.currency, 'USD');
  accounts.set(id, { account, as }); reviewed = account;
 }
 const ownerId = (await h.api('/api/barrow/state')).actor.id;
 const prepare = async (id, currency, quantity, reference) => {
  const { account, as } = accounts.get(id);
  const order = await h.command('order.prepare', { accountId: id, reference, lines: [{ sku: 'OAT-1', quantity }], currency: 'AUD', totalCents: 1 }, as);
  assert.equal(order.currency, 'USD'); assert.equal(order.totalCents, account.value.prices[0].unitCents * quantity);
  assert.equal(order.lines[0].unitCents, account.value.prices[0].unitCents);
  // Historical test fixture only: pre-currency orders have no currency field.
  if (currency === 'AUD') { delete order.currency; await h.db.prepare('UPDATE bw_orders SET value_json=? WHERE id=?').bind(JSON.stringify(order), order.id).run(); }
  return order;
 };
 const originals = [];
 for (const [id, currency, unitCents, totalCents] of [['cedar', 'USD', '6501', '19503'], ['harbor', 'USD', '7203', '21609'], ['cedar', 'AUD', '6501', '19503']]) {
  let { account, as } = accounts.get(id);
  const buyerId = (await h.api('/api/barrow/state', undefined, as)).actor.id;
  const reference = `PO-${id}-${currency}-SNAPSHOT`;
  const draft = await prepare(id, currency, 3, reference);
  assert.equal(draft.preparedBy, buyerId); assert.equal(draft.totalCents, Number(totalCents)); assert.equal(draft.termsDays, 30);
  await h.command('order.submit', { orderId: draft.id }, as);
  const lost = await h.command('order.approve', { orderId: draft.id }, { status: 503 }); assert.equal(lost.error.code, 'PIER_UNAVAILABLE');
  const pending = (await h.api('/api/barrow/state', undefined, as)).orders.find(o => o.id === draft.id);
  assert.equal(pending.status, 'reserving'); assert.equal(pending.pierOrderId, undefined); assert.equal(pending.invoice, undefined);
  assert.equal(pending.submittedBy, buyerId); assert.equal(pending.approvedBy, ownerId); assert.ok(pending.approvedAt);
  assert.equal((await h.request(`/api/barrow/invoices/${draft.id}.csv`, as)).status, 409);
  const upstreamBefore = (await pier.api('/api/pier/state')).orders;
  assert.equal(upstreamBefore.length, originals.length + 1);
  const created = upstreamBefore.filter(o => !originals.some(({ approved }) => approved.pierOrderId === o.id));
  assert.equal(created.length, 1); const [upstreamOrder] = created;
  // ACC-004: a closed account must still recover its already-executed handoff.
  account = await h.command('account.save', { id, revision: account.revision, value: { ...account.value, lifecycle: 'closed' } });
  const approved = await h.command('order.approve', { orderId: draft.id });
  assert.equal(approved.status, 'approved'); assert.equal(approved.pierOrderId, upstreamOrder.id); assert.equal(approved.pierReference, upstreamOrder.reference);
  await h.command('order.approve', { orderId: draft.id });
  assert.deepEqual((await pier.api('/api/pier/state')).orders, upstreamBefore);
  const retained = (await h.api('/api/barrow/state', undefined, as)).orders.find(o => o.id === draft.id);
  assert.equal(retained.pierOrderId, upstreamOrder.id); assert.equal(retained.status, 'approved');
  assert.ok(approved.pierOrderId); assert.ok(approved.pierReference);
  const upstream = upstreamBefore.filter(o => o.id === approved.pierOrderId);
  assert.equal(upstream.length, 1); assert.equal(upstream[0].lines[0].quantity, '3'); assert.equal(upstream[0].lines[0].reserved, '3'); assert.equal(attempts.get(`barrow-${draft.id}`), 2);
  const text = await (await h.request(`/api/barrow/invoices/${draft.id}.csv`, as)).text(), [line] = await invoice(h, approved);
  assert.equal(line.currency, currency); assert.equal(line.quantity, '3'); assert.equal(line.unit_cents, unitCents);
  assert.equal(line.line_cents, totalCents); assert.equal(line.invoice_total_cents, totalCents); assert.equal(line.customer_reference, reference);
  const due = new Date(approved.invoice.issuedAt + 'T00:00:00Z'); due.setUTCDate(due.getUTCDate() + 30); assert.equal(approved.invoice.dueAt, due.toISOString().slice(0, 10));
  // Reopen for the next distinct order; the closed-account recovery was above.
  account = await h.command('account.save', { id, revision: account.revision, value: { ...account.value, lifecycle: 'active' } });
  accounts.set(id, { account, as }); originals.push({ approved, text, as });
 }
 // PRI-007 rechecks stock at submission; later contention still yields shortfalls.
 const shorts = []; for (const currency of ['USD', 'AUD']) shorts.push(await prepare('cedar', currency, 10, `PO-${currency}-SHORT`));
 for (const draft of shorts) await h.command('order.submit', { orderId: draft.id }, accounts.get('cedar').as);
 await pier.command('order.create', { customerId: source.customer.id, lines: [{ itemId: source.item.id, quantity: '109' }] });
 for (const [index, draft] of shorts.entries()) {
  await h.command('order.approve', { orderId: draft.id }, { status: 503 }); const short = await h.command('order.approve', { orderId: draft.id });
  assert.equal(short.status, 'shortfall'); assert.equal(short.reservation[0].quantity, '10'); assert.equal(short.reservation[0].reserved, index === 0 ? '2' : '0');
  assert.equal(short.invoice, undefined); assert.equal((await h.request(`/api/barrow/invoices/${draft.id}.csv`, accounts.get('cedar').as)).status, 409);
 }
 for (const [id, { account, as }] of accounts) {
  const changed = await h.command('account.save', { id, revision: account.revision, value: { ...account.value, termsDays: 7, prices: [{ sku: 'OAT-1', unitCents: 9999, minQty: 1 }] } });
  accounts.set(id, { account: changed, as });
 }
 // Also preserve an approved record written before currency snapshots existed.
 const legacy = { ...originals[0].approved, id: 'legacy-aud', reference: 'PO-legacy', invoice: { ...originals[0].approved.invoice, number: 'BAR-legacy-aud' } };
 delete legacy.currency;
 await h.db.prepare('INSERT INTO bw_orders VALUES(?,?,?,?)').bind(legacy.id, legacy.accountId, JSON.stringify(legacy), legacy.revision).run();
 assert.equal((await invoice(h, legacy))[0].currency, 'AUD');
 // A different configured destination must refuse a restored order handoff.
 const target = await installation({ bindings: { PIER_ORIGIN: pier.origin, PIER_SESSION: pier.cookie } }); t.after(() => target.close());
 await restore(target, await archive(h));
 const restored = await target.api('/api/barrow/state');
 for (const { approved, text, as } of originals) {
  assert.deepEqual((await h.api('/api/barrow/state', undefined, as)).orders.find(o => o.id === approved.id), approved);
  assert.equal(await (await h.request(`/api/barrow/invoices/${approved.id}.csv`, as)).text(), text);
  assert.equal(await (await target.request(`/api/barrow/invoices/${approved.id}.csv`)).text(), text);
  assert.deepEqual(restored.orders.find(o => o.id === approved.id), approved);
  assert.deepEqual(await invoice(target, approved), await invoice(h, approved));
  const before = (await pier.api('/api/pier/state')).orders;
  const refused = await target.command('order.approve', { orderId: approved.id }, { status: 409 }); assert.equal(refused.error.code, 'PIER_CHANGED');
  assert.deepEqual((await pier.api('/api/pier/state')).orders, before);
  assert.equal((await target.api('/api/barrow/state')).orders.find(o => o.id === approved.id).pierOrderId, approved.pierOrderId);
 }
 assert.deepEqual(restored.orders.find(o => o.id === legacy.id), legacy);
 assert.deepEqual(await invoice(target, legacy), await invoice(h, legacy));
 assert.equal((await invoice(target, legacy))[0].currency, 'AUD');
 assert.equal((await pier.api('/api/pier/state')).orders.length, 6); assert.ok([...attempts.values()].every(n => n === 2));
});
