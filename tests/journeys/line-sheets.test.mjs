import { buyingProfilesFixture } from '../api/buying-profiles-fixture.mjs';
// Built Worker, native synthetic sessions, real pinned Pier. Screenshots stay outside the public tree.
import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {sheetFixture,csvRows} from '../api/line-sheet-fixture.mjs';
import {captureRegionWidths,signedContext} from './browser-helpers.mjs';
async function app(page,h) {
 await page.goto(h.origin+'/app');
 if(new URL(page.url()).pathname==='/setup'){
  await page.getByLabel('Your name').fill('Supplier owner');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();
 }
 await page.getByRole('button',{name:'Line sheets',exact:true}).waitFor();
}
const shot=(page,region,name)=>captureRegionWidths(page,region,name);

test('supplier publishes recipient-priced seasonal matrices and two buyers order exact size runs on phones, download their own documents, and see a revoked share refused at desktop and phone',async t=>{
 const f=await sheetFixture(t,{built:true,https:true}),{h,buyers}=f;
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});t.after(()=>browser.close());
 const owner=await signedContext(browser,h);t.after(()=>owner.close());const page=await owner.newPage();await app(page,h);
 // Retail editing and per-document preferences are actual form controls.
 await page.getByRole('button',{name:'Accounts',exact:true}).click();await page.getByRole('button',{name:'Edit account',exact:true}).first().click();
 const editor=page.getByRole('button',{name:'Save account',exact:true}).locator('..').locator('..');
 await expect(editor.getByLabel('Price book currency',{exact:true})).toHaveValue('USD');await expect(editor.getByLabel('Confirmation PDF prices',{exact:true})).toHaveValue('both');
 await editor.getByLabel('Suggested retail prices (optional JSON)',{exact:true}).fill(JSON.stringify([{sku:f.skus[0],msrpCents:2402},{sku:f.skus[2],msrpCents:3202}]));
 await shot(page,editor,'sheet-account-retail-settings');await editor.getByRole('button',{name:'Save account',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Trade account saved.'})).toBeVisible();
 await page.getByRole('button',{name:'Line sheets',exact:true}).click();const tools=page.getByRole('region',{name:'Seasonal line sheets',exact:true});await tools.getByText('Publish seasonal line sheet',{exact:true}).click();
 await tools.getByLabel('Sheet name',{exact:true}).fill('Spring for Cedar');await tools.getByLabel('Season',{exact:true}).fill('Spring buyer preview');await tools.getByLabel('Sheet prices',{exact:true}).selectOption('both');await tools.getByLabel('Variant SKUs',{exact:true}).fill(f.skus.join('\n'));await tools.getByLabel('Size runs and fixed assortment packs (optional JSON)',{exact:true}).fill(JSON.stringify(f.packs));
 const year=new Date().getUTCFullYear()+1;await tools.getByLabel('Ship start',{exact:true}).fill(`${year}-03-01`);await tools.getByLabel('Ship end',{exact:true}).fill(`${year}-03-31`);
 await shot(page,tools,'sheet-publisher');await tools.getByRole('button',{name:'Publish for this account',exact:true}).click();await tools.getByRole('button',{name:/Spring for Cedar/}).waitFor();
 const cedarSheet=(await h.api('/api/barrow/line-sheets?accountId=cedar')).sheets.find(s=>s.name==='Spring for Cedar');
 // Price-book import/export controls share the public command used by the API proof.
 await tools.getByLabel('Line-sheet account',{exact:true}).selectOption('wren');await tools.getByText('Import recipient price book',{exact:true}).click();
 const book=await(await h.request('/api/barrow/price-book.csv?accountId=wren')).text();await tools.getByLabel('Price book CSV',{exact:true}).fill(book);await shot(page,tools,'sheet-price-book-import');await tools.getByRole('button',{name:'Import price book',exact:true}).click();await expect(tools.getByRole('button',{name:'Import price book',exact:true})).toBeEnabled();
 const wren=await h.api('/api/barrow/accounts/by-id/wren'),wrenSheet=await f.publish(wren,'wholesale');
 const records=[];
 for(const [key,s,code,total] of [['cedar',cedarSheet,'USD',4003],['wren',wrenSheet,'CAD',4309]]){
  const context=await signedContext(browser,h,buyers[key].as);t.after(()=>context.close());const buyerPage=await context.newPage();await app(buyerPage,h);
  // The existing catalog labels CAD as CAD too.
  if(key==='wren'){await expect(buyerPage.getByText('CAD 13.03',{exact:false}).first()).toBeVisible();await shot(buyerPage,buyerPage.locator('.br-pad'),'sheet-cad-catalog');await shot(buyerPage,buyerPage.locator('.br-footer'),'sheet-currency-footer');}
  await buyerPage.getByRole('button',{name:'Line sheets',exact:true}).click();await buyerPage.getByRole('button',{name:key==='cedar'?/Spring for Cedar/:/Spring collection/}).first().click();
  const card=buyerPage.getByRole('article',{name:'Published line sheet',exact:true});await card.getByRole('heading').waitFor();await expect(card).toContainText(code);await expect(card).toContainText(key==='cedar'?'MSRP USD 24.02':'Wholesale CAD 13.03');if(key==='wren')await expect(card).not.toContainText('MSRP');
  await shot(buyerPage,card,`sheet-${key}-matrix`);await buyerPage.setViewportSize({width:390,height:1000});
  await card.getByRole('spinbutton',{name:'One full size run pack count',exact:true}).fill('1');await card.getByRole('button',{name:'Preview sheet cart',exact:true}).click();
  const preview=card.getByRole('region',{name:'Line-sheet cart preview',exact:true});await expect(preview).toContainText(`Wholesale total ${code} ${(total/100).toFixed(2)}`);await preview.getByLabel('PO reference',{exact:true}).fill(`synthetic-barrow-phone-${key}`);await shot(buyerPage,preview,`sheet-${key}-cart-preview`);
  await buyerPage.setViewportSize({width:390,height:1000});const [preparedResponse]=await Promise.all([buyerPage.waitForResponse(r=>r.url().endsWith('/api/barrow/commands')&&r.request().postDataJSON()?.type==='order.prepare'),preview.getByRole('button',{name:'Prepare sheet order',exact:true}).click()]);assert.equal(preparedResponse.status(),200,JSON.stringify(await preparedResponse.json()));
  const orderCard=buyerPage.locator('article.br-order').filter({hasText:`synthetic-barrow-phone-${key}`});await orderCard.waitFor();await expect(orderCard).toContainText(`${code} ${(total/100).toFixed(2)}`);
  await orderCard.getByRole('button',{name:'Submit for supplier review',exact:true}).click();await expect(orderCard.locator('.br-status').first()).toHaveText('submitted');await orderCard.getByText('Order confirmations',{exact:true}).click();await orderCard.getByRole('link',{name:'Download confirmation 1 PDF',exact:true}).waitFor();await shot(buyerPage,orderCard,`sheet-${key}-submitted-order`);
  const orders=(await h.api('/api/barrow/orders/history?accountId='+key)).orders,order=orders.find(o=>o.reference===`synthetic-barrow-phone-${key}`);assert.equal(order.totalCents,total);assert.deepEqual(order.lines.map(l=>l.quantity),[1,1,1]);
  const pdf=await(await context.request.get(h.origin+`/api/barrow/line-sheets/${s.id}.pdf`)).text();assert.equal(pdf.includes('MSRP'),key==='cedar');
  const csv=csvRows(await(await context.request.get(h.origin+`/api/barrow/orders/${order.id}/confirmations/1.csv`)).text());assert.equal(csv.rows[0].currency,code);assert.equal(csv.header.includes('msrp_cents'),key==='cedar');
  if(key==='wren'){
   await orderCard.getByRole('button',{name:'Reorder selected lines',exact:true}).click();const dialog=buyerPage.getByRole('dialog',{name:`Reorder ${order.id}`,exact:true});await dialog.getByRole('button',{name:'Compare current terms',exact:true}).click();await expect(dialog.getByRole('heading',{name:'Current comparison',exact:true})).toBeVisible();await expect(dialog).toContainText('CAD 43.09');await shot(buyerPage,dialog.getByRole('region',{name:'Reorder difference summary',exact:true}),'sheet-cad-reorder');await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  }
  let quote=await h.command('quote.request',{accountId:key,lines:[{sku:f.skus[0],quantity:1}]},buyers[key]);quote=await h.command('quote.propose',{quoteId:quote.id,revision:quote.revision,validUntil:`${year}-04-01`,lines:[{sku:f.skus[0],quantity:1}]});assert.equal(quote.currency,code);assert.equal(quote.revisions[0].totalCents,key==='cedar'?1201:1303);
  await buyerPage.reload();await buyerPage.getByRole('button',{name:'Orders',exact:true}).click();const quotes=buyerPage.getByRole('region',{name:'Quotes',exact:true});await expect(quotes).toContainText(`${code} ${key==='cedar'?'12.01':'13.03'}`);await shot(buyerPage,quotes,`sheet-${key}-quote-currency`);
  records.push({page:buyerPage,context,sheet:s,order,key});
 }
 await page.getByRole('button',{name:'Data',exact:true}).click();const report=page.locator('.br-card').filter({has:page.getByRole('heading',{name:'Quote conversion',exact:true})}).first();await expect(report.getByRole('region',{name:'Line-sheet engagement',exact:true})).toContainText('opens 1');await expect(report.getByRole('region',{name:'Line-sheet engagement',exact:true})).toContainText('buyer@example.test');await expect(report.getByRole('region',{name:'Line-sheet engagement',exact:true})).toContainText('wren@example.test');await shot(page,report,'sheet-buyer-engagement-report');
 const cedarBuyer=records[0];await cedarBuyer.page.getByRole('button',{name:'Line sheets',exact:true}).click();await cedarBuyer.page.getByRole('button',{name:/Spring for Cedar/}).click();await cedarBuyer.page.getByRole('article',{name:'Published line sheet',exact:true}).waitFor();await h.command('sheet.revoke',{sheetId:cedarSheet.id,revision:cedarSheet.revision});
 // A page opened before revocation cannot make another sheet request.
 await cedarBuyer.page.getByRole('button',{name:'Preview sheet cart',exact:true}).click();await expect(cedarBuyer.page.getByRole('alert')).toContainText('Line sheet not found');await expect(cedarBuyer.page.getByRole('article',{name:'Published line sheet',exact:true})).toHaveCount(0);await shot(cedarBuyer.page,cedarBuyer.page.getByRole('region',{name:'Seasonal line sheets',exact:true}),'sheet-revoked-share');
});

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
 await owner.getByRole('region', { name: 'Buying profile account', exact: true }).getByLabel('Trade account', {exact:true}).selectOption(f.account.id);
 const settings = owner.getByRole('region', { name: 'Brands and buying profiles', exact: true });
 const brandForm = settings.getByRole('form', { name: 'Brand settings', exact: true });
 await brandForm.getByLabel('Edit brand').selectOption(brands[0].id);
 await captureRegionWidths(owner, brandForm, 'buying-profile-brand-seller-settings');
 const profileForm = settings.getByRole('form', { name: 'Buying profile settings', exact: true });
 await profileForm.getByLabel('Edit buying profile').selectOption(profiles[0].id);
 await profileForm.getByLabel('Unit price in cents for price 1',{exact:true}).fill('6502');
 await profileForm.getByRole('button',{name:'Save buying profile',exact:true}).click();
 await expect.poll(async()=>(await f.read({})).profiles.find(profile=>profile.id===profiles[0].id).value.prices[0].unitCents).toBe(6502);
 specifications[0].unitCents=6502;
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
  await captureRegionWidths(buyer,selector.locator('..'),`buying-profile-${index}-deliberate-switch`);
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
 await grant.getByRole('combobox',{name:/^Profile access/}).selectOption(profiles[1].id);
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
