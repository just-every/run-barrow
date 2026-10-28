// Native buying journey: real HTTPS Worker, D1 and pinned Pier; interrupted browser transport only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { installation, stock, accountValue } from '../api/harness.mjs';
import { captureWidths, signedContext } from './browser-helpers.mjs';

const email = number => `synthetic-barrow-${number}${String.fromCharCode(64)}example.test`;

test('keyboard buyer corrects a forty-line size matrix, recovers interrupted requests and obtains distinct company and supplier approval', async t => {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 const base = await stock(pier, '100');
 const items = [];
 for (let style = 1; style <= 10; style++) for (const size of ['S', 'M', 'L', 'XL']) {
  const code = `ST${String(style).padStart(2, '0')}`;
  items.push(await pier.command('item.save', { sku: `${code}-${size}`, name: `Tee ${code}-${size}`, unit: 'each', packSize: '1' }));
 }
 const po = await pier.command('po.draft', { supplierId: base.supplier.id, promiseDate: '2026-10-20', reason: 'Synthetic matrix stock', lines: items.map(item => ({ itemId: item.id, quantity: '100', price: '10.00' })) });
 await pier.command('po.approve', { poId: po.id, version: po.version });
 await pier.command('po.commit', { poId: po.id, version: po.version });
 await pier.command('receipt.create', { poId: po.id, supplierReference: 'synthetic-barrow-40', lines: po.lines.map(line => ({ poLineId: line.id, locationId: base.location.id, quantity: '100', cost: '10.00' })) });
 const h = await installation({ built: true, https: true, bindings: { PIER_ORIGIN: pier.origin, PIER_SESSION: pier.cookie } }); t.after(() => h.close());
 await h.command('account.save', { id: 'cedar', value: { ...accountValue(base.customer.id, email(40)), minimumCents: 10000, prices: items.map((item, index) => ({ sku: item.sku, unitCents: 1000, minQty: index === 0 ? 6 : 1, ...(index === 0 ? { casePack: 6 } : {}) })) } });
 const admin = { as: await h.signIn(email(40)) };
 async function join(number, name, rights) {
  await h.command('company.invite', { accountId: 'cedar', email: email(number), name, policy: { rights, locations: 'all', perOrderLimitCents: 100, approvalLimitCents: null }, reason: 'Administrator assigned explicit purchasing authority.' }, admin);
  const who = { as: await h.signIn(email(number), 'existing') };
  const message = h.mail.requests.findLast(row => row.message.subject === 'Your company buyer invitation' && row.message.to.includes(email(number))).message;
  const link = new URL(message.text.match(/https?:\/\/[^\s<>]+\/app\?[^\s<>]+/)[0]);
  await h.command('company.accept', { invitationId: link.searchParams.get('companyInvitation'), token: link.searchParams.get('companyToken') }, who);
  return { ...who, actor: (await h.api('/api/barrow/state', undefined, who)).actor };
 }
 const purchaser = await join(41, 'Matrix purchaser', ['purchaser']);
 const approver = await join(42, 'Matrix approver', ['approver']);
 const browser = await chromium.launch({ headless: true, ...(process.env.BARROW_CHROMIUM_EXECUTABLE ? { executablePath: process.env.BARROW_CHROMIUM_EXECUTABLE } : {}), args: ['--no-sandbox', '--use-mock-keychain', '--password-store=basic'] }); t.after(() => browser.close());
 async function pageFor(cookie) {
  const context = await signedContext(browser, h, cookie); t.after(() => context.close());
  const page = await context.newPage();
  await page.goto(h.origin + '/app');
  if (new URL(page.url()).pathname === '/setup') {
   await page.getByLabel('Your name').fill('Supplier owner'); await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Finish setup', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Orders', exact: true }).waitFor();
  return page;
 }
 const buyer = await pageFor(purchaser.as);
 const matrix = buyer.getByRole('region', { name: 'Size matrix', exact: true });
 const cells = matrix.getByRole('spinbutton');
 await expect(cells).toHaveCount(40);
 // Enter every quantity with the keyboard, crossing native style buttons with Tab.
 const first = cells.first();
 const scan = buyer.getByRole('textbox', { name: 'Scan or type SKU', exact: true });
 await scan.focus(); await buyer.keyboard.type('synthetic-barrow-unknown'); await buyer.keyboard.press('Enter');
 await expect(scan).toBeFocused(); await expect(scan).toHaveAttribute('aria-invalid', 'true'); assert.ok(await scan.getAttribute('aria-describedby'));
 await scan.fill(items[0].sku); await scan.press('Enter'); await expect(first).toBeFocused();
 // Valid case quantities below the account minimum keep a persistent linked error.
 const minimumSummary = buyer.getByRole('region', { name: 'Review these problems', exact: true });
 await first.fill('6');
 await buyer.getByRole('button', { name: 'Prepare draft', exact: true }).press('Enter');
 await expect(minimumSummary).toBeFocused();
 await minimumSummary.getByRole('link', { name: /^Order quantities:/ }).press('Enter'); await expect(first).toBeFocused();
 await expect(first).toHaveAttribute('aria-invalid', 'true');
 const minimumDescription = await first.getAttribute('aria-describedby'); assert.ok(minimumDescription);
 const minimumError = buyer.locator(`[id=${JSON.stringify(minimumDescription)}]`);
 await expect(minimumError).toContainText(/Add USD\s40\.00 to meet the minimum\./);
 await first.press('Tab'); await expect(minimumError).toBeVisible();
 await captureWidths(buyer, 'buyer-persistent-minimum-error');
 await first.fill('12');
 await expect(first).not.toHaveAttribute('aria-invalid', 'true');
 await expect(first).not.toHaveAttribute('aria-describedby');
 await expect(minimumError).toHaveCount(0);
 await expect(minimumSummary).toHaveCount(0);
 await first.fill(''); await first.focus();
 for (let index = 0; index < items.length; index++) {
  await expect(cells.nth(index)).toBeFocused();
  await buyer.keyboard.type(index === 0 ? '7' : '1');
  if (index < items.length - 1) {
   await buyer.keyboard.press('Tab');
   if ((index + 1) % 4 === 0) await buyer.keyboard.press('Tab');
  }
 }
 const summary = buyer.getByRole('region', { name: 'Review these problems', exact: true });
 await expect(first).toHaveAttribute('aria-invalid', 'true');
 const described = await first.getAttribute('aria-describedby'); assert.ok(described);
 await expect(buyer.locator(`[id=${JSON.stringify(described)}]`)).toContainText('choose');
 await expect(cells.last()).toBeFocused();
 const prepare = buyer.getByRole('button', { name: 'Prepare draft', exact: true });
 await prepare.focus(); await buyer.keyboard.press('Enter'); await expect(summary).toBeFocused();
 await summary.getByRole('link', { name: /ST01-S/ }).focus(); await buyer.keyboard.press('Enter'); await expect(first).toBeFocused();
 assert.equal(await first.evaluate(element => { const box = element.getBoundingClientRect(); return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === element; }), true, 'The linked problem is visible above sticky controls');
 await captureWidths(buyer, 'buyer-linked-quantity-error');
 await buyer.getByRole('button', { name: 'Use 6 for ST01-S', exact: true }).focus(); await buyer.keyboard.press('Enter');
 await expect(first).toBeFocused(); await expect(first).toHaveValue('6'); await expect(first).not.toHaveAttribute('aria-invalid', 'true');
 await expect(summary).toHaveCount(0);
 const reference = buyer.getByLabel('Your purchase order / reference', { exact: true });
 await reference.focus(); await buyer.keyboard.type('synthetic-barrow-keyboard-40');
 // Dismissal returns to the exact opener, leaving the cart in place.
 const paste = buyer.getByRole('button', { name: 'Paste or upload CSV', exact: true });
 await paste.focus(); await buyer.keyboard.press('Enter');
 const dialog = buyer.getByRole('dialog', { name: 'Add lines by paste or CSV', exact: true });
 await dialog.waitFor(); await buyer.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(paste).toBeFocused();
 await paste.press('Enter');
 await dialog.getByLabel('Paste lines', { exact: true }).fill('ST01-S 7\nUNKNOWN 1');
 await dialog.getByRole('button', { name: 'Preview pasted lines', exact: true }).press('Enter');
 const uploadSummary = dialog.getByRole('region', { name: 'Review these problems', exact: true }); await expect(uploadSummary).toBeFocused();
 await uploadSummary.getByRole('link', { name: /Row 2/ }).press('Enter');
 await expect(dialog.getByRole('button', { name: 'Leave out row 2', exact: true })).toBeFocused();
 await captureWidths(buyer, 'buyer-upload-correction-summary');
 await dialog.getByRole('button', { name: 'Cancel', exact: true }).press('Enter'); await expect(paste).toBeFocused(); await expect(first).toHaveValue('6');
 // Dates expose a persistent description and a summary link that opens the disclosure.
 await buyer.getByText('Delivery dates & instructions', { exact: true }).press('Enter');
 await buyer.getByLabel('Requested delivery date (Eastern time)', { exact: true }).fill('2098-02-10');
 const cancel = buyer.getByLabel('Cancel if not shipped after (Eastern time)', { exact: true }); await cancel.fill('2098-02-09'); await expect(cancel).toBeFocused();
 await prepare.press('Enter'); await expect(summary).toBeFocused(); await summary.getByRole('link', { name: /Cancel after date/ }).press('Enter'); await expect(cancel).toBeFocused();
 assert.ok(await cancel.getAttribute('aria-describedby')); await cancel.fill('2098-02-11');
 // An interrupted request did not reach the server: work and keyboard position survive the state refresh.
 async function interrupt(page, type, forward = false) {
  let intercepted = false;
  await page.route('**/api/barrow/commands', async route => {
   if (route.request().postDataJSON()?.type !== type || intercepted) return route.continue();
   intercepted = true;
   if (forward) await route.fetch();
   await route.abort('failed');
  });
  return async () => { assert.ok(intercepted, `${type} was interrupted`); await page.unroute('**/api/barrow/commands'); };
 }
 let clear = await interrupt(buyer, 'order.prepare');
 await prepare.press('Enter'); await buyer.getByRole('alert').filter({ hasText: 'request is not confirmed' }).waitFor();
 await expect(prepare).toBeEnabled(); await expect(prepare).toBeFocused();
 await expect(reference).toHaveValue('synthetic-barrow-keyboard-40'); await expect(first).toHaveValue('6'); await expect(cells.last()).toHaveValue('1');
 assert.equal((await h.api('/api/barrow/state', undefined, purchaser)).orders.length, 0);
 await expect(buyer.getByRole('status').filter({ hasText: 'Draft prepared.' })).toHaveCount(0);
 await captureWidths(buyer, 'buyer-draft-transport-recovery'); await clear();
 let releasePrepare, arrived;
 const pending = new Promise(resolve => { arrived = resolve; });
 const release = new Promise(resolve => { releasePrepare = resolve; }); t.after(() => releasePrepare());
 await buyer.route('**/api/barrow/commands', async route => {
  if (route.request().postDataJSON()?.type !== 'order.prepare') return route.continue();
  arrived(); await release; await route.continue();
 });
 await prepare.press('Enter'); await pending;
 await expect(reference).toHaveValue('synthetic-barrow-keyboard-40');
 await expect(buyer.getByRole('status').filter({ hasText: 'Draft prepared.' })).toHaveCount(0);
 assert.equal((await h.api('/api/barrow/state', undefined, purchaser)).orders.length, 0);
 releasePrepare();
 const purchase = page => page.locator('article.br-order').filter({ hasText: 'Reference: synthetic-barrow-keyboard-40' });
 const result = page => purchase(page).locator('.br-order-explain');
 await expect(result(buyer)).toBeFocused(); await expect(result(buyer)).toContainText('Prepared for review');
 await buyer.unroute('**/api/barrow/commands');
 const draft = (await h.api('/api/barrow/state', undefined, purchaser)).orders.find(order => order.reference === 'synthetic-barrow-keyboard-40');
 assert.equal(draft.lines.length, 40); assert.equal(draft.totalCents, 45000);
 await captureWidths(buyer, 'buyer-confirmed-forty-line-draft');
 await purchase(buyer).getByRole('button', { name: 'Submit for supplier review', exact: true }).press('Enter');
 await expect(result(buyer)).toBeFocused(); await expect(result(buyer)).toContainText('Awaiting a different authorized company approver');
 assert.equal((await pier.api('/api/pier/state')).orders.length, 0);
 await captureWidths(buyer, 'buyer-awaiting-distinct-approval');
 const reviewer = await pageFor(approver.as); await reviewer.getByRole('button', { name: 'Orders', exact: true }).press('Enter');
 await reviewer.getByRole('button', { name: /^Company approval / }).press('Enter');
 clear = await interrupt(reviewer, 'order.company-approve');
 const approve = purchase(reviewer).getByRole('button', { name: 'Approve company purchase', exact: true }); await approve.press('Enter');
 await reviewer.getByRole('alert').filter({ hasText: 'request is not confirmed' }).waitFor(); await expect(approve).toBeEnabled(); await expect(approve).toBeFocused();
 await expect(purchase(reviewer).getByText('awaiting-company-approval', { exact: true })).toBeVisible();
 await expect(reviewer.getByRole('status').filter({ hasText: 'Company purchase approved' })).toHaveCount(0); await clear();
 await approve.press('Enter'); await expect(result(reviewer)).toBeFocused(); await expect(result(reviewer)).toContainText('Submitted for supplier review');
 const released = await h.api(`/api/barrow/orders/${draft.id}`, undefined, approver);
 assert.equal(released.companyApprovedBy, approver.actor.id); assert.notEqual(released.preparedBy, released.companyApprovedBy);
 await captureWidths(reviewer, 'buyer-company-approved-result');
 const supplier = await pageFor(h.cookie); await supplier.getByRole('button', { name: 'Orders', exact: true }).press('Enter');
 // A lost response after recording approval shows the actual refreshed state and never invents acceptance.
 clear = await interrupt(supplier, 'order.approve', true);
 await purchase(supplier).getByRole('button', { name: 'Approve & reserve stock', exact: true }).press('Enter');
 await supplier.getByRole('alert').filter({ hasText: 'request is not confirmed' }).waitFor();
 await expect(purchase(supplier).getByText('approved', { exact: true })).toBeVisible();
 await expect(supplier.locator('#command-error')).toBeFocused();
 await expect(supplier.getByRole('status').filter({ hasText: 'Reservation requested.' })).toHaveCount(0); await clear();
 const approved = await h.api(`/api/barrow/orders/${draft.id}`); assert.equal(approved.status, 'approved'); assert.ok(approved.pierOrderId);
 await buyer.reload(); await buyer.getByRole('button', { name: 'Orders', exact: true }).press('Enter');
 await expect(purchase(buyer).getByText('approved', { exact: true })).toBeVisible(); await expect(result(buyer)).toContainText('Stock is reserved in full');
 assert.equal((await pier.api('/api/pier/state')).orders.length, 1);
 await captureWidths(buyer, 'buyer-supplier-accepted-end-state');
});
