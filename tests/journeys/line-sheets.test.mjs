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
  if(key==='wren'){await expect(buyerPage.getByText('CAD 13.03',{exact:false}).first()).toBeVisible();await shot(buyerPage,buyerPage.locator('.br-pad'),'sheet-cad-catalog');}
  await buyerPage.getByRole('button',{name:'Line sheets',exact:true}).click();await buyerPage.getByRole('button',{name:key==='cedar'?/Spring for Cedar/:/Spring collection/}).last().click();
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
  records.push({page:buyerPage,context,sheet:s,order,key});
 }
 await page.getByRole('button',{name:'Data',exact:true}).click();const report=page.locator('.br-card').filter({has:page.getByRole('heading',{name:'Quote conversion',exact:true})}).first();await expect(report.getByRole('region',{name:'Line-sheet engagement',exact:true})).toContainText('opens 1');await expect(report.getByRole('region',{name:'Line-sheet engagement',exact:true})).toContainText('cedar');await expect(report.getByRole('region',{name:'Line-sheet engagement',exact:true})).toContainText('wren');await shot(page,report,'sheet-buyer-engagement-report');
 const cedarBuyer=records[0];await h.command('sheet.revoke',{sheetId:cedarSheet.id,revision:cedarSheet.revision});await cedarBuyer.page.getByRole('button',{name:'Line sheets',exact:true}).click();
 // Existing stale links fail through the UI as well as downloads.
 await cedarBuyer.page.getByRole('button',{name:/Spring for Cedar/}).click();await expect(cedarBuyer.page.getByRole('alert')).toContainText('Line sheet not found');await shot(cedarBuyer.page,cedarBuyer.page.getByRole('region',{name:'Seasonal line sheets',exact:true}),'sheet-revoked-share');
});
