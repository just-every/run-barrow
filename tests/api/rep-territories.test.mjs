import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { installation, stock, accountValue } from './harness.mjs';

const easternDay = offset => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(Date.now() + offset * 86400000));
const policy = (role, extra = {}) => ({ role, accounts: [], warehouses: [], reports: [], discountLimitCents: 0, stockExceptionLimitCents: 0, ...extra });
const reason = 'Owner reviewed this exact functional role and scope.';

async function confirmInvitation(h, email) {
 const message = h.mail.requests.findLast(row => row.message.to.includes(email))?.message;
 assert.ok(message, 'Native invitation reached the external mail edge');
 const href = message.text?.match(/https?:\/\/[^\s<>]+\/auth\/confirm\?token=[^\s<>]+/)?.[0] ?? message.html?.match(/href="([^"]*\/auth\/confirm\?token=[^"]+)"/)?.[1]?.replaceAll('&amp;', '&');
 const response = await h.request('/auth/confirm', { method: 'POST', as: '', body: { token: new URL(href).searchParams.get('token') } });
 assert.equal(response.status, 303);
 return { as: response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
}

test('ACC-006: managers assign reps to territories and accounts with dated coverage; access, quote routing, reports, tasks, commissions and sends follow the current assignment and no history is rewritten', async t => {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 const products = await stock(pier, '100');
 const customers = { wren: await pier.command('party.save', { name: 'Wren Market', kind: 'customer' }), birch: await pier.command('party.save', { name: 'Birch Hollow', kind: 'customer' }), elm: await pier.command('party.save', { name: 'Elm Corner', kind: 'customer' }) };
 const key = randomBytes(32);
 const h = await installation({ https: true, bindings: { MAIL_WEBHOOK_SECRET: 'whsec_' + key.toString('base64'), MAIL_EVENT_TENANT: 'barrow-test', PIER_ORIGIN: pier.origin, PIER_SESSION: pier.cookie } }); t.after(() => h.close());
 const prices = [{ sku: 'OAT-1', unitCents: 6500, minQty: 1 }];
 await h.command('account.save', { id: 'cedar', value: { ...accountValue(products.customer.id), prices, territory: 'Northeast', assignedRep: 'profile-text-only' } });
 await h.command('account.save', { id: 'wren', value: { ...accountValue(customers.wren.id, 'wren@example.test'), name: 'Wren Market', prices, territory: 'Northeast' } });
 await h.command('account.save', { id: 'birch', value: { ...accountValue(customers.birch.id, 'birch@example.test'), name: 'Birch Hollow', prices, territory: 'West' } });
 await h.command('account.save', { id: 'elm', value: { ...accountValue(customers.elm.id, 'elm@example.test'), name: 'Elm Corner', prices, territory: 'West' } });
 const buyer = { as: await h.signIn('buyer@example.test') }, wrenBuyer = { as: await h.signIn('wren@example.test') };
 const admin = { as: await h.signIn('admin@example.test', 'admin') };
 const { token } = await h.api('/api/barrow/agent-token', {}), agent = { as: '', headers: { authorization: `Bearer ${token}` } };
 const activate = async (email, grantPolicy) => {
  const grant = await h.command('staff.invite', { email, name: email.split('@')[0], policy: grantPolicy, reason });
  const who = await confirmInvitation(h, email);
  return { grant, who, id: grant.userId };
 };
 const reports = ['sales', 'finance', 'commissions', 'quotes'];
 const repA = await activate('rep-a@example.test', policy('rep', { reports, commissionRep: 'rep-a' }));
 const repB = await activate('rep-b@example.test', policy('rep', { reports, commissionRep: 'rep-b' }));
 const manager = await activate('manager@example.test', policy('sales-manager', { accounts: 'all', warehouses: 'all', reports: ['sales'] }));
 const scopedManager = await activate('scoped-manager@example.test', policy('sales-manager', { accounts: ['cedar'] }));
 const operations = await activate('operations@example.test', policy('operations', { warehouses: 'all', reports: ['fulfillment'] }));
 await h.command('commission.settings', { revision: null, reason: 'Two rep rules.', rules: ['a', 'b'].map(x => ({ id: `rule-${x}`, rep: `rep-${x}`, from: '2026-01-01', rateBps: 500, basis: 'acceptance', splits: [{ rep: `rep-${x}`, shareBps: 10000 }] })) });
 const assignments = async (opts = {}) => (await h.api('/api/barrow/rep-assignments', undefined, opts));
 const accountIds = async who => (await h.api('/api/barrow/state', undefined, who)).accounts.map(row => row.id).sort();

 // Profile rep text and a grant with no assignment hold nothing.
 assert.deepEqual(await accountIds(repA.who), []);
 await h.api('/api/barrow/accounts/by-id/cedar', undefined, { ...repA.who, status: 404 });

 // Only owner, admin and an all-account manager assign; nobody else, and no agent.
 const assign = (userId, kind, target, opts = {}, extra = {}) => h.command('rep.assign', { userId, kind, target, reason: 'Manager assigned this book.', ...extra }, opts);
 for (const who of [buyer, agent, repA.who, operations.who, scopedManager.who]) await assign(repA.id, 'territory', 'Northeast', { ...who, status: 403 });
 for (const who of [buyer, agent, operations.who]) await h.api('/api/barrow/rep-assignments', undefined, { ...who, status: 403 });
 await assign(repA.id, 'territory', 'Nowhere', { status: 400 });
 await assign('not-a-user', 'territory', 'Northeast', { status: 400 });
 await assign(manager.id, 'territory', 'Northeast', { status: 400 }); // a manager grant is not a rep identity
 const territory = await assign(repA.id, 'territory', 'Northeast', manager.who);
 const birch = await assign(repB.id, 'account', 'birch', admin.who);
 await assign(repB.id, 'account', 'cedar', { status: 409 }); // one primary rep per account and day
 assert.deepEqual(await accountIds(repA.who), ['cedar', 'wren']);
 assert.deepEqual(await accountIds(repB.who), ['birch']);
 await h.api('/api/barrow/accounts/by-id/birch', undefined, { ...repA.who, status: 404 });
 await h.command('order.prepare', { accountId: 'birch', lines: [{ sku: 'OAT-1', quantity: 2 }] }, { ...repA.who, status: 404 });
 assert.equal((await assignments(repA.who)).assignments.length, 1, 'a rep reads only their own assignments');
 assert.equal((await assignments()).assignments.filter(row => row.effective).length, 2);
 // Buyers see their current rep by name, never identity or contact.
 const seen = (await h.api('/api/barrow/state', undefined, buyer)).accounts[0];
 assert.deepEqual(seen.currentReps, [{ name: 'rep-a', coverage: false }]);
 assert.ok(!JSON.stringify(seen).includes(repA.id) && !JSON.stringify(seen).includes('rep-a@example.test'));

 // ORD-005 notices and AUTO-003 mail reach the assigned rep instead of every owner/admin; the thread is the rep's alone.
 const quoteMail = id => h.mail.deliveries.filter(row => row.message.subject === `Barrow quote ${id}` && !row.message.text.includes('expires after today')).map(row => row.message.to[0]);
 const quote = await h.command('quote.request', { accountId: 'cedar', lines: [{ sku: 'OAT-1', quantity: 5 }] }, buyer);
 assert.deepEqual(quoteMail(quote.id), ['rep-a@example.test']);
 const readQuote = (who, status) => h.api(`/api/barrow/quotes/${quote.id}`, undefined, status ? { ...who, status } : who);
 assert.deepEqual((await readQuote(repA.who)).notices.map(row => row.kind), ['requested']);
 assert.deepEqual((await readQuote({})).notices, [], 'owner and admins are not notified while a rep holds the account');
 await readQuote(repB.who, 404); await readQuote(wrenBuyer, 404);
 await h.command('quote.message', { quoteId: quote.id, body: 'Buyer question', }, buyer);
 assert.deepEqual(quoteMail(quote.id), ['rep-a@example.test', 'rep-a@example.test']);
 await h.command('quote.message', { quoteId: quote.id, internal: true, body: 'Rep-only margin note' }, repA.who);
 assert.equal(quoteMail(quote.id).length, 2, 'the author of a note is never notified of it');
 await h.command('quote.read', { quoteId: quote.id }, {});
 assert.equal((await readQuote(repA.who)).notices.length, 2, 'an owner marking read does not clear the rep’s notices');
 await h.command('quote.read', { quoteId: quote.id }, repA.who);
 assert.deepEqual((await readQuote(repA.who)).notices, []);
 // A discount above the rep's allowance waits for approvers, so that notice keeps reaching owner/admin.
 let revised = await readQuote(repA.who);
 await h.command('quote.propose', { quoteId: quote.id, revision: revised.revision, validUntil: easternDay(0), lines: [{ sku: 'OAT-1', quantity: 5, unitCents: 6000 }], reason: 'Volume.' }, repA.who);
 assert.deepEqual(quoteMail(quote.id).slice(-2).sort(), ['admin@example.test', 'owner@example.test']);
 revised = await readQuote({});
 assert.equal(revised.status, 'awaiting-approval');
 revised = await h.command('quote.approve', { quoteId: quote.id, revision: revised.revision, number: 1, reason: 'Approved.' });
 // Expiry reminders (last valid day, today) go to the buyer and the holding rep, not owner/admin.
 await h.command('quote-mail.dispatch', {});
 const expiry = h.mail.deliveries.filter(row => row.message.text.includes('expires after today') && row.message.subject === `Barrow quote ${quote.id}`).map(row => row.message.to[0]).sort();
 assert.deepEqual(expiry, ['buyer@example.test', 'rep-a@example.test']);

 // A bounced buyer email opens a task owned by the proposing rep while they hold the account; reassignment is limited to current holders.
 const sent = h.mail.deliveries.find(row => row.message.to.includes('buyer@example.test') && row.message.subject === `Barrow quote ${quote.id}`);
 const bounce = async id => {
  const timestamp = String(Math.floor(Date.now() / 1000)), body = JSON.stringify({ type: 'email.bounced', created_at: new Date().toISOString(), data: { email_id: sent.id, to: ['buyer@example.test'] } });
  const signature = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
  return h.raw('/api/barrow/quote-mail/webhook', { method: 'POST', headers: { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': 'v1,' + signature }, body });
 };
 assert.equal((await bounce('bounce-1')).status, 200);
 const failed = (await h.api('/api/barrow/followups?view=all', undefined, repA.who)).tasks.find(row => row.kind === 'quote-mail');
 assert.equal(failed.ownerId, repA.id);
 assert.equal((await h.api('/api/barrow/followups?view=all', undefined, repB.who)).tasks.some(row => row.id === failed.id), false);
 await h.command('followup.update', { id: failed.id, revision: failed.revision, ownerId: repB.id }, { status: 400 });
 await h.command('followup.update', { id: failed.id, revision: failed.revision, ownerId: repB.id }, { ...repB.who, status: 404 });

 // Reports: a held account or a completely held territory; another territory or account is refused through page and CSV.
 for (const suffix of ['', '.csv']) {
  for (const kind of ['sales', 'finance']) {
   for (const filter of ['?accountId=cedar', '?territory=Northeast']) assert.equal((await h.request(`/api/barrow/reports/${kind}${suffix}${filter}`, repA.who)).status, 200, `${kind}${suffix}${filter}`);
   for (const filter of ['', '?accountId=birch', '?territory=West', '?territory=Northeast&territory=West']) await h.api(`/api/barrow/reports/${kind}${suffix}${filter}`, undefined, { ...repA.who, status: 403 });
  }
 }
 assert.equal((await h.request('/api/barrow/reports/sales?territory=Northeast', repB.who)).status, 403);
 assert.equal((await h.request('/api/barrow/reports/sales?territory=West', repB.who)).status, 403, 'a territory held only in part is refused, never trimmed to the held account');
 assert.equal((await h.request('/api/barrow/reports/sales?accountId=birch', repB.who)).status, 200);

 // Orders: approve one before and one after a transfer; attribution is frozen per order at first approval.
 const first = await h.command('order.prepare', { accountId: 'cedar', lines: [{ sku: 'OAT-1', quantity: 2 }] }, repA.who);
 assert.equal(first.preparedBy, repA.id);
 await h.command('order.submit', { orderId: first.id }, repA.who);
 await h.command('order.approve', { orderId: first.id });
 const statement = who => h.api('/api/barrow/reports/commissions', undefined, who);
 assert.deepEqual((await statement({})).rows.map(row => [row.orderId, row.assignedRep, row.rep]), [[first.id, 'rep-a', 'rep-a']]);
 assert.deepEqual((await statement(repA.who)).rows.map(row => row.orderId), [first.id]);
 await h.api('/api/barrow/reports/commissions?rep=rep-b', undefined, { ...repA.who, status: 403 });
 assert.deepEqual((await statement(repB.who)).rows, [], 'a rep label alone grants no other rep’s statement');

 // Coverage: repB covers repA for a week, then the window passes. Coverage never moves attribution.
 await h.command('rep.cover', { userId: repB.id, kind: 'rep', target: repA.id, endsOn: easternDay(-1), reason: 'Past' }, { status: 400 });
 await h.command('rep.cover', { userId: repB.id, kind: 'rep', target: repA.id, reason: 'No end' }, { status: 400 });
 await h.command('rep.cover', { userId: repB.id, kind: 'rep', target: repB.id, endsOn: easternDay(7), reason: 'Self' }, { status: 400 });
 const vacation = await h.command('rep.cover', { userId: repB.id, kind: 'rep', target: repA.id, endsOn: easternDay(7), reason: 'Vacation week.' }, manager.who);
 assert.deepEqual(await accountIds(repB.who), ['birch', 'cedar', 'wren']);
 assert.equal((await readQuote(repB.who)).id, quote.id);
 assert.deepEqual((await h.api('/api/barrow/state', undefined, buyer)).accounts[0].currentReps.map(row => [row.name, row.coverage, row.through]), [['rep-a', false, undefined], ['rep-b', true, easternDay(7)]]);
 const during = await h.command('quote.message', { quoteId: quote.id, body: 'While rep-a is away' }, buyer);
 assert.ok(during.id); assert.deepEqual(quoteMail(quote.id).slice(-2).sort(), ['rep-a@example.test', 'rep-b@example.test']);
 assert.equal((await h.request('/api/barrow/reports/sales?territory=Northeast', repB.who)).status, 200, 'covering a rep’s whole book covers every account of their territory');
 assert.equal((await h.request('/api/barrow/reports/sales?accountId=cedar', repB.who)).status, 200);
 // The failed-contact task can now be reassigned to the covering rep, and only while they cover it.
 await h.command('followup.update', { id: failed.id, revision: failed.revision, ownerId: repB.id });
 await h.db.prepare('UPDATE bw_rep_assignments SET starts_on=?,ends_on=? WHERE id=?').bind('2026-01-01', '2026-01-02', vacation.id).run(); // the window passes (stand-in for the clock)
 assert.deepEqual(await accountIds(repB.who), ['birch']);
 await readQuote(repB.who, 404);
 await h.api('/api/barrow/reports/sales?accountId=cedar', undefined, { ...repB.who, status: 403 });
 assert.equal((await h.api('/api/barrow/followups?view=all', undefined, repB.who)).tasks.some(row => row.id === failed.id), false, 'a task leaves the rep’s queue when coverage ends');

 // Scheduled sends: a queued delivery is cancelled and the link revoked the moment the assignment ends.
 await h.configure({ MAIL_WEBHOOK_SECRET: undefined });
 const schedule = await h.command('report.save', { name: 'Cedar monthly', reportType: 'sales', filters: { accountId: 'cedar' }, recipientIds: [repA.id] });
 const run = await h.command('report.run', { scheduleId: schedule.id }), download = `/api/barrow/report-runs/${run.id}.json`;
 assert.equal((await h.request(download, repA.who)).status, 200);
 await h.command('report.save', { name: 'Birch for rep-a', reportType: 'sales', filters: { accountId: 'birch' }, recipientIds: [repA.id] }, { status: 400 });
 await h.command('report.save', { name: 'Territory for rep-a', reportType: 'sales', filters: { territory: 'Northeast' }, recipientIds: [repA.id] }, { status: 400 });
 const queued = () => h.db.prepare('SELECT status,reason FROM bw_report_deliveries WHERE run_id=? AND operator_id=?').bind(run.id, repA.id).first();
 assert.equal((await queued()).status, 'not configured');
 const transferred = await h.command('rep.transfer', { id: territory.id, revision: territory.revision, toUserId: repB.id, reason: 'Territory moves to rep-b.' }, manager.who);
 assert.deepEqual(await queued(), { status: 'cancelled', reason: 'rep assignment changed' });
 await h.api(download, undefined, { ...repA.who, status: 403 });
 assert.deepEqual(await accountIds(repA.who), []);
 await readQuote(repA.who, 404);
 await h.api('/api/barrow/reports/sales?accountId=cedar', undefined, { ...repA.who, status: 403 });
 assert.deepEqual(await accountIds(repB.who), ['birch', 'cedar', 'wren']);
 assert.deepEqual((await h.api('/api/barrow/state', undefined, buyer)).accounts[0].currentReps, [{ name: 'rep-b', coverage: false }]);

 // Future attribution follows the transfer; the earlier order, snapshot and audit keep rep-a.
 const second = await h.command('order.prepare', { accountId: 'cedar', lines: [{ sku: 'OAT-1', quantity: 2 }] }, repB.who);
 await h.command('order.submit', { orderId: second.id }, repB.who);
 await h.command('order.approve', { orderId: second.id });
 assert.deepEqual((await statement({})).rows.map(row => [row.orderId, row.assignedRep, row.rep]).sort(), [[first.id, 'rep-a', 'rep-a'], [second.id, 'rep-b', 'rep-b']].sort());
 assert.deepEqual((await statement(repA.who)).rows, [], 'a transferred account leaves the old rep’s statement while its frozen attribution stays');
 assert.deepEqual((await statement(repB.who)).rows.map(row => row.orderId), [second.id]);
 assert.equal((await h.api(`/api/barrow/orders/${first.id}`)).preparedBy, repA.id, 'earlier orders keep their preparer');
 // Ending an assignment is immediate and audited; transferring or ending twice is refused as stale.
 await h.command('rep.end', { id: transferred.id, revision: transferred.revision, reason: 'Rep left.' }, manager.who);
 assert.deepEqual(await accountIds(repB.who), ['birch']);
 await h.command('rep.end', { id: transferred.id, revision: transferred.revision, reason: 'Again.' }, { ...manager.who, status: 409 });
 await h.command('rep.transfer', { id: transferred.id, revision: transferred.revision, toUserId: repA.id, reason: 'Stale.' }, { ...manager.who, status: 409 });
 const events = (await h.api('/api/barrow/audit?limit=200')).events.filter(event => event.action.startsWith('rep.'));
 assert.deepEqual([...new Set(events.map(event => event.action))].sort(), ['rep.assigned', 'rep.covered', 'rep.ended', 'rep.transferred']);
 assert.ok(events.every(event => event.reason && event.actorId));
 // No attribution comes from profile text: the account's own assignedRep stayed text throughout.
 assert.equal((await h.api('/api/barrow/accounts/by-id/cedar')).value.assignedRep, 'profile-text-only');
});
