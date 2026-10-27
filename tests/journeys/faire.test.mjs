import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {faireFixture,ingestFixture} from '../api/faire-fixture.mjs';
import {signedContext,captureRegionWidths} from './browser-helpers.mjs';

test('Faire source quantities and unknown fulfillment facts remain visible without a Pier connection',async t=>{
 const f=await faireFixture(t,{built:true});await ingestFixture(f);
 const browser=await chromium.launch({headless:true,...(process.env.BARROW_CHROMIUM?{executablePath:process.env.BARROW_CHROMIUM}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});t.after(()=>browser.close());
 const context=await signedContext(browser,f.h);t.after(()=>context.close());const page=await context.newPage();await page.goto(f.h.origin+'/app');
 if(new URL(page.url()).pathname==='/setup'){await page.getByLabel('Your name').fill('Supplier owner');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click()}
 await page.getByRole('button',{name:'Data',exact:true}).click();await page.getByText('Fulfillment & backorders',{exact:true}).click();
 const panel=page.locator('.br-card').filter({has:page.getByRole('heading',{name:'Fulfillment & backorders',exact:true})}).first();
 await expect(panel.getByRole('heading',{name:'Faire · synthetic-barrow-order-1 · OAT-1',exact:true})).toBeVisible();await expect(panel.getByRole('heading',{name:'Faire · synthetic-barrow-order-2 · OAT-1',exact:true})).toBeVisible();
 const first=panel.getByRole('article').filter({hasText:'synthetic-barrow-order-1'}),second=panel.getByRole('article').filter({hasText:'synthetic-barrow-order-2'});
 await expect(first).toContainText('Ordered 3 · shipped unknown · warehouse unknown');await expect(second).toContainText('Ordered 2 · shipped unknown · warehouse unknown');await expect(first).toContainText('Delivery unknown · settlement owned by Faire');
 assert.equal(await panel.locator('button,a,[role=button]').evaluateAll(elements=>elements.filter(element=>element.getBoundingClientRect().width>0&&!/[A-Za-z0-9]/.test(element.textContent??'')&&!element.getAttribute('aria-describedby')).length),0);
 await panel.getByRole('button',{name:'Open late-line queue',exact:true}).click();await expect(first).toHaveCount(0);await panel.getByRole('button',{name:'Show all lines',exact:true}).click();await expect(first).toBeVisible();
 await captureRegionWidths(page,panel,'faire-fulfillment');
});
