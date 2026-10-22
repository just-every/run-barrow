import test from 'node:test';
import assert from 'node:assert/strict';
import { installation, stock, accountValue, archive, restore } from './harness.mjs';

const policy = (role, extra = {}) => ({
 role, accounts: ['cedar'], warehouses: [], reports: [],
 discountLimitCents: 0, stockExceptionLimitCents: 0, ...extra,
});
const reason = 'Owner reviewed this exact functional role and scope.';

// Consume the invitation staff.invite actually sent. Reinviting through signIn
// would change the Native lifecycle under test and hide version-binding errors.
async function confirmInvitation(h, email) {
 const message = h.mail.requests.findLast(row => row.message.to.includes(email))?.message;
 assert.ok(message, 'Native invitation reached the external mail edge');
 const href = message.text?.match(/https?:\/\/[^\s<>]+\/auth\/confirm\?token=[^\s<>]+/)?.[0]
  ?? message.html?.match(/href="([^"]*\/auth\/confirm\?token=[^"]+)"/)?.[1]?.replaceAll('&amp;', '&');
 assert.ok(href, 'Invitation has the public Native confirmation link');
 const link = new URL(href);
 assert.equal(link.origin, h.origin);
 const response = await h.request('/auth/confirm', { method: 'POST', as: '', body: { token: link.searchParams.get('token') } });
 assert.equal(response.status, 303);
 return { as: response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
}

test('ACC-005: owner grants Native members scoped functional work, amount approvals and reports; narrowing and revocation immediately close every exercised door', async t => {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 const products = await stock(pier, '100');
 const otherCustomer = await pier.command('party.save', { name: 'Wren Market', kind: 'customer' });
 const reportMail={MAIL_WEBHOOK_SECRET:Buffer.from('synthetic-barrow-11').toString('base64'),MAIL_EVENT_TENANT:'synthetic-barrow-12'};
 const h = await installation({https:true,bindings:{...reportMail,PIER_ORIGIN:pier.origin,PIER_SESSION:pier.cookie}}); t.after(() => h.close());
 await h.command('account.save', { id: 'cedar', value: { ...accountValue(products.customer.id), assignedRep: 'synthetic-barrow-1' } });
 await h.command('account.save', { id: 'wren', value: { ...accountValue(otherCustomer.id, 'wren@example.test'), name: 'Wren Market', assignedRep: 'synthetic-barrow-2' } });
 const buyer = { as: await h.signIn('buyer@example.test') }, admin = { as: await h.signIn('admin@example.test', 'admin') };
 const { token } = await h.api('/api/barrow/agent-token', {}), agent = { as: '', headers: { authorization: `Bearer ${token}` } };
 const roster = async () => (await h.api('/api/barrow/staff/members')).members;
 const invite = (email, grantPolicy, opts = {}) => h.command('staff.invite', { email, name: 'Functional staff', policy: grantPolicy, reason }, opts);
 const update = (grant, grantPolicy, opts = {}) => h.command('staff.update', { userId: grant.userId, revision: grant.revision, policy: grantPolicy, reason }, opts);

 for (const who of [buyer, admin, agent]) {
  await invite('forbidden@example.test', policy('rep'), { ...who, status: 403 });
  await h.api('/api/barrow/staff/members', undefined, { ...who, status: 403 });
 }
 const invalid = [
  policy('owner'), policy('rep', { accounts: ['absent'] }), policy('rep', { accounts: null }),
  policy('rep', { reports: ['private-report'] }), policy('rep', { reports: ['commissions'] }),
  policy('finance', { commissionRep: 'synthetic-barrow-1' }), policy('rep', { discountLimitCents: -1 }),
  policy('rep', { stockExceptionLimitCents: 1.5 }), { role: 'rep', accounts: 'all' },
 ];
 for (const grantPolicy of invalid) await invite('invalid@example.test', grantPolicy, { status: 400 });
 await invite('buyer@example.test', policy('rep'), { status: 409 });
 await invite('owner@example.test', policy('rep'), { status: 409 });

 const activate = async (email, grantPolicy) => {
  const grant = await invite(email, grantPolicy);
  assert.equal(grant.status, 'invited'); assert.equal(grant.effective, false);
  assert.equal((await roster()).find(row => row.userId === grant.userId).effective, false);
  const pending = (await h.api('/auth/operators')).find(row => row.id === grant.userId);
  assert.equal(pending.role, 'member'); assert.equal(pending.status, 'invited');
  const who = await confirmInvitation(h, email);
  const native = (await h.api('/auth/operators')).find(row => row.id === grant.userId);
  assert.equal(native.role, 'member'); assert.equal(native.status, 'active');
  const effective = (await roster()).find(row => row.userId === grant.userId);
  assert.equal(effective.effective, true); assert.equal(effective.nativeVersion, native.version);
  assert.equal((await h.api('/api/barrow/state', undefined, who)).actor.staff.userId, native.id);
  return { grant: effective, who };
 };
 await h.api('/api/barrow/state', undefined, { as: '', status: 401 });
 let { grant: repGrant, who: rep } = await activate('rep@example.test', policy('rep', { reports: ['sales', 'quotes', 'commissions'], commissionRep: 'synthetic-barrow-1', discountLimitCents: 100 }));
 let { grant: managerGrant, who: manager } = await activate('manager@example.test', policy('sales-manager', { warehouses: 'all', discountLimitCents: 100, stockExceptionLimitCents: 13000 }));
 const { who: finance } = await activate('finance@example.test', policy('finance', { reports: ['finance'] }));
 let { grant: operationsGrant, who: operations } = await activate('operations@example.test', policy('operations', { warehouses: ['New York'], reports: ['fulfillment'] }));
 let { grant: analystGrant, who: analyst } = await activate('analyst@example.test', policy('analyst', { warehouses: ['New York'], reports: ['sales', 'fulfillment'] }));

 await update(repGrant, policy('rep'), { ...rep, status: 403 });
 await h.command('staff.revoke', { userId: repGrant.userId, revision: repGrant.revision, reason }, { ...admin, status: 403 });
 await invite('delegated@example.test', policy('rep'), { ...manager, status: 403 });
 assert.deepEqual((await h.api('/api/barrow/state', undefined, rep)).accounts.map(row => row.id), ['cedar']);
 await h.api('/api/barrow/accounts/by-id/wren', undefined, { ...rep, status: 404 });
 await h.command('order.prepare', { accountId: 'wren', lines: [{ sku: 'OAT-1', quantity: 2 }] }, { ...rep, status: 404 });
 await h.command('settings.timezone', { timeZone: 'UTC' }, { ...manager, status: 403 });
 await h.command('synthetic-barrow-3', {}, { ...rep, status: 403 });
 await h.api('/api/barrow/synthetic-barrow-4', undefined, { ...rep, status: 403 });
 for (const who of [rep,operations,finance,analyst]) {
  const actor=(await h.api('/api/barrow/state',undefined,who)).actor;
  const own=(await h.api('/api/barrow/audit',undefined,who)).events;
  assert.ok(own.every(event=>event.actorId===actor.id&&(!event.accountId||event.accountId==='cedar')));
 }

 // A rep may propose at their exact amount limit; a larger discount waits for
 // a manager covering both this account and the whole discount amount.
 let quote = await h.command('quote.request', { accountId: 'cedar', lines: [{ sku: 'OAT-1', quantity: 2 }] }, rep);
 const foreignQuote = await h.command('quote.request', { accountId: 'wren', lines: [{ sku: 'OAT-1', quantity: 2 }] });
 const validUntil = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
 await h.command('quote.propose',{quoteId:quote.id,revision:quote.revision,validUntil,lines:[{sku:'OAT-1',quantity:2}],freightQuote:{methodId:'synthetic-barrow-14',warehouse:'New York',cents:100,reason:'Rep cannot grant a supplier freight quote.'}},{...rep,status:403});
 const propose = unitCents => h.command('quote.propose', { quoteId: quote.id, revision: quote.revision, validUntil, lines: [{ sku: 'OAT-1', quantity: 2, unitCents }], reason: 'Agreed exact merchandise discount.' }, rep);
 quote = await propose(6450);
 assert.equal(quote.status, 'proposed'); assert.equal(quote.revisions.at(-1).approval.by, repGrant.userId);
 assert.equal(quote.revisions.at(-1).basisCents - quote.revisions.at(-1).totalCents, 100);
 quote = await propose(6400); assert.equal(quote.status, 'awaiting-approval');
 const approval = { quoteId: quote.id, revision: quote.revision, number: 2, reason: 'Manager reviewed this exact discount.' };
 await h.command('quote.approve', approval, { ...rep, status: 403 });
 await h.command('quote.approve', approval, { ...manager, status: 403 });
 managerGrant = await update(managerGrant, policy('sales-manager', { warehouses: 'all', discountLimitCents: 200, stockExceptionLimitCents: 13000 }));
 await h.command('quote.propose', { quoteId: foreignQuote.id, revision: foreignQuote.revision, validUntil, lines: [{ sku: 'OAT-1', quantity: 2 }] }, { ...manager, status: 404 });
 quote = await h.command('quote.approve', approval, manager);
 assert.equal(quote.status, 'proposed'); assert.equal(quote.revisions.at(-1).approval.by, managerGrant.userId);
 await h.command('quote.message', { quoteId: quote.id, internal: true, body: 'synthetic-barrow-5 private sales discussion' }, rep);

 const draft = await h.command('order.prepare', { accountId: 'cedar', lines: [{ sku: 'OAT-1', quantity: 2 }] }, rep);
 const larger = await h.command('order.prepare', { accountId: 'cedar', lines: [{ sku: 'OAT-1', quantity: 3 }] }, rep);
 await h.command('order.stock-exception', { orderId: larger.id, reason: 'Above the owner allowance.' }, { ...manager, status: 403 });
 await h.command('order.stock-exception', { orderId: draft.id, reason: 'Rep cannot accept stale stock.' }, { ...rep, status: 403 });
 const excepted = await h.command('order.stock-exception', { orderId: draft.id, reason: 'Manager counted the shelf at the exact amount limit.' }, manager);
 assert.equal(excepted.totalCents, managerGrant.stockExceptionLimitCents); assert.equal(excepted.stockException.by, managerGrant.userId);
 await h.command('order.submit', { orderId: draft.id }, { ...rep, status: 403 }); // the account has a buyer: REP-001 leaves submission to them
 await h.command('order.submit', { orderId: draft.id }, buyer);
 await h.command('order.approve', { orderId: draft.id }, { ...operations, status: 403 });
 operationsGrant = await update(operationsGrant, policy('operations', { warehouses: 'all', reports: ['fulfillment'] }));
 const approved = await h.command('order.approve', { orderId: draft.id }, operations);
 assert.equal(approved.status, 'approved'); assert.equal((await h.api(`/api/barrow/orders/${approved.id}`, undefined, finance)).id, approved.id);
 assert.equal((await h.request(`/api/barrow/invoices/${approved.id}.csv`, finance)).status, 200);
 await h.api(`/api/barrow/orders/${larger.id}`, undefined, { ...finance, status: 404 });
 await h.api('/api/barrow/invoices/' + approved.id + '.csv', undefined, { ...rep, status: 403 });
 for (const who of [finance, operations, analyst]) {
  await h.command('order.prepare', { accountId: 'cedar', lines: [{ sku: 'OAT-1', quantity: 2 }] }, { ...who, status: 403 });
  await h.api(`/api/barrow/quotes/${quote.id}`, undefined, { ...who, status: 403 });
 }
 assert.deepEqual((await h.api('/api/barrow/state', undefined, finance)).accounts[0].value.prices, []);
 assert.deepEqual((await h.api('/api/barrow/state', undefined, analyst)).accounts, []);
 await h.api('/api/barrow/catalogue?accountId=cedar', undefined, { ...finance, status: 403 });

 // Report rights do not authorize a broader account/warehouse filter or a
 // different commission rep, including through downloadable CSV reports.
 for (const suffix of ['', '.csv']) {
  for (const filter of ['', '?accountId=wren', '?accountId=cedar&accountId=wren'])
   await h.api(`/api/barrow/reports/sales${suffix}${filter}`, undefined, { ...rep, status: 403 });
  assert.equal((await h.request(`/api/barrow/reports/sales${suffix}?accountId=cedar`, rep)).status, 200);
  await h.api(`/api/barrow/reports/finance${suffix}?accountId=cedar`, undefined, { ...rep, status: 403 });
  await h.api(`/api/barrow/reports/sales${suffix}?accountId=cedar`, undefined, { ...finance, status: 403 });
  assert.equal((await h.request(`/api/barrow/reports/finance${suffix}?accountId=cedar`, finance)).status, 200);
  await h.api(`/api/barrow/reports/commissions${suffix}?accountId=cedar&rep=synthetic-barrow-2`, undefined, { ...rep, status: 403 });
 }
 const commissions = await h.api('/api/barrow/reports/commissions?accountId=cedar', undefined, rep);
 assert.equal(commissions.filter.rep, 'synthetic-barrow-1'); assert.ok(commissions.rows.length > 0);
 assert.ok(commissions.rows.every(row => row.accountId === 'cedar' && row.rep === 'synthetic-barrow-1'));
 const repCsv = await (await h.request('/api/barrow/reports/commissions.csv?accountId=cedar', rep)).text();
 assert.ok(repCsv.includes('synthetic-barrow-1')); assert.ok(!repCsv.includes('synthetic-barrow-2'));
 for (const warehouse of ['', '&warehouse=Elsewhere']) await h.api(`/api/barrow/reports/fulfillment?accountId=cedar${warehouse}`, undefined, { ...analyst, status: 403 });
 assert.equal((await h.request('/api/barrow/reports/fulfillment?accountId=cedar&warehouse=New%20York', analyst)).status, 200);

 // Refresh and assignment use the task's complete account and role scope.
 let board = await h.command('followup.refresh', {}, rep);
 assert.ok(board.tasks.some(task => task.sourceId === quote.id)); assert.ok(board.tasks.every(task => task.accountId === 'cedar'));
 const task = board.tasks.find(row => row.sourceId === quote.id);
 assert.equal(task.ownerId, repGrant.userId);
 await h.command('followup.update', { id: task.id, revision: task.revision, ownerId: operationsGrant.userId }, { status: 400 });
 const assigned = await h.command('followup.update', { id: task.id, revision: task.revision, ownerId: managerGrant.userId, contact: { outcome: 'failed', note: 'synthetic-barrow-6 manual contact' } }, rep);
 assert.equal(assigned.ownerId, managerGrant.userId); assert.equal(assigned.contacts.at(-1).by, repGrant.userId);
 await h.command('followup.refresh', {});
 const foreignTask = (await h.api('/api/barrow/followups?view=all')).tasks.find(row => row.sourceId === foreignQuote.id);
 assert.ok(foreignTask);
 await h.command('followup.update', { id: foreignTask.id, revision: foreignTask.revision, ownerId: repGrant.userId }, { status: 400 });
 await h.command('followup.update', { id: foreignTask.id, revision: foreignTask.revision, close: true, resolution: 'Out of scope.' }, { ...rep, status: 404 });
 board = await h.command('followup.refresh', {}, rep);
 assert.ok(board.tasks.every(row => row.accountId === 'cedar')); assert.equal(board.tasks.find(row => row.id === task.id).contacts.length, 1);
 const tasksCsv = await (await h.request('/api/barrow/export/followups.csv', rep)).text();
 assert.ok(tasksCsv.includes(task.id)); assert.ok(!tasksCsv.includes(foreignTask.id));
 const financeExport = await h.api('/api/barrow/export.json', undefined, finance);
 assert.deepEqual(financeExport.manifest.accountIds, ['cedar']); assert.deepEqual(financeExport.prices, []); assert.deepEqual(financeExport.quotes, []);
 assert.ok(!JSON.stringify(financeExport).includes('synthetic-barrow-5'));
 assert.ok(financeExport.orders.every(row => row.accountId === 'cedar' && row.status === 'approved'));

 // Saved recipients must cover the whole immutable filter. Changing a grant
 // invalidates old links even when the owner later restores the same scope.
 const saveReport = (filters, recipientIds = [repGrant.userId]) => h.command('report.save', { name: 'Scoped monthly sales', reportType: 'sales', filters, recipientIds });
 await h.command('report.save', { name: 'No delegated scheduling', reportType: 'sales', filters: { accountId: 'cedar' }, recipientIds: [repGrant.userId] }, { ...rep, status: 403 });
 for (const filters of [{}, { accountId: 'wren' }]) await h.command('report.save', { name: 'Too broad', reportType: 'sales', filters, recipientIds: [repGrant.userId] }, { status: 400 });
 const schedule = await saveReport({ accountId: 'cedar' });
 const run = await h.command('report.run', { scheduleId: schedule.id }), download = `/api/barrow/report-runs/${run.id}.json`;
 const reportMails=()=>h.mail.requests.filter(row=>row.message.subject.startsWith('Barrow report:'));
 assert.equal(reportMails().length,1);assert.deepEqual(reportMails()[0].message.to,['rep@example.test']);
 assert.ok(!reportMails()[0].message.text.includes(approved.id));assert.ok(!reportMails()[0].message.text.includes('Cedar Street Pantry'));
 await h.command('report.run',{scheduleId:schedule.id});await h.command('report.dispatch',{});
 assert.equal(reportMails().length,1,'An activated member recipient gets one notification per snapshot');
 assert.equal((await h.api(download, undefined, rep)).filters.accountId, 'cedar');
 await h.api(download, undefined, { ...finance, status: 403 });
 assert.ok((await h.api('/api/barrow/report-schedules', undefined, rep)).schedules.some(row => row.id === schedule.id));
 // Historical pending-delivery fixture at the network edge: source snapshot,
 // recipient and grant all came through public commands, not a stand-in sender.
 await h.db.prepare("UPDATE bw_report_deliveries SET status='queued',provider_message_id=NULL WHERE run_id=? AND operator_id=?").bind(run.id,repGrant.userId).run();
 repGrant = await update(repGrant, policy('rep', { accounts: [], reports: ['sales', 'commissions'], commissionRep: 'synthetic-barrow-1' }));
 await h.command('report.dispatch',{});assert.equal(reportMails().length,1);
 assert.equal((await h.api('/api/barrow/report-schedules')).runs.length,0);
 assert.equal((await h.api('/api/barrow/report-schedules',undefined,rep)).runs.find(row=>row.id===run.id).status,'cancelled');
 assert.deepEqual((await h.api('/api/barrow/state', undefined, rep)).accounts, []);
 await h.api('/api/barrow/reports/sales?accountId=cedar', undefined, { ...rep, status: 403 });
 await h.api(download, undefined, { ...rep, status: 403 });
 await h.command('followup.update', { id: assigned.id, revision: assigned.revision, contact: { outcome: 'reached', note: 'Grant no longer covers this account.' } }, { ...rep, status: 404 });
 repGrant = await update(repGrant, policy('rep', { reports: ['sales', 'commissions'], commissionRep: 'synthetic-barrow-1' }));
 await h.api(download, undefined, { ...rep, status: 403 });
 const freshSchedule = await saveReport({ accountId: 'cedar' }), freshRun = await h.command('report.run', { scheduleId: freshSchedule.id });
 const freshDownload = `/api/barrow/report-runs/${freshRun.id}.json`;
 assert.equal((await h.request(freshDownload, rep)).status, 200);
 await h.command('staff.revoke', { userId: repGrant.userId, revision: repGrant.revision, reason: 'Owner ended this staff assignment.' });
 assert.equal((await roster()).find(row => row.userId === repGrant.userId).effective, false);
 assert.equal((await h.api('/api/barrow/state', undefined, rep)).actor.staff, null);
 await h.api(freshDownload, undefined, { ...rep, status: 403 });
 await h.api('/api/barrow/reports/sales?accountId=cedar', undefined, { ...rep, status: 403 });
 await h.api(`/api/barrow/quotes/${quote.id}`, undefined, { ...rep, status: 404 });
 await h.api('/api/barrow/followups', undefined, { ...rep, status: 403 });
 await h.api('/api/barrow/export/followups.csv', undefined, { ...rep, status: 403 });
 await h.command('order.prepare', { accountId: 'cedar', lines: [{ sku: 'OAT-1', quantity: 2 }] }, { ...rep, status: 404 });

 // Native identity changes never resurrect the grant under a fresh session.
 await h.api('/auth/operator/status', { operatorId: analystGrant.userId, status: 'inactive' });
 await h.api('/api/barrow/reports/sales?accountId=cedar', undefined, { ...analyst, status: 401 });
 await h.api('/auth/operator/status', { operatorId: analystGrant.userId, status: 'active' });
 analyst = { as: await h.signIn('analyst@example.test', 'existing') };
 assert.equal((await h.api('/api/barrow/state', undefined, analyst)).actor.staff, null);
 await h.api('/api/barrow/reports/sales?accountId=cedar', undefined, { ...analyst, status: 403 });
 analystGrant = await update(analystGrant, policy('analyst', { accounts: 'all', reports: ['sales'] }));
 assert.equal((await h.request('/api/barrow/reports/sales', analyst)).status, 200);
 const native = (await h.api('/auth/operators')).find(row => row.id === analystGrant.userId);
 assert.equal(analystGrant.nativeVersion, native.version);

 // An invited outside finance operator is an exact private recipient, can opt out,
 // and cannot use another staff person's link. No bare-address subscription exists.
 const financeId=(await h.api('/api/barrow/state',undefined,finance)).actor.id;
 const financeSchedule=await h.command('report.save',{name:'Outside accountant aging',reportType:'finance',filters:{accountId:'cedar'},recipientIds:[financeId]});
 const financeRun=await h.command('report.run',{scheduleId:financeSchedule.id});
 const financeDownload=`/api/barrow/report-runs/${financeRun.id}.json`;
 assert.equal((await h.request(financeDownload,finance)).status,200);
 await h.api(financeDownload,undefined,{...analyst,status:403});
 await h.command('report.remove-recipient',{scheduleId:financeSchedule.id},finance);
 await h.api(financeDownload,undefined,{...finance,status:403});
 const ownAudit=(await h.api('/api/barrow/audit',undefined,manager)).events;
 assert.ok(ownAudit.some(event=>event.action==='quote.discount-approved'&&event.accountId==='cedar'&&event.revision&&event.source&&event.reason));
 assert.ok(ownAudit.every(event=>event.actorId===managerGrant.userId));
 const ownCsv=await (await h.request('/api/barrow/audit.csv',manager)).text();
 assert.ok(ownCsv.includes('quote.discount-approved'));assert.ok(!ownCsv.includes('staff.granted'));
 for(const who of [rep,operations,finance,analyst])await h.api('/api/barrow/applications',undefined,{...who,status:403});
 // Manager policy edits require explicit authority for the entire policy.
 await h.api('/api/barrow/commissions',undefined,{...manager,status:403});
 managerGrant=await update(managerGrant,policy('sales-manager',{accounts:'all',warehouses:'all',reports:['commissions'],discountLimitCents:200,stockExceptionLimitCents:13000}));
 const freeCustomer=await pier.command('party.save',{name:'Community Gifts',kind:'customer'});
 await h.command('account.save',{id:'gifts',value:{...accountValue(freeCustomer.id,'synthetic-barrow-13@example.test'),name:'Community Gifts',minimumCents:0,prices:[{sku:'OAT-1',unitCents:0,minQty:1}]}});
 managerGrant=await update(managerGrant,policy('sales-manager',{accounts:'all',warehouses:'all',reports:['commissions'],discountLimitCents:200,stockExceptionLimitCents:0}));
 const freeDraft=await h.command('order.prepare',{accountId:'gifts',lines:[{sku:'OAT-1',quantity:1}]});assert.equal(freeDraft.totalCents,0);
 await h.command('order.stock-exception',{orderId:freeDraft.id,reason:'Zero allowance grants no stock exception, including free merchandise.'},{...manager,status:403});
 const commissionPolicy=await h.api('/api/barrow/commissions',undefined,manager);
 const changedPolicy=await h.command('commission.settings',{revision:commissionPolicy.revision,reason:'Manager reviewed future original-line attribution.',rules:[{id:'synthetic-barrow-10',rep:'synthetic-barrow-1',from:validUntil,rateBps:500,basis:'acceptance',splits:[{rep:'synthetic-barrow-1',shareBps:10000}]}]},manager);
 assert.ok(changedPolicy.revision);assert.equal((await h.api('/api/barrow/commissions',undefined,manager)).rules[0].id,'synthetic-barrow-10');
 // Portability carries attribution without reviving staff authority or outreach.
 const target=await installation({https:true,bindings:reportMail});t.after(()=>target.close());
 await restore(target,await archive(h));
 const restoredGrants=(await target.api('/api/barrow/staff/members')).members;
 assert.equal(restoredGrants.length,(await roster()).length);
 assert.ok(restoredGrants.every(grant=>grant.state==='revoked'&&!grant.effective));
 await target.api(financeDownload,undefined,{status:403});
 const restoredSchedules=await target.api('/api/barrow/report-schedules');
 assert.ok(restoredSchedules.schedules.every(schedule=>schedule.restored===1));
 await target.command('report.dispatch',{});assert.equal(target.mail.requests.filter(row=>row.message.subject.startsWith('Barrow report:')).length,0);
 const events = (await h.api('/api/barrow/audit?limit=200')).events;
 for (const action of ['staff.granted', 'staff.rights-changed', 'staff.revoked', 'staff.permission-refused']) {
  const event = events.find(row => row.action === action);
  assert.ok(event, action); assert.ok(event.actorId && event.createdAt && event.revision && event.source && event.reason);
 }
});

test('functional application reviewers: all-account managers decide and download, finance reads certificates, every other grant and revoked access is refused', async t => {
 const h=await installation({https:true});t.after(()=>h.close());
 await h.command('account.save',{id:'cedar',value:accountValue('synthetic-barrow-302')});
 const {verifiedApplication}=await import('./application-fixture.mjs');
 const {application:submitted,applicant,bytes}=await verifiedApplication(h);
 const grantPerson=async(email,grantPolicy)=>{
  const who={as:await h.signIn(email)};
  const grant=await h.command('staff.invite',{email,name:'Functional reviewer',policy:grantPolicy,reason});
  return {who,grant};
 };
 const managerPolicy=policy('sales-manager',{accounts:'all',entitlements:['applications']});
 let {who:manager,grant:managerGrant}=await grantPerson('reviewer@example.test',managerPolicy);
 let {who:finance,grant:financeGrant}=await grantPerson('certificate@example.test',policy('finance',{entitlements:['application-documents']}));
 for(const invalid of [policy('sales-manager',{entitlements:['applications']}),policy('rep',{accounts:'all',entitlements:['applications']}),policy('operations',{entitlements:['application-documents']}),policy('analyst',{entitlements:['applications']}),policy('sales-manager',{accounts:'all',entitlements:['application-documents']}),policy('finance',{entitlements:['applications']})])
  await h.command('staff.invite',{email:'invalid-reviewer@example.test',name:'Invalid reviewer',policy:invalid,reason},{status:400});
 const forbidden=[];
 for(const [index,grantPolicy] of [policy('rep'),policy('operations'),policy('analyst'),policy('sales-manager'),policy('sales-manager',{accounts:'all'}),policy('finance')].entries())
  forbidden.push((await grantPerson(`restricted-${index}@example.test`,grantPolicy)).who);
 const {token}=await h.api('/api/barrow/agent-token',{});
 forbidden.push({as:'',headers:{authorization:`Bearer ${token}`}});
 const documentPath=submitted.documents[0].path;
 const refusal=async who=>{
  for(const path of ['/api/barrow/applications',documentPath,'/api/barrow/export/applications.csv','/api/barrow/export/applicationdocuments.csv'])await h.api(path,undefined,{...who,status:403});
  for(const type of ['application.request-information','application.approve','application.decline','application.rules.save'])await h.command(type,{id:submitted.id,revision:submitted.revision,reason}, {...who,status:403});
 };
 for(const who of forbidden)await refusal(who);
 // A valid applicant cookie must not turn a staff permission refusal into a document grant.
 await h.api(documentPath,undefined,{as:forbidden[0].as+'; '+applicant.as,status:403});
 const queue=await h.api('/api/barrow/applications',undefined,manager);
 assert.equal(queue.access,'review');let row=queue.applications.find(row=>row.id===submitted.id);
 assert.equal(row.value.email,'applicant@example.test');assert.equal(row.duplicates[0].id,'cedar');
 const financeView=await h.api('/api/barrow/applications',undefined,finance);
 assert.equal(financeView.access,'documents');assert.deepEqual(financeView.applications[0].value,{name:'Cedar Street Pantry'});
 assert.equal(financeView.applications[0].history,undefined);assert.equal(financeView.applications[0].duplicates,undefined);
 for(const who of [manager,finance]){
  const response=await h.request(documentPath,who);assert.equal(response.status,200);assert.equal(await response.text(),bytes);
  assert.equal((await h.request('/api/barrow/export/applicationdocuments.csv',who)).status,200);
 }
 assert.equal((await h.request('/api/barrow/export/applications.csv',manager)).status,200);
 await h.api('/api/barrow/export/applications.csv',undefined,{...finance,status:403});
 for(const type of ['application.request-information','application.approve','application.decline'])await h.command(type,{id:row.id,revision:row.revision,reason},{...finance,status:403});
 const decide=(type,application,extra={})=>h.command(type,{id:application.id,revision:application.revision,reason:'Reviewed exact application and separate-company duplicates.',duplicateReviews:application.duplicates.map(({id,kind,revision})=>({id,kind,revision})),...extra},manager);
 row=await decide('application.request-information',row);assert.equal(row.state,'information requested');
 row=await decide('application.approve',row,{accountDuplicateReviews:row.duplicates.filter(d=>d.kind==='account').map(({id,revision})=>({id,revision})),account:{pierCustomerId:'synthetic-barrow-304',termsDays:30,minimumCents:0,prices:[]}});
 assert.equal(row.state,'approved');assert.ok(row.accountId);assert.equal(row.invitationRequestedTo,'applicant@example.test');
 const invitation=h.mail.requests.findLast(r=>r.message.to.includes('applicant@example.test')&&r.message.subject==='Your company buyer invitation').message.text.match(/https?:\/\/[^\s<>]+/)[0];
 const link=new URL(invitation), buyer={as:await h.signIn('applicant@example.test','existing')};
 const joined=await h.command('company.accept',{invitationId:link.searchParams.get('companyInvitation'),token:link.searchParams.get('companyToken')},buyer);
 assert.equal(joined.accountId,row.accountId);assert.ok(joined.rights.includes('administrator'));
 const ownCertificate=await h.request(documentPath,{as:buyer.as+'; '+applicant.as});assert.equal(ownCertificate.status,200);assert.equal(await ownCertificate.text(),bytes);
 await h.api('/auth/operators',undefined,{...manager,status:403});
 await h.api('/auth/invite',{email:'unapproved@example.test',displayName:'No authority',role:'member'},{...manager,status:403});
 const second=await verifiedApplication(h,{name:'Harbor Provisions',email:'harbor@example.test'});
 const open=(await h.api('/api/barrow/applications',undefined,manager)).applications.find(row=>row.id===second.application.id);
 assert.equal((await decide('application.decline',open)).state,'declined');
 const pending=await verifiedApplication(h,{name:'Eastside Market',email:'eastside@example.test'});
 const pendingRow=(await h.api('/api/barrow/applications',undefined,manager)).applications.find(row=>row.id===pending.application.id);
 await decide('application.approve',pendingRow,{account:{pierCustomerId:'synthetic-barrow-306',termsDays:30,minimumCents:0,prices:[]}});
 const pendingLink=new URL(h.mail.requests.findLast(r=>r.message.to.includes('eastside@example.test')&&r.message.subject==='Your company buyer invitation').message.text.match(/https?:\/\/[^\s<>]+/)[0]);
 const pendingBuyer={as:await h.signIn('eastside@example.test','existing')};
 const events=(await h.api('/api/barrow/audit')).events;
 for(const action of ['application.information-requested','application.approved','application.declined','application.document-downloaded'])assert.ok(events.some(event=>event.action===action&&event.actorId===managerGrant.userId));
 assert.ok(events.some(event=>event.action==='application.document-downloaded'&&event.actorId===financeGrant.userId));
 managerGrant=await h.command('staff.update',{userId:managerGrant.userId,revision:managerGrant.revision,policy:policy('sales-manager',{accounts:'all'}),reason});
 await refusal(manager);
 await h.command('company.accept',{invitationId:pendingLink.searchParams.get('companyInvitation'),token:pendingLink.searchParams.get('companyToken')},{...pendingBuyer,status:409});
 await h.command('staff.revoke',{userId:financeGrant.userId,revision:financeGrant.revision,reason});
 await refusal(finance);
});
