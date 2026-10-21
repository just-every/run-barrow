// Manual ACC-005 journey: built HTTPS Worker, real D1/Pier, only Resend's edge faked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { installation, stock, accountValue } from '../api/harness.mjs';
import { captureWidths, signedContext } from './browser-helpers.mjs';

const assigned = 'synthetic-barrow-101', other = 'synthetic-barrow-102';
const reportLabels = { sales: 'Sales', finance: 'Invoice aging', quotes: 'Quote conversion', fulfillment: 'Fulfillment', commissions: 'Commissions' };
const people = [
 { number: 201, role: 'sales-manager', accounts: 'all', warehouses: 'all', reports: ['sales', 'quotes'], discountLimitCents: 5000, stockExceptionLimitCents: 20000, report: 'sales' },
 { number: 202, role: 'rep', accounts: [assigned], warehouses: ['New York'], reports: ['sales', 'commissions'], discountLimitCents: 1000, stockExceptionLimitCents: 0, commissionRep: 'synthetic-barrow-202', report: 'sales' },
 { number: 203, role: 'operations', accounts: [assigned], warehouses: ['New York'], reports: ['fulfillment'], discountLimitCents: 0, stockExceptionLimitCents: 0, report: 'fulfillment' },
 { number: 204, role: 'finance', accounts: [assigned], warehouses: [], reports: ['finance'], discountLimitCents: 0, stockExceptionLimitCents: 0, report: 'finance' },
 { number: 205, role: 'analyst', accounts: [assigned], warehouses: [], reports: ['sales', 'quotes'], discountLimitCents: 0, stockExceptionLimitCents: 0, report: 'sales' },
].map(person => ({ ...person, name: ({201:'Morgan Lee',202:'Avery Sales',203:'Jordan Operations',204:'Casey Finance',205:'Riley Analyst'})[person.number], email: `synthetic-barrow-${person.number}@example.test` }));

async function downloadedText(page, link) {
 const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
 const stream = await download.createReadStream();
 assert.ok(stream, 'The scoped report download has a readable body');
 const chunks = []; for await (const chunk of stream) chunks.push(chunk);
 return Buffer.concat(chunks).toString('utf8');
}

test('owner invites five native functional staff roles, exact scoped reports and supplier doors, then revokes live rep access at desktop and phone', async t => {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 const products = await stock(pier, '100');
 const otherCustomer = await pier.command('party.save', { name: other, kind: 'customer' });
 const h = await installation({ built: true, https: true, bindings: { PIER_ORIGIN: pier.origin, PIER_SESSION: pier.cookie } });
 t.after(() => h.close());
 for (const [id, customerId, rep] of [[assigned, products.customer.id, 'synthetic-barrow-202'], [other, otherCustomer.id, 'synthetic-barrow-206']]) {
  await h.command('account.save', { id, value: { ...accountValue(customerId, `${id}@example.test`), name: id===assigned?'Cedar Street Pantry':'Wren Market', minimumCents: 0, assignedRep: rep, warehouses: ['New York'] } });
 }
 const invoices = new Map();
 for (const accountId of [assigned, other]) {
  const draft = await h.command('order.prepare', { accountId, reference: accountId, lines: [{ sku: 'OAT-1', quantity: 2 }] });
  await h.command('order.submit', { orderId: draft.id });
  const order = await h.command('order.approve', { orderId: draft.id });
  assert.equal(order.status, 'approved'); assert.ok(order.invoice); assert.ok(order.pierOrderId);
  invoices.set(accountId, order);
 }
 assert.equal((await pier.api('/api/pier/state')).orders.length, 2, 'Both report sources have real Pier reservations');

 const assignedQuote=await h.command('quote.request',{accountId:assigned,lines:[{sku:'OAT-1',quantity:2}]});
 const otherQuote=await h.command('quote.request',{accountId:other,lines:[{sku:'OAT-1',quantity:2}]});
 await h.command('followup.refresh',{});
 const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] });
 t.after(() => browser.close());
 const ownerContext = await signedContext(browser, h); t.after(() => ownerContext.close());
 const owner = await ownerContext.newPage();
 await owner.goto(h.origin + '/app');
 if (new URL(owner.url()).pathname === '/setup') {
  await owner.getByLabel('Your name').fill('synthetic-barrow-200');
  await owner.getByRole('checkbox').check();
  await owner.getByRole('button', { name: 'Finish setup', exact: true }).click();
 }
 await owner.getByRole('button', { name: 'Team', exact: true }).click();
 const team = owner.getByRole('region', { name: 'Team access', exact: true });
 await team.getByRole('form', { name: 'Invite staff', exact: true }).waitFor();
 await captureWidths(owner, 'staff-owner-empty-team');

 async function json(page, path, status = 200) {
  const response = await page.request.get(h.origin + path);
  assert.equal(response.status(), status, `Staff GET ${path}`);
  const value = await response.json();
  if (status === 403) assert.equal(value.error.code, 'FORBIDDEN');
  return value;
 }
 async function deniedCommand(page, type, payload = {}) {
  const response = await page.request.post(h.origin + '/api/barrow/commands', { headers: { origin: h.origin }, data: { type, payload } });
  assert.equal(response.status(), 403, `Staff command ${type} is refused`);
  assert.equal((await response.json()).error.code, 'FORBIDDEN');
 }
 async function rosterPerson(email) {
  return (await h.api('/api/barrow/staff/members')).members.find(member => member.email === email);
 }

 const active = [];
 for (const person of people) {
  const form = team.getByRole('form', { name: 'Invite staff', exact: true });
  await form.getByLabel('Staff name', { exact: true }).fill(person.name);
  await form.getByLabel('Exact staff email', { exact: true }).fill(person.email);
  await form.getByLabel('Functional role', { exact: true }).selectOption(person.role);
  if (person.accounts === 'all') {
   await form.getByRole('checkbox', { name: 'All trade accounts, including future accounts', exact: true }).check();
  } else {
   await form.getByLabel('Trade account', { exact: true }).selectOption(assigned);
   await form.getByRole('button', { name: 'Add scoped account', exact: true }).click();
  }
  if (person.warehouses === 'all') {
   await form.getByRole('checkbox', { name: 'All warehouses, including future warehouses', exact: true }).check();
  } else {
   for (const warehouse of person.warehouses) {
    await form.getByLabel('Exact warehouse name', { exact: true }).fill(warehouse);
    await form.getByRole('button', { name: 'Add scoped warehouse', exact: true }).click();
   }
  }
  for (const [report, label] of Object.entries(reportLabels)) {
   await form.getByRole('checkbox', { name: label, exact: true }).setChecked(person.reports.includes(report));
  }
  await form.getByLabel('Discount approval allowance (USD cents)', { exact: true }).fill(String(person.discountLimitCents));
  await form.getByLabel('Stock exception allowance (USD cents)', { exact: true }).fill(String(person.stockExceptionLimitCents));
  await form.getByLabel('Fixed commission rep label (optional)', { exact: true }).fill(person.commissionRep ?? '');
  await form.getByLabel('Reason for this access change', { exact: true }).fill('Owner assigned this exact functional role, scope, reports and exception allowances.');
  await captureWidths(owner, `staff-invite-policy-${person.role}`);
  await form.getByRole('button', { name: 'Send native staff invitation', exact: true }).click();
  const card = team.getByRole('article').filter({ has: owner.getByRole('heading', { name: person.name, exact: true }) });
  await expect(card).toContainText('Native sign-in: invited');
  await expect(form.getByLabel('Exact staff email', { exact: true })).toHaveValue('');
  const pending = await rosterPerson(person.email);
  assert.equal(pending.status, 'invited'); assert.equal(pending.effective, false);
  for (const field of ['role', 'accounts', 'warehouses', 'reports', 'discountLimitCents', 'stockExceptionLimitCents']) assert.deepEqual(pending[field], person[field]);

  const message = h.mail.requests.findLast(row => row.message.to.includes(person.email))?.message;
  assert.ok(message, 'The native staff invitation reaches only the Resend network edge fake');
  const href = message.text?.match(/https?:\/\/[^\s<>]+\/auth\/confirm\?token=[^\s<>]+/)?.[0];
  assert.ok(href, 'The owner invitation supplies a native confirmation link');
  const link = new URL(href); assert.equal(link.origin, h.origin);
  // Fresh synthetic browser context: activate the original invitation through Base's real form.
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 } });
  t.after(() => context.close());
  const page = await context.newPage();
  await page.goto(h.origin + link.pathname + link.search);
  await page.getByRole('heading', { name: 'Accept your invitation to Barrow', exact: true }).waitFor();
  assert.equal((await rosterPerson(person.email)).effective, false, 'Previewing the link grants no supplier access');
  await captureWidths(page, `staff-native-confirm-${person.role}`);
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await page.waitForURL(h.origin + '/app');
  await page.getByRole('button', { name: 'Reports', exact: true }).waitFor();
  const state = await json(page, '/api/barrow/state');
  assert.equal(state.actor.role, 'member', 'Functional staff retain native member authority');
  assert.equal(state.actor.staff.role, person.role);
  assert.equal((await rosterPerson(person.email)).effective, true);
  assert.deepEqual(state.accounts.map(account => account.id).sort(), person.role === 'analyst' ? [] : person.accounts === 'all' ? [assigned, other] : [assigned]);
  for (const name of ['Team', 'Data', 'Move in']) await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  if (!['sales-manager', 'rep'].includes(person.role)) await expect(page.getByRole('button', { name: 'Order pad', exact: true })).toHaveCount(0);
  if (person.role !== 'sales-manager') await expect(page.getByRole('button', { name: 'Accounts', exact: true })).toHaveCount(0);
  if (['sales-manager', 'rep'].includes(person.role)) await page.getByRole('spinbutton', { name: /quantity for Toasted oat granola/ }).waitFor();
  else if (person.role !== 'analyst') await page.getByRole('heading', { name: 'All orders', exact: true }).waitFor();
  else await page.getByRole('heading', { name: 'Your staff reports', exact: true }).waitFor();
  await captureWidths(page, `staff-active-workspace-${person.role}`);

  // Unknown product doors and access administration never inherit native membership.
  await json(page, '/api/barrow/synthetic-barrow-999', 403);
  await json(page, '/api/barrow/staff/members', 403);
  await deniedCommand(page, 'synthetic-barrow-999');
  await deniedCommand(page, 'staff.invite', { email: 'synthetic-barrow-299@example.test' });
  await deniedCommand(page, 'credit.override', { accountId: assigned });
  active.push({ ...person, page, actor: state.actor, card });
 }

 await owner.reload();
 await owner.getByRole('button', { name: 'Team', exact: true }).click();
 await expect(team.getByRole('article')).toHaveCount(people.length);
 await expect(team.getByRole('article').filter({ hasText: 'Native sign-in: active' })).toHaveCount(people.length);
 await captureWidths(owner, 'staff-owner-active-roster');

 const financePerson=active.find(person=>person.role==='finance');
 const financeSchedule=await h.command('report.save',{name:'Outside accountant monthly aging',reportType:'finance',filters:{accountId:assigned},recipientIds:[financePerson.actor.id]});
 const financeRun=await h.command('report.run',{scheduleId:financeSchedule.id});
 for (const person of active) {
  const { page } = person;
  await page.getByRole('button', { name: 'Reports', exact: true }).click();
  const reports = page.getByRole('region', { name: 'Your staff reports', exact: true });
  await expect(reports.getByLabel('Entitled report', { exact: true }).getByRole('option')).toHaveText(['Choose a report', ...person.reports.map(name => reportLabels[name])]);
  await reports.getByLabel('Entitled report', { exact: true }).selectOption(person.report);
  await expect(reports.getByRole('button', { name: 'Read scoped report', exact: true })).toBeDisabled();
  const accounts = reports.getByLabel('Report account', { exact: true });
  assert.deepEqual(await accounts.locator('option').evaluateAll(options => options.map(option => option.value)), person.accounts === 'all' ? ['', '__all__', assigned, other] : ['', assigned]);
  await accounts.selectOption(assigned);
  if (person.report === 'finance') await reports.getByLabel('As of', { exact: true }).fill(invoices.get(assigned).invoice.issuedAt);
  if (person.report === 'fulfillment') {
   await expect(reports.getByRole('button', { name: 'Read scoped report', exact: true })).toBeDisabled();
   await expect(reports.getByLabel('Report warehouse', { exact: true }).getByRole('option')).toHaveText(['Choose an explicit warehouse scope', 'New York']);
   await reports.getByLabel('Report warehouse', { exact: true }).selectOption('New York');
  }
  await captureWidths(page, `staff-report-explicit-scope-${person.role}`);
  await reports.getByRole('button', { name: 'Read scoped report', exact: true }).click();
  const download = reports.getByRole('link', { name: 'Download scoped report (JSON)', exact: true });
  await download.waitFor();
  const report = JSON.parse(await downloadedText(page, download));
  const rows = report[person.report === 'fulfillment' ? 'lines' : 'rows'];
  assert.deepEqual(rows.map(row => row.orderId), [invoices.get(assigned).id], `${person.role} reads the assigned source without the other account`);
  assert.equal(JSON.stringify(report).includes(invoices.get(other).id), false);
  if (person.report === 'finance') {assert.equal(rows[0].amountCents, invoices.get(assigned).totalCents);await expect(reports.getByRole('region',{name:'Report totals',exact:true}).getByText('Current',{exact:true}).locator('..')).toContainText('USD 130.00');}
  if (person.report === 'sales') assert.equal(rows[0].bookedCents, invoices.get(assigned).totalCents);
  if (person.report === 'fulfillment') assert.equal(report.source, 'Pier');
  if (['sales', 'finance'].includes(person.report)) {
   const csv = await downloadedText(page, reports.getByRole('link', { name: 'Download scoped report (CSV)', exact: true }));
   assert.ok(csv.includes(invoices.get(assigned).id)); assert.equal(csv.includes(invoices.get(other).id), false);
  }
  person.reportPath = await download.getAttribute('href');
  if(person.role==='analyst')await expect(reports.getByRole('link',{name:/^Order /})).toHaveCount(0);
  await captureWidths(page, `staff-report-result-${person.role}`);
  if (person.accounts === 'all') {
   await accounts.selectOption('__all__');
   await reports.getByRole('button', { name: 'Read scoped report', exact: true }).click();
   await download.waitFor();
   const all = JSON.parse(await downloadedText(page, download));
   assert.deepEqual(all.rows.map(row => row.orderId).sort(), [...invoices.values()].map(order => order.id).sort());
   await captureWidths(page, 'staff-manager-explicit-all-account-report');
  }

  const suffix = person.report === 'fulfillment' ? '&warehouse=New+York' : '';
  if (person.accounts !== 'all') {
   await json(page, `/api/barrow/reports/${person.report}`, 403);
   await json(page, `/api/barrow/reports/${person.report}?accountId=${other}${suffix}`, 403);
   await json(page, `/api/barrow/reports/${person.report}?accountId=${assigned}&accountId=${other}${suffix}`, 403);
   if (person.report !== 'fulfillment') await json(page, `/api/barrow/reports/${person.report}.csv?accountId=${other}`, 403);
  }
  const unentitled = person.report === 'finance' ? 'sales' : 'finance';
  await json(page, `/api/barrow/reports/${unentitled}?accountId=${assigned}`, 403);
 }

 await financePerson.page.getByRole('button',{name:'Reports',exact:true}).click();
 const snapshots=financePerson.page.getByRole('region',{name:'Your scheduled snapshots',exact:true});
 const frozen=snapshots.getByRole('link',{name:'Download this frozen snapshot',exact:true});
 await frozen.waitFor();assert.equal(JSON.parse(await downloadedText(financePerson.page,frozen)).filters.accountId,assigned);
 await captureWidths(financePerson.page,'staff-finance-frozen-snapshot');
 await snapshots.getByRole('button',{name:'Remove me from Outside accountant monthly aging',exact:true}).click();
 await expect(snapshots.getByText('No active report subscriptions for this sign-in.',{exact:true})).toBeVisible();
 await expect(snapshots.getByRole('link',{name:'Download this frozen snapshot',exact:true})).toHaveCount(0);
 await json(financePerson.page,`/api/barrow/report-runs/${financeRun.id}.json`,403);
 await captureWidths(financePerson.page,'staff-finance-removed-snapshot');
 const rep = active.find(person => person.role === 'rep');
 await rep.page.getByRole('button',{name:'Follow-ups',exact:true}).click();
 await rep.page.getByRole('heading',{name:`Unanswered quote ${assignedQuote.id}`,exact:true}).waitFor();
 await expect(rep.page.getByRole('heading',{name:`Unanswered quote ${otherQuote.id}`,exact:true})).toHaveCount(0);
 const task=rep.page.getByRole('article').filter({has:rep.page.getByRole('heading',{name:`Unanswered quote ${assignedQuote.id}`,exact:true})});
 await task.getByText('Record a contact attempt',{exact:true}).click();
 await task.getByLabel('Contact note',{exact:true}).fill('Called the store manager; no answer. Follow up tomorrow.');
 await task.getByRole('button',{name:'Record contact',exact:true}).click();
 await task.getByText('Recorded contacts (1)',{exact:true}).waitFor();
 await captureWidths(rep.page,'staff-rep-assigned-followup');
 await rep.page.getByRole('button',{name:'Audit',exact:true}).click();
 await rep.page.getByRole('heading',{name:'Commercial audit',exact:true}).waitFor();
 await captureWidths(rep.page,'staff-own-audit');
 const managerPage=active.find(person=>person.role==='sales-manager').page;
 await managerPage.getByRole('button',{name:'Reports',exact:true}).click();
 await managerPage.getByText('Manage commission rules',{exact:true}).click();
 await captureWidths(managerPage,'staff-manager-commission-policy');
 await json(rep.page, `/api/barrow/accounts/by-id/${assigned}`);
 await json(rep.page, `/api/barrow/accounts/by-id/${other}`, 404);
 await json(rep.page, `/api/barrow/orders/${invoices.get(other).id}`, 404);
 await json(rep.page, `/api/barrow/reports/commissions?accountId=${assigned}&rep=synthetic-barrow-206`, 403);
 const operations = active.find(person => person.role === 'operations');
 await json(operations.page, `/api/barrow/reports/fulfillment?accountId=${assigned}&warehouse=synthetic-barrow-999`, 403);
 await json(operations.page, `/api/barrow/reports/fulfillment?accountId=${assigned}`, 403);
 await deniedCommand(operations.page, 'account.save', { id: assigned });
 await deniedCommand(active.find(person => person.role === 'analyst').page, 'order.prepare', { accountId: assigned });

 await team.getByRole('button', { name: `Edit access for ${rep.name}`, exact: true }).click();
 const edit = team.getByRole('form', { name: 'Edit staff access', exact: true });
 await expect(edit.getByLabel('Functional role', { exact: true })).toHaveValue('rep');
 await expect(edit.getByLabel('Discount approval allowance (USD cents)', { exact: true })).toHaveValue(String(rep.discountLimitCents));
 await edit.getByLabel('Reason for this access change', { exact: true }).fill('Owner ended this rep assignment; existing native sign-in must lose supplier data on its next request.');
 await captureWidths(owner, 'staff-owner-revoke-review');
 await edit.getByRole('button', { name: 'Revoke staff access', exact: true }).click();
 await expect(rep.card).toContainText('Staff grant: revoked');
 await expect(rep.card.getByRole('button', { name: `Edit access for ${rep.name}`, exact: true })).toHaveCount(0);
 assert.equal((await rosterPerson(rep.email)).effective, false);
 await captureWidths(owner, 'staff-owner-revoked-roster');

 // The very same signed-in browser loses both saved download links and live data.
 await json(rep.page, rep.reportPath, 403);
 await json(rep.page, rep.reportPath.replace('?', '.csv?'), 403);
 const revoked = await json(rep.page, '/api/barrow/state');
 assert.equal(revoked.actor.role, 'member'); assert.equal(revoked.actor.staff, null);
 assert.deepEqual(revoked.accounts, []); assert.deepEqual(revoked.orders, []);
 await json(rep.page, `/api/barrow/orders/${invoices.get(assigned).id}`, 404);
 await rep.page.reload();
 await rep.page.getByRole('heading', { name: 'No orders yet', exact: true }).waitFor();
 for (const name of ['Reports', 'Order pad', 'Team', 'Accounts']) await expect(rep.page.getByRole('button', { name, exact: true })).toHaveCount(0);
 await expect(rep.page.getByRole('link', { name: /Download scoped report/ })).toHaveCount(0);
 await captureWidths(rep.page, 'staff-revoked-native-member-end-state');
 assert.equal((await h.api(`/api/barrow/orders/${invoices.get(assigned).id}`)).status, 'approved');
});
