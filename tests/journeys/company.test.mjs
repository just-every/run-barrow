// Manual ACC-002 browser journey: built Barrow Worker, real D1/Pier, Resend edge only faked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { installation, stock, accountValue } from '../api/harness.mjs';
import { captureWidths, signedContext } from './browser-helpers.mjs';

test('company administrator invites four native users, limited purchaser waits for another approver, finance reads invoices, shared lists and removal at desktop and phone', async t => {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 const products = await stock(pier, '100');
 const h = await installation({ built: true, https: true, bindings: { PIER_ORIGIN: pier.origin, PIER_SESSION: pier.cookie } });
 t.after(() => h.close());
 await h.command('account.save', { id: 'cedar', value: { ...accountValue(products.customer.id), minimumCents: 0, prices: [{ sku: 'OAT-1', unitCents: 40000, minQty: 1 }] } });
 const otherCustomer = await pier.command('party.save', { name: 'Harbour Provisions', kind: 'customer' });
 await h.command('account.save', { id: 'harbour', value: { ...accountValue(otherCustomer.id, 'synthetic-barrow-20@example.test'), name: 'Harbour Provisions' } });
 const adminCookie = await h.signIn('buyer@example.test');
 const adminAuth = { as: adminCookie };
 const downtown = await h.command('location.save', { accountId: 'cedar', kind: 'ship-to', value: { name: 'Downtown', line1: '101 Main Street', city: 'Columbia', state: 'SC', zip: '29201' } }, adminAuth);
 await h.command('location.save', { accountId: 'cedar', kind: 'ship-to', value: { name: 'North store', line1: '202 Main Street', city: 'Columbia', state: 'SC', zip: '29201' } }, adminAuth);
 const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] });
 t.after(() => browser.close());
 async function nativePage(cookie) {
  const context = await signedContext(browser, h, cookie); t.after(() => context.close());
  return context.newPage();
 }
 const staff = await nativePage(h.cookie);
 await staff.goto(h.origin + '/app');
 if (new URL(staff.url()).pathname === '/setup') {
  await staff.getByLabel('Your name').fill('Supplier owner');
  await staff.getByRole('checkbox').check();
  await staff.getByRole('button', { name: 'Finish setup', exact: true }).click();
 }
 await staff.getByRole('button', { name: 'Accounts', exact: true }).waitFor();
 const admin = await nativePage(adminCookie);
 await admin.goto(h.origin + '/app');
 await admin.getByRole('button', { name: 'Company', exact: true }).click();
 const users = admin.getByRole('region', { name: 'Company users', exact: true });
 await users.getByLabel('Invitee email').waitFor();
 const firstBuyer = (await h.api('/api/barrow/state', undefined, adminAuth)).actor;
 assert.ok(firstBuyer.company.rights.includes('administrator'));
 assert.equal(firstBuyer.company.perOrderLimitCents, null);
 await expect(users.getByLabel('Trade account', { exact: true }).getByRole('option')).toHaveText(['Choose an account', 'Cedar Street Pantry']);
 await captureWidths(admin, 'company-administrator');
 await h.api('/api/barrow/company/members?accountId=harbour', undefined, { ...adminAuth, status: 404 });

 const invitations = [
  { email: 'synthetic-barrow-11@example.test', name: 'Limited Purchaser', rights: ['Purchaser'], perOrder: '40000', approval: '0', scoped: true },
  { email: 'synthetic-barrow-12@example.test', name: 'Purchase Approver', rights: ['Purchasing approver'], perOrder: '0', approval: '100000' },
  { email: 'synthetic-barrow-13@example.test', name: 'Company Finance', rights: ['Finance viewer'], perOrder: '0', approval: '0' },
  { email: 'synthetic-barrow-14@example.test', name: 'Store Colleague', rights: ['Purchaser'], unlimited: true, approval: '0' },
 ];
 const rights = ['Company administrator', 'Purchaser', 'Purchasing approver', 'Finance viewer'];
 const invited = [];
 for (const [index, person] of invitations.entries()) {
  await users.getByLabel('Invitee name').fill(person.name);
  await users.getByLabel('Invitee email').fill(person.email);
  for (const right of rights) await users.getByRole('checkbox', { name: right, exact: true }).setChecked(person.rights.includes(right));
  await users.getByRole('checkbox', { name: 'All company ship-to locations', exact: true }).setChecked(!person.scoped);
  if (person.scoped) {
   await users.getByRole('checkbox', { name: 'Downtown', exact: true }).check();
   await expect(users.getByRole('checkbox', { name: 'North store', exact: true })).not.toBeChecked();
  }
  await users.getByRole('checkbox', { name: 'Unlimited per-order allowance', exact: true }).setChecked(Boolean(person.unlimited));
  if (!person.unlimited) await users.getByLabel('Per-order limit (USD cents)', { exact: true }).fill(person.perOrder);
  await users.getByRole('checkbox', { name: 'Unlimited company approval allowance', exact: true }).uncheck();
  await users.getByLabel('Company approval limit (USD cents)', { exact: true }).fill(person.approval);
  if (person.scoped) {
   await users.getByText('Per-location allowance overrides', { exact: true }).click();
   await users.getByLabel('Per-order override · Downtown', { exact: true }).fill('50000');
   await users.getByLabel('Approval override · Downtown', { exact: true }).fill('0');
  }
  await users.getByLabel('Company change reason').fill('Administrator assigned explicit company purchasing rights for this person.');
  await captureWidths(admin, `company-invite-policy-${index + 1}`);
  await users.getByRole('button', { name: 'Request company invitation', exact: true }).click();
  await users.getByRole('listitem').filter({ hasText: person.email }).filter({ hasText: 'invitation requested' }).waitFor();
  await expect(users.getByLabel('Invitee email')).toHaveValue('');
  const message = h.mail.requests.findLast(row => row.message.subject === 'Your company buyer invitation' && row.message.to.includes(person.email))?.message;
  assert.ok(message, 'Company invitation reaches the Resend network edge');
  const link = new URL(message.text.match(/https?:\/\/[^\s<>]+\/app\?[^\s<>]+/)[0]);
  // This synthetic native session is issued through Base magic-link confirmation, never a copied profile.
  const cookie = await h.signIn(person.email, 'existing');
  assert.equal((await h.api('/api/barrow/state', undefined, { as: cookie })).accounts.length, 0);
  const page = await nativePage(cookie);
  await page.goto(h.origin + link.pathname + link.search);
  await page.getByRole('heading', { name: 'Company buyer invitation', exact: true }).waitFor();
  await captureWidths(page, `company-native-acceptance-${index + 1}`);
  await page.getByRole('button', { name: 'Accept company invitation', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Company invitation', exact: true })).toHaveCount(0);
  const state = await h.api('/api/barrow/state', undefined, { as: cookie });
  assert.deepEqual(state.accounts.map(row => row.id), ['cedar']);
  assert.equal(new URL(page.url()).searchParams.has('companyToken'), false);
  await page.getByRole('button', { name: 'Orders', exact: true }).waitFor();
  if(person.rights.includes('Finance viewer'))await page.getByRole('heading',{name:'Your orders',exact:true}).waitFor();else await page.getByRole('spinbutton',{name:/quantity for Toasted oat granola/}).waitFor();
  await captureWidths(page, `company-active-user-${index + 1}`);
  invited.push({ ...person, page, cookie, actor: state.actor });
 }
 const [purchaser, approver, finance, colleague] = invited;
 await h.command('company.invite',{accountId:'cedar',email:'synthetic-barrow-20@example.test',name:'Another company buyer',policy:{rights:['purchaser'],locations:'all',perOrderLimitCents:0,approvalLimitCents:0},reason:'Supplier must review this exact collision.'},adminAuth);
 await staff.getByRole('button',{name:'Accounts',exact:true}).click();await staff.getByRole('region',{name:'Company users',exact:true}).getByText('another trade account',{exact:false}).waitFor();await captureWidths(staff,'company-supplier-collision-review');
 const roster = (await h.api('/api/barrow/company/members?accountId=cedar', undefined, adminAuth)).members;
 const limited = roster.find(row => row.userId === purchaser.actor.id);
 assert.deepEqual(limited.locations, [downtown.id]);
 assert.equal(limited.perOrderLimitCents, 40000);
 assert.equal(limited.locationLimits[downtown.id].perOrderLimitCents, 50000);
 assert.deepEqual(approver.actor.company.rights, ['approver']);
 assert.equal(approver.actor.company.approvalLimitCents, 100000);
 assert.deepEqual(finance.actor.company.rights, ['finance']);
 assert.equal(colleague.actor.company.perOrderLimitCents, null);
 await admin.reload();
 await admin.getByRole('button', { name: 'Company', exact: true }).click();
 await users.getByLabel('Edit company user').selectOption({ label: `${purchaser.name} · ${purchaser.email}` });
 await expect(users.getByLabel('Per-order limit (USD cents)', { exact: true })).toHaveValue('40000');
 await captureWidths(admin, 'company-active-members-and-grant');

 const buy = purchaser.page;
 await buy.getByRole('button', { name: 'Catalog', exact: true }).click();
 await buy.getByRole('spinbutton', { name: /quantity for Toasted oat granola/ }).fill('2');
 await buy.getByLabel('Ship to').selectOption(downtown.id);
 await buy.getByLabel('Your purchase order / reference', { exact: true }).fill('Company purchase');
 await captureWidths(buy, 'company-limited-purchaser-cart');
 // Save both audiences through the real list dialog before preparing this cart.
 await buy.getByRole('button', { name: 'Saved lists', exact: true }).click();
 const lists = buy.getByRole('dialog', { name: 'Saved lists', exact: true });
 await lists.getByLabel('List name', { exact: true }).fill('Downtown replenishment');
 await lists.getByRole('checkbox', { name: 'Share with everyone who orders for this account', exact: true }).check();
 await lists.getByRole('button', { name: 'Save cart as list', exact: true }).click();
 await lists.getByRole('button', { name: 'Add Downtown replenishment to cart', exact: true }).waitFor();
 await expect(lists.getByLabel('List name', { exact: true })).toHaveValue('');
 await lists.getByLabel('List name', { exact: true }).fill('Private planning');
 await lists.getByRole('button', { name: 'Save cart as list', exact: true }).click();
 await lists.getByRole('button', { name: 'Add Private planning to cart', exact: true }).waitFor();
 await captureWidths(buy, 'company-creator-shared-and-private-lists');
 await lists.getByRole('button', { name: 'Close', exact: true }).click();
 await buy.getByRole('button', { name: 'Prepare draft', exact: true }).click();
 const purchase = page => page.locator('article.br-order').filter({ hasText: 'Reference: Company purchase' });
 await purchase(buy).getByRole('button', { name: 'Submit for supplier review', exact: true }).waitFor();
 await captureWidths(buy, 'company-purchaser-draft');
 await purchase(buy).getByRole('button', { name: 'Submit for supplier review', exact: true }).click();
 await purchase(buy).getByText('awaiting-company-approval', { exact: true }).waitFor();
 await expect(purchase(buy).getByRole('button', { name: 'Approve company purchase', exact: true })).toHaveCount(0);
 const waiting = (await h.api('/api/barrow/state', undefined, { as: purchaser.cookie })).orders.find(row => row.reference === 'Company purchase');
 assert.equal(waiting.totalCents, 80000);
 assert.equal(waiting.status, 'awaiting-company-approval');
 assert.equal((await pier.api('/api/pier/state')).orders.length, 0);
 await captureWidths(buy, 'company-awaiting-approval');
 await h.command('order.company-approve', { orderId: waiting.id, revision: waiting.revision, reason: 'Finance cannot approve purchases.' }, { as: finance.cookie, status: 403 });

 await approver.page.reload();
 await approver.page.getByRole('button', { name: 'Orders', exact: true }).click();
 await purchase(approver.page).getByRole('button', { name: 'Approve company purchase', exact: true }).waitFor();
 await captureWidths(approver.page, 'company-approver-review');
 await purchase(approver.page).getByRole('button', { name: 'Approve company purchase', exact: true }).click();
 await purchase(approver.page).getByText('submitted', { exact: true }).waitFor();
 const released = await h.api(`/api/barrow/orders/${waiting.id}`, undefined, { as: approver.cookie });
 assert.equal(released.preparedBy, purchaser.actor.id);
 assert.equal(released.companyApprovedBy, approver.actor.id);
 assert.notEqual(released.preparedBy, released.companyApprovedBy);
 await captureWidths(approver.page, 'company-approved-for-supplier');
 await staff.reload();
 await staff.getByRole('button', { name: 'Orders', exact: true }).click();
 await purchase(staff).getByRole('button', { name: 'Approve & reserve stock', exact: true }).click();
 await purchase(staff).getByText('approved', { exact: true }).waitFor();
 await captureWidths(staff, 'company-supplier-reserved');
 const approved = await h.api(`/api/barrow/orders/${waiting.id}`);
 assert.equal(approved.status, 'approved');
 assert.ok(approved.pierOrderId);

 const fin = finance.page;
 await fin.reload();
 await fin.getByRole('button', { name: 'Orders', exact: true }).click();
 await expect(fin.getByRole('button', { name: 'Catalog', exact: true })).toHaveCount(0);
 await expect(fin.getByRole('button', { name: 'Company', exact: true })).toHaveCount(0);
 await expect(purchase(fin).getByRole('button', { name: 'Approve company purchase', exact: true })).toHaveCount(0);
 const statement = fin.getByRole('region', { name: 'Account statement', exact: true });
 await statement.getByRole('link', { name: approved.invoice.number, exact: true }).waitFor();
 await expect(statement.getByRole('row').filter({ hasText: 'Closing balance' })).toContainText('800.00');
 await captureWidths(fin, 'company-finance-invoice-and-statement');
 async function downloadText(link) {
  const [download] = await Promise.all([fin.waitForEvent('download'), link.click()]);
  const stream = await download.createReadStream();
  assert.ok(stream, 'Download has a readable body');
  const chunks = []; for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
 }
 assert.ok((await downloadText(purchase(fin).getByRole('link', { name: 'Download invoice CSV', exact: true }))).includes(approved.invoice.number));
 const statementCsv = await downloadText(statement.getByRole('link', { name: 'Statement (CSV)', exact: true }));
 assert.ok(statementCsv.includes(approved.invoice.number));
 assert.ok(statementCsv.includes('80000'));
 assert.match(await downloadText(statement.getByRole('link', { name: 'Statement (PDF)', exact: true })), /^%PDF-/);
 await h.command('order.prepare', { accountId: 'cedar', shipToId: downtown.id, lines: [{ sku: 'OAT-1', quantity: 2 }] }, { as: finance.cookie, status: 403 });

 const peer = colleague.page;
 await peer.getByRole('button', { name: 'Catalog', exact: true }).click();
 await peer.getByRole('button', { name: 'Saved lists', exact: true }).click();
 const peerLists = peer.getByRole('dialog', { name: 'Saved lists', exact: true });
 await peerLists.getByRole('button', { name: 'Add Downtown replenishment to cart', exact: true }).waitFor();
 await expect(peerLists.getByRole('button', { name: 'Add Private planning to cart', exact: true })).toHaveCount(0);
 await captureWidths(peer, 'company-colleague-shared-list-only');
 await peerLists.getByRole('button', { name: 'Add Downtown replenishment to cart', exact: true }).click();
 const preview = peer.getByRole('dialog', { name: 'Add Downtown replenishment to cart', exact: true });
 await preview.getByRole('status').filter({ hasText: '800.00' }).waitFor();
 await captureWidths(peer, 'company-shared-list-current-preview');
 await preview.getByRole('button', { name: 'Replace cart', exact: true }).click();
 await expect(peer.getByRole('spinbutton', { name: /quantity for Toasted oat granola/ })).toHaveValue('2');
 await captureWidths(peer, 'company-colleague-shared-list-cart');

 await users.getByLabel('Company change reason').fill('Purchaser no longer represents this company.');
 await captureWidths(admin, 'company-remove-user-review');
 await users.getByRole('button', { name: 'Remove company user', exact: true }).click();
 await users.getByRole('listitem').filter({ hasText: purchaser.email }).filter({ hasText: 'removed' }).waitFor();
 await captureWidths(admin, 'company-user-removed');
 await buy.reload();
 await buy.getByRole('heading', { name: 'Your orders', exact: true }).waitFor();
 await buy.getByRole('heading', { name: 'No orders yet', exact: true }).waitFor();
 await expect(buy.getByRole('button', { name: 'Catalog', exact: true })).toHaveCount(0);
 await expect(buy.getByRole('link', { name: 'Download invoice CSV', exact: true })).toHaveCount(0);
 await captureWidths(buy, 'company-revoked-user-end-state');
 await staff.getByRole('button',{name:'Accounts',exact:true}).click();const custody=staff.getByRole('region',{name:'Company users',exact:true});await custody.getByLabel('Edit company user').selectOption({label:`${purchaser.name} · ${purchaser.email}`});await custody.getByLabel('Company change reason').fill('Owner reviewed individual identity erasure; commercial history is retained.');await custody.getByLabel('Type ERASE for this company user').fill('ERASE');await captureWidths(staff,'company-owner-erasure-review');await custody.getByRole('button',{name:'Erase company user',exact:true}).click();await custody.getByRole('listitem').filter({hasText:'Former company user'}).waitFor();await captureWidths(staff,'company-former-user-history');
 assert.equal((await h.request('/api/barrow/state',{as:purchaser.cookie})).status,401);
 assert.equal((await h.api('/api/barrow/orders/' + waiting.id)).preparedBy, purchaser.actor.id);
});
