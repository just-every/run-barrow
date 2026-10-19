import test from 'node:test';
import assert from 'node:assert/strict';
import { installation, stock, accountValue } from './harness.mjs';

test('PRI-007: server admission rejects hidden items, undefined units, minimums and changed prices; client and agent totals never become authority', async t => {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 const products = await stock(pier, '24');
 const h = await installation({ bindings: { PIER_ORIGIN: pier.origin, PIER_SESSION: pier.cookie } }); t.after(() => h.close());
 let account = await h.command('account.save', { id: 'cedar', value: { ...accountValue(products.customer.id), prices: [{ sku: 'OAT-1', unitCents: 6500, minQty: 2, casePack: 2, increment: 2 }] } });
 const buyer = await h.signIn('buyer@example.test'), foreign = await h.signIn('foreign@example.test');
 const prepare = (lines, extra = {}, opts = { as: buyer }) => h.command('order.prepare', { accountId: 'cedar', lines, ...extra }, opts);
 assert.equal((await prepare([{ sku: 'OAT-1', quantity: 2 }], {}, { as: foreign, status: 404 })).error.code, 'NOT_FOUND');
 assert.equal((await prepare([{ sku: 'HIDDEN', quantity: 2 }], {}, { as: buyer, status: 409 })).error.code, 'PRICE');
 assert.equal((await prepare([{ sku: 'OAT-1', quantity: 2, unit: 'pallet' }], {}, { as: buyer, status: 400 })).error.code, 'UNIT');
 const minimum = await prepare([{ sku: 'OAT-1', quantity: 1 }], {}, { as: buyer, status: 409 });
 assert.equal(minimum.error.code, 'MINIMUM'); assert.match(minimum.error.message, /2/);
 assert.equal((await prepare([{ sku: 'OAT-1', quantity: 3 }], {}, { as: buyer, status: 409 })).error.code, 'QUANTITY');
 assert.equal((await prepare([{ sku: 'OAT-1', quantity: 26 }], {}, { as: buyer, status: 409 })).error.code, 'STOCK');
 const draft = await prepare([{ sku: 'OAT-1', quantity: 2, unitCents: 1, lineCents: 2 }], { totalCents: 2, currency: 'EUR', termsDays: 999 });
 assert.deepEqual([draft.lines[0].unitCents, draft.lines[0].lineCents, draft.totalCents, draft.currency, draft.termsDays], [6500, 13000, 13000, 'USD', 30]);
 const { token } = await h.api('/api/barrow/agent-token', {});
 const agent = { as: '', headers: { authorization: `Bearer ${token}` } };
 const proposed = await prepare([{ sku: 'OAT-1', quantity: 2, unitCents: 0 }], { totalCents: 0, accountRevision: 'invented' }, agent);
 assert.equal(proposed.totalCents, 13000); assert.match(proposed.preparedBy, /^agent:/);
 assert.equal((await h.command('order.submit', { orderId: proposed.id }, { ...agent, status: 403 })).error.code, 'PERSON_REQUIRED');
 account = await h.command('account.save', { id: account.id, revision: account.revision, value: { ...account.value, prices: [{ ...account.value.prices[0], unitCents: 7500 }] } });
 const changed = await h.command('order.submit', { orderId: draft.id, totalCents: 13000, unitCents: 6500, override: true }, { as: buyer, status: 409 });
 assert.equal(changed.error.code, 'PRICE_CHANGED'); assert.match(changed.error.message, /new draft/);
 // Re-preparing uses current rules; neither buyer nor supplier can bypass an invalid order minimum.
 account = await h.command('account.save', { id: account.id, revision: account.revision, value: { ...account.value, minimumCents: 20000 } });
 for (const as of [buyer, h.cookie]) {
  const refused = await prepare([{ sku: 'OAT-1', quantity: 2 }], { totalCents: 999999, override: true }, { as, status: 409 });
  assert.equal(refused.error.code, 'MINIMUM');
 }
 const live = await prepare([{ sku: 'OAT-1', quantity: 4 }], { reference: 'LIVE-RECHECK' });
 const consumption = await pier.command('order.create', { customerId: products.customer.id, lines: [{ itemId: products.item.id, quantity: '22' }] });
 assert.equal((await h.command('order.submit', { orderId: live.id }, { as: buyer, status: 409 })).error.code, 'STOCK');
 await pier.command('order.cancel', { orderId: consumption.id, reason: 'Release stock after submission refusal' });
 const current = await prepare([{ sku: 'OAT-1', quantity: 4 }], { reference: 'CURRENT-RULES' });
 assert.equal(current.totalCents, 30000);
 await h.command('order.submit', { orderId: current.id }, { as: buyer });
 // The authority can have less stock by approval time: it acknowledges the exact shortfall, never a fake invoice.
 const allocation = await pier.command('order.create', { customerId: products.customer.id, lines: [{ itemId: products.item.id, quantity: '22' }] });
 const short = await h.command('order.approve', { orderId: current.id });
 assert.equal(short.status, 'shortfall'); assert.equal(short.reservation[0].reserved, '2'); assert.equal(short.invoice, undefined);
 assert.equal((await h.request(`/api/barrow/invoices/${short.id}.csv`)).status, 409);
 const audit = await h.api(`/api/barrow/audit?orderId=${short.id}`);
 assert.ok(audit.events.some(event => event.action === 'order.shortfall' && event.actorId === short.approvedBy));
 await pier.command('order.cancel', { orderId: allocation.id, reason: 'Release competing demand' });
 const awaitingApproval = await prepare([{ sku: 'OAT-1', quantity: 4 }], { reference: 'REVOKED-APPROVAL' });
 await h.command('order.submit', { orderId: awaitingApproval.id }, { as: buyer });
 const awaitingSubmission = await prepare([{ sku: 'OAT-1', quantity: 4 }], { reference: 'REVOKED-SUBMISSION' });
 assert.equal((await pier.request('/auth/signout', { method: 'POST', body: {} })).status, 204);
 assert.equal((await h.command('order.submit', { orderId: awaitingSubmission.id }, { as: buyer, status: 503 })).error.code, 'PIER_UNAVAILABLE');
 assert.equal((await h.command('order.approve', { orderId: awaitingApproval.id }, { status: 503 })).error.code, 'PIER_UNAVAILABLE');
 const retained = (await h.api('/api/barrow/state')).orders;
 assert.equal(retained.find(row => row.id === awaitingSubmission.id).status, 'draft');
 assert.equal(retained.find(row => row.id === awaitingApproval.id).status, 'submitted');
});
