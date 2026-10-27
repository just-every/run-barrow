import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {reorderFixture} from '../api/reorder-fixture.mjs';
import {captureRegionWidths,signedContext} from './browser-helpers.mjs';

test('a buyer inspects the accepted sell-through quantities, prebook commitments and outage uncertainty on the native order at desktop and phone',async t=>{
 const {h,account,buyer}=await reorderFixture(t,{built:true,https:true});
 // Stay clear of either calendar boundary; no time-of-day or same-day assertion.
 const observedOn=new Date(Date.now()-86400000).toISOString().slice(0,10),requestedDate=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
 const prebook=await h.command('order.prepare',{accountId:account.id,requestedDate,lines:[{sku:'TEA-1',quantity:5}]},{as:buyer});await h.command('order.submit',{orderId:prebook.id},{as:buyer});
 const p={accountId:account.id,authorized:true,csv:'sku,unit,sold,observedDays,onHand,status\nOAT-1,case,20,10,2,complete\nTEA-1,case,20,10,2,complete\nJAM-1,case,,10,1,outage',observedOn,requestedDate,horizonDays:10,seasonalityBps:10000,budgetCents:200000,selections:[{sku:'OAT-1',unit:'case',quantity:14},{sku:'TEA-1',unit:'case',quantity:9},{sku:'JAM-1',unit:'case',quantity:2}],acknowledgedOutage:true};
 const review=await h.command('order.sellthrough-preview',p,{as:buyer});
 const acceptance={...p,fingerprint:review.fingerprint,acknowledged:true,key:'synthetic-barrow-501',reference:'synthetic-barrow-502'};
 const draft=await h.command('order.sellthrough',acceptance,{as:buyer});assert.equal((await h.command('order.sellthrough',acceptance,{as:buyer})).id,draft.id);
 const browser=await chromium.launch({headless:true,...(process.env.BARROW_CHROMIUM?{executablePath:process.env.BARROW_CHROMIUM}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});t.after(()=>browser.close());
 const context=await signedContext(browser,h,buyer);t.after(()=>context.close());const page=await context.newPage();await page.goto(h.origin+'/app');
 await page.getByRole('button',{name:'Orders',exact:true}).click();
 await page.getByText('Accepted sell-through plan',{exact:true}).click();
 const plan=page.getByRole('region',{name:'Accepted sell-through plan',exact:true});
 await expect(plan).toContainText('OAT-1 · chosen 14 case · suggested 15');
 await expect(plan).toContainText('TEA-1 · chosen 9 case · suggested 10');
 await expect(plan).toContainText('JAM-1 · chosen 2 case · suggested Unknown');
 await expect(plan).toContainText('open commitments 8 base units');
 await expect(plan).toContainText('Sell-through unknown: export outage');
 // The added disclosure has no icon-only controls; other order actions retain their labels.
 assert.equal(await plan.locator('button').count(),0);
 await captureRegionWidths(page,plan,'accepted-sellthrough-plan');
});
