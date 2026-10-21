// Manual ACC-007 journey: built HTTPS Worker, real D1/Pier, only Resend's edge faked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { installation, stock, accountValue } from '../api/harness.mjs';
import { captureWidths, signedContext } from './browser-helpers.mjs';

const policyOf = (rights, extra = {}) => ({ rights, locations: 'all', perOrderLimitCents: null, approvalLimitCents: null, ...extra });

test('a company administrator sets a two-step route and delegation; a $6,000 cart waits, is approved in order by a delegate and finance, then released at desktop and phone', async t => {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 const products = await stock(pier, '100');
 const h = await installation({ built: true, https: true, bindings: { PIER_ORIGIN: pier.origin, PIER_SESSION: pier.cookie } }); t.after(() => h.close());
 await h.command('account.save', { id: 'cedar', value: { ...accountValue(products.customer.id), minimumCents: 0, prices: [{ sku: 'OAT-1', unitCents: 40000, minQty: 1 }] } });
 const admin = { as: await h.signIn('buyer@example.test') };
 const companyToken = email => {
  const message = h.mail.requests.findLast(row => row.message.subject === 'Your company buyer invitation' && row.message.to.includes(email)).message;
  const link = new URL(message.text.match(/https?:\/\/[^\s<>]+\/app\?[^\s<>]+/)[0]);
  return { invitationId: link.searchParams.get('companyInvitation'), token: link.searchParams.get('companyToken') };
 };
 const join = async (email, name, rights, extra = {}) => {
  await h.command('company.invite', { accountId: 'cedar', email, name, policy: policyOf(rights, extra), reason: 'Administrator assigned explicit company purchasing rights.' }, admin);
  const who = { as: await h.signIn(email, 'existing') };
  await h.command('company.accept', companyToken(email), who);
  return who;
 };
 const purchaser = await join('purchaser@example.test', 'Limited Purchaser', ['purchaser'], { perOrderLimitCents: 100000, approvalLimitCents: 0 });
 const ops = await join('ops@example.test', 'Operations Manager', ['approver'], { approvalLimitCents: 1000000, perOrderLimitCents: 0 });
 const finance = await join('finance-lead@example.test', 'Finance Lead', ['approver'], { approvalLimitCents: 1000000, perOrderLimitCents: 0 });
 const deputy = await join('deputy@example.test', 'Deputy Approver', ['approver'], { approvalLimitCents: 1000000, perOrderLimitCents: 0 });

 const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] });
 t.after(() => browser.close());
 const open = async (who, tab) => {
  const context = await signedContext(browser, h, who.as); t.after(() => context.close());
  const page = await context.newPage(); await page.goto(h.origin + '/app');
  if (tab) await page.getByRole('button', { name: tab, exact: true }).click();
  return page;
 };

 // The company administrator writes the route and the delegation through the Company page.
 const adminPage = await open(admin, 'Company');
 const routes = adminPage.getByRole('region', { name: 'Approval routes', exact: true });
 await routes.getByText('No approval route yet', { exact: false }).waitFor();
 await captureWidths(adminPage, 'approvals-admin-empty-routes');
 await routes.getByRole('button', { name: 'Add a rule', exact: true }).click();
 const policy = routes.getByRole('form', { name: 'Approval policy', exact: true });
 await policy.getByLabel('Rule ID', { exact: true }).fill('large');
 await policy.getByLabel('Rule name', { exact: true }).fill('Large orders');
 await policy.getByLabel('Orders above (USD cents)', { exact: true }).fill('500000');
 await policy.getByLabel('Step label', { exact: true }).fill('Operations');
 await policy.getByRole('group', { name: 'Approvers for step 1', exact: true }).getByLabel('Operations Manager', { exact: true }).check();
 await policy.getByLabel('Escalate after (hours, blank for none)', { exact: true }).fill('24');
 await policy.getByRole('group', { name: 'Escalation people for step 1', exact: true }).getByLabel('Finance Lead', { exact: true }).check();
 await policy.getByRole('button', { name: 'Add a step', exact: true }).click();
 const stepTwo = policy.getByRole('group', { name: 'Rule 1 step 2', exact: true });
 await stepTwo.getByLabel('Step label', { exact: true }).fill('Finance');
 await stepTwo.getByRole('group', { name: 'Approvers for step 2', exact: true }).getByLabel('Finance Lead', { exact: true }).check();
 await policy.getByLabel('Reason for this policy change', { exact: true }).fill('Orders over $5,000 need operations then finance.');
 await captureWidths(adminPage, 'approvals-admin-route-form');
 await policy.getByRole('button', { name: 'Save approval policy', exact: true }).click();
 await routes.getByRole('heading', { name: /policy revision 1/ }).waitFor();
 const delegate = routes.getByRole('form', { name: 'Delegate approval', exact: true });
 await delegate.getByLabel('Absent approver', { exact: true }).selectOption({ label: 'Operations Manager' });
 await delegate.getByLabel('Delegate', { exact: true }).selectOption({ label: 'Deputy Approver' });
 const nextWeek = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(Date.now() + 7 * 86400000));
 await delegate.getByLabel('Through (Eastern time, at most 90 days)', { exact: true }).fill(nextWeek);
 await delegate.getByLabel('Reason', { exact: true }).fill('Operations manager is away this week.');
 await delegate.getByRole('button', { name: 'Delegate approval', exact: true }).click();
 await routes.getByText('In effect today').waitFor();
 await captureWidths(adminPage, 'approvals-admin-saved-route-and-delegation');

 // The purchaser prepares and submits the $6,000 cart and sees where it waits.
 const buy = await open(purchaser);
 await buy.getByRole('spinbutton', { name: /quantity for Toasted oat granola/ }).fill('15');
 await buy.getByRole('button', { name: 'Prepare draft', exact: true }).click();
 const card = page => page.locator('article.br-order').first();
 await card(buy).getByRole('button', { name: 'Submit for supplier review', exact: true }).click();
 await card(buy).getByText('awaiting-company-approval', { exact: true }).waitFor();
 await expect(card(buy).locator('[data-approval-status]')).toContainText('Approval step 1 of 2: Operations');
 await expect(card(buy).getByRole('button', { name: 'Approve company purchase', exact: true })).toHaveCount(0);
 await expect(card(buy).getByRole('button', { name: 'Withdraw request', exact: true })).toHaveCount(1);
 await captureWidths(buy, 'approvals-purchaser-waiting-step-1');

 // Finance cannot approve first; the delegate decides step 1, finance step 2.
 const financePage = await open(finance, 'Orders');
 await expect(card(financePage).getByRole('button', { name: 'Approve company purchase', exact: true })).toHaveCount(0);
 const deputyPage = await open(deputy, 'Orders');
 await captureWidths(deputyPage, 'approvals-delegate-sees-step-1');
 await card(deputyPage).getByRole('button', { name: 'Approve company purchase', exact: true }).click();
 await expect(card(deputyPage).locator('[data-approval-status]')).toContainText('Approval step 2 of 2: Finance');
 await expect(card(deputyPage).locator('[data-approval-status]')).toContainText('Operations by Deputy Approver (delegate)');
 await expect(card(deputyPage).getByRole('button', { name: 'Approve company purchase', exact: true })).toHaveCount(0);
 await captureWidths(deputyPage, 'approvals-step-1-approved-by-delegate');
 await financePage.reload();
 await financePage.getByRole('button', { name: 'Orders', exact: true }).click();
 await captureWidths(financePage, 'approvals-finance-sees-step-2');
 await card(financePage).getByRole('button', { name: 'Approve company purchase', exact: true }).click();
 await card(financePage).getByText('submitted', { exact: true }).waitFor();
 const order = (await h.api('/api/barrow/orders/history')).orders[0];
 assert.equal(order.status, 'submitted'); assert.deepEqual(order.approvalRoute.decided.map(row => row.step), [1, 2]);
 await captureWidths(financePage, 'approvals-released-to-supplier');
});
