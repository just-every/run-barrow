import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {qboFixture} from '../api/qbo-fixture.mjs';
import {signedContext,captureRegionWidths} from './browser-helpers.mjs';
const app=async(page,h)=>{await page.goto(h.origin+'/app');if(new URL(page.url()).pathname==='/setup'){await page.getByLabel('Your name').fill('Supplier owner');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click()}await page.getByRole('button',{name:'Orders',exact:true}).waitFor()};
export async function qboBrowser(t) {
 const f=await qboFixture(t,{built:true}),{h,edge,order,buyer}=f;
 const browser=await chromium.launch({headless:true,...(process.env.BARROW_CHROMIUM_PATH?{executablePath:process.env.BARROW_CHROMIUM_PATH}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});t.after(()=>browser.close());
 const ownerContext=await signedContext(browser,h),buyerContext=await signedContext(browser,h,buyer.as);t.after(()=>ownerContext.close());t.after(()=>buyerContext.close());
 const page=await ownerContext.newPage(),customer=await buyerContext.newPage();await app(page,h);await page.getByRole('button',{name:'Settings',exact:true}).click();
 const settings=page.getByRole('region',{name:'QuickBooks settings',exact:true});await expect(settings).toContainText('QuickBooks is not connected.');
 await settings.getByLabel('Review reason',{exact:true}).fill('Owner reviewed the exact company and native references.');await settings.getByLabel('QuickBooks company ID',{exact:true}).fill('123456');await settings.getByRole('checkbox').check();
 await captureRegionWidths(page,settings,'qbo-owner-consent');
 // The only browser interception is Intuit authorization; its code is redeemed through the real callback.
 await page.route('https://appcenter.intuit.com/**',route=>route.fulfill({status:200,contentType:'text/plain',body:'Synthetic external authorization response.'}));
 const authorization=page.waitForRequest(request=>request.url().startsWith('https://appcenter.intuit.com/'));
 await settings.getByRole('button',{name:'Authorize QuickBooks reads',exact:true}).click();const outbound=await authorization;
 const response=await h.request(f.callback({authorizationUrl:outbound.url()}));assert.equal(response.status,303);await app(page,h);await page.getByRole('button',{name:'Settings',exact:true}).click();await expect(settings).toContainText('Company 123456');
 await settings.getByLabel('Review reason',{exact:true}).fill('Owner approved current source references for the native account.');await settings.getByText('Review reference mappings',{exact:true}).click();
 for(const [kind,target] of [['Customer','cedar'],['Item','OAT-1'],['Account','receivables'],['TaxCode','reviewed tax reference']]) {
  await settings.getByLabel('Reference kind',{exact:true}).selectOption(kind);await settings.getByRole('button',{name:'Read reference page 1',exact:true}).click();
  const ref=(await f.workspace()).references.find(r=>r.kind===kind);await settings.getByLabel('Source reference',{exact:true}).selectOption(ref.source_id);
  if(kind==='Customer')await settings.getByLabel('Native account',{exact:true}).selectOption(target);else await settings.getByLabel(kind==='Item'?'Native SKU':'Reviewed native reference label',{exact:true}).fill(target);
  await settings.getByRole('button',{name:'Approve reference mapping',exact:true}).click();await expect(settings).toContainText(`${kind} ${ref.source_id} → ${target}`);
 }
 await captureRegionWidths(page,settings,'qbo-reviewed-references');
 await settings.getByRole('button',{name:'Start dated invoice read',exact:true}).click();let state=await f.workspace(),run=state.runs[0];
 edge.fail=true;await settings.getByRole('button',{name:'Resume '+run.id,exact:true}).click();await expect(settings.getByRole('alert')).toContainText('HTTP 503');await expect(settings).toContainText('failed');await captureRegionWidths(page,settings,'qbo-interrupted-correlation');
 edge.fail=false;await settings.getByRole('button',{name:'Resume '+run.id,exact:true}).click();await expect(settings).toContainText('complete');state=await f.workspace();const observation=state.observations.find(o=>o.runId===run.id);
 await settings.getByLabel('Ledger invoice',{exact:true}).selectOption(observation.id);await settings.getByLabel('Native issued order ID',{exact:true}).fill(order.id);await settings.getByRole('button',{name:'Review and link existing invoice',exact:true}).click();await expect(settings.getByRole('alert')).toHaveCount(0);await expect(settings.getByRole('status')).toContainText('QuickBooks review saved.');await captureRegionWidths(page,settings,'qbo-linked-invoice');
 await app(customer,h);await customer.getByRole('button',{name:'Orders',exact:true}).click();const statement=customer.getByRole('region',{name:'Account statement',exact:true});const comparisons=statement.getByRole('region',{name:'QuickBooks dated comparisons',exact:true});await expect(comparisons).toContainText('Matched');await expect(comparisons).toContainText('difference USD 0.00');await expect(comparisons.getByRole('link',{name:'QBO 100',exact:true})).toBeVisible();await captureRegionWidths(customer,statement,'qbo-buyer-statement');
 for(const kind of ['CSV','PDF']){const path=await statement.getByRole('link',{name:`Statement (${kind})`,exact:true}).getAttribute('href');const download=await h.request(path,buyer);assert.equal(download.status,200);assert.match(await download.text(),/123456/)}
 await page.getByRole('button',{name:'Data',exact:true}).click();const finance=page.locator('.br-card').filter({has:page.getByRole('heading',{name:'Invoice aging and finance',exact:true})}).first();await expect(finance).toContainText('QuickBooks dated comparisons');await expect(finance).toContainText('difference USD 0.00');await captureRegionWidths(page,finance,'qbo-finance-comparison');
 edge.balance=75;edge.token='1';const changed=await f.resume(await f.start());assert.equal(changed.state,'complete');await customer.reload();await customer.getByRole('button',{name:'Orders',exact:true}).click();await expect(comparisons).toContainText('Balance differs');await expect(comparisons).toContainText('difference USD 55.00');await captureRegionWidths(customer,statement,'qbo-balance-conflict');
 await page.getByRole('button',{name:'Settings',exact:true}).click();await settings.getByLabel('Review reason',{exact:true}).fill('Owner revokes further company reads.');await settings.getByRole('button',{name:'Disconnect and revoke QuickBooks',exact:true}).click();await expect(settings).toContainText('QuickBooks is not connected.');await expect(settings).toContainText('QuickBooks acknowledged revocation.');await captureRegionWidths(page,settings,'qbo-revoked');
 for(const region of [settings,statement]) {
  const small=await region.locator('*').evaluateAll(elements=>elements.filter(e=>e.checkVisibility()&&[...e.childNodes].some(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim())&&parseFloat(getComputedStyle(e).fontSize)<13).map(e=>e.tagName));assert.deepEqual(small,[]);
  assert.equal(await region.locator('button,a,[role=button]').evaluateAll(elements=>elements.filter(e=>e.getBoundingClientRect().width>0&&!/[A-Za-z0-9]/.test(e.textContent??'')&&!e.getAttribute('aria-describedby')).length),0);
 }
}
