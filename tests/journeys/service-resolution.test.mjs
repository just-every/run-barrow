import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {replacementCatalogue,replacementShipping} from '../api/service-resolution-fixture.mjs';
import {returnClaimsFixture} from '../api/return-claims-fixture.mjs';
import {signedContext,captureRegionWidths} from './browser-helpers.mjs';

test('buyer reports a shortage with an RMA and requested replacement, supplier assigns a response deadline and both see unresolved attributed service history',async t=>{
 const f=await returnClaimsFixture(t,{built:true,clock:'2035-01-15T12:00:00Z',dispatchedQuantity:4}),{h,buyer,order}=f;
 await replacementCatalogue(h,f.pier);await replacementShipping(h);
 let rma=await f.request();rma=await h.command('return.decide',{id:rma.id,revision:rma.revision,orderRevision:order.revision,quantity:2,instructions:'Return two for separate inspection.',reason:'Keep the remainder disputed.'});
 const browser=await chromium.launch({headless:true,...(process.env.BARROW_CHROMIUM?{executablePath:process.env.BARROW_CHROMIUM}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});t.after(()=>browser.close());
 const ownerContext=await signedContext(browser,h),buyerContext=await signedContext(browser,h,buyer.as);t.after(()=>ownerContext.close());t.after(()=>buyerContext.close());
 const ownerPage=await ownerContext.newPage(),buyerPage=await buyerContext.newPage();
 async function open(page) {
  await page.goto(h.origin+'/app');
  if(new URL(page.url()).pathname==='/setup'){await page.getByLabel('Your name').fill('Supplier owner');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click()}
  await page.getByRole('button',{name:'Orders',exact:true}).click();
  const card=page.locator('article.br-order').filter({hasText:'Reference: '+order.reference});await card.getByText('Shortages and service',{exact:true}).click();
  const panel=card.getByRole('region',{name:'Service for '+order.id,exact:true});await expect(panel.getByRole('heading',{name:'Service cases',exact:true})).toBeVisible();return panel;
 }
 let panel=await open(buyerPage);await panel.getByText('Report a shortage or defect',{exact:true}).click();
 await panel.getByLabel('Reported units',{exact:true}).fill('1');await panel.getByLabel('Buyer report',{exact:true}).fill('One unit was missing from the delivered carton.');await panel.getByLabel('Linked RMA ID (optional)',{exact:true}).fill(rma.id);await panel.getByLabel('Requested replacement SKU (optional)',{exact:true}).fill('OAT-2');
 await panel.getByRole('button',{name:'Submit service report',exact:true}).click();await expect(panel).toContainText('buyer reported 1');await expect(panel).toContainText('Pier confirms dispatch of 4 physical units');await expect(panel).toContainText('6 physical units; 2 awaiting dispatch; 0 cancelled');await expect(panel).toContainText('1 × OAT-2');await expect(panel).toContainText('disputed 1');await expect(panel.getByText('Review service case',{exact:true})).toHaveCount(0);
 panel=await open(ownerPage);await panel.getByText('Review service case',{exact:true}).click();await panel.getByLabel('Response deadline',{exact:true}).fill('2035-01-18');await panel.getByLabel('Buyer-visible response',{exact:true}).fill('We are reviewing your requested replacement. Price difference, tax and freight require approval before acceptance.');await panel.getByRole('button',{name:'Record service response',exact:true}).click();
 await expect(panel).toContainText('2035-01-18');await expect(panel).toContainText('Supplier owner');await expect(panel).toContainText('Unresolved.');await expect(panel.getByRole('list',{name:'Service response history'})).toContainText('require approval before acceptance');
 await panel.getByText('Propose replacement',{exact:true}).click();
 await panel.getByRole('button',{name:'Review replacement prices',exact:true}).click();
 await expect(panel).toContainText('Merchandise difference: USD 14.00');
 await panel.getByLabel('Replacement proposal reason',{exact:true}).fill('We propose the different-value oat replacement with the displayed parcel charge.');
 await panel.getByRole('button',{name:'Record replacement proposal',exact:true}).click();
 await expect(panel).toContainText('Replacement proposal 1');await expect(panel).toContainText('Replacement freight: USD 10.00');
 await captureRegionWidths(ownerPage,panel,'service-owner-review');
 panel=await open(buyerPage);await expect(panel).toContainText('2035-01-18');await expect(panel).toContainText('require approval before acceptance');await expect(panel).toContainText('no replacement order has been accepted');await expect(panel).toContainText('Unresolved.');await expect(panel).toContainText('6 physical units; 2 awaiting dispatch; 0 cancelled');
 await expect(panel).toContainText('Merchandise difference: USD 14.00');await expect(panel).toContainText('Replacement freight: USD 10.00');
 await panel.getByRole('checkbox',{name:'I approve the displayed merchandise difference',exact:false}).check();
 await panel.getByRole('button',{name:'Approve replacement price and freight',exact:true}).click();
 await expect(panel).toContainText('Buyer approved this exact merchandise difference and freight.');await expect(panel).toContainText('Tax remains unverified.');await expect(panel).toContainText('case remains unresolved');
 await captureRegionWidths(buyerPage,panel,'service-buyer-response');
 const original=await h.api('/api/barrow/orders/'+order.id);assert.deepEqual(original.lines,order.lines);assert.equal((await h.api('/api/barrow/credits?orderId='+order.id)).credits.length,0);
 assert.equal((await f.claims()).claims.find(row=>row.id===rma.id).disputedQuantity,1);
 for(const page of [buyerPage,ownerPage]) {
  const region=page.getByRole('region',{name:'Service for '+order.id,exact:true});
  assert.equal(await region.locator('button,a,[role=button]').evaluateAll(elements=>elements.filter(element=>element.getBoundingClientRect().width>0&&!/[A-Za-z0-9]/.test(element.textContent??'')&&!element.getAttribute('aria-describedby')).length),0);
  assert.equal(await region.locator('p,label,button,a,li').evaluateAll(elements=>elements.filter(element=>element.getBoundingClientRect().width>0&&parseFloat(getComputedStyle(element).fontSize)<13).length),0);
 }
});
