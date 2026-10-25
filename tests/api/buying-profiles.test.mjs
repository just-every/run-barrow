import test from 'node:test';
import assert from 'node:assert/strict';
import { buyingProfilesFixture } from './buying-profiles-fixture.mjs';
import { activateStaff } from './harness.mjs';

const csvRows = text => {
 const [columns, ...rows] = text.trim().split('\r\n').map(row => row.slice(1, -1).split('","').map(value => value.replaceAll('""', '"')));
 return rows.map(row => Object.fromEntries(columns.map((column, index) => [column, row[index]])));
};

test('CAT-006: one company buyer deliberately selects approved brand price books; exact currencies, sellers and accepted terms survive orders, invoices and later seller edits', async t => {
 const f = await buyingProfilesFixture(t), { h, account, buyer, buyerId, profiles, brands, specifications } = f;
 assert.deepEqual((await f.read()).profiles.map(profile => profile.id), [profiles[0].id]);
 assert.equal((await f.read({})).profiles.length, 2);
 await f.catalogue(1, { ...buyer, status: 404 });
 await f.prepare(1, {}, { ...buyer, status: 404 });
 await f.terms(1, { ...buyer, status: 404 });
 const initial = await f.catalogue(0);
 assert.equal(initial.currency, specifications[0].currency); assert.equal(initial.items[0].unitCents, specifications[0].unitCents);
 const { token } = await h.api('/api/barrow/agent-token', {}), agent = { as: '', headers: { authorization: `Bearer ${token}` } };
 const staff = await activateStaff(h, 'synthetic-barrow-812@example.test', { role: 'sales-manager', accounts: 'all', warehouses: 'all', reports: [], discountLimitCents: 0, stockExceptionLimitCents: 0 });
 for (const who of [buyer, agent, staff.who]) {
  await h.command('brand.save', { id: brands[0].id, revision: brands[0].revision, value: brands[0].value }, { ...who, status: 403 });
  await h.command('profile.save', { id: profiles[0].id, revision: profiles[0].revision, accountId: account.id, value: profiles[0].value }, { ...who, status: 403 });
  await f.grant(1, true, { ...who, status: 403 });
 }
 await h.command('brand.save', { id: brands[0].id, revision: brands[0].revision, value: { ...brands[0].value, currency: 'CAD' } }, { status: 409 });
 await h.command('profile.save', { id: profiles[0].id, revision: profiles[0].revision, accountId: account.id, value: { ...profiles[0].value, brandId: brands[1].id } }, { status: 409 });
 await f.grant(1);
 assert.deepEqual(new Set((await f.read()).profiles.map(profile => profile.id)), new Set(profiles.map(profile => profile.id)));
 const orders = [];
 for (let index = 0; index < profiles.length; index++) {
  const spec = specifications[index], profile = profiles[index], catalogue = await f.catalogue(index);
  assert.equal(catalogue.currency, spec.currency); assert.equal(catalogue.items[0].unitCents, spec.unitCents);
  let order = await f.prepare(index, { currency: index === 0 ? 'CAD' : 'USD', totalCents: 1, lines: [{ sku: 'OAT-1', quantity: 2, unitCents: 1 }] });
  assert.equal(order.accountId, account.id); assert.equal(order.currency, spec.currency);
  assert.equal(order.lines[0].unitCents, spec.unitCents); assert.equal(order.totalCents, spec.unitCents * 2); assert.equal(order.termsDays, spec.termsDays);
  assert.equal(order.buyingProfile.id, profile.id); assert.equal(order.buyingProfile.brandId, spec.brandId);
  assert.deepEqual(order.buyingProfile.seller, spec.seller); assert.equal(order.buyingProfile.currency, spec.currency);
  await h.command('order.submit', { orderId: order.id }, { ...buyer, status: 409 });
  const before = (await f.terms(index)).assignment.current;
  if (index === 0) {
   await h.command('terms.publish', { series: spec.series, title: 'Mill House updated sales terms', body: 'Contact Mill House Foods before returning goods. The current order records its agreed currency and payment date.' });
   await h.command('order.submit', { orderId: order.id, termsAcceptance: { version: before.version, accepted: true } }, { ...buyer, status: 409 });
  }
  const current = (await f.terms(index)).assignment.current;
  order = await h.command('order.submit', { orderId: order.id, termsAcceptance: { version: current.version, accepted: true } }, buyer);
  assert.equal(order.termsAcceptance.series, spec.series); assert.equal(order.termsAcceptance.version, current.version); assert.equal(order.termsAcceptance.acceptedBy, buyerId);
  order = await h.command('order.approve', { orderId: order.id }); assert.equal(order.status, 'approved'); orders.push(order);
  const response = await h.request(`/api/barrow/invoices/${order.id}.csv`, buyer); assert.equal(response.status, 200);
  const [line] = csvRows(await response.text());
  assert.equal(line.currency, spec.currency); assert.equal(line.unit_cents, String(spec.unitCents)); assert.equal(line.invoice_total_cents, String(spec.unitCents * 2));
  assert.equal(line.buying_profile_id, profile.id); assert.equal(line.brand_id, spec.brandId);
  assert.equal(line.seller_legal_name, spec.seller.legalName); assert.equal(line.seller_address, spec.seller.address); assert.equal(line.seller_registration, spec.seller.registration);
 }
 await f.prepare(1, { replaces: (await f.prepare(0)).id }, { ...buyer, status: 409 });
 const historical = await h.api(`/api/barrow/orders/${orders[0].id}`, undefined, buyer);
 await h.command('brand.save', { id: brands[0].id, revision: brands[0].revision, value: { ...brands[0].value, seller: { ...brands[0].value.seller, legalName: 'Mill House Foods Wholesale LLC', address: '50 Broadway, New York, NY 10004' } } });
 assert.deepEqual((await h.api(`/api/barrow/orders/${historical.id}`, undefined, buyer)).buyingProfile, historical.buyingProfile);
 const invoice = await h.request(`/api/barrow/invoices/${historical.id}.csv`, buyer);
 assert.equal(csvRows(await invoice.text())[0].seller_legal_name, historical.buyingProfile.seller.legalName);
 const exported = await h.api('/api/barrow/export.json');
 for (const order of orders) {
  const row = exported.orders.find(row => row.id === order.id);
  assert.deepEqual(row.buyingProfile, order.buyingProfile); assert.equal(row.currency, order.currency); assert.equal(row.totalCents, order.totalCents);
 }
 await f.grant(1, false);
 assert.ok(!(await f.read()).profiles.some(profile => profile.id === profiles[1].id));
 await f.prepare(1, {}, { ...buyer, status: 404 });
 const pierOrders = (await f.pier.api('/api/pier/state')).orders;
 for (const order of orders) assert.ok(pierOrders.some(upstream => upstream.id === order.pierOrderId));
});
