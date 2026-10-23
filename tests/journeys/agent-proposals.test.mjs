import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {proposalFixture} from '../api/proposal-fixture.mjs';
import {captureRegionWidths,signedContext} from './browser-helpers.mjs';

test('owner scopes an external agent, manager and buyer review exact replacements, revoked execution is refused and a fresh revision completes once at desktop and phone',async t=>{
 const f=await proposalFixture(t,{built:true,https:true}),{h}=f;
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});t.after(()=>browser.close());
 const context=await signedContext(browser,h);t.after(()=>context.close());const page=await context.newPage();await page.goto(h.origin+'/app');
 if(new URL(page.url()).pathname==='/setup'){await page.getByLabel('Your name').fill('Supplier owner');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click()}
 async function grantScreen() {
  await page.getByRole('button',{name:'Data',exact:true}).click();const section=page.getByRole('region',{name:'Account-scoped proposal authority',exact:true});
  await section.getByLabel('Trade account',{exact:true}).selectOption('cedar');return section.getByRole('region',{name:'External agent proposal grants',exact:true});
 }
 const grants=await grantScreen();await grants.getByLabel('Original SKU',{exact:true}).fill('OAT-1');await grants.getByLabel('Allowed replacement SKUs, separated by commas',{exact:true}).fill('MAPLE-1, HONEY-1');await grants.getByLabel('Reported external cost limit (USD cents)',{exact:true}).fill('10');await grants.getByLabel('Buyer contact limit',{exact:true}).fill('9');await grants.getByLabel('Owner’s reason for granting this permission',{exact:true}).fill('Owner approved the account, exact replacement assortment, bounded contacts and explicit human decisions.');await grants.getByRole('checkbox').check();
 await captureRegionWidths(page,grants,'proposal-owner-scope');await grants.getByRole('button',{name:'Create private proposal credential',exact:true}).click();
 const credential=grants.getByLabel('Private proposal credential',{exact:true});await credential.waitFor();const token=await credential.inputValue(),grant=(await h.api('/api/barrow/proposal-grants?accountId=cedar')).grants[0];
 await captureRegionWidths(page,grants,'proposal-scoped-credential');
 let proposal=await f.submit({token,grant});
 async function managerScreen() {
  await page.getByRole('button',{name:'Orders',exact:true}).click();
  const panel=page.getByRole('region',{name:'Agent substitution proposals',exact:true}).filter({hasText:'synthetic-barrow-101'});await panel.getByRole('heading',{name:/Proposal [12] ·/}).first().waitFor();return panel;
 }
 async function offer(panel,candidate=1) {
  const latest=panel.getByRole('article').last();await latest.getByRole('button',{name:`Select candidate ${candidate} for buyer review`,exact:true}).click();await latest.getByLabel('Manager’s reason for this exact offer',{exact:true}).fill('Reviewed the original PO, current inventory, exact case prices and the unavailable tax comparison.');await latest.getByRole('checkbox').check();await captureRegionWidths(page,latest,'proposal-manager-review');await latest.getByRole('button',{name:'Offer selected candidate to buyer',exact:true}).click();
  await expect(latest.getByRole('heading')).toContainText('offered');
 }
 let panel=await managerScreen();await offer(panel);proposal=(await f.history()).proposals.at(-1);
 const buyerContext=await signedContext(browser,h,f.buyer.as);t.after(()=>buyerContext.close());const buyerPage=await buyerContext.newPage();
 async function buyerAccept(number) {
  await buyerPage.goto(h.origin+'/app');await buyerPage.getByRole('button',{name:'Orders',exact:true}).click();const details=buyerPage.locator('details').filter({has:buyerPage.locator('summary').filter({hasText:`Substitution ${number}: offered`})});await details.locator('summary').click();
  await captureRegionWidths(buyerPage,details,'proposal-buyer-basket');buyerPage.once('dialog',dialog=>dialog.accept());await details.getByRole('button',{name:'Accept exact substitution',exact:true}).click();await expect(buyerPage.getByText(`Substitution ${number}: accepted`,{exact:false})).toBeVisible();
 }
 await buyerAccept(proposal.offerNumber);
 const currentAccount=await h.api('/api/barrow/accounts/by-id/cedar');await h.command('account.save',{id:'cedar',revision:currentAccount.revision,value:{...currentAccount.value,prices:currentAccount.value.prices.map(price=>({...price,unitCents:price.unitCents+100}))}});
 const grantPanel=await grantScreen();await grantPanel.getByLabel('Reason to revoke this grant',{exact:true}).fill('Owner revoked the changed source scope before stock execution.');await grantPanel.getByRole('button',{name:'Revoke proposal grant',exact:true}).click();await expect(grantPanel.getByRole('heading',{name:'Proposal grant · revoked',exact:true})).toBeVisible();await captureRegionWidths(page,grantPanel,'proposal-owner-revoked');
 const before=(await f.pier.api('/api/pier/state')).orders;await f.execute(proposal,{}, {status:409});assert.deepEqual((await f.pier.api('/api/pier/state')).orders,before);
 panel=await managerScreen();await panel.getByText('Source evidence and permitted tools',{exact:true}).click();await panel.getByText('Effects and refusals',{exact:true}).click();await captureRegionWidths(page,panel,'proposal-refused-history');await expect(panel.getByRole('button',{name:'Execute buyer-approved replacement',exact:true})).toHaveCount(0);
 await panel.getByText('Withdraw this unexecuted proposal',{exact:true}).click();await panel.getByLabel('Manager’s withdrawal reason',{exact:true}).fill('Preserve the declined execution and all approvals; request a newly sourced and reviewed revision.');await panel.getByRole('button',{name:'Withdraw proposal',exact:true}).click();await expect(panel.getByRole('heading',{name:/Proposal 1 · superseded/})).toBeVisible();
 const withdrawn=(await f.history()).proposals[0],fresh=await f.grant();proposal=await f.submit(fresh,{id:withdrawn.id,number:withdrawn.number,revision:withdrawn.revision,runId:'synthetic-barrow-120'});
 await panel.getByRole('button',{name:'Refresh agent proposals',exact:true}).click();await panel.getByRole('heading',{name:/Proposal 2 · proposed/}).waitFor();await offer(panel);proposal=(await f.history()).proposals.at(-1);await buyerAccept(proposal.offerNumber);
 await panel.getByRole('button',{name:'Refresh agent proposals',exact:true}).click();await panel.getByRole('button',{name:'Execute buyer-approved replacement',exact:true}).click();
 // The original disappears under a stale status filter only if the UI changed
 // filters; All keeps both source and replacement visible after execution.
 panel=page.getByRole('region',{name:'Agent substitution proposals',exact:true}).filter({hasText:'synthetic-barrow-120'});await panel.getByRole('heading',{name:/Proposal 2 · completed/}).waitFor();
 await captureRegionWidths(page,panel,'proposal-completed-history');const result=(await f.history()).proposals.at(-1);assert.equal(result.state,'completed');assert.equal((await h.api('/api/barrow/orders/'+result.replacementId)).status,'approved');
 const source=(await f.pier.api('/api/pier/state')).orders,mail=h.mail.deliveries.length;await f.execute(proposal);assert.deepEqual((await f.pier.api('/api/pier/state')).orders,source);assert.equal(h.mail.deliveries.length,mail);
});
