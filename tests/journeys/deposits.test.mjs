import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {releasedDepositFixture} from '../api/prebook-fixture.mjs';
import {captureRegionWidths,signedContext} from './browser-helpers.mjs';
async function app(page,h) {
 await page.goto(h.origin+'/app');
 if(new URL(page.url()).pathname==='/setup') {
  await page.getByLabel('Your name').fill('Supplier owner');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();
 }
 await page.getByRole('button',{name:'Orders',exact:true}).waitFor();
}
async function report(page,heading) {
 await page.getByRole('button',{name:'Data',exact:true}).click();
 return page.locator('.br-card').filter({has:page.getByRole('heading',{name:heading,exact:true})}).first();
}
test('finance reviews a seasonal deposit on two release invoices and the buyer sees one receipt, dated allocations and unapplied cash without a second sale',async t=>{
 const {h,buyer,payment,releases,edge,publication}=await releasedDepositFixture(t,{built:true});
 const browser=await chromium.launch({headless:true,...(process.env.BARROW_CHROMIUM_PATH?{executablePath:process.env.BARROW_CHROMIUM_PATH}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});t.after(()=>browser.close());
 const context=await signedContext(browser,h),buyerContext=await signedContext(browser,h,buyer.as);t.after(()=>context.close());t.after(()=>buyerContext.close());
 const page=await context.newPage(),buy=await buyerContext.newPage();try {await app(page,h);await page.getByRole('button',{name:'Orders',exact:true}).click();
 for(const [index,amount] of [[0,'150.00'],[1,'60.00']]) {
  const order=page.locator('article.br-order').filter({has:page.locator('.br-order-id').getByText(releases[index].id.replace(/^O-/,''),{exact:true})});
  // Each immutable invoice selects its own source card by its displayed order identity.
  const target=await order.count()?order:page.locator('article.br-order').filter({has:page.locator(`a[href="/api/barrow/invoices/${releases[index].id}.csv"]`)});
  await target.getByText('Credit notes and refunds',{exact:true}).click();const panel=target.getByRole('region',{name:'Credit report',exact:true});
  await panel.getByText('Manage credits and refunds',{exact:true}).click();await panel.getByLabel('Captured receipt',{exact:true}).selectOption(payment.id);
  await expect(panel).toContainText(index===0?'unapplied principal USD 210.00':'unapplied principal USD 60.00');
  await panel.getByLabel('USD amount',{exact:true}).fill(amount);await panel.getByLabel('Reason',{exact:true}).fill('Finance reviewed this exact seasonal deposit allocation to the named release.');
  await captureRegionWidths(page,panel,'deposit-review-'+(index+1));await panel.getByRole('button',{name:'Apply card principal',exact:true}).click();await expect(panel).toContainText('Card principal applied: USD '+amount);
  await captureRegionWidths(page,panel,'deposit-applied-'+(index+1));
 }
 await app(buy,h);await buy.getByRole('button',{name:'Orders',exact:true}).click();const statement=buy.getByRole('region',{name:'Account statement',exact:true});
 await expect(statement).toContainText('Principal allocation');await expect(statement).toContainText('USD 490.00');await expect(statement).toContainText('Unapplied principal');await expect(statement).toContainText(payment.providerPaymentId);await captureRegionWidths(buy,statement,'deposit-buyer-statement');
 const sales=await report(page,'Sales by account and product');await expect(sales).toContainText('490.00');await captureRegionWidths(page,sales,'deposit-sales');
 const finance=await report(page,'Invoice aging and finance');await finance.getByText('Seasonal deposits (1)',{exact:true}).click();await expect(finance).toContainText(payment.providerPaymentId);await expect(finance).toContainText('paid USD 210.00');await captureRegionWidths(page,finance,'deposit-finance');
 const commissions=await report(page,'Rep commissions');await expect(commissions).toContainText('12.60');await expect(commissions).toContainText('8.40');await captureRegionWidths(page,commissions,'deposit-commissions');
 // Schedule an existing release balance, then collect two separately authorized instalments.
 await page.getByRole('button',{name:'Orders',exact:true}).click();
 const ownerOrder=page.locator('article.br-order').filter({has:page.locator(`a[href="/api/barrow/invoices/${releases[0].id}.csv"]`)}),ownerPayment=ownerOrder.getByRole('region',{name:'Card payment',exact:true});
 await ownerPayment.getByText('Schedule remaining payments',{exact:true}).click();
 for(const [index,dueDate,amountCents] of [[1,'2027-03-15','10000'],[2,'2027-04-15','5000']]){await ownerPayment.getByLabel(`Payment ${index} due date`,{exact:true}).fill(dueDate);await ownerPayment.getByLabel(`Payment ${index} principal in minor units`,{exact:true}).fill(amountCents)}
 await ownerPayment.getByRole('button',{name:'Add dated payment',exact:true}).click();await ownerPayment.getByLabel('Payment 3 due date',{exact:true}).fill('2027-05-15');await ownerPayment.getByLabel('Payment 3 principal in minor units',{exact:true}).fill('22000');await ownerPayment.getByLabel('Schedule reason',{exact:true}).fill('Owner reviewed three dated balance payments with separate buyer authorization.');
 await captureRegionWidths(page,ownerPayment,'deposit-balance-schedule');const noCharge=edge.captures;await ownerPayment.getByRole('button',{name:'Save dated payments',exact:true}).click();await expect(ownerPayment).toContainText('Dated payments saved');assert.equal(edge.captures,noCharge);
 const planned=(await h.api('/api/barrow/payments?orderId='+releases[0].id)).payments.filter(row=>row.scheduleId).sort((a,b)=>a.dueDate.localeCompare(b.dueDate));assert.deepEqual(planned.map(row=>row.amountCents),[10000,5000,22000]);
 await buy.reload();await buy.getByRole('button',{name:'Orders',exact:true}).click();const buyerOrder=buy.locator('article.br-order').filter({has:buy.locator(`a[href="/api/barrow/invoices/${releases[0].id}.csv"]`)}),buyerPayment=buyerOrder.getByRole('region',{name:'Card payment',exact:true});
 for(const [index,amount] of [[0,'100.00'],[1,'50.00']]) {
  await buyerPayment.getByLabel('Payment to review',{exact:true}).selectOption(planned[index].id);await expect(buyerPayment).toContainText(planned[index].dueDate);
  await buyerPayment.getByRole('button',{name:'Prepare scheduled card payment',exact:true}).click();await expect(buyerPayment.getByRole('link',{name:'Add card securely with Stripe',exact:true})).toBeVisible();
  edge.complete(planned[index]);await buyerPayment.getByRole('button',{name:'Refresh card and payment',exact:true}).click();await expect(buyerPayment).toContainText('ending 4242');
  await expect(buyerPayment.getByRole('button',{name:'Authorize card payment',exact:true})).toBeDisabled();await buyerPayment.getByRole('checkbox',{name:/^I authorize /}).check();
  await captureRegionWidths(buy,buyerPayment,'deposit-partial-review-'+(index+1));await buyerPayment.getByRole('button',{name:'Authorize card payment',exact:true}).click();await expect(buyerPayment).toContainText('Card authorized; capture pending');
  await ownerPayment.getByRole('button',{name:'Reload payment records',exact:true}).click();await ownerPayment.getByLabel('Payment to review',{exact:true}).selectOption(planned[index].id);await ownerPayment.getByLabel('Reason for capture or cancellation',{exact:true}).fill('Owner verified this separately authorized balance payment.');await ownerPayment.getByRole('button',{name:'Capture authorized payment',exact:true}).click();await expect(ownerPayment).toContainText('Payment captured');
  const partial=(await h.api('/api/barrow/payments?orderId='+releases[0].id)).payments.find(row=>row.id===planned[index].id);assert.equal(partial.state,'captured');
  const credit=ownerOrder.getByRole('region',{name:'Credit report',exact:true});await ownerOrder.getByText('Credit notes and refunds',{exact:true}).click();await credit.getByRole('button',{name:'Reload credit report',exact:true}).click();await credit.getByText('Manage credits and refunds',{exact:true}).click();await credit.getByLabel('Captured receipt',{exact:true}).selectOption(partial.id);await credit.getByLabel('USD amount',{exact:true}).fill(amount);await credit.getByLabel('Reason',{exact:true}).fill('Finance applied the verified partial balance receipt to its original release.');await credit.getByRole('button',{name:'Apply card principal',exact:true}).click();await expect(credit).toContainText('Card principal applied: USD '+amount);await credit.getByText('Manage credits and refunds',{exact:true}).click();await ownerOrder.getByText('Credit notes and refunds',{exact:true}).click();
 }
 await buy.reload();await buy.getByRole('button',{name:'Orders',exact:true}).click();const reconciled=buy.getByRole('region',{name:'Account statement',exact:true});await expect(reconciled).toContainText('USD 340.00');for(const row of planned.slice(0,2)){const receipt=await h.api('/api/barrow/payments/'+row.id);await expect(reconciled).toContainText(receipt.providerPaymentId)}await captureRegionWidths(buy,reconciled,'deposit-partial-statement');assert.equal(edge.captures,noCharge+2);
 // Fixed deposit configuration uses the existing Settings form, with no percentage ambiguity.
 await page.getByRole('button',{name:'Data',exact:true}).click();await page.getByText('Settings: seasonal prebooks',{exact:true}).click();const settings=page.getByRole('region',{name:'Seasonal prebook settings',exact:true});
 await settings.getByLabel('Season ID',{exact:true}).fill('synthetic-barrow-720');await settings.getByLabel('Season name',{exact:true}).fill('Fixed seasonal deposit');await settings.getByLabel('Opens at with timezone',{exact:true}).fill(publication.opensAt);await settings.getByLabel('Closes at with timezone',{exact:true}).fill(publication.closesAt);await settings.getByLabel('Season minimum in minor units',{exact:true}).fill('20000');await settings.getByLabel('Deposit type',{exact:true}).selectOption('fixed');await settings.getByLabel('Fixed deposit in minor units',{exact:true}).fill('21000');
 for(const [index,ship,cancel] of [[0,'2027-03-10','2027-03-20'],[1,'2027-03-20','2027-03-30']]){await settings.getByLabel('Ship date',{exact:true}).nth(index).fill(ship);await settings.getByLabel('Cancel after',{exact:true}).nth(index).fill(cancel)}
 await settings.getByLabel('Season decision reason',{exact:true}).fill('Owner publishes an exact fixed principal requirement.');await captureRegionWidths(page,settings,'deposit-fixed-settings');await settings.getByRole('button',{name:'Publish season',exact:true}).click();await expect(settings.getByRole('heading',{name:'Fixed seasonal deposit',exact:true})).toBeVisible();await expect(settings).toContainText('deposit USD 210.00');
 for(const screen of [page,buy])assert.equal(await screen.locator('button,a,[role=button]').evaluateAll(elements=>elements.filter(element=>element.getBoundingClientRect().width>0&&!/[A-Za-z0-9]/.test(element.textContent??'')&&!element.getAttribute('aria-describedby')).length),0);
 }catch(error){await buy.screenshot({path:(process.env.BARROW_JOURNEY_EVIDENCE??'/tmp')+'/deposit-failure.png',fullPage:true});throw error}
});
