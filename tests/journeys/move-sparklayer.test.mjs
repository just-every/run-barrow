import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {sparkFixture} from '../api/sparklayer-fixture.mjs';
import {captureRegionWidths,signedContext} from './browser-helpers.mjs';

test('owner uses an imported SparkLayer list at current prices and explicitly shares it at desktop and phone',async t=>{
 const {h,preview,apply}=await sparkFixture(t,{built:true,https:true});await apply(await preview());
 const account=await h.api('/api/barrow/accounts/by-id/cedar');await h.command('account.save',{id:account.id,revision:account.revision,value:{...account.value,prices:account.value.prices.map(p=>({...p,unitCents:7000}))}});
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});t.after(()=>browser.close());
 const context=await signedContext(browser,h);t.after(()=>context.close());const page=await context.newPage();await page.goto(h.origin+'/app');
 if(new URL(page.url()).pathname==='/setup'){await page.getByLabel('Your name').fill('Supplier owner');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click()}
 await page.getByRole('button',{name:'Order pad',exact:true}).click();
 await page.getByRole('button',{name:'Saved lists',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Saved lists',exact:true});await expect(dialog).toContainText('Store replenishment');await expect(dialog).toContainText('Only you');
 await captureRegionWidths(page,dialog,'sparklayer-imported-private-list');
 await dialog.getByRole('button',{name:'Share with this account',exact:true}).click();await expect(dialog).toContainText('Shared with this account');await captureRegionWidths(page,dialog,'sparklayer-explicit-shared-list');
 await dialog.getByRole('button',{name:'Add Store replenishment to cart',exact:true}).click();
 const cart=page.getByRole('dialog',{name:'Add Store replenishment to cart',exact:true});await expect(cart).toContainText(/USD\s+280\.00/);await captureRegionWidths(page,cart,'sparklayer-current-price-preview');
 // The clause's dialogs use visible words for every control; no icon-only control needs a tooltip.
 assert.deepEqual(await cart.locator('button').evaluateAll(buttons=>buttons.filter(b=>!b.textContent?.trim()).map(b=>b.getAttribute('aria-label'))),[]);
 await cart.getByRole('button',{name:'Replace cart',exact:true}).click();await expect(cart).toHaveCount(0);
 assert.equal((await h.api('/api/barrow/state')).orders.length,0);
});
