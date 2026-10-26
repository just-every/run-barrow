import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {pierSource} from '../pier-source.mjs';
import {start} from './install-harness.mjs';
import {signedContext,captureRegionWidths} from './browser-helpers.mjs';
import {syncFixture} from '../api/stock-sync-fixture.mjs';

async function openApp(page,origin) {
 await page.goto(origin+'/app');
 if(new URL(page.url()).pathname==='/setup') {
  await page.getByLabel('Your name').fill('Supplier owner');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();
 }
}
// Pier runs through its real documented development command, never a source-edge fake.
test('real Pier development sync resumes ACK interruption, reconciles once and shows private stock notice and assigned recovery at desktop and phone',async t=>{
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});t.after(()=>browser.close());
 const dev=await start(await pierSource());t.after(()=>dev.stop());
 const pierContext=await browser.newContext();t.after(()=>pierContext.close());const pierPage=await pierContext.newPage();await pierPage.goto(dev.openUrl);
 await pierPage.waitForURL(url=>['/app','/setup'].includes(url.pathname));
 if(new URL(pierPage.url()).pathname==='/setup') {
  await pierPage.getByLabel('Your name').fill('Pier stock owner');await pierPage.getByRole('checkbox').check();await pierPage.getByRole('button',{name:'Finish setup',exact:true}).click();
 }
 await pierPage.waitForURL(url=>url.pathname==='/app');
 const cookies=await pierContext.cookies(dev.origin),cookie=cookies.map(row=>row.name+'='+row.value).join('; ');
 const api=async(path,body)=>{
  const response=await pierContext.request.fetch(dev.origin+path,{method:body===undefined?'GET':'POST',headers:{origin:dev.origin},...(body===undefined?{}:{data:body})});
  assert.ok(response.ok(),`Pier ${path}: HTTP ${response.status()}`);return response.json();
 };
 const pier={origin:dev.origin,cookie,api,command:async(type,payload)=>(await api('/api/pier/commands',{type,payload,commandId:crypto.randomUUID()})).result};
 const f=await syncFixture(t,{pier,built:true}),{h}=f;await f.ready();
 const owner=await signedContext(browser,h);t.after(()=>owner.close());const page=await owner.newPage();await openApp(page,h.origin);await page.getByRole('button',{name:'Data',exact:true}).click();await page.getByText('Stock synchronization',{exact:true}).first().click();
 const sync=page.getByRole('region',{name:'Stock synchronization',exact:true});await expect(sync).toContainText('Caught up');await captureRegionWidths(page,sync,'stock-sync-reconciled');
 const buyer=await signedContext(browser,h,f.buyer.as);t.after(()=>buyer.close());const buyerPage=await buyer.newPage();await openApp(buyerPage,h.origin);await buyerPage.getByRole('button',{name:'Catalog',exact:true}).click();
 const alerts=buyerPage.getByRole('region',{name:'Stock notices',exact:true});await alerts.getByRole('button',{name:'Notify me here',exact:true}).click();await expect(alerts).toContainText('Waiting for stock');await captureRegionWidths(buyerPage,alerts,'stock-notice-requested');
 await f.restock();f.interruptAck();const interrupted=await f.sync();assert.ok(interrupted.pending);
 const first=await pier.api('/api/pier/stock-changes?'+new URLSearchParams({consumer:interrupted.consumer,limit:'2',checkpoint:interrupted.checkpoint}));
 const replay=await pier.api('/api/pier/stock-changes?'+new URLSearchParams({consumer:interrupted.consumer,limit:'2',checkpoint:interrupted.checkpoint}));assert.deepEqual(first.events.map(row=>row.eventId),replay.events.map(row=>row.eventId));
 const resumed=await f.sync();assert.equal(resumed.pending,null);assert.equal(resumed.has_more,0);assert.equal((await f.read()).notices.length,1);
 await buyerPage.reload();await expect(alerts).toContainText('OAT-1 is back in stock');await expect(alerts.getByRole('status')).toHaveCount(1);await captureRegionWidths(buyerPage,alerts,'stock-notice-once');
 await alerts.getByLabel('Notice type',{exact:true}).selectOption('prebook');await alerts.getByRole('button',{name:'Notify me here',exact:true}).click();await expect(alerts).toContainText('Waiting for prebook window');
 await sync.getByText('Prebook notice window',{exact:true}).click();
 const local=timestamp=>{const date=new Date(timestamp);return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16)};
 await sync.getByLabel('Prebook SKU',{exact:true}).fill('OAT-1');await sync.getByLabel('Window opens in your timezone',{exact:true}).fill(local(Date.now()-3600000));await sync.getByLabel('Window closes in your timezone',{exact:true}).fill(local(Date.now()+3600000));await sync.getByLabel('Window reason',{exact:true}).fill('Owner confirmed the Spring prebook notification window.');
 await sync.getByRole('button',{name:'Record prebook window',exact:true}).click();await expect(sync).toContainText('Prebook window recorded.');await f.sync();await f.sync();await buyerPage.reload();await expect(alerts).toContainText('OAT-1 prebook window is open.');assert.equal((await f.read()).notices.filter(row=>row.kind==='prebook').length,1);await captureRegionWidths(buyerPage,alerts,'prebook-notice-once');await captureRegionWidths(page,sync,'prebook-window-recorded');
 f.failure(true);for(let n=0;n<3;n++)await f.sync();await sync.getByRole('button',{name:'Refresh sync status',exact:true}).click();await expect(sync).toContainText('Operator follow-up · open');await captureRegionWidths(page,sync,'stock-sync-owned-failure');
 f.failure(false);await f.sync();await sync.getByRole('button',{name:'Refresh sync status',exact:true}).click();await expect(sync).toContainText('Operator follow-up · open');
 await sync.getByLabel('Resolution reason',{exact:true}).fill('Owner checked the resumed source and completed reconciliation.');await sync.getByRole('button',{name:'Record resolution',exact:true}).click();await expect(sync).toContainText('Operator follow-up · closed');await captureRegionWidths(page,sync,'stock-sync-resolved');
});
