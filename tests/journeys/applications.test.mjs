// Manual clause browser journey: actual built Worker, real D1/Pier, fake only at the paid mail edge.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { installation, stock } from '../api/harness.mjs';
const directory=process.env.BARROW_JOURNEY_EVIDENCE??'/tmp/sx-barrow-c25-screens';
export async function captureWidths(page,name) {
 await mkdir(directory,{recursive:true});
 for(const width of [1440,390]) {
  await page.setViewportSize({width,height:1000});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name} ${width}: horizontal overflow`);
  await page.screenshot({path:`${directory}/${name}-${width}.png`,fullPage:true});
 }
 await page.setViewportSize({width:1440,height:1000});
}
export async function signedContext(browser,h,cookie=h.cookie) {
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});
 await context.addCookies(cookie.split('; ').map(v=>({name:v.slice(0,v.indexOf('=')),value:v.slice(v.indexOf('=')+1),url:h.origin,httpOnly:true,secure:true,sameSite:'Strict'})));
 return context;
}
test('native trade application, review, private status, usage acceptance and retention screens at desktop and phone',async t=>{
 const pier=await installation({pier:true});t.after(()=>pier.close());const products=await stock(pier);
 const h=await installation({built:true,https:true,bindings:{PIER_ORIGIN:pier.origin,PIER_SESSION:pier.cookie}});t.after(()=>h.close());
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});t.after(()=>browser.close());
 const owner=await signedContext(browser,h),staff=await owner.newPage();
 await staff.goto(h.origin+'/app');
 if(new URL(staff.url()).pathname==='/setup') {
  await staff.getByLabel('Your name').fill('Supplier owner');await staff.getByRole('checkbox').check();await staff.getByRole('button',{name:'Finish setup',exact:true}).click();
 }
 await staff.getByRole('button',{name:'Accounts',exact:true}).waitFor();
 const visitor=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}}),page=await visitor.newPage();
 await page.goto(h.origin+'/apply');const form=page.getByRole('form',{name:'Public trade form'});
 await form.getByLabel('Company legal name').fill('Cedar Street Pantry');await form.getByLabel('EIN, never a Social Security number').fill('12-3456789');await form.getByLabel('Contact name').fill('River Buyer');await form.getByLabel('Contact email').fill('applicant@example.test');await form.getByLabel('Contact phone').fill('803 555 0101');await form.getByLabel('Expected annual volume in whole USD').fill('90000');
 const address=async index=>{for(const [label,value] of Object.entries({'Location name':index?'Cedar North':'Cedar Downtown','Address line 1':index?'202 Main Street':'101 Main Street',City:'Columbia','US state':'SC','ZIP code':'29201'}))await form.getByLabel(label,{exact:true}).nth(index).fill(value)};
 await address(0);await form.getByRole('button',{name:'Add requested location'}).click();await address(1);
 await form.getByLabel('Resale certificates',{exact:false}).setInputFiles([{name:'resale.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 synthetic-barrow-1')},{name:'business.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 synthetic-barrow-2')}]);
 await form.getByRole('checkbox',{name:'Your details and documents go only to the supplier'}).check();await captureWidths(page,'application-form');
 await page.waitForTimeout(3100);await form.getByRole('button',{name:'Submit and request verification code'}).click();await page.getByRole('status').filter({hasText:'Verification accepted'}).waitFor();
 assert.equal((await h.api('/api/barrow/applications')).applications.length,0);
 const code=h.mail.requests.findLast(r=>r.message.subject==='Verify your trade application').message.text.match(/code is (\d{6})/)[1];
 await page.getByLabel('Verification code',{exact:true}).fill(code);await page.getByRole('button',{name:'Verify email and view application'}).click();await page.getByText('Status: submitted',{exact:true}).waitFor();await captureWidths(page,'application-submitted');
 await staff.getByRole('button',{name:'Accounts',exact:true}).click();const queue=staff.getByRole('region',{name:'Trade applications'});await queue.getByLabel('Application',{exact:false}).selectOption({label:'Cedar Street Pantry · submitted'});await queue.getByRole('heading',{name:'Cedar Street Pantry · submitted'}).waitFor();await captureWidths(staff,'application-review');
 await queue.getByLabel('Decision reason (shown to applicant)').fill('Please attach the missing state certificate.');await queue.getByRole('button',{name:'Request missing certificate'}).click();await queue.getByRole('heading',{name:'Cedar Street Pantry · information requested'}).waitFor();
 await page.reload();await page.getByText('Status: information requested',{exact:true}).waitFor();await captureWidths(page,'application-information-request');
 await page.getByLabel('Requested certificate',{exact:false}).setInputFiles({name:'state.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 synthetic-barrow-3')});await page.getByRole('button',{name:'Answer information request'}).click();await page.getByText('Status: submitted',{exact:true}).waitFor();
 await staff.reload();await staff.getByRole('button',{name:'Accounts',exact:true}).click();await queue.getByLabel('Application',{exact:false}).selectOption({label:'Cedar Street Pantry · submitted'});await queue.getByLabel('Decision reason (shown to applicant)').fill('Trade relationship approved after certificate review.');await queue.getByText('Approve and invite buyer',{exact:true}).click();
 for(const [label,value] of Object.entries({'Exact Pier customer ID':products.customer.id,'Approved SKU (optional)':'OAT-1','Unit price USD cents':'6500','Minimum quantity':'2'}))await queue.getByLabel(label,{exact:true}).fill(value);
 await queue.getByRole('button',{name:'Approve application and request invitation'}).click();await queue.getByRole('heading',{name:'Cedar Street Pantry · approved'}).waitFor();await captureWidths(staff,'application-approved-review');
 await page.reload();await page.getByText('Status: approved',{exact:true}).waitFor();await captureWidths(page,'application-approved-status');
 const v1=await h.command('usage.publish',{title:'Portal use',body:'Use this portal only for the approved Cedar trade relationship.'});
 const buyer=await signedContext(browser,h,await h.signIn('applicant@example.test')),buy=await buyer.newPage();await buy.goto(h.origin+'/app');await buy.getByRole('heading',{name:'Portal usage terms',exact:true}).waitFor();await captureWidths(buy,'usage-first-signin');await buy.getByRole('checkbox').check();await buy.getByRole('button',{name:'Accept portal usage terms'}).click();await buy.getByRole('button',{name:'Orders',exact:true}).waitFor().catch(async error=>{await captureWidths(buy,'failure-usage');console.log('USAGE_DOM',await buy.locator('main').innerText());throw error});await captureWidths(buy,'application-approved-assortment');await buy.getByRole('button',{name:'Orders',exact:true}).click();
 await h.command('usage.publish',{title:'Portal use update',body:'Updated portal usage obligations.'});await buy.reload();await buy.getByText('Portal use update · version 2',{exact:true}).waitFor();await captureWidths(buy,'usage-reaccept');await buy.getByRole('checkbox').check();await buy.getByRole('button',{name:'Accept portal usage terms'}).click();await buy.getByRole('button',{name:'Orders',exact:true}).waitFor();
 await staff.reload();await staff.getByRole('button',{name:'Accounts',exact:true}).click();await staff.getByRole('region',{name:'Portal usage terms'}).getByRole('heading',{name:'Portal usage terms',exact:true}).waitFor();await captureWidths(staff,'usage-publisher');
 const token=await h.api('/api/barrow/applications/form',undefined,{as:''});await page.waitForTimeout(3100);
 const declinedInput={name:'Harbour Provisions',noEin:true,contactName:'Finley Applicant',email:'declined@example.test',phone:'803 555 0102',annualVolumeUsd:40000,locations:[{name:'Harbour Market',line1:'303 Main Street',city:'Columbia',state:'SC',zip:'29201'}],documents:[],consent:true,formToken:token.formToken};
 const declinedApplication=await h.api('/api/barrow/applications',declinedInput,{as:''});
 await staff.reload();await staff.getByRole('button',{name:'Accounts',exact:true}).click();
 const declineContext=await browser.newContext({ignoreHTTPSErrors:true}),declinePage=await declineContext.newPage();await declinePage.goto(h.origin+`/apply?application=${declinedApplication.id}`);
 await declinePage.getByLabel('Verification code',{exact:true}).fill(h.mail.requests.findLast(r=>r.message.subject==='Verify your trade application').message.text.match(/code is (\d{6})/)[1]);await declinePage.getByRole('button',{name:'Verify email and view application'}).click();await declinePage.getByText('Status: submitted',{exact:true}).waitFor();
 await staff.reload();await staff.getByRole('button',{name:'Accounts',exact:true}).click();await queue.getByLabel('Application',{exact:false}).selectOption({label:'Harbour Provisions · submitted'});await queue.getByLabel('Decision reason (shown to applicant)').fill('Current assortment is unavailable for your business.');await queue.getByRole('button',{name:'Decline application',exact:true}).click();await queue.getByRole('heading',{name:'Harbour Provisions · declined'}).waitFor();
 await declinePage.reload();await declinePage.getByText('Status: declined',{exact:true}).waitFor();await captureWidths(declinePage,'application-declined');await declineContext.close();
 await h.command('retention.settings',{revision:null,days:{poDocuments:null,media:null,messages:null,commercialHistory:null,applicationRecords:1},reason:'Review expired applications.'});await h.db.prepare('UPDATE bw_applications SET updated_at=? WHERE id=?').bind(new Date(Date.now()-2*86400000).toISOString(),declinedApplication.id).run();
 await staff.reload();
 await staff.getByRole('button',{name:'Data',exact:true}).click();await staff.getByRole('region',{name:'Application retention'}).waitFor();await captureWidths(staff,'application-retention');
 await visitor.close();await buyer.close();await owner.close();console.log(`BROWSER_CAPTURES ${directory}`);
});
