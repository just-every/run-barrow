// Manual ACC-006 journey: built HTTPS Worker, real D1/Pier, only Resend's edge faked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { installation, stock, accountValue } from '../api/harness.mjs';
import { captureWidths, signedContext } from './browser-helpers.mjs';

const reason = 'Owner reviewed this exact functional role and scope.';
async function activate(h, email, policy) {
 const grant = await h.command('staff.invite', { email, name: email.split('@')[0], policy, reason });
 const message = h.mail.requests.findLast(row => row.message.to.includes(email)).message;
 const href = message.text.match(/https?:\/\/[^\s<>]+\/auth\/confirm\?token=[^\s<>]+/)[0];
 const response = await h.request('/auth/confirm', { method: 'POST', as: '', body: { token: new URL(href).searchParams.get('token') } });
 assert.equal(response.status, 303);
 return { id: grant.userId, cookie: response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
}

test('manager assigns, covers and transfers rep territories; the rep, the buyer and the manager each see only the current assignment at desktop and phone', async t => {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 const products = await stock(pier, '100');
 const wren = await pier.command('party.save', { name: 'Wren Market', kind: 'customer' }), birch = await pier.command('party.save', { name: 'Birch Hollow', kind: 'customer' });
 const h = await installation({ built: true, https: true, bindings: { PIER_ORIGIN: pier.origin, PIER_SESSION: pier.cookie } }); t.after(() => h.close());
 const prices = [{ sku: 'OAT-1', unitCents: 6500, minQty: 1 }];
 await h.command('account.save', { id: 'cedar', value: { ...accountValue(products.customer.id), minimumCents: 0, prices, territory: 'Northeast' } });
 await h.command('account.save', { id: 'wren', value: { ...accountValue(wren.id, 'wren@example.test'), name: 'Wren Market', minimumCents: 0, prices, territory: 'Northeast' } });
 await h.command('account.save', { id: 'birch', value: { ...accountValue(birch.id, 'birch@example.test'), name: 'Birch Hollow', minimumCents: 0, prices, territory: 'West' } });
 const grant = (role, extra = {}) => ({ role, accounts: [], warehouses: [], reports: ['sales'], discountLimitCents: 0, stockExceptionLimitCents: 0, ...extra });
 const avery = await activate(h, 'avery-rep@example.test', grant('rep', { commissionRep: 'avery' }));
 const blake = await activate(h, 'blake-rep@example.test', grant('rep', { commissionRep: 'blake' }));
 const morgan = await activate(h, 'morgan-manager@example.test', grant('sales-manager', { accounts: 'all', warehouses: 'all' }));
 const buyer = await h.signIn('buyer@example.test');

 const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] });
 t.after(() => browser.close());
 const open = async (cookie, tab) => {
  const context = await signedContext(browser, h, cookie); t.after(() => context.close());
  const page = await context.newPage(); await page.goto(h.origin + '/app');
  if (tab) await page.getByRole('button', { name: tab, exact: true }).click();
  return page;
 };
 const ownerContext = await signedContext(browser, h); t.after(() => ownerContext.close());
 const owner = await ownerContext.newPage();
 await owner.goto(h.origin + '/app');
 if (new URL(owner.url()).pathname === '/setup') {
  await owner.getByLabel('Your name').fill('synthetic-barrow-300');
  await owner.getByRole('checkbox').check();
  await owner.getByRole('button', { name: 'Finish setup', exact: true }).click();
 }
 await owner.getByRole('button', { name: 'Accounts', exact: true }).click();
 const card = owner.getByRole('region', { name: 'Rep territories and coverage', exact: true });
 await card.getByText('No rep holds a territory or account through an assignment yet.').waitFor();
 await captureWidths(owner, 'territories-owner-empty');

 // The owner assigns Northeast to Avery; the second form submission shows the one-primary-rep rule.
 const form = card.getByRole('form', { name: 'Assign or cover', exact: true });
 await form.getByLabel('Rep', { exact: true }).selectOption({ label: 'avery-rep' });
 await form.getByLabel('Territory', { exact: true }).selectOption('Northeast');
 await form.getByLabel('Reason', { exact: true }).fill('Avery covers the Northeast book.');
 await captureWidths(owner, 'territories-owner-assign-form');
 await form.getByRole('button', { name: 'Assign rep', exact: true }).click();
 await expect(card.getByRole('article')).toHaveCount(1);
 await expect(card.getByRole('article')).toContainText('avery-rep · Primary rep');
 await expect(card.getByRole('article')).toContainText('In effect today');
 await form.getByLabel('Rep', { exact: true }).selectOption({ label: 'blake-rep' });
 await form.getByLabel('Account ID', { exact: true }).fill('cedar').catch(() => {});
 await form.getByLabel('Scope', { exact: true }).selectOption('account');
 await form.getByLabel('Account ID', { exact: true }).fill('cedar');
 await form.getByLabel('Reason', { exact: true }).fill('Blake wants Cedar too.');
 await form.getByRole('button', { name: 'Assign rep', exact: true }).click();
 await owner.getByRole('alert').getByText(/Another rep is already the primary rep/).waitFor();
 await captureWidths(owner, 'territories-owner-overlap-refused');

 // Avery reads only their own assignment and holds exactly the Northeast accounts; Birch is not found.
 const averyPage = await open(avery.cookie, 'Reports');
 const mine = averyPage.getByRole('region', { name: 'Your accounts', exact: true });
 await expect(mine.getByRole('article')).toContainText('territory Northeast');
 await expect(mine.getByRole('form')).toHaveCount(0);
 assert.deepEqual((await (await averyPage.request.get(h.origin + '/api/barrow/state')).json()).accounts.map(row => row.id).sort(), ['cedar', 'wren']);
 assert.equal((await averyPage.request.get(h.origin + '/api/barrow/accounts/by-id/birch')).status(), 404);
 await captureWidths(averyPage, 'territories-rep-your-accounts');

 // The buyer sees the current rep by name only.
 const buyerPage = await open(buyer);
 await buyerPage.locator('[data-current-rep]').getByText('Your rep: avery-rep.', { exact: true }).waitFor();
 await captureWidths(buyerPage, 'territories-buyer-current-rep');

 // An all-account manager gives Blake vacation coverage, then transfers Northeast to Blake.
 const manager = await open(morgan.cookie, 'Accounts');
 const managerCard = manager.getByRole('region', { name: 'Rep territories and coverage', exact: true });
 const cover = managerCard.getByRole('form', { name: 'Assign or cover', exact: true });
 await cover.getByLabel('Type', { exact: true }).selectOption('cover');
 await cover.getByLabel('Rep', { exact: true }).selectOption({ label: 'blake-rep' });
 await cover.getByLabel('Scope', { exact: true }).selectOption('rep');
 await cover.getByLabel('Rep being covered', { exact: true }).selectOption({ label: 'avery-rep' });
 const nextWeek = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(Date.now() + 7 * 86400000));
 await cover.getByLabel('Covers through (required)', { exact: true }).fill(nextWeek);
 await cover.getByLabel('Reason', { exact: true }).fill('Avery is on vacation this week.');
 await captureWidths(manager, 'territories-manager-coverage-form');
 await cover.getByRole('button', { name: 'Give coverage', exact: true }).click();
 await expect(managerCard.getByRole('article')).toHaveCount(2);
 await buyerPage.reload();
 await buyerPage.locator('[data-current-rep]').getByText(`blake-rep is covering through ${nextWeek}.`).waitFor();
 await captureWidths(buyerPage, 'territories-buyer-covering-rep');
 const blakePage = await open(blake.cookie, 'Reports');
 assert.deepEqual((await (await blakePage.request.get(h.origin + '/api/barrow/state')).json()).accounts.map(row => row.id).sort(), ['cedar', 'wren']);

 await managerCard.getByRole('article').filter({ hasText: 'avery-rep · Primary rep' }).getByRole('button', { name: 'Transfer Northeast', exact: true }).click();
 const transfer = managerCard.getByRole('form', { name: 'Transfer assignment', exact: true });
 await transfer.getByLabel('New primary rep', { exact: true }).selectOption({ label: 'blake-rep' });
 await transfer.getByLabel('Reason', { exact: true }).fill('Avery moved to the West team.');
 await captureWidths(manager, 'territories-manager-transfer-form');
 await transfer.getByRole('button', { name: 'Transfer from today', exact: true }).click();
 await expect(managerCard.getByRole('article').filter({ hasText: 'Ended' })).toHaveCount(1);
 await captureWidths(manager, 'territories-manager-after-transfer');
 await buyerPage.reload();
 await buyerPage.locator('[data-current-rep]').getByText('Your rep: blake-rep.', { exact: true }).waitFor();
 await averyPage.reload();
 await averyPage.getByRole('button', { name: 'Reports', exact: true }).click();
 const ended = averyPage.getByRole('region', { name: 'Your accounts', exact: true }).getByRole('article');
 await expect(ended).toContainText('Ended');
 await expect(ended).not.toContainText('In effect today');
 assert.deepEqual((await (await averyPage.request.get(h.origin + '/api/barrow/state')).json()).accounts, []);
 await captureWidths(averyPage, 'territories-rep-after-transfer');
});
