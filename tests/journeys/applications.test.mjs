// Manual clause browser journey: actual built Worker, real D1/Pier, fake only at the paid mail edge.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { installation, stock } from '../api/harness.mjs';
import { verifiedApplication } from '../api/application-fixture.mjs';
import {captureWidths,signedContext} from './browser-helpers.mjs';
const directory=process.env.BARROW_JOURNEY_EVIDENCE??'/tmp/sx-barrow-c25-screens';
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
 await expect(form.getByLabel('Resale certificates',{exact:false})).toBeDisabled();
 assert.equal(await form.locator('[name=website]').isVisible(),false);
 await form.getByRole('checkbox',{name:'Your details and documents go only to the supplier'}).check();await captureWidths(page,'application-form');
 await page.waitForTimeout(3100);await form.getByRole('button',{name:'Submit and request verification code'}).click();await page.getByRole('status').filter({hasText:'Verification accepted'}).waitFor();
 assert.equal((await h.api('/api/barrow/applications')).applications.length,0);
 const code=h.mail.requests.findLast(r=>r.message.subject==='Verify your trade application').message.text.match(/code is (\d{6})/)[1];
 await page.getByLabel('Verification code',{exact:true}).fill(code);await page.getByRole('button',{name:'Verify email and view application'}).click();await page.getByText('Status: submitted',{exact:true}).waitFor();await captureWidths(page,'application-submitted');
 await staff.getByRole('button',{name:'Accounts',exact:true}).click();const queue=staff.getByRole('region',{name:'Trade applications'});await queue.getByLabel('Application',{exact:false}).selectOption({label:'Cedar Street Pantry · submitted'});await queue.getByRole('heading',{name:'Cedar Street Pantry · submitted'}).waitFor();await captureWidths(staff,'application-review');
 await queue.getByLabel('Decision reason (shown to applicant)').fill('Please attach the missing state certificate.');await queue.getByRole('button',{name:'Request missing certificate'}).click();await queue.getByRole('heading',{name:'Cedar Street Pantry · information requested'}).waitFor();
 await page.reload();await page.getByText('Status: information requested',{exact:true}).waitFor();await captureWidths(page,'application-information-request');
 assert.equal(await page.getByRole('button',{name:'Answer information request'}).count(),0);
 assert.equal((await h.api('/api/barrow/applications')).applications[0].documents.length,0);
 await staff.reload();await staff.getByRole('button',{name:'Accounts',exact:true}).click();await queue.getByLabel('Application',{exact:false}).selectOption({label:'Cedar Street Pantry · information requested'});await queue.getByLabel('Decision reason (shown to applicant)').fill('Trade requirements reviewed; approve without accepting the requested certificate.');await queue.getByText('Approve and invite buyer',{exact:true}).click();
 for(const [label,value] of Object.entries({'Exact Pier customer ID':products.customer.id,'Approved SKU (optional)':'OAT-1','Unit price USD cents':'6500','Minimum quantity':'2'}))await queue.getByLabel(label,{exact:true}).fill(value);
 await queue.getByRole('button',{name:'Approve application and request invitation'}).click();await queue.getByRole('heading',{name:'Cedar Street Pantry · approved'}).waitFor();await captureWidths(staff,'application-approved-review');
 await page.reload();await page.getByText('Status: approved',{exact:true}).waitFor();await captureWidths(page,'application-approved-status');
 const v1=await h.command('usage.publish',{title:'Portal use',body:'Use this portal only for the approved Cedar trade relationship.'});
 const buyer=await signedContext(browser,h,await h.signIn('applicant@example.test')),buy=await buyer.newPage();await buy.goto(h.origin+'/app');await buy.getByRole('heading',{name:'Portal usage terms',exact:true}).waitFor();await captureWidths(buy,'usage-first-signin');await buy.getByRole('checkbox').check();await buy.getByRole('button',{name:'Accept portal usage terms'}).click();await buy.getByRole('button',{name:'Orders',exact:true}).waitFor();await captureWidths(buy,'application-approved-assortment');await buy.getByRole('button',{name:'Orders',exact:true}).click();
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


test('owner grants functional application review and finance document access, reviewers use their own doors, and revocation closes them at desktop and phone', async t=>{
 const h=await installation({built:true,https:true});t.after(()=>h.close());
 const {application,bytes}=await verifiedApplication(h,{existingDocument:true});
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});t.after(()=>browser.close());
 const ownerContext=await signedContext(browser,h);t.after(()=>ownerContext.close());const owner=await ownerContext.newPage();await owner.goto(h.origin+'/app');
 if(new URL(owner.url()).pathname==='/setup'){await owner.getByLabel('Your name').fill('Supplier owner');await owner.getByRole('checkbox').check();await owner.getByRole('button',{name:'Finish setup',exact:true}).click()}
 const people=[];
 for(const person of [{name:'Morgan Review',email:'manager-review@example.test',role:'sales-manager',entitlement:'Review trade applications and download their documents'}, {name:'Casey Certificates',email:'finance-review@example.test',role:'finance',entitlement:'Read application documents for certificate review'}]){
  await owner.getByRole('button',{name:'Team',exact:true}).click();const form=owner.getByRole('form',{name:'Invite staff',exact:true});
  await form.getByLabel('Staff name',{exact:true}).fill(person.name);await form.getByLabel('Exact staff email',{exact:true}).fill(person.email);await form.getByLabel('Functional role',{exact:true}).selectOption(person.role);
  if(person.role==='sales-manager')await form.getByRole('checkbox',{name:'All trade accounts, including future accounts',exact:true}).check();
  await form.getByRole('checkbox',{name:person.entitlement,exact:true}).check();await form.getByLabel('Reason for this access change',{exact:true}).fill('Owner authorized this functional application responsibility.');
  await captureWidths(owner,`application-grant-${person.role}`);await form.getByRole('button',{name:'Send native staff invitation',exact:true}).click();await expect(form.getByLabel('Exact staff email',{exact:true})).toHaveValue('');
  const message=h.mail.requests.findLast(row=>row.message.to.includes(person.email)).message;
  const url=new URL(message.text.match(/https?:\/\/[^\s<>]+\/auth\/confirm\?token=[^\s<>]+/)[0]);
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});t.after(()=>context.close());const page=await context.newPage();await page.goto(h.origin+url.pathname+url.search);await page.getByRole('button',{name:'Confirm',exact:true}).click();await page.waitForURL(h.origin+'/app');
  await page.getByRole('button',{name:person.role==='finance'?'Applications':'Accounts',exact:true}).click();
  const queue=page.getByRole('region',{name:'Trade applications'});await queue.getByLabel('Application',{exact:false}).selectOption(application.id);await queue.getByRole('heading',{name:/Cedar Street Pantry/}).waitFor();
  await queue.getByText(/resale.pdf · \d+ bytes · quarantined/).waitFor();assert.equal(await queue.getByRole('link',{name:'resale.pdf',exact:true}).count(),0);
  const download=await page.request.get(h.origin+application.documents[0].path);assert.equal(download.status(),503);const result=await download.json();assert.equal(result.error.code,'APPLICATION_DOCUMENTS_UNAVAILABLE');assert.equal(JSON.stringify(result).includes(bytes),false);
  if(person.role==='finance'){
   assert.equal(await queue.getByRole('button').count(),0);assert.equal(await queue.getByLabel('Decision reason (shown to applicant)').count(),0);
   const refused=await page.request.post(h.origin+'/api/barrow/commands',{headers:{origin:h.origin},data:{type:'application.approve',payload:{id:application.id,revision:application.revision,reason:'Finance has no decision right.'}}});assert.equal(refused.status(),403);
  }
  await captureWidths(page,`application-reviewer-${person.role}`);people.push({...person,page,queue});
 }
 const manager=people[0];await manager.queue.getByLabel('Decision reason (shown to applicant)').fill('Please supply the missing state certificate.');await manager.queue.getByRole('button',{name:'Request missing certificate',exact:true}).click();await manager.queue.getByRole('heading',{name:'Cedar Street Pantry · information requested',exact:true}).waitFor();await captureWidths(manager.page,'application-manager-information-request');
 await manager.queue.getByLabel('Decision reason (shown to applicant)').fill('Trade requirements met; approve while certificate remains quarantined.');await manager.queue.getByText('Approve and invite buyer',{exact:true}).click();await manager.queue.getByLabel('Exact Pier customer ID',{exact:true}).fill('synthetic-barrow-305');await manager.queue.getByRole('button',{name:'Approve application and request invitation',exact:true}).click();await manager.queue.getByRole('heading',{name:'Cedar Street Pantry · approved',exact:true}).waitFor();await captureWidths(manager.page,'application-manager-approved');
 const second=await verifiedApplication(h,{name:'Harbor Provisions',email:'harbor@example.test'});await manager.page.reload();await manager.page.getByRole('button',{name:'Accounts',exact:true}).click();await manager.queue.getByLabel('Application',{exact:false}).selectOption(second.application.id);await manager.queue.getByLabel('Decision reason (shown to applicant)').fill('This business is outside our approved distribution.');await manager.queue.getByRole('button',{name:'Decline application',exact:true}).click();await manager.queue.getByRole('heading',{name:'Harbor Provisions · declined',exact:true}).waitFor();await captureWidths(manager.page,'application-manager-declined');
 for(const person of people){
  await owner.reload();await owner.getByRole('button',{name:'Team',exact:true}).click();const card=owner.getByRole('article').filter({has:owner.getByRole('heading',{name:person.name,exact:true})});
  await card.getByRole('button',{name:`Edit access for ${person.name}`,exact:true}).click();const edit=owner.getByRole('form',{name:'Edit staff access',exact:true});await edit.getByLabel('Reason for this access change',{exact:true}).fill('End this application entitlement immediately.');await edit.getByRole('button',{name:'Revoke staff access',exact:true}).click();await owner.getByRole('form',{name:'Invite staff',exact:true}).waitFor();
  const refused=await person.page.request.get(h.origin+application.documents[0].path);assert.equal(refused.status(),403);await person.page.reload();await person.page.getByRole('button',{name:'Orders',exact:true}).waitFor();assert.equal(await person.page.getByRole('region',{name:'Trade applications'}).count(),0);await captureWidths(person.page,`application-revoked-${person.role}`);
 }
});
