// Manual REP-001 journey: built HTTPS Worker, real D1/Pier, only Resend's edge faked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { installation, stock, accountValue, activateStaff } from '../api/harness.mjs';
import { captureWidths, signedContext } from './browser-helpers.mjs';

test('a rep prepares an order for an assigned account, the buyer submits it, and the accepted order names rep and buyer at desktop and phone', async t => {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 const products = await stock(pier, '100');
 const birch = await pier.command('party.save', { name: 'Birch Hollow', kind: 'customer' });
 const h = await installation({ built: true, https: true, bindings: { PIER_ORIGIN: pier.origin, PIER_SESSION: pier.cookie } }); t.after(() => h.close());
 const prices = [{ sku: 'OAT-1', unitCents: 6500, minQty: 1 }];
 await h.command('account.save', { id: 'cedar', value: { ...accountValue(products.customer.id), minimumCents: 0, prices, territory: 'Northeast' } });
 await h.command('account.save', { id: 'birch', value: { ...accountValue(birch.id, 'birch@example.test'), name: 'Birch Hollow', minimumCents: 0, prices, territory: 'West' } });
 const buyerCookie = await h.signIn('buyer@example.test');
 const rep = await activateStaff(h, 'avery-rep@example.test', { role: 'rep', accounts: [], warehouses: [], reports: ['sales'], discountLimitCents: 0, stockExceptionLimitCents: 0, commissionRep: 'avery' });
 const manager = await activateStaff(h, 'morgan-manager@example.test', { role: 'sales-manager', accounts: 'all', warehouses: 'all', reports: [], discountLimitCents: 0, stockExceptionLimitCents: 0 });
 await h.command('rep.assign', { userId: rep.id, kind: 'territory', target: 'Northeast', reason: 'Avery sells the Northeast.' }, manager.who);

 const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] });
 t.after(() => browser.close());
 const open = async cookie => {
  const context = await signedContext(browser, h, cookie); t.after(() => context.close());
  const page = await context.newPage(); await page.goto(h.origin + '/app'); return page;
 };
 const avery = await open(rep.who.as);
 await avery.getByRole('button', { name: 'Order pad', exact: true }).waitFor();
 const picker = avery.getByRole('group', { name: 'Trade account selection', exact: true });
 assert.deepEqual(await picker.getByLabel('Trade account', { exact: true }).locator('option').evaluateAll(options => options.map(option => option.value)), ['', 'cedar'], 'only the assigned account can be selected');
 await expect(avery.getByText('Birch Hollow')).toHaveCount(0);
 await avery.getByRole('spinbutton', { name: /quantity for Toasted oat granola/ }).fill('2');
 await captureWidths(avery, 'rep-order-pad-assigned-account');
 await avery.getByRole('button', { name: 'Prepare draft', exact: true }).click();
 const draftOf = page => page.locator('article.br-order').first();
 await draftOf(avery).getByText('Prepared on the buyer’s behalf', { exact: false }).waitFor();
 await captureWidths(avery, 'rep-prepared-draft');

 // The rep cannot submit past the buyer: the server refuses and the order stays a draft.
 await avery.getByRole('button', { name: 'Submit for supplier review', exact: true }).click();
 await avery.getByRole('alert').getByText(/waits for the buyer to review and submit/).waitFor();
 await captureWidths(avery, 'rep-submit-refused');

 const buyer = await open(buyerCookie);
 await buyer.getByRole('button', { name: 'Orders', exact: true }).click();
 await expect(draftOf(buyer)).toContainText('draft');
 await captureWidths(buyer, 'buyer-reviews-rep-draft');
 await draftOf(buyer).getByRole('button', { name: 'Submit for supplier review', exact: true }).click();
 await draftOf(buyer).getByText('submitted', { exact: true }).waitFor();
 const order = (await h.api('/api/barrow/orders/history')).orders[0];
 assert.equal((await h.command('order.approve', { orderId: order.id })).status, 'approved');

 for (const [name, page, preparer, submitter] of [['buyer', buyer, 'avery-rep', 'You'], ['rep', avery, 'You', 'Trade buyer']]) {
  await page.reload();
  await page.getByRole('button', { name: 'Orders', exact: true }).click();
  const card = draftOf(page);
  await card.getByText('approved', { exact: true }).waitFor();
  await card.locator('summary', { hasText: 'Order history & Pier details' }).click();
  await expect(card).toContainText(`${preparer} · rep acting for the buyer`);
  await expect(card).toContainText(`Submitted by${submitter}`);
  await captureWidths(page, `accepted-order-names-rep-and-buyer-${name}`);
 }
});

test('a rep plans a showroom visit, records buyer notes and samples, turns the show basket into a quote, and sees the follow-up and Pier’s sample acknowledgment at desktop and phone', async t => {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 const products = await stock(pier, '100');
 const h = await installation({ built: true, https: true, bindings: { PIER_ORIGIN: pier.origin, PIER_SESSION: pier.cookie } }); t.after(() => h.close());
 await h.command('account.save', { id: 'cedar', value: { ...accountValue(products.customer.id), minimumCents: 0, prices: [{ sku: 'OAT-1', unitCents: 6500, minQty: 1 }], territory: 'Northeast' } });
 const grant = (role, extra = {}) => ({ role, accounts: [], warehouses: [], reports: [], discountLimitCents: 0, stockExceptionLimitCents: 0, ...extra });
 const rep = await activateStaff(h, 'avery-rep@example.test', grant('rep', { commissionRep: 'avery' }));
 const manager = await activateStaff(h, 'morgan-manager@example.test', grant('sales-manager', { accounts: 'all', warehouses: 'all' }));
 const operations = await activateStaff(h, 'olive-operations@example.test', grant('operations', { accounts: 'all', warehouses: 'all' }));
 await h.command('rep.assign', { userId: rep.id, kind: 'territory', target: 'Northeast', reason: 'Avery sells the Northeast.' }, manager.who);
 const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] });
 t.after(() => browser.close());
 const open = async cookie => {
  const context = await signedContext(browser, h, cookie); t.after(() => context.close());
  const page = await context.newPage(); await page.goto(h.origin + '/app'); return page;
 };
 const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(Date.now() + 2 * 86400000));
 const avery = await open(rep.who.as);
 await avery.getByRole('button', { name: 'Order pad', exact: true }).waitFor();
 const visits = avery.getByRole('region', { name: 'Visits and samples', exact: true });
 await visits.getByText('No visits planned for this account yet.').waitFor();
 const plan = visits.getByRole('form', { name: 'Plan a visit', exact: true });
 await plan.getByLabel('Visit kind', { exact: true }).selectOption('showroom');
 await plan.getByLabel('Date (Eastern time)', { exact: true }).fill(day);
 await plan.getByLabel('Time', { exact: true }).fill('10:30');
 await plan.getByLabel('Location (optional)', { exact: true }).fill('Showroom 4');
 await plan.getByLabel('Agenda (optional)', { exact: true }).fill('Present the spring collection.');
 await captureWidths(avery, 'visits-plan-form');
 await plan.getByRole('button', { name: 'Plan visit', exact: true }).click();
 const card = visits.locator('article').filter({ hasText: 'Showroom visit · ' });
 await card.getByText(`Next action: avery-rep · ${day}`, { exact: false }).waitFor();
 await captureWidths(avery, 'visits-planned');

 // At the visit: buyer notes, a sample request and the show basket turned into a quote; then the visit completes.
 await card.locator('summary', { hasText: 'Record buyer notes and outcome' }).click();
 await card.getByLabel('Buyer notes', { exact: true }).fill('Buyer wants the spring granola in display cases.');
 await card.getByRole('button', { name: 'Save buyer notes', exact: true }).click();
 await card.getByRole('list', { name: 'Buyer notes' }).getByText(/display cases/).waitFor();
 await card.locator('summary', { hasText: 'Request samples' }).click();
 await card.getByLabel('Samples item 1', { exact: true }).selectOption('OAT-1');
 await card.getByLabel('Samples quantity 1', { exact: true }).fill('2');
 await card.getByRole('button', { name: 'Record sample request', exact: true }).click();
 await card.getByText('Awaiting handoff to inventory.').waitFor();
 await captureWidths(avery, 'visits-notes-and-sample-request');
 await card.locator('summary', { hasText: 'Show basket' }).click();
 await card.getByLabel('Show basket item 1', { exact: true }).selectOption('OAT-1');
 await card.getByLabel('Show basket quantity 1', { exact: true }).fill('12');
 await card.getByRole('button', { name: 'Prepare quote from basket', exact: true }).click();
 await card.getByText(/^Show basket prepared as quote /).waitFor();
 await card.locator('summary', { hasText: 'Record buyer notes and outcome' }).click();
 await card.getByRole('button', { name: 'Complete visit', exact: true }).click();
 await card.getByText('Showroom visit · ' + day + ' 10:30 · completed').waitFor();
 await captureWidths(avery, 'visits-basket-quoted-and-completed');

 // Operations hands the samples to inventory; the rep sees Pier's acknowledgment on the visit and in the next action.
 const olive = await open(operations.who.as);
 await olive.getByRole('button', { name: 'Orders', exact: true }).click();
 const pending = olive.getByRole('region', { name: 'Visits and samples', exact: true });
 await pending.getByRole('heading', { name: 'Sample requests awaiting inventory' }).waitFor();
 await captureWidths(olive, 'visits-operations-sample-request');
 await pending.getByRole('button', { name: 'Hand samples to inventory', exact: true }).click();
 await pending.getByText('No sample requests are waiting.').waitFor();
 await avery.reload();
 await avery.getByRole('button', { name: 'Order pad', exact: true }).click();
 await card.getByText(/Pier acknowledged sample order .*: 2 of 2 reserved/).waitFor();
 await expect(card).toContainText('Next action: avery-rep');
 await captureWidths(avery, 'visits-sample-acknowledged');
 await avery.getByRole('button', { name: 'Follow-ups', exact: true }).click();
 const task = avery.locator('article').filter({ hasText: 'Showroom visit with Cedar Street Pantry' });
 await task.getByText(/Pier acknowledged sample order .*: 2 of 2 units reserved/).waitFor();
 await captureWidths(avery, 'visits-follow-up-in-queue');
});
