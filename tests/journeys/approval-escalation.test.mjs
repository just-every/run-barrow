import { accountFollowupFixture } from '../api/account-followup-fixture.mjs';
// Manual AUTO-002 journey: built HTTPS Worker, real D1/Pier, only Resend's edge faked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { installation, stock, accountValue } from '../api/harness.mjs';
import { captureWidths, captureRegionWidths, signedContext } from './browser-helpers.mjs';

const policyOf = (rights, extra = {}) => ({ rights, locations: 'all', perOrderLimitCents: null, approvalLimitCents: null, ...extra });
const hoursAgo = hours => new Date(Date.now() - hours * 3600000).toISOString();

test('approvers, delegates and the escalation approver see the steps waiting for them, each approval closes its notices, and the supplier’s overdue approval task names its blocking cause until approval at desktop and phone', async t => {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 const products = await stock(pier, '100');
 const h = await installation({ built: true, https: true, bindings: { PIER_ORIGIN: pier.origin, PIER_SESSION: pier.cookie } }); t.after(() => h.close());
 await h.command('account.save', { id: 'cedar', value: { ...accountValue(products.customer.id), minimumCents: 0, prices: [{ sku: 'OAT-1', unitCents: 40000, minQty: 1 }] } });
 const admin = { as: await h.signIn('buyer@example.test') };
 const join = async (email, name, rights, extra = {}) => {
  await h.command('company.invite', { accountId: 'cedar', email, name, policy: policyOf(rights, extra), reason: 'Administrator assigned explicit company purchasing rights.' }, admin);
  const who = { as: await h.signIn(email, 'existing') };
  const message = h.mail.requests.findLast(row => row.message.subject === 'Your company buyer invitation' && row.message.to.includes(email)).message;
  const link = new URL(message.text.match(/https?:\/\/[^\s<>]+\/app\?[^\s<>]+/)[0]);
  await h.command('company.accept', { invitationId: link.searchParams.get('companyInvitation'), token: link.searchParams.get('companyToken') }, who);
  return { ...who, id: (await h.api('/api/barrow/state', undefined, who)).actor.id };
 };
 const approver = { approvalLimitCents: 1000000, perOrderLimitCents: 0 };
 const purchaser = await join('purchaser@example.test', 'Limited Purchaser', ['purchaser'], { perOrderLimitCents: 100000, approvalLimitCents: 0 });
 const buyerApprover = await join('ops@example.test', 'Buyer Approver', ['approver'], approver);
 const finance = await join('finance-lead@example.test', 'Finance Lead', ['approver'], approver);
 const director = await join('director@example.test', 'Escalation Director', ['approver'], approver);
 const deputy = await join('deputy@example.test', 'Deputy Approver', ['approver'], approver);
 await h.command('company.route.save', { accountId: 'cedar', revision: null, rules: [{ id: 'large', name: 'Large orders', locations: 'all', aboveCents: 500000, steps: [{ label: 'Buyer approval', approvers: [buyerApprover.id], escalateAfterHours: 24, escalateTo: [director.id] }, { label: 'Finance', approvers: [finance.id], escalateAfterHours: null, escalateTo: [] }] }], reason: 'Large orders need the buyer approver, then finance.' }, admin);
 await h.command('company.delegate', { accountId: 'cedar', delegatorId: buyerApprover.id, delegateId: deputy.id, endsOn: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), reason: 'The buyer approver is away.' }, admin);
 const draft = await h.command('order.prepare', { accountId: 'cedar', lines: [{ sku: 'OAT-1', quantity: 15 }] }, purchaser);
 const waiting = await h.command('order.submit', { orderId: draft.id }, purchaser);
 assert.equal(waiting.status, 'awaiting-company-approval');

 const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] });
 t.after(() => browser.close());
 const open = async (who, tab) => {
  const context = await signedContext(browser, h, who.as); t.after(() => context.close());
  const page = await context.newPage(); await page.goto(h.origin + '/app');
  await page.getByRole('button', { name: tab, exact: true }).click();
  return page;
 };
 const panel = page => page.getByRole('region', { name: 'Approvals waiting for you', exact: true });
 // The Worker's own hourly cron handler, triggered as Cloudflare would.
 const cron = async () => { const result = await (await h.mf.getWorker()).scheduled({ cron: '0 * * * *' }); assert.equal(result.outcome, 'ok') };
 const card = page => page.locator('article.br-order').first();

 // The step's approver and its current delegate each see the one step waiting for them.
 const approverPage = await open(buyerApprover, 'Orders');
 await panel(approverPage).getByText('Your approval step', { exact: false }).waitFor();
 await expect(panel(approverPage).locator('li')).toHaveCount(1);
 await captureWidths(approverPage, 'approval-notices-approver');
 const deputyPage = await open(deputy, 'Orders');
 await panel(deputyPage).getByText('As delegate for Buyer Approver', { exact: false }).waitFor();
 await captureWidths(deputyPage, 'approval-notices-delegate');
 const directorPage = await open(director, 'Orders');
 await panel(directorPage).getByText('No approval steps are waiting for you.').waitFor();

 // After the step's 24 hours the scheduled escalation notifies the escalation approver once, with the exact cause.
 const stored = JSON.parse((await h.db.prepare('SELECT value_json FROM bw_orders WHERE id=?').bind(waiting.id).first()).value_json);
 stored.approvalRoute.stepRequestedAt = hoursAgo(25);
 await h.db.prepare('UPDATE bw_orders SET value_json=? WHERE id=?').bind(JSON.stringify(stored), waiting.id).run(); // stands in for 25 elapsed hours
 await cron(); await h.command('approval.escalate', {});
 await expect.poll(async () => (await h.api('/api/barrow/approval-notices', undefined, director)).notices.length).toBe(1);
 await directorPage.reload(); await directorPage.getByRole('button', { name: 'Orders', exact: true }).click();
 await panel(directorPage).getByText(/Escalated to you.*past its 24-hour escalation time/).waitFor();
 await expect(panel(directorPage).locator('li')).toHaveCount(1);
 await captureWidths(directorPage, 'approval-notices-escalated');

 // The buyer approver decides step 1: every step-1 notice closes and Finance sees step 2.
 await approverPage.reload(); await approverPage.getByRole('button', { name: 'Orders', exact: true }).click();
 await card(approverPage).getByRole('button', { name: 'Approve company purchase', exact: true }).click();
 await expect(card(approverPage).locator('[data-approval-status]')).toContainText('Approval step 2 of 2: Finance');
 await panel(approverPage).getByText('No approval steps are waiting for you.').waitFor();
 await directorPage.reload(); await directorPage.getByRole('button', { name: 'Orders', exact: true }).click();
 await panel(directorPage).getByText('No approval steps are waiting for you.').waitFor();
 await captureWidths(directorPage, 'approval-notices-closed-by-step-approval');
 const financePage = await open(finance, 'Orders');
 await panel(financePage).getByText(/step 2 of 2 \(Finance\) waits for your approval/).waitFor();
 await captureWidths(financePage, 'approval-notices-finance-step-2');
 await card(financePage).getByRole('button', { name: 'Approve company purchase', exact: true }).click();
 await card(financePage).getByText('submitted', { exact: true }).waitFor();
 await panel(financePage).getByText('No approval steps are waiting for you.').waitFor();

 // Supplier side: overdue for 24 hours, the scheduled escalation opens the approval task with its blocking cause; approval closes it.
 const reached = JSON.parse((await h.db.prepare('SELECT value_json FROM bw_orders WHERE id=?').bind(waiting.id).first()).value_json);
 reached.companyApprovedAt = hoursAgo(25);
 await h.db.prepare('UPDATE bw_orders SET value_json=? WHERE id=?').bind(JSON.stringify(reached), waiting.id).run(); // stands in for 25 elapsed hours
 await cron();
 await expect.poll(async () => (await h.api('/api/barrow/followups?view=all')).tasks.filter(row => row.kind === 'approval').length).toBe(1);
 const context = await signedContext(browser, h); t.after(() => context.close());
 const owner = await context.newPage();
 await owner.goto(h.origin + '/app');
 if (new URL(owner.url()).pathname === '/setup') {
  await owner.getByLabel('Your name').fill('synthetic-barrow-402');
  await owner.getByRole('checkbox').check();
  await owner.getByRole('button', { name: 'Finish setup', exact: true }).click();
 }
 const board = async () => { await owner.reload(); await owner.getByRole('button', { name: 'Data', exact: true }).click(); await owner.getByLabel('Queue view').selectOption('all') };
 await board();
 const task = owner.locator('article').filter({ hasText: `Overdue approval ${waiting.id}` });
 await task.getByText(/Blocking: No supplier approver has approved it yet/).waitFor();
 await captureWidths(owner, 'approval-task-overdue-with-cause');
 await owner.getByRole('button', { name: 'Orders', exact: true }).click();
 await card(owner).getByRole('button', { name: 'Approve & reserve stock', exact: true }).click();
 await card(owner).getByText(/approved|reserving/).first().waitFor();
 await board();
 await task.getByText('Resolution: Supplier approved the order; its approval task is resolved.').waitFor();
 await captureWidths(owner, 'approval-task-closed-by-approval');
});

test('account follow-up reviews delayed fulfillment before stock, approves exact delivery outreach, suppresses a quote and records a buyer response at desktop and phone', async t => {
 const f = await accountFollowupFixture(t, { built: true, https: true }), { h, account } = f;
 const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] }); t.after(() => browser.close());
 const context = await signedContext(browser, h); t.after(() => context.close());
 const page = await context.newPage(); await page.goto(h.origin + '/app');
 if (new URL(page.url()).pathname === '/setup') {
  await page.getByLabel('Your name').fill('synthetic-barrow-708'); await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Finish setup', exact: true }).click();
 }
 await page.getByRole('button', { name: 'Data', exact: true }).click();
 await page.getByLabel('Queue view').selectOption('all');
 const builder = page.getByRole('region', { name: 'Plan account follow-up', exact: true });
 await builder.getByLabel('Account for follow-up').selectOption(account.id);
 await captureRegionWidths(page, builder, 'account-followup-account');
 const beforePlanMail = h.mail.deliveries.length;
 await builder.getByRole('button', { name: 'Prepare account follow-up plan', exact: true }).click();
 const plan = page.getByRole('region', { name: 'Account follow-up plan', exact: true });
 await plan.waitFor();
 await plan.getByText('Records used for this plan', { exact: true }).click();
 const current = await f.task();
 assert.equal(current.plan.actions[0].kind, 'delivery'); assert.equal(current.status, 'open'); assert.ok(current.ownerId);
 assert.equal(h.mail.deliveries.length, beforePlanMail);
 await captureRegionWidths(page, plan, 'account-followup-grounded-plan');
 const delivery = plan.getByRole('article', { name: 'Delivery follow-up', exact: true });
 const quote = plan.getByRole('article', { name: 'Quote follow-up', exact: true });
 const body = 'We are reviewing the four outstanding cases from your delivery. I will confirm a verified update before discussing additional stock.';
 await delivery.getByLabel('Message recipient').selectOption(current.plan.actions[0].recipientId);
 await delivery.getByLabel('Message to buyer').fill(body);
 await delivery.getByLabel('Contact date', {exact:true}).fill(current.plan.actions[0].sendOn);
 await delivery.getByLabel('Reason for this decision').fill('Review the delayed delivery with the buyer before discussing a new order.');
 await delivery.getByRole('checkbox').check();
 await captureRegionWidths(page, delivery, 'account-followup-review-exact-message');
 await delivery.getByRole('button', { name: 'Approve exact message', exact: true }).click();
 await expect(delivery.getByRole('heading')).toContainText('approved');
 assert.equal(h.mail.deliveries.length, beforePlanMail);
 await captureRegionWidths(page, delivery, 'account-followup-approved');
 await quote.getByLabel('Reason for this decision').fill('The delivery issue takes priority; suppress additional stock outreach.');
 await quote.getByRole('checkbox').check();
 await quote.getByRole('button', { name: 'Suppress outreach', exact: true }).click();
 await expect(quote.getByRole('heading')).toContainText('suppressed');
 assert.equal((await f.task()).status, 'open'); assert.equal(h.mail.deliveries.length, beforePlanMail);
 await captureRegionWidths(page, quote, 'account-followup-suppressed');
 await delivery.getByRole('button', { name: 'Send approved message', exact: true }).click();
 await expect(delivery.getByRole('heading')).toContainText('sent');
 const sent = await f.task();
 assert.equal(sent.status, 'open'); assert.equal(sent.ownerId, current.ownerId);
 const action = sent.plan.actions.find(action => action.kind === 'delivery');
 assert.equal((await h.api(`/api/barrow/quotes/${action.quoteId}`, undefined, f.buyer)).thread.at(-1).body, body);
 assert.equal(h.mail.deliveries.length, beforePlanMail + 1);
 await captureRegionWidths(page, plan, 'account-followup-sent-awaiting-buyer');
 await page.getByRole('button', { name: 'Refresh next actions', exact: true }).click();
 await expect.poll(async () => (await f.task()).status).toBe('open');
 const buyerContext = await signedContext(browser, h, f.buyer.as); t.after(() => buyerContext.close());
 const buyerPage = await buyerContext.newPage(); await buyerPage.goto(`${h.origin}/app?quote=${encodeURIComponent(action.quoteId)}`);
 const conversation = buyerPage.locator('details').filter({ has: buyerPage.locator('summary').filter({ hasText: /^Conversation/ }) });
 await conversation.locator('summary').click();
 await conversation.getByLabel('Message', {exact:true}).fill('Thank you. Please confirm the four outstanding cases after your delivery review.');
 await conversation.getByRole('button', { name: 'Send message', exact: true }).click();
 await expect(conversation.getByLabel('Message', {exact:true})).toHaveValue('');
 await captureRegionWidths(buyerPage, conversation, 'account-followup-buyer-response');
 await page.getByRole('button', { name: 'Refresh next actions', exact: true }).click();
 await expect.poll(async () => (await f.task()).status).toBe('closed');
 await expect(plan.getByRole('button', { name: 'Send approved message', exact: true })).toHaveCount(0);
 const taskCard = page.locator('article').filter({ has: page.getByRole('heading', { name: current.title, exact: true }) });
 await expect(taskCard.getByText(/^Resolution:/)).toContainText('Buyer replied');
 await taskCard.getByText('Follow-up decisions and outcomes', { exact: true }).click();
 await captureRegionWidths(page, taskCard, 'account-followup-closed-with-outcomes');
});
