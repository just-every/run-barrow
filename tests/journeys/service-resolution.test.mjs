import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {returnClaimsFixture} from '../api/return-claims-fixture.mjs';
import {signedContext,captureRegionWidths} from './browser-helpers.mjs';

test('buyer reports a shortage with an RMA and requested replacement, supplier assigns a response deadline and both see unresolved attributed service history',async t=>{
 const f=await returnClaimsFixture(t,{built:true,clock:'2035-01-15T12:00:00Z'}),{h,buyer,order}=f;
 let rma=await f.request();rma=await h.command('return.decide',{id:rma.id,revision:rma.revision,orderRevision:order.revision,quantity:2,instructions:'Return two for separate inspection.',reason:'Keep the remainder disputed.'});
 const browser=await chromium.launch({headless:true,...(process.env.BARROW_CHROMIUM?{executablePath:process.env.BARROW_CHROMIUM}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});t.after(()=>browser.close());
 const ownerContext=await signedContext(browser,h),buyerContext=await signedContext(browser,h,buyer.as);t.after(()=>ownerContext.close());t.after(()=>buyerContext.close());
 const ownerPage=await ownerContext.newPage(),buyerPage=await buyerContext.newPage();
 async function open(page,target=order) {
  await page.goto(h.origin+'/app');
  if(new URL(page.url()).pathname==='/setup'){await page.getByLabel('Your name').fill('Supplier owner');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click()}
  await page.getByRole('button',{name:'Orders',exact:true}).click();
  const card=page.locator('article.br-order').filter({hasText:'Reference: '+target.reference});await card.getByText('Shortages and service',{exact:true}).click();
  const panel=card.getByRole('region',{name:'Service for '+target.id,exact:true});await expect(panel.getByRole('heading',{name:'Service cases',exact:true})).toBeVisible();return panel;
 }
 let panel=await open(buyerPage);await panel.getByText('Report a shortage or defect',{exact:true}).click();
 await panel.getByLabel('Reported units',{exact:true}).fill('1');await panel.getByLabel('Buyer report',{exact:true}).fill('One unit was missing from the delivered carton.');await panel.getByLabel('Linked RMA ID (optional)',{exact:true}).fill(rma.id);await panel.getByLabel('Requested replacement SKU (optional)',{exact:true}).fill('OAT-2');
 await panel.getByRole('button',{name:'Submit service report',exact:true}).click();await expect(panel).toContainText('buyer reported 1');await expect(panel).toContainText('Pier confirms dispatch of 6 physical units');await expect(panel).toContainText('1 × OAT-2');await expect(panel).toContainText('disputed 1');await expect(panel.getByText('Review service case',{exact:true})).toHaveCount(0);
 panel=await open(ownerPage);await panel.getByText('Review service case',{exact:true}).click();await panel.getByLabel('Response deadline',{exact:true}).fill('2035-01-18');await panel.getByLabel('Buyer-visible response',{exact:true}).fill('We are reviewing your requested replacement. Price difference, tax and freight require approval before acceptance.');const firstReviewResponse=ownerPage.waitForResponse(response=>response.url().endsWith('/commands')&&response.request().postDataJSON()?.type==='service.review');await panel.getByRole('button',{name:'Record service response',exact:true}).click();assert.equal((await firstReviewResponse).status(),200);
 assert.equal((await h.api('/api/barrow/orders/'+order.id+'/service-cases')).cases[0].history.length,2);
 await expect(panel).toContainText('2035-01-18');await expect(panel).toContainText('Supplier owner');await expect(panel).toContainText('Unresolved.');await expect(panel.getByRole('list',{name:'Service response history'})).toContainText('require approval before acceptance');
 await captureRegionWidths(ownerPage,panel,'service-owner-review');
 panel=await open(buyerPage);await expect(panel).toContainText('2035-01-18');await expect(panel).toContainText('require approval before acceptance');await expect(panel).toContainText('no replacement order has been accepted');await expect(panel).toContainText('Unresolved.');
 await captureRegionWidths(buyerPage,panel,'service-buyer-response');
 // Stock reconciliation changes only the current order revision, not the case's frozen basis.
 const draft=await h.command('order.prepare',{accountId:'cedar',reference:'synthetic-barrow-976',lines:[{sku:'OAT-1',quantity:4}]},buyer);
 await h.command('order.submit',{orderId:draft.id},buyer);
 await f.pier.command('order.create',{customerId:f.product.customer.id,lines:[{itemId:f.product.item.id,quantity:'192'}]});
 const shortOrder=await h.command('order.approve',{orderId:draft.id});assert.equal(shortOrder.status,'shortfall');
 const reported=await h.command('service.report',{requestId:'synthetic-barrow-977',orderId:shortOrder.id,orderRevision:shortOrder.revision,line:1,quantity:2,kind:'shortage',reason:'Two units remain short.'},buyer);
 await h.signIn(['synthetic-barrow-978','example.test'].join('@'),'admin');
 const reviewer=(await h.api('/api/barrow/orders/'+shortOrder.id+'/service-cases')).people.find(person=>person.name==='Supplier staff');assert.ok(reviewer);
 const shortPanel=await open(ownerPage,shortOrder);await shortPanel.getByText('Review service case',{exact:true}).click();
 await shortPanel.getByRole('combobox',{name:/Service owner/}).selectOption(reviewer.id);
 await shortPanel.getByLabel('Response deadline',{exact:true}).fill('2035-01-19');await shortPanel.getByLabel('Buyer-visible response',{exact:true}).fill('The stock shortfall remains owned while we review the replacement.');
 const refreshedResponse=ownerPage.waitForResponse(response=>response.url().endsWith('/commands')&&response.request().postDataJSON()?.type==='order.refresh');
 await ownerPage.locator('article.br-order').filter({hasText:'Reference: '+shortOrder.reference}).getByRole('button',{name:'Refresh stock status',exact:true}).click();
 assert.equal((await refreshedResponse).status(),200);
 const refreshed=await h.api('/api/barrow/orders/'+shortOrder.id);assert.notEqual(refreshed.revision,shortOrder.revision);
 const cases=await h.api('/api/barrow/orders/'+shortOrder.id+'/service-cases');assert.equal(cases.orderRevision,refreshed.revision);assert.equal(cases.cases[0].orderRevision,shortOrder.revision);
 const reviewedResponse=ownerPage.waitForResponse(response=>response.url().endsWith('/commands')&&response.request().postDataJSON()?.type==='service.review');
 await shortPanel.getByRole('button',{name:'Record service response',exact:true}).click();assert.equal((await reviewedResponse).status(),200);
 await expect(shortPanel).toContainText('2035-01-19');await expect(shortPanel.getByRole('list',{name:'Service response history'})).toContainText('stock shortfall remains owned');
 const reviewed=(await h.api('/api/barrow/orders/'+shortOrder.id+'/service-cases')).cases[0];assert.equal(reviewed.id,reported.id);assert.equal(reviewed.history.length,2);assert.equal(reviewed.ownerId,reviewer.id);assert.deepEqual(reviewed.commercial,reported.commercial);
 await captureRegionWidths(ownerPage,shortPanel,'service-stock-refresh-review');
 await open(ownerPage);
 const original=await h.api('/api/barrow/orders/'+order.id);assert.deepEqual(original.lines,order.lines);assert.equal((await h.api('/api/barrow/credits?orderId='+order.id)).credits.length,0);
 assert.equal((await f.claims()).claims.find(row=>row.id===rma.id).disputedQuantity,1);
 for(const page of [buyerPage,ownerPage]) {
  const region=page.getByRole('region',{name:'Service for '+order.id,exact:true});
  assert.equal(await region.locator('button,a,[role=button]').evaluateAll(elements=>elements.filter(element=>element.getBoundingClientRect().width>0&&!/[A-Za-z0-9]/.test(element.textContent??'')&&!element.getAttribute('aria-describedby')).length),0);
  assert.equal(await region.locator('p,label,button,a,li').evaluateAll(elements=>elements.filter(element=>element.getBoundingClientRect().width>0&&parseFloat(getComputedStyle(element).fontSize)<13).length),0);
 }
});
