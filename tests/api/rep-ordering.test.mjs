import test from 'node:test';
import assert from 'node:assert/strict';
import { installation, stock, accountValue, activateStaff } from './harness.mjs';

const policy = (role, extra = {}) => ({ role, accounts: [], warehouses: [], reports: [], discountLimitCents: 0, stockExceptionLimitCents: 0, ...extra });

test('REP-001: a rep switches only among assigned accounts, sees prices, stock, history and balances, prepares for the buyer, and the accepted order names rep and buyer', async t => {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 const products = await stock(pier, '100');
 const birchParty = await pier.command('party.save', { name: 'Birch Hollow', kind: 'customer' }), oakParty = await pier.command('party.save', { name: 'Oak Ridge', kind: 'customer' });
 const h = await installation({ https: true, bindings: { PIER_ORIGIN: pier.origin, PIER_SESSION: pier.cookie } }); t.after(() => h.close());
 const prices = [{ sku: 'OAT-1', unitCents: 6500, minQty: 1 }];
 await h.command('account.save', { id: 'cedar', value: { ...accountValue(products.customer.id), minimumCents: 0, prices, territory: 'Northeast' } });
 await h.command('account.save', { id: 'birch', value: { ...accountValue(birchParty.id, 'birch@example.test'), name: 'Birch Hollow', minimumCents: 0, prices, territory: 'West' } });
 // Oak has no signed-in buyer yet: a supplier-assisted account.
 await h.command('account.save', { id: 'oak', value: { ...accountValue(oakParty.id, 'oak@example.test'), name: 'Oak Ridge', minimumCents: 0, prices, territory: 'Northeast' } });
 const buyer = { as: await h.signIn('buyer@example.test') };
 const rep = await activateStaff(h, 'avery@example.test', policy('rep', { reports: ['sales'], commissionRep: 'avery' }));
 const manager = await activateStaff(h, 'morgan@example.test', policy('sales-manager', { accounts: 'all', warehouses: 'all' }));
 const finance = await activateStaff(h, 'casey@example.test', policy('finance', { accounts: 'all', reports: ['finance'] }));
 await h.command('rep.assign', { userId: rep.id, kind: 'territory', target: 'Northeast', reason: 'Avery sells the Northeast.' }, manager.who);
 const as = who => who.who;
 const state = async () => (await h.api('/api/barrow/state', undefined, as(rep)));

 // Switching: only assigned accounts exist for the rep, with their negotiated prices; the West account is refused everywhere.
 assert.deepEqual((await state()).accounts.map(row => row.id).sort(), ['cedar', 'oak']);
 assert.deepEqual((await state()).accounts.find(row => row.id === 'cedar').value.prices, prices);
 await h.api('/api/barrow/accounts/by-id/birch', undefined, { ...as(rep), status: 404 });
 await h.api('/api/barrow/catalogue?accountId=birch', undefined, { ...as(rep), status: 404 });
 await h.command('order.prepare', { accountId: 'birch', lines: [{ sku: 'OAT-1', quantity: 2 }] }, { ...as(rep), status: 404 });
 await h.command('quote.request', { accountId: 'birch', lines: [{ sku: 'OAT-1', quantity: 2 }] }, { ...as(rep), status: 404 });
 // Stock and history of an assigned account.
 const catalogue = await h.api('/api/barrow/catalogue?accountId=cedar', undefined, as(rep));
 assert.equal(catalogue.items.find(item => item.sku === 'OAT-1').available, '100', 'the rep reads live promiseable stock');

 // Prepare on the buyer's behalf: acting-as attribution is recorded and shown, and a quote records its requester.
 const draft = await h.command('order.prepare', { accountId: 'cedar', reference: 'PO-REP-1', lines: [{ sku: 'OAT-1', quantity: 2 }] }, as(rep));
 assert.equal(draft.preparedBy, rep.id); assert.equal(draft.preparedAs, 'rep');
 const quote = await h.command('quote.request', { accountId: 'cedar', lines: [{ sku: 'OAT-1', quantity: 2 }] }, as(rep));
 assert.equal(quote.requestedBy, rep.id);
 const history = await h.api('/api/barrow/orders/history', undefined, as(rep));
 assert.deepEqual(history.orders.map(row => row.id), [draft.id]);
 assert.equal(history.people[rep.id], 'avery');
 // Buyer approval policy still applies: the rep cannot submit where a buyer exists and cannot stand in as the company approver.
 const refused = await h.command('order.submit', { orderId: draft.id }, { ...as(rep), status: 403 });
 assert.equal(refused.error.code, 'BUYER_REQUIRED');
 await h.command('order.company-approve', { orderId: draft.id, revision: draft.revision }, { ...as(rep), status: 403 });
 await h.command('order.company-approve', { orderId: draft.id, revision: draft.revision }, { ...as(manager), status: 403 });
 assert.equal((await h.api(`/api/barrow/orders/${draft.id}`, undefined, as(rep))).status, 'draft');
 // The buyer sees the rep's draft with the rep's name, submits it under their own policy, and the supplier accepts.
 const buyerView = await h.api('/api/barrow/orders/history', undefined, buyer);
 assert.equal(buyerView.orders.find(row => row.id === draft.id).preparedBy, rep.id); assert.equal(buyerView.people[rep.id], 'avery');
 const submitted = await h.command('order.submit', { orderId: draft.id }, buyer);
 assert.equal(submitted.status, 'submitted'); assert.equal(submitted.submittedBy, (await h.api('/api/barrow/state', undefined, buyer)).actor.id);
 const accepted = await h.command('order.approve', { orderId: draft.id });
 assert.equal(accepted.status, 'approved'); assert.equal(accepted.preparedBy, rep.id); assert.equal(accepted.preparedAs, 'rep'); assert.ok(accepted.submittedBy && accepted.submittedBy !== rep.id);
 const shown = await h.api('/api/barrow/orders/history', undefined, buyer);
 assert.deepEqual([shown.people[accepted.preparedBy], shown.people[accepted.submittedBy]], ['avery', 'Trade buyer'], 'the accepted order names the rep and the buyer');
 // Balances: invoiced totals of the held account through the statement, refused for another territory and for a manager-less rep route.
 const statement = await h.api('/api/barrow/statements/cedar', undefined, as(rep));
 assert.equal(statement.sections[0].closingCents, accepted.totalCents);
 assert.equal((await h.request('/api/barrow/statements/cedar.csv', as(rep))).status, 200);
 await h.api('/api/barrow/statements/birch', undefined, { ...as(rep), status: 404 });
 await h.api('/api/barrow/invoices/' + accepted.id + '.csv', undefined, { ...as(rep), status: 403 });
 // A supplier-assisted account has no buyer to approve: the rep's own submission is the supplier-assisted order.
 const assisted = await h.command('order.prepare', { accountId: 'oak', lines: [{ sku: 'OAT-1', quantity: 2 }] }, as(rep));
 assert.equal((await h.command('order.submit', { orderId: assisted.id }, as(rep))).status, 'submitted');
 // Revoking the assignment ends the rep's selling at once.
 const [assignment] = (await h.api('/api/barrow/rep-assignments')).assignments;
 await h.command('rep.end', { id: assignment.id, revision: assignment.revision, reason: 'Avery left the territory.' });
 await h.command('order.prepare', { accountId: 'cedar', lines: [{ sku: 'OAT-1', quantity: 2 }] }, { ...as(rep), status: 404 });
 assert.deepEqual((await state()).accounts, []);
});
