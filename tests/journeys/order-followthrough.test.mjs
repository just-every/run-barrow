import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {orderFollowthroughFixture,pendingOrder} from '../api/order-followthrough-fixture.mjs';
import {captureRegionWidths,signedContext} from './browser-helpers.mjs';

test('supplier reviews order-linked inventory and card exceptions, retries one durable acknowledgment and records an attributed exception without closing delivery',async t=>{
 const f=await orderFollowthroughFixture(t,{built:true}),{h,pier,buyer,edge}=f;
 const lost=await pendingOrder(f);f.loseAck();await h.command('order.approve',{orderId:lost.id},{status:503});await h.command('followup.refresh',{});
 const browser=await chromium.launch({headless:true,...(process.env.BARROW_CHROMIUM?{executablePath:process.env.BARROW_CHROMIUM}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});t.after(()=>browser.close());
 const context=await signedContext(browser,h);t.after(()=>context.close());const page=await context.newPage();await page.goto(h.origin+'/app');
 if(new URL(page.url()).pathname==='/setup'){await page.getByLabel('Your name').fill('Supplier owner');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click()}
 async function open(order){
  await page.getByRole('button',{name:'Orders',exact:true}).click();
  const card=page.locator('article.br-order').filter({hasText:'Reference: '+order.reference});
  await card.getByText('Order follow-through',{exact:true}).click();
  const trace=card.getByRole('region',{name:'Order follow-through '+order.id,exact:true});await expect(trace.getByRole('heading',{name:'Delivery and payment trace',exact:true})).toBeVisible();return trace;
 }
 let trace=await open(lost);
 await expect(trace).toContainText('inventory acknowledgment: Not recorded');await expect(trace).toContainText('Invoice: Not issued');
 const task=trace.getByRole('article',{name:'Missing inventory acknowledgment '+lost.reference,exact:true});
 await task.getByText('Review next action',{exact:true}).click();await task.getByLabel('Next-action draft',{exact:true}).fill('Check the original inventory response, then contact the buyer after the supplier reviews the promise.');
 await expect(task.getByRole('button',{name:'Save reviewed next action',exact:true})).toBeDisabled();await task.getByRole('checkbox').check();
 const mail=h.mail.deliveries.length;
 await task.getByRole('button',{name:'Save reviewed next action',exact:true}).click();await expect(task).toContainText('Reviewed next action:');assert.equal(h.mail.deliveries.length,mail);
 await task.getByLabel('Next contact date',{exact:true}).fill('2031-01-17');await task.getByRole('button',{name:'Save contact date',exact:true}).click();await expect(task).toContainText('next contact 2031-01-17');
 await captureRegionWidths(page,trace,'order-followthrough-pending');
 const before=(await pier.api('/api/pier/state')).orders;
 await trace.getByRole('button',{name:'Retry stock reservation',exact:true}).click();
 // Recovery refreshes the ordinary Orders workspace, so reopen the current revision.
 await expect(page.locator('article.br-order').filter({hasText:'Reference: '+lost.reference}).getByText('approved',{exact:true})).toBeVisible();
 trace=await open(lost);await trace.getByRole('button',{name:'Refresh order exceptions',exact:true}).click();await expect(trace).toContainText('Inventory acknowledgment recorded as');await expect(trace).toContainText('Job unresolved');await expect(trace).toContainText('BAR-'+lost.id);assert.equal((await pier.api('/api/pier/state')).orders.length,before.length);
 await captureRegionWidths(page,trace,'order-followthrough-recovered');
 const free=Number((await pier.api('/api/pier/state')).positions[0].available),first=await pendingOrder(f,'synthetic-barrow-921',free),short=await pendingOrder(f,'synthetic-barrow-922',free);
 await h.command('order.approve',{orderId:first.id});await h.command('order.approve',{orderId:short.id});await h.command('followup.refresh',{});await page.reload();trace=await open(short);
 await expect(trace).toContainText('backordered '+free);await expect(trace).toContainText('Invoice: Not issued');const shortTask=trace.getByRole('article',{name:'Inventory shortfall '+short.reference,exact:true});
 await shortTask.getByText('Record human exception resolution',{exact:true}).click();await shortTask.getByLabel('Resolution reason',{exact:true}).fill('Supplier reviewed the backorder with the buyer and records a human exception; delivery remains unverified.');await shortTask.getByRole('button',{name:'Record attributed resolution',exact:true}).click();
 await expect(shortTask).toContainText('closed');await expect(shortTask).toContainText('Supplier owner');await expect(trace).toContainText('carrier delivery unknown');await captureRegionWidths(page,trace,'order-followthrough-human-resolution');
 // A failed verified card attempt remains its own task and cannot establish delivery.
 await h.command('order.cancel',{orderId:first.id,reason:'Supplier releases the unused test reservation.'});
 const issued=await f.prepared({outcome:'requires_action'}),p=issued.payment;
 let payment=await h.command('card.authorize',{paymentId:p.id,consent:true,amountCents:p.amountCents,surchargeCents:p.surchargeCents},buyer);
 edge.intents.get(payment.providerPaymentId).status='requires_payment_method';payment=await h.command('card.refresh',{paymentId:p.id},buyer);
 await page.reload();trace=await open(issued.order);await expect(trace).toContainText('declined');await expect(trace).toContainText('card authorization failed');await expect(trace).toContainText('Job unresolved');
 const paymentTask=trace.getByRole('article',{name:'Card payment exception '+p.id,exact:true});await expect(paymentTask.getByText('Record human exception resolution',{exact:true})).toHaveCount(0);
 await captureRegionWidths(page,trace,'order-followthrough-card-exception');
 const ownerTrace=await f.trace(issued.order);assert.ok(ownerTrace.payments[0].events.length);assert.equal(ownerTrace.tasks.find(row=>row.sourceId===p.id).status,'open');
 for(const region of [trace]){
  assert.equal(await region.locator('button,a,[role=button]').evaluateAll(elements=>elements.filter(element=>element.getBoundingClientRect().width>0&&!/[A-Za-z0-9]/.test(element.textContent??'')&&!element.getAttribute('aria-describedby')).length),0);
  assert.equal(await region.locator('p,label,button,a,li').evaluateAll(elements=>elements.filter(element=>element.getBoundingClientRect().width>0&&parseFloat(getComputedStyle(element).fontSize)<13).length),0);
 }
});
