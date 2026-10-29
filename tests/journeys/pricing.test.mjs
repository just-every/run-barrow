import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {cardFixture} from '../api/card-fixture.mjs';
import {signedContext,captureRegionWidths} from './browser-helpers.mjs';
const app=async(page,h)=>{await page.goto(h.origin+'/app');if(new URL(page.url()).pathname==='/setup'){await page.getByLabel('Your name').fill('Supplier owner');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click()}await page.getByRole('button',{name:'Orders',exact:true}).waitFor()};
const shot=async(page,region,name)=>{
 assert.deepEqual(await page.locator('.barrow *').evaluateAll(elements=>elements.filter(e=>e.checkVisibility()&&[...e.childNodes].some(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim())&&parseFloat(getComputedStyle(e).fontSize)<13).map(e=>({tag:e.tagName,text:e.textContent.slice(0,60),size:getComputedStyle(e).fontSize}))),[],name+': readable text');
 assert.deepEqual(await page.locator('.barrow *').evaluateAll(elements=>elements.filter(e=>{if(!e.checkVisibility())return false;const s=getComputedStyle(e);return ['borderTopLeftRadius','borderTopRightRadius','borderBottomLeftRadius','borderBottomRightRadius'].some(k=>parseFloat(s[k])>0)&&new Set(['borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth'].map(k=>s[k])).size>1}).map(e=>({tag:e.tagName,classes:e.className}))),[],name+': complete rounded borders');
 if(process.env.BARROW_JOURNEY_EVIDENCE)await captureRegionWidths(page,region,name)
};

test('supplier schedules a complete book and dated USD basis, buyer keeps CAD documents, and reports show the recorded conversion without changing cents',async t=>{
 const {h,buyer,edge}=await cardFixture(t,{built:true,https:true});
 const browser=await chromium.launch({headless:true,...(process.env.BARROW_CHROMIUM?{executablePath:process.env.BARROW_CHROMIUM}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});t.after(()=>browser.close());
 const owner=await signedContext(browser,h);t.after(()=>owner.close());const page=await owner.newPage();await app(page,h);
 await page.getByRole('button',{name:'Accounts',exact:true}).click();await page.getByRole('button',{name:'Edit account',exact:true}).first().click();
 const form=page.getByRole('button',{name:'Save account',exact:true}).locator('..').locator('..');
 await form.getByLabel('Price book currency',{exact:true}).selectOption('CAD');await form.getByLabel('Minimum order (cents)',{exact:true}).fill('0');await form.getByLabel(/^Agreed prices/).fill('OAT-1,1303,1');
 const revisions=[{effectiveFrom:'2098-01-02',prices:[{sku:'OAT-1',unitCents:1709,minQty:1}]}],basis={asOf:'2026-10-26',numerator:73,denominator:100,source:'Supplier daily CAD reference'};
 await form.getByLabel(/^Scheduled book revisions/).fill(JSON.stringify(revisions));await form.getByLabel(/^Dated USD conversion basis/).fill(JSON.stringify(basis));
 await shot(page,form,'scheduled-book-settings');await form.getByRole('button',{name:'Save account',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Trade account saved.'})).toBeVisible();await shot(page,page.getByRole('status').filter({hasText:'Trade account saved.'}),'scheduled-book-saved');
 const account=await h.api('/api/barrow/accounts/by-id/cedar');assert.deepEqual(account.value.priceRevisions,revisions);assert.deepEqual(account.value.usdConversion,basis);
 const context=await signedContext(browser,h,buyer.as);t.after(()=>context.close());const buyerPage=await context.newPage();await app(buyerPage,h);await expect(buyerPage.getByText('CAD 13.03',{exact:false}).first()).toBeVisible();await shot(buyerPage,buyerPage.locator('.br-pad'),'cad-exact-price');
 const order=await h.command('order.prepare',{accountId:'cedar',reference:'Dated CAD order',lines:[{sku:'OAT-1',quantity:3}]},buyer);await h.command('order.submit',{orderId:order.id},buyer);await h.command('order.approve',{orderId:order.id});
 let payment=await h.command('card.prepare',{orderId:order.id},buyer);edge.complete(payment);payment=await h.command('card.refresh',{paymentId:payment.id},buyer);assert.equal(payment.surchargeCents,0);
 payment=await h.command('card.authorize',{paymentId:payment.id,consent:true,amountCents:3909,surchargeCents:0},buyer);assert.equal(payment.currency,'CAD');assert.equal(payment.state,'authorized');await h.command('card.capture',{paymentId:payment.id,reason:'Supplier approved exact CAD presentment.'});
 assert.equal(edge.requests.find(r=>r.path==='/payment_intents').body.get('currency'),'cad');assert.equal(edge.requests.find(r=>r.path==='/payment_intents').body.get('amount'),'3909');
 await page.reload();await page.getByRole('button',{name:'Data',exact:true}).click();
 for(const heading of ['Invoice aging and finance','Sales by account and product']) {
  await page.getByText(heading,{exact:true}).first().click();const region=page.locator('.br-card').filter({has:page.getByRole('heading',{name:heading,exact:true})}).first();await region.getByText(heading.startsWith('Invoice')?'Invoice sources (1)':'Document lines (1)',{exact:true}).click();
  await expect(region).toContainText('CAD 39.09');await expect(region).toContainText('USD 28.54');await expect(region).toContainText('2026-10-26');await expect(region).toContainText('73 to 100');await expect(region).toContainText(basis.source);await shot(page,region,heading.startsWith('Invoice')?'cad-finance-conversion':'cad-sales-conversion');
 }
 const current=await h.api('/api/barrow/accounts/by-id/cedar');await h.command('account.save',{id:current.id,revision:current.revision,value:{...current.value,currency:'EUR',usdConversion:undefined,priceRevisions:[]}});
 const quote=await h.command('quote.request',{accountId:'cedar',lines:[{sku:'OAT-1',quantity:3}]},buyer);await h.command('quote.propose',{quoteId:quote.id,revision:quote.revision,validUntil:'2098-01-31',lines:[{sku:'OAT-1',quantity:3}]});await h.command('quote.accept',{quoteId:quote.id,number:1},buyer);
 await page.getByText('Quote conversion',{exact:true}).first().click();const conversion=page.locator('.br-card').filter({has:page.getByRole('heading',{name:'Quote conversion',exact:true})}).first();
 await conversion.getByLabel(/^Currency/).selectOption('EUR');await expect(conversion).toContainText('Accepted orders 1: EUR 39.09');
 await conversion.getByLabel(/^Currency/).selectOption('GBP');await expect(conversion).toContainText('Accepted orders 0: GBP 0.00');
 await shot(page,conversion,'enabled-currency-quote-report');
 for(const screen of [page,buyerPage])assert.equal(await screen.locator('button,a,[role=button]').evaluateAll(elements=>elements.filter(e=>e.getBoundingClientRect().width>0&&!/[A-Za-z0-9]/.test(e.textContent??'')&&!e.getAttribute('aria-describedby')).length),0);
});
