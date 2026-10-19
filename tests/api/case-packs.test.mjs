import test from 'node:test';
import assert from 'node:assert/strict';
import { installation, stock, accountValue } from './harness.mjs';

test('PRI-003: case packs and increments refuse invalid quantities at the order, agent, reorder and import doors with explicit corrections, never silently inflating', async t => {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 const products = await stock(pier, '200');
 const h = await installation({ bindings: { PIER_ORIGIN: pier.origin, PIER_SESSION: pier.cookie } }); t.after(() => h.close());
 const base = accountValue(products.customer.id);
 // A rule set that allows no quantity at all is refused when the merchant sets it.
 const impossible = await h.command('account.save', { id: 'cedar', value: { ...base, prices: [{ sku: 'OAT-1', unitCents: 6500, minQty: 5, casePack: 10, increment: 10 }] } }, { status: 409 });
 assert.equal(impossible.error.code, 'ACCOUNT_PRICE_RULE');
 // Minimum 12, whole cases of 6, then steps of 12: 12, 24, 36 …
 let account = await h.command('account.save', { id: 'cedar', value: { ...base, prices: [{ sku: 'OAT-1', unitCents: 6500, minQty: 12, casePack: 6, increment: 12 }] } });
 const buyer = await h.signIn(base.email), as = { as: buyer };
 const prepare = (quantity, opts = as) => h.command('order.prepare', { accountId: 'cedar', lines: [{ sku: 'OAT-1', quantity }] }, opts);
 const offer = (await h.api('/api/barrow/catalogue?accountId=cedar', undefined, as)).items[0];
 assert.deepEqual([offer.minQty, offer.casePack, offer.increment], [12, 6, 12]);

 const below = await prepare(8, { ...as, status: 409 });
 assert.equal(below.error.code, 'MINIMUM'); assert.match(below.error.message, /minimum is 12 .*Choose 12 case instead/);
 const between = await prepare(30, { ...as, status: 409 });
 assert.equal(between.error.code, 'QUANTITY'); assert.match(between.error.message, /steps of 12 .*Choose 24 case or 36 case instead/);
 const offCase = await prepare(15, { ...as, status: 409 });
 assert.match(offCase.error.message, /case packs of 6 .*steps of 12 .*Choose 12 case or 24 case instead/);
 assert.equal((await h.api('/api/barrow/state', undefined, as)).orders.length, 0);

 // An agent's draft obeys the same rules.
 const { token } = await h.api('/api/barrow/agent-token', {});
 const agent = { as: '', headers: { authorization: `Bearer ${token}` } };
 assert.equal((await prepare(30, { ...agent, status: 409 })).error.code, 'QUANTITY');

 // The buyer accepts a correction by choosing it: exactly that quantity is ordered and reserved, nothing more.
 const accepted = await prepare(36);
 assert.equal(accepted.lines[0].quantity, 36); assert.equal(accepted.totalCents, 36 * 6500);
 await h.command('order.submit', { orderId: accepted.id }, as);
 const approved = await h.command('order.approve', { orderId: accepted.id });
 assert.equal((await pier.api('/api/pier/state')).orders.find(order => order.id === approved.pierOrderId).lines[0].quantity, '36');

 // A later rule change blocks a reorder of 36 in review with the same explanation and choices.
 account = await h.command('account.save', { id: 'cedar', revision: account.revision, value: { ...account.value, prices: [{ sku: 'OAT-1', unitCents: 6500, minQty: 12, casePack: 12, increment: 48 }] } });
 const review = await h.command('order.reorder-preview', { orderId: accepted.id, selections: [{ sku: 'OAT-1' }] }, as);
 assert.ok(review.blockingCodes.includes('QUANTITY'));
 assert.ok(review.blockers.some(text => /Choose 12 case or 60 case instead/.test(text)));

 // The reviewed account CSV carries case packs and increments; a pack without a price row is refused.
 const header = 'accountId,name,email,pierCustomerId,termsDays,minimumCents,sku,unitCents,minQty,city,state,casePack,increment';
 const csv = `${header}\nbirch,Birch Lane Grocer,birch@example.test,pier-birch,30,0,OAT-1,6500,24,Columbia,SC,12,24\n`;
 const preview = await h.api('/api/barrow/imports/preview', { csv });
 let job = await h.api('/api/barrow/imports/apply', { csv, fingerprint: preview.fingerprint });
 for (let batch = 0; job.state !== 'completed' && batch < 5; batch++) job = await h.api('/api/barrow/imports/apply', { csv, fingerprint: preview.fingerprint });
 const imported = (await h.api('/api/barrow/state')).accounts.find(item => item.id.endsWith('birch'));
 assert.deepEqual(imported.value.prices[0], { sku: 'OAT-1', unitCents: 6500, minQty: 24, casePack: 12, increment: 24 });
 const orphan = `${header}\nwren,Wren & Co.,wren@example.test,pier-wren,30,0,,,,,,6,\n`;
 assert.equal((await h.api('/api/barrow/imports/preview', { csv: orphan }, { status: 409 })).error.code, 'CSV_PRICE');
});
