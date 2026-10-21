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
