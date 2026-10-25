import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { buyingProfilesFixture } from '../api/buying-profiles-fixture.mjs';
import { captureRegionWidths, signedContext } from './browser-helpers.mjs';

test('owner approves two brand price books and one company buyer deliberately switches between their sellers, currencies and sales terms at desktop and phone', async t => {
 const f = await buyingProfilesFixture(t, { built: true, https: true }), { h, profiles, brands, specifications } = f;
 const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] }); t.after(() => browser.close());
 const ownerContext = await signedContext(browser, h); t.after(() => ownerContext.close());
 const owner = await ownerContext.newPage(); await owner.goto(h.origin + '/app');
 if (new URL(owner.url()).pathname === '/setup') {
  await owner.getByLabel('Your name').fill('synthetic-barrow-815'); await owner.getByRole('checkbox').check();
  await owner.getByRole('button', { name: 'Finish setup', exact: true }).click();
 }
 await owner.getByRole('button', { name: 'Data', exact: true }).click();
 await owner.getByRole('region', { name: 'Buying profile account', exact: true }).getByLabel('Trade account').selectOption(f.account.id);
 const settings = owner.getByRole('region', { name: 'Brands and buying profiles', exact: true });
 const brandForm = settings.getByRole('form', { name: 'Brand settings', exact: true });
 await brandForm.getByLabel('Edit brand').selectOption(brands[0].id);
 await captureRegionWidths(owner, brandForm, 'buying-profile-brand-seller-settings');
 const profileForm = settings.getByRole('form', { name: 'Buying profile settings', exact: true });
 await profileForm.getByLabel('Edit buying profile').selectOption(profiles[0].id);
 await captureRegionWidths(owner, profileForm, 'buying-profile-price-book-settings');
 const buyerContext = await signedContext(browser, h, f.buyer.as); t.after(() => buyerContext.close());
 const buyer = await buyerContext.newPage(); await buyer.goto(h.origin + '/app');
 const selector = buyer.getByLabel('Buying profile');
 await selector.locator(`option[value="${profiles[0].id}"]`).waitFor({ state: 'attached' });
 assert.ok(!(await selector.locator('option').evaluateAll(options => options.map(option => option.value))).includes(profiles[1].id));
 await f.catalogue(1, { ...f.buyer, status: 404 });
 const prepared = [];
 async function buy(index) {
  const spec = specifications[index], reference = `synthetic-barrow-${813 + index}`;
  await selector.selectOption(profiles[index].id);
  const pad = buyer.locator('form.br-pad');
  await expect(pad).toContainText(spec.seller.legalName);
  await expect(pad).toContainText(spec.currency);
  await buyer.getByRole('spinbutton', { name: /quantity for Toasted oat granola/ }).fill('2');
  await pad.getByLabel('Your purchase order / reference', { exact: true }).fill(reference);
  await captureRegionWidths(buyer, pad, `buying-profile-${index}-selected-price-book`);
  await pad.getByRole('button', { name: 'Prepare draft', exact: true }).click();
  const card = buyer.locator('article.br-order').filter({ hasText: reference });
  await card.waitFor(); await expect(card).toContainText(spec.seller.legalName);
  await expect(card).toContainText(spec.currency);
  await expect(card.getByRole('button', { name: 'Submit for supplier review', exact: true })).toBeDisabled();
  await card.getByRole('checkbox', { name: /^I accept / }).check();
  await captureRegionWidths(buyer, card, `buying-profile-${index}-review-terms-and-seller`);
  await card.getByRole('button', { name: 'Submit for supplier review', exact: true }).click();
  await card.getByText('submitted', { exact: true }).waitFor();
  const order = (await h.api('/api/barrow/orders/history', undefined, f.buyer)).orders.find(order => order.reference === reference);
  assert.equal(order.buyingProfile.id, profiles[index].id); assert.equal(order.currency, spec.currency);
  assert.equal(order.totalCents, spec.unitCents * 2); assert.equal(order.lines[0].unitCents, spec.unitCents);
  assert.equal(order.termsAcceptance.series, spec.series);
  await h.command('order.approve', { orderId: order.id }); prepared.push(order);
  await buyer.reload(); await buyer.getByRole('button', { name: 'Orders', exact: true }).click();
  const accepted = buyer.locator('article.br-order').filter({ hasText: reference });
  await accepted.getByText('approved', { exact: true }).waitFor();
  await expect(accepted).toContainText(spec.seller.legalName); await expect(accepted).toContainText(spec.currency);
  await captureRegionWidths(buyer, accepted, `buying-profile-${index}-accepted-invoice`);
  const download = buyer.waitForEvent('download');
  await accepted.getByRole('link', { name: 'Download invoice CSV', exact: true }).click();
  const invoice = await download; assert.equal(await invoice.failure(), null);
 }
 await buy(0);
 const grant = settings.getByRole('form', { name: 'Buyer profile approval', exact: true });
 await grant.getByLabel('Profile access').selectOption(profiles[1].id);
 await grant.getByLabel('Buyer for this profile').selectOption(f.buyerId);
 await grant.getByLabel('Buyer access').selectOption('approved');
 await grant.getByLabel('Reason for profile access', { exact: true }).fill('Approve this company buyer for the independent Canadian price book and its legal seller.');
 await captureRegionWidths(owner, grant, 'buying-profile-second-brand-approval');
 await grant.getByRole('button', { name: 'Save buyer profile access', exact: true }).click();
 await expect.poll(async () => (await f.read()).profiles.length).toBe(2);
 await buyer.reload(); await buyer.getByRole('button', { name: 'Catalog', exact: true }).click();
 await buy(1);
 for (let index = 0; index < prepared.length; index++) {
  const record = await h.api(`/api/barrow/orders/${prepared[index].id}`, undefined, f.buyer);
  assert.deepEqual(record.buyingProfile.seller, specifications[index].seller); assert.equal(record.currency, specifications[index].currency);
 }
});
