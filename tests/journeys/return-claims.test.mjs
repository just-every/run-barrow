import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {returnClaimsFixture} from '../api/return-claims-fixture.mjs';
import {signedContext,captureRegionWidths} from './browser-helpers.mjs';

test('buyer requests three damaged units and the supplier authorizes two, matches their Pier receipt and retains the disputed remainder without issuing credit',async t=>{
 const f=await returnClaimsFixture(t,{built:true}),{h,buyer,order}=f;
 const browser=await chromium.launch({headless:true,...(process.env.BARROW_CHROMIUM?{executablePath:process.env.BARROW_CHROMIUM}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});t.after(()=>browser.close());
 const ownerContext=await signedContext(browser,h),buyerContext=await signedContext(browser,h,buyer.as);t.after(()=>ownerContext.close());t.after(()=>buyerContext.close());
 const ownerPage=await ownerContext.newPage(),buyerPage=await buyerContext.newPage();
 async function open(page){
  await page.goto(h.origin+'/app');
  if(new URL(page.url()).pathname==='/setup'){await page.getByLabel('Your name').fill('Supplier owner');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click()}
  await page.getByRole('button',{name:'Orders',exact:true}).click();
  const card=page.locator('article.br-order').filter({hasText:'Reference: '+order.reference});
  await card.getByText('Returns and claims',{exact:true}).click();
  const panel=card.getByRole('region',{name:'Returns for '+order.id,exact:true});await expect(panel.getByRole('heading',{name:'Return requests',exact:true})).toBeVisible();return panel;
 }
 let panel=await open(buyerPage);
 await panel.getByText('Request a return',{exact:true}).click();await panel.getByLabel('Requested units',{exact:true}).fill('3');await panel.getByLabel('Return reason',{exact:true}).fill('Damaged cartons');await panel.getByLabel('Goods condition',{exact:true}).fill('Two crushed units and one disputed unit.');
 await panel.getByRole('button',{name:'Submit return request',exact:true}).click();await expect(panel).toContainText('requested 3');await expect(panel).toContainText('Awaiting supplier authorization');await expect(panel.getByText('Review return quantities',{exact:true})).toHaveCount(0);
 await captureRegionWidths(buyerPage,panel,'return-buyer-request');
 panel=await open(ownerPage);await panel.getByText('Review return quantities',{exact:true}).click();await panel.getByLabel('Approved units',{exact:true}).fill('2');await panel.getByLabel('Return instructions',{exact:true}).fill('Bring two units to the supplier returns desk.');await panel.getByLabel('Decision reason',{exact:true}).fill('Authorize two; retain the disputed remainder for review.');
 await panel.getByRole('button',{name:'Record return authorization',exact:true}).click();await expect(panel).toContainText('Approved 2 of 3 · disputed 1');await expect(panel).toContainText('Disputed return remainder: open');await expect(panel).toContainText('Supplier owner');
 await captureRegionWidths(ownerPage,panel,'return-partial-authorization');
 const received=await f.receive(2);await panel.getByText('Match physical return receipt',{exact:true}).click();await panel.getByLabel('Pier return receipt ID',{exact:true}).fill(received.id);await panel.getByLabel('Received selling units',{exact:true}).fill('2');await panel.getByRole('button',{name:'Match recorded receipt',exact:true}).click();
 await expect(panel).toContainText('Original-priced credit proposal: USD 130.00');await expect(panel).toContainText(received.id);await expect(panel).toContainText('Disputed return remainder: open');
 await captureRegionWidths(ownerPage,panel,'return-reconciled-proposal');
 assert.equal((await h.api('/api/barrow/credits?orderId='+order.id)).credits.length,0);
 await buyerPage.reload();panel=await open(buyerPage);await expect(panel).toContainText('Approved 2 of 3 · disputed 1');await expect(panel).toContainText('Bring two units');await expect(panel).toContainText('USD 130.00');
 assert.equal(await panel.locator('button,a,[role=button]').evaluateAll(elements=>elements.filter(element=>element.getBoundingClientRect().width>0&&!/[A-Za-z0-9]/.test(element.textContent??'')&&!element.getAttribute('aria-describedby')).length),0);
 assert.equal(await panel.locator('p,label,button,a').evaluateAll(elements=>elements.filter(element=>element.getBoundingClientRect().width>0&&parseFloat(getComputedStyle(element).fontSize)<13).length),0);
});
