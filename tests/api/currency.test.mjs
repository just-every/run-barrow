import test from 'node:test';
import assert from 'node:assert/strict';
import { installation, stock, accountValue, archive, restore } from './harness.mjs';

const csvRows = text => text.trim().split('\r\n').map(line => line.slice(1, -1).split('","'));
const invoice = async (h, order) => {
 const response = await h.request(`/api/barrow/invoices/${order.id}.csv`);
 assert.equal(response.status, 200);
 const [columns, ...rows] = csvRows(await response.text());
 return rows.map(row => Object.fromEntries(columns.map((name, i) => [name, row[i]])));
};

test('PRI-001: negotiated USD checkout and invoice cents survive changes and legacy AUD restore', async t => {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 const products = await stock(pier);
 const h = await installation({ bindings: { PIER_ORIGIN: pier.origin, PIER_SESSION: pier.cookie } }); t.after(() => h.close());
 const orders = [];
 for (const [id, unitCents] of [['cedar', 6501], ['harbor', 7203]]) {
  const account = await h.command('account.save', { id, value: { ...accountValue(products.customer.id, `${id}@example.test`), minimumCents: 0, prices: [{ sku: 'OAT-1', unitCents, minQty: 1 }] } });
  const buyer = await h.signIn(account.value.email);
  const catalog = await h.api(`/api/barrow/catalogue?accountId=${id}`, undefined, { as: buyer });
  assert.equal(catalog.items[0].unitCents, unitCents); assert.equal(catalog.currency, 'USD');
  let order = await h.command('order.prepare', { accountId: id, reference: `PO-${id}`, lines: [{ sku: 'OAT-1', quantity: 3 }], currency: 'AUD', totalCents: 1 }, { as: buyer });
  assert.equal(order.currency, 'USD'); assert.equal(order.totalCents, unitCents * 3);
  assert.equal(order.lines[0].unitCents, unitCents);
  await h.command('order.submit', { orderId: order.id }, { as: buyer });
  order = await h.command('order.approve', { orderId: order.id });
  assert.equal(order.status, 'approved');
  const [line] = await invoice(h, order);
  assert.equal(line.currency, 'USD'); assert.equal(Number(line.unit_cents), unitCents);
  assert.equal(Number(line.line_cents), order.totalCents); assert.equal(Number(line.invoice_total_cents), order.totalCents);
  const snapshot = await (await h.request(`/api/barrow/invoices/${order.id}.csv`, { as: buyer })).text();
  await h.command('account.save', { id, revision: account.revision, value: { ...account.value, termsDays: 7, prices: [{ sku: 'OAT-1', unitCents: 9999, minQty: 1 }] } });
  assert.equal(await (await h.request(`/api/barrow/invoices/${order.id}.csv`, { as: buyer })).text(), snapshot);
  orders.push(order);
 }
 // A real-shaped pre-currency record is test data, exported and restored through the public portability door.
 const legacy = { ...orders[0], id: 'legacy-aud', reference: 'PO-legacy', invoice: { ...orders[0].invoice, number: 'BAR-legacy-aud' } };
 delete legacy.currency;
 await h.db.prepare('INSERT INTO bw_orders VALUES(?,?,?,?)').bind(legacy.id, legacy.accountId, JSON.stringify(legacy), legacy.revision).run();
 const before = await invoice(h, legacy); assert.equal(before[0].currency, 'AUD');
 const target = await installation(); t.after(() => target.close());
 await restore(target, await archive(h));
 const state = await target.api('/api/barrow/state');
 for (const original of [...orders, legacy]) {
  const restored = state.orders.find(order => order.id === original.id);
  assert.deepEqual(restored, original);
  assert.deepEqual(await invoice(target, restored), await invoice(h, original));
 }
 assert.equal((await invoice(target, legacy))[0].currency, 'AUD');
});
