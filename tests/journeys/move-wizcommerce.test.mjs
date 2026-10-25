import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {sparkFixture} from '../api/sparklayer-fixture.mjs';
import {wizInput,wizNativeInput} from '../api/wizcommerce-fixture.mjs';
import {captureRegionWidths,signedContext} from './browser-helpers.mjs';

test('owner reviews a pending WizCommerce buyer and sees exact accepted purchasing rights at desktop and phone',async t=>{
 const {h}=await sparkFixture(t,{built:true,https:true}),input=wizInput(),report=await h.api('/api/barrow/imports/wizcommerce/preview',input),applied=await h.api('/api/barrow/imports/wizcommerce/apply',{...input,fingerprint:report.fingerprint,reason:'Owner retained source without granting access.'});
 assert.equal(h.mail.deliveries.length,0);
 await h.api('/api/barrow/imports/wizcommerce/invite',{importId:applied.id,fingerprint:applied.fingerprint,email:'new-buyer@example.test',confirm:true,policy:{rights:['purchaser'],locations:'all',perOrderLimitCents:25000,approvalLimitCents:0},reason:'Owner reviewed source candidate and limited native invitation.'});
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});t.after(()=>browser.close());const context=await signedContext(browser,h);t.after(()=>context.close());const page=await context.newPage();await page.goto(h.origin+'/app');
 if(new URL(page.url()).pathname==='/setup'){await page.getByLabel('Your name').fill('Supplier owner');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click()}
 await page.getByRole('button',{name:'Accounts',exact:true}).click();const company=page.getByRole('region',{name:'Company users',exact:true});await expect(company).toContainText('new-buyer@example.test');await expect(company).toContainText('invitation requested');
 await captureRegionWidths(page,company,'wizcommerce-reviewed-pending-buyer');
 assert.deepEqual(await company.locator('button').evaluateAll(buttons=>buttons.filter(b=>!b.textContent?.trim()).map(b=>b.getAttribute('aria-label'))),[]);
 assert.equal((await h.db.prepare("SELECT state FROM bw_company_members WHERE email='new-buyer@example.test'").first()).state,'invited');
 const buyer={as:await h.signIn('new-buyer@example.test','existing')},message=h.mail.requests.find(row=>row.message.subject==='Your company buyer invitation').message,link=new URL(message.text.match(/https?:\/\/[^\s<>]+\/app\?[^\s<>]+/)[0]);
 await h.command('company.accept',{invitationId:link.searchParams.get('companyInvitation'),token:link.searchParams.get('companyToken')},buyer);
 await page.reload();await page.getByRole('button',{name:'Accounts',exact:true}).click();await expect(company).toContainText('25000 USD cents');await expect(company).toContainText('active');await captureRegionWidths(page,company,'wizcommerce-accepted-limited-buyer');

});


test('owner previews workbook and FTP native activation, approves exact reconciliation and replays without duplicates at desktop and phone',async t=>{
 const {h}=await sparkFixture(t,{built:true,https:true}),cedar=await h.api('/api/barrow/accounts/by-id/cedar'),account={...cedar.value,pierCustomerId:'synthetic-barrow-71'};
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});t.after(()=>browser.close());const context=await signedContext(browser,h);t.after(()=>context.close());const page=await context.newPage();await page.goto(h.origin+'/app');
 if(new URL(page.url()).pathname==='/setup'){await page.getByLabel('Your name').fill('Supplier owner');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click()}
 await page.getByRole('button',{name:'Move in',exact:true}).click();const region=page.getByRole('region',{name:'WizCommerce move-in',exact:true});
 for(const [index,layout] of ['ftp','split','master'].entries()){
  const input=wizNativeInput(account,layout);await expect(region.getByLabel('Choose WizCommerce manifest')).toBeEnabled();await region.getByLabel('Choose WizCommerce manifest').setInputFiles({name:'wizcommerce-source.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(input))});
  await region.getByRole('button',{name:'Preview WizCommerce import',exact:true}).click();const preview=region.getByRole('region',{name:'WizCommerce preview',exact:true});await expect(preview).toContainText('Source and planned totals match.');await expect(preview).toContainText('Native customer, contact and address reconciliation');
  if(index===0){assert.equal((await h.api('/api/barrow/state')).accounts.some(row=>row.id==='wren'),false);await captureRegionWidths(page,region,'wizcommerce-native-preview')}
  await region.getByLabel('WizCommerce approval reason').fill('Owner compared native customer, contact, both addresses and exact currency totals.');await region.getByRole('checkbox',{name:'I reviewed this WizCommerce source, native entities, mappings, totals, missing fields and exact fingerprint.'}).check();
  await region.getByRole('button',{name:'Apply reviewed WizCommerce import',exact:true}).click();await expect(region).toContainText('WizCommerce import completed.');
  if(index===0){await captureRegionWidths(page,region,'wizcommerce-native-completed');await region.getByRole('button',{name:'Replay reviewed WizCommerce import',exact:true}).click();await expect(region).toContainText('Replay confirmed');await captureRegionWidths(page,region,'wizcommerce-native-replay')}
 }
 assert.equal((await h.api('/api/barrow/locations?accountId=wren')).locations.length,3);assert.equal((await h.api('/api/barrow/imports/wizcommerce')).history.length,2);
 assert.deepEqual(await region.locator('button').evaluateAll(buttons=>buttons.filter(button=>!button.textContent?.trim()).map(button=>button.getAttribute('aria-label'))),[]);
 const missing=wizNativeInput(account);missing.authority.customers['store-1']='missing';delete missing.nativeAccounts;await region.getByLabel('WizCommerce source').fill(JSON.stringify(missing));await expect(region.getByRole('region',{name:'WizCommerce preview',exact:true})).toHaveCount(0);await region.getByRole('button',{name:'Preview WizCommerce import',exact:true}).click();await expect(region).toContainText('Resolve the differences before applying.');await expect(region.getByRole('button',{name:'Apply reviewed WizCommerce import',exact:true})).toBeDisabled();await captureRegionWidths(page,region,'wizcommerce-native-unresolved');
 await page.getByRole('button',{name:'Accounts',exact:true}).click();const locations=page.locator('[aria-label="Locations"]');await locations.getByLabel('Trade account',{exact:true}).selectOption('wren');await expect(locations).toContainText('receiving@example.test');await expect(locations).toContainText('Wren billing');await expect(locations).toContainText('Brooklyn, NY 11201');await captureRegionWidths(page,locations,'wizcommerce-native-locations');
});
