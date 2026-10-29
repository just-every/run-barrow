import test from 'node:test';
import assert from 'node:assert/strict';
import { installation, stock, accountValue, activateStaff } from './harness.mjs';

const policy = (role, extra = {}) => ({ role, accounts: [], warehouses: [], reports: [], discountLimitCents: 0, stockExceptionLimitCents: 0, ...extra });
import { easternDay } from '../eastern-day.mjs';

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

test('REP-005: a rep plans a showroom visit for a held account, records buyer notes and a sample request, turns the show basket into a quote, assigns the follow-up, and sees Pier’s acknowledgment once the samples reach inventory', async t => {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 const products = await stock(pier, '100');
 const birchParty = await pier.command('party.save', { name: 'Birch Hollow', kind: 'customer' });
 const h = await installation({ https: true, bindings: { PIER_ORIGIN: pier.origin, PIER_SESSION: pier.cookie } }); t.after(() => h.close());
 const prices = [{ sku: 'OAT-1', unitCents: 6500, minQty: 1 }];
 await h.command('account.save', { id: 'cedar', value: { ...accountValue(products.customer.id), minimumCents: 0, prices, territory: 'Northeast' } });
 await h.command('account.save', { id: 'birch', value: { ...accountValue(birchParty.id, 'birch@example.test'), name: 'Birch Hollow', minimumCents: 0, prices, territory: 'West' } });
 const buyer = { as: await h.signIn('buyer@example.test') };
 const rep = await activateStaff(h, 'avery@example.test', policy('rep', { commissionRep: 'avery' }));
 const other = await activateStaff(h, 'blake@example.test', policy('rep', { commissionRep: 'blake' }));
 const manager = await activateStaff(h, 'morgan@example.test', policy('sales-manager', { accounts: 'all', warehouses: 'all' }));
 const operations = await activateStaff(h, 'olive@example.test', policy('operations', { accounts: 'all', warehouses: 'all' }));
 await h.command('rep.assign', { userId: rep.id, kind: 'territory', target: 'Northeast', reason: 'Avery sells the Northeast.' }, manager.who);
 await h.command('rep.assign', { userId: other.id, kind: 'territory', target: 'West', reason: 'Blake sells the West.' }, manager.who);
 const { token } = await h.api('/api/barrow/agent-token', {}), agent = { as: '', headers: { authorization: `Bearer ${token}` } };

 // Plan a showroom visit: only for an account the person sells today; another territory is not found.
 const plan = { accountId: 'cedar', kind: 'showroom', date: easternDay(2), time: '10:30', location: 'Showroom 4', agenda: 'Spring collection' };
 await h.command('visit.schedule', { ...plan, accountId: 'birch' }, { ...rep.who, status: 404 });
 for (const who of [buyer, agent, operations.who]) await h.command('visit.schedule', plan, { ...who, status: 403 });
 await h.command('visit.schedule', { ...plan, time: '25:00' }, { ...rep.who, status: 400 });
 let visit = await h.command('visit.schedule', plan, rep.who);
 assert.equal(visit.status, 'planned');
 const read = async (who = rep.who) => (await h.api('/api/barrow/visits?accountId=cedar', undefined, who)).visits.find(row => row.id === visit.id);
 await h.api('/api/barrow/visits?accountId=cedar', undefined, { ...other.who, status: 404 });
 assert.deepEqual((await h.api('/api/barrow/visits', undefined, other.who)).visits, [], 'another rep never sees this account’s visits');
 await h.api('/api/barrow/visits', undefined, { ...buyer, status: 403 });
 // Its next action is a task on the rep's own queue, linked to the account and the visit.
 let task = (await h.api('/api/barrow/followups?view=all', undefined, rep.who)).tasks.find(row => row.id === `visit:${visit.id}`);
 assert.deepEqual([task.kind, task.accountId, task.ownerId, task.nextContactDate], ['visit', 'cedar', rep.id, easternDay(2)]);
 assert.match(task.title, /Showroom visit with Cedar Street Pantry/);
 assert.equal((await h.request(task.sourcePath, rep.who)).status, 200); assert.equal((await h.request(task.sourcePath, other.who)).status, 404);
 assert.equal((await h.api('/api/barrow/followups?view=all', undefined, other.who)).tasks.some(row => row.id === task.id), false);

 // At the visit: buyer notes, a sample request from the account's own collection, and the show basket as a quote.
 visit = await h.command('visit.record', { id: visit.id, revision: visit.revision, note: 'Buyer wants the spring granola in display cases.' }, rep.who);
 await h.command('visit.samples', { id: visit.id, revision: visit.revision, lines: [{ sku: 'NOPE-1', quantity: 1 }] }, { ...rep.who, status: 400 });
 visit = await h.command('visit.samples', { id: visit.id, revision: visit.revision, lines: [{ sku: 'OAT-1', quantity: 2 }] }, rep.who);
 await h.command('visit.samples', { id: visit.id, revision: 'stale', lines: [{ sku: 'OAT-1', quantity: 1 }] }, { ...rep.who, status: 409 });
 visit = await h.command('visit.basket', { id: visit.id, revision: visit.revision, prepare: 'quote', lines: [{ sku: 'OAT-1', quantity: 12 }] }, rep.who);
 const quote = await h.api(`/api/barrow/quotes/${visit.basket.quoteId}`, undefined, rep.who);
 assert.deepEqual([quote.requestedBy, quote.accountId, quote.status], [rep.id, 'cedar', 'requested']);
 await h.command('visit.basket', { id: visit.id, revision: visit.revision, prepare: 'order', lines: [{ sku: 'OAT-1', quantity: 1 }] }, { ...rep.who, status: 409 }); // one basket per visit
 visit = await h.command('visit.record', { id: visit.id, revision: visit.revision, status: 'completed' }, rep.who);
 // Assign the follow-up: a dated next action on the rep's queue, reassignable only to someone who holds the account.
 task = (await h.api('/api/barrow/followups?view=all', undefined, rep.who)).tasks.find(row => row.id === `visit:${visit.id}`);
 assert.match(task.reason, /completed/);
 await h.command('followup.update', { id: task.id, revision: task.revision, ownerId: other.id }, { ...rep.who, status: 400 });
 task = await h.command('followup.update', { id: task.id, revision: task.revision, nextContactDate: easternDay(5), contact: { outcome: 'reached', note: 'Send the quote and confirm the sample delivery.' } }, rep.who);
 assert.deepEqual([task.ownerId, task.nextContactDate], [rep.id, easternDay(5)]);

 // Hand the samples to inventory: not the rep; operations can, and only once. Pier stays the only stock ledger.
 const available = async () => (await h.api('/api/barrow/catalogue?accountId=cedar', undefined, rep.who)).items.find(item => item.sku === 'OAT-1').available;
 assert.equal(await available(), '100');
 await h.command('visit.handoff', { id: visit.id, revision: visit.revision }, { ...rep.who, status: 403 });
 const handed = await h.command('visit.handoff', { id: visit.id, revision: visit.revision }, operations.who);
 assert.equal(handed.samples.handoff.acknowledged, 'reserved');
 assert.deepEqual(handed.samples.handoff.lines.map(line => [line.quantity, line.reserved]), [['2', '2']]);
 assert.equal((await h.command('visit.handoff', { id: visit.id, revision: handed.revision }, operations.who)).samples.handoff.pierOrderId, handed.samples.handoff.pierOrderId);
 assert.equal((await pier.api('/api/pier/state')).orders.filter(order => order.id === handed.samples.handoff.pierOrderId).length, 1);
 assert.equal(await available(), '98', 'promiseable stock falls by the samples Pier reserved');
 // The rep sees the next action and the completion acknowledgment.
 const seen = await read();
 assert.match(seen.task.reason, /Pier acknowledged sample order .*: 2 of 2 units reserved/);
 assert.deepEqual([seen.task.nextContactDate, seen.samples.handoff.pierReference, seen.notes.length], [easternDay(5), handed.samples.handoff.pierReference, 1]);
 const events = (await h.api('/api/barrow/audit?limit=200')).events.map(event => event.action);
 for (const action of ['visit.scheduled', 'visit.noted', 'visit.samples-requested', 'visit.basket-prepared', 'visit.completed', 'visit.samples-handed-off']) assert.ok(events.includes(action), action);
});
