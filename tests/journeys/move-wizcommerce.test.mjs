import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {sparkFixture} from '../api/sparklayer-fixture.mjs';
import {wizInput} from '../api/wizcommerce-fixture.mjs';
import {captureRegionWidths,signedContext} from './browser-helpers.mjs';

test('owner sees a separately reviewed WizCommerce buyer as pending with explicit limited rights at desktop and phone',async t=>{
 const {h}=await sparkFixture(t,{built:true,https:true}),input=wizInput(),report=await h.api('/api/barrow/imports/wizcommerce/preview',input),applied=await h.api('/api/barrow/imports/wizcommerce/apply',{...input,fingerprint:report.fingerprint,reason:'Owner retained source without granting access.'});
 assert.equal(h.mail.deliveries.length,0);
 await h.api('/api/barrow/imports/wizcommerce/invite',{importId:applied.id,fingerprint:applied.fingerprint,email:'new-buyer@example.test',confirm:true,policy:{rights:['purchaser'],locations:'all',perOrderLimitCents:25000,approvalLimitCents:0},reason:'Owner reviewed source candidate and limited native invitation.'});
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});t.after(()=>browser.close());const context=await signedContext(browser,h);t.after(()=>context.close());const page=await context.newPage();await page.goto(h.origin+'/app');
 if(new URL(page.url()).pathname==='/setup'){await page.getByLabel('Your name').fill('Supplier owner');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click()}
 await page.getByRole('button',{name:'Accounts',exact:true}).click();const company=page.getByRole('region',{name:'Company users',exact:true});await expect(company).toContainText('new-buyer@example.test');await expect(company).toContainText('invitation requested');await expect(company).toContainText('25000 USD cents');
 await captureRegionWidths(page,company,'wizcommerce-reviewed-pending-buyer');
 assert.deepEqual(await company.locator('button').evaluateAll(buttons=>buttons.filter(b=>!b.textContent?.trim()).map(b=>b.getAttribute('aria-label'))),[]);
 assert.equal((await h.db.prepare("SELECT state FROM bw_company_members WHERE email='new-buyer@example.test'").first()).state,'invited');
});
