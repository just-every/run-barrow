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
 const {h,buyer,payment,releases}=await releasedDepositFixture(t,{built:true});
 const browser=await chromium.launch({headless:true,...(process.env.BARROW_CHROMIUM_PATH?{executablePath:process.env.BARROW_CHROMIUM_PATH}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});t.after(()=>browser.close());
 const context=await signedContext(browser,h),buyerContext=await signedContext(browser,h,buyer.as);t.after(()=>context.close());t.after(()=>buyerContext.close());
 const page=await context.newPage(),buy=await buyerContext.newPage();await app(page,h);await page.getByRole('button',{name:'Orders',exact:true}).click();
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
 for(const screen of [page,buy])assert.equal(await screen.locator('button,a,[role=button]').evaluateAll(elements=>elements.filter(element=>element.getBoundingClientRect().width>0&&!/[A-Za-z0-9]/.test(element.textContent??'')&&!element.getAttribute('aria-describedby')).length),0);
});
