import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {cardFixture} from '../api/card-fixture.mjs';
import {activateStaff} from '../api/harness.mjs';
import {signedContext,captureRegionWidths} from './browser-helpers.mjs';

const policy={role:'finance',accounts:['cedar'],warehouses:[],reports:['finance'],discountLimitCents:0,stockExceptionLimitCents:0};
async function open(page,h){await page.goto(h.origin+'/app');if(new URL(page.url()).pathname==='/setup'){await page.getByLabel('Your name').fill('Supplier owner');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click()}}

test('finance records a buyer promise, sees its missed owned task, revises the commitment and records a pause and withdrawal through built pages',async t=>{
 const {h,order}=await cardFixture(t,{built:true,https:true,clock:'2026-11-02T17:00:00Z'});
 const invoice=await order('Buyer promise for finance review'),second=await order('Missed commitment for follow-up');
 const {who:finance}=await activateStaff(h,['promise-journey','example.test'].join('@'),policy);
 const browser=await chromium.launch({headless:true,executablePath:process.env.BARROW_CHROMIUM_PATH,args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});t.after(()=>browser.close());
 const ownerContext=await signedContext(browser,h),context=await signedContext(browser,h,finance.as);t.after(()=>ownerContext.close());t.after(()=>context.close());
 const owner=await ownerContext.newPage();await open(owner,h);
 const page=await context.newPage();await open(page,h);await page.getByRole('button',{name:'Reports',exact:true}).click();
 try {
 const panel=page.getByRole('region',{name:'Buyer payment promises',exact:true});await panel.getByLabel('Promise account',{exact:true}).selectOption('cedar');await expect(panel).toContainText('No buyer promises have been recorded');
 await panel.getByText('Record or revise a buyer promise',{exact:true}).click();const form=panel.getByRole('form',{name:'Record buyer promise',exact:true});
 await form.getByLabel('Promise invoice',{exact:true}).selectOption(invoice.id);await form.getByLabel('Promised amount (USD minor units)',{exact:true}).fill('10000');await form.getByLabel('Promise due date',{exact:true}).fill('2026-11-02');await form.getByLabel('Promise decision reason',{exact:true}).fill('Buyer agrees to pay one hundred dollars today.');await form.getByRole('button',{name:'Record buyer promise',exact:true}).click();
 let card=panel.getByRole('article',{name:'Promise '+invoice.invoice.number,exact:true});await expect(card).toContainText('USD 100.00');await expect(card).toContainText('open');
 await panel.getByText('Record or revise a buyer promise',{exact:true}).click();await form.getByLabel('Promise invoice',{exact:true}).selectOption(invoice.id);await form.getByLabel('Promised amount (USD minor units)',{exact:true}).fill('9000');await form.getByLabel('Promise due date',{exact:true}).fill('2026-11-03');await form.getByLabel('Promise decision reason',{exact:true}).fill('Buyer changes the commitment; keep its earlier history.');await form.getByRole('button',{name:'Save revised promise',exact:true}).click();
 card=panel.getByRole('article',{name:'Promise '+invoice.invoice.number,exact:true});await expect(card).toContainText('USD 90.00');await card.getByText('Promise decision history (2)',{exact:true}).click();await expect(card).toContainText('USD 100.00');await expect(card).toContainText('2026-11-03');
 await card.getByText('Review a finance decision',{exact:true}).click();let decision=card.getByRole('form',{name:'Finance decision '+invoice.invoice.number,exact:true});await decision.getByLabel('Finance decision',{exact:true}).selectOption('pause');await decision.getByLabel('Pause through',{exact:true}).fill('2026-11-05');await decision.getByLabel('Finance decision reason',{exact:true}).fill('Finance approves a brief collection pause.');await decision.getByRole('button',{name:'Record finance decision',exact:true}).click();
 await expect(card).toContainText('Approved collection pause through 2026-11-05');await expect(card).toContainText('not a provider dispute');await card.getByText('Promise decision history (3)',{exact:true}).click();await captureRegionWidths(page,card,'buyer-promise-history-and-pause');
 // Record a prior-day commitment through the public finance door, then reconcile its missed date.
 const source=(await h.api('/api/barrow/payment-promises?accountId=cedar',undefined,finance)).invoices.find(row=>row.orderId===second.id);
 await h.command('promise.record',{accountId:'cedar',orderId:second.id,sourceRevision:source.sourceRevision,buyerId:source.buyers[0].id,amountCents:13000,currency:'USD',dueDate:'2026-11-01',revision:null,reason:'Finance records the buyer’s prior-day commitment from its conversation.'},finance);
 await panel.getByRole('button',{name:'Reconcile buyer promises',exact:true}).click();const missed=panel.getByRole('article',{name:'Promise '+second.invoice.number,exact:true});await expect(missed).toContainText('missed');
 await page.getByRole('button',{name:'Follow-ups',exact:true}).click();await expect(page.getByText('Missed promise '+second.invoice.number,{exact:true})).toBeVisible();await expect(page.getByText('Buyer promise '+invoice.invoice.number,{exact:true})).toHaveCount(0);
 const tasks=page.locator('div.br-card').filter({has:page.getByRole('heading',{name:'Next actions',exact:true})}).first();
 const missedTask=page.getByRole('article').filter({has:page.getByRole('heading',{name:'Missed promise '+second.invoice.number,exact:true})});await expect(missedTask.getByRole('button',{name:'Close with resolution',exact:true})).toHaveCount(0);await expect(missedTask).toContainText('attributed finance resolution');
 await captureRegionWidths(page,tasks,'missed-buyer-promise-owned-task');
 await page.getByRole('button',{name:'Reports',exact:true}).click();await panel.getByLabel('Promise account',{exact:true}).selectOption('cedar');card=panel.getByRole('article',{name:'Promise '+invoice.invoice.number,exact:true});
 await card.getByText('Review a finance decision',{exact:true}).click();decision=card.getByRole('form',{name:'Finance decision '+invoice.invoice.number,exact:true});await decision.getByLabel('Finance decision',{exact:true}).selectOption('withdraw');await decision.getByLabel('Finance decision reason',{exact:true}).fill('Buyer withdraws; finance records the changed agreement.');await decision.getByRole('button',{name:'Record finance decision',exact:true}).click();await expect(card).toContainText('withdrawn');await expect(card.getByText('Review a finance decision',{exact:true})).toHaveCount(0);await card.getByText('Promise decision history (4)',{exact:true}).click();await expect(card).toContainText('USD 100.00');await expect(card).toContainText('Buyer withdraws');await captureRegionWidths(page,card,'buyer-promise-withdrawn-history');
 assert.equal(await panel.locator('button,a,[role=button]').evaluateAll(elements=>elements.filter(element=>element.getBoundingClientRect().width>0&&!/[A-Za-z0-9]/.test(element.textContent??'')&&!element.getAttribute('aria-describedby')).length),0);
 } catch(error) {const dir=process.env.BARROW_JOURNEY_EVIDENCE??'/tmp/barrow-promise-screens';await mkdir(dir,{recursive:true});await page.screenshot({path:dir+'/failure.png',fullPage:true});console.error(await page.locator('main').innerText());throw error}
});
