import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { invoiceFixture, readPdf } from '../api/invoice-documents.mjs';
import { captureRegionWidths, signedContext } from './browser-helpers.mjs';

export async function invoiceDocumentsJourney(t) {
 const f=await invoiceFixture(t,{built:true}),{h,buyer,order}=f;
 const legacy={...order,id:'legacy-invoice',invoice:{...order.invoice,number:'BAR-legacy-invoice'}};delete legacy.currency;
 await h.db.prepare('INSERT INTO bw_orders VALUES(?,?,?,?)').bind(legacy.id,legacy.accountId,JSON.stringify(legacy),legacy.revision).run();
 const browser=await chromium.launch({headless:true,...(process.env.BARROW_CHROMIUM_PATH?{executablePath:process.env.BARROW_CHROMIUM_PATH}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});t.after(()=>browser.close());
 const context=await signedContext(browser,h,buyer.as);t.after(()=>context.close());const page=await context.newPage();
 await page.goto(h.origin+'/app');
 if(new URL(page.url()).pathname==='/setup'){
  await page.getByLabel('Your name').fill('Invoice buyer');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();
 }
 await page.getByRole('button',{name:'Orders',exact:true}).click();
 const downloads=new Map();
 for(const current of [order,legacy]) {
  const card=page.locator('article.br-order').filter({has:page.getByRole('link',{name:'Download invoice PDF',exact:true}).and(page.locator(`[href="/api/barrow/invoices/${current.id}.pdf"]`))});
  await expect(card.getByRole('link',{name:'Download invoice PDF',exact:true})).toBeVisible();
  for(const format of ['pdf','csv']) {
   const [file]=await Promise.all([page.waitForEvent('download'),card.getByRole('link',{name:`Download invoice ${format.toUpperCase()}`,exact:true}).click()]);
   assert.equal(file.suggestedFilename(),`barrow-${current.id}.${format}`);
   const bytes=await readFile(await file.path());downloads.set(`${current.id}.${format}`,bytes);
   if(format==='pdf') {
    const pdf=await readPdf(bytes);assert.ok(pdf.pages>=3);
    for(const text of [`Invoice ${current.invoice.number}`,`Currency: ${current.currency??'AUD'}`,'157906 minor units','1750 minor units','Tax: Not calculated','Buyer: 王氏食品 Wáng Family Foods'])assert.ok(pdf.text.includes(text),text);
   }else {assert.ok(bytes.toString().includes(f.account.value.name));assert.ok(bytes.toString().includes(`"${current.currency??'AUD'}"`));assert.ok(bytes.toString().includes('"157906"'));}
   if(process.env.BARROW_JOURNEY_EVIDENCE)await writeFile(`${process.env.BARROW_JOURNEY_EVIDENCE}/invoice-${current.currency??'AUD'}.${format}`,bytes);
  }
  assert.equal(await card.locator('button,a,[role=button]').evaluateAll(elements=>elements.filter(element=>element.getBoundingClientRect().width>0&&!/[A-Za-z0-9]/.test(element.textContent??'')&&!element.getAttribute('aria-describedby')).length),0);
  await captureRegionWidths(page,card,`invoice-${current.currency??'AUD'}`);
 }
 await h.command('account.save',{id:'cedar',revision:f.account.revision,value:{...f.account.value,name:'Changed current buyer',termsDays:7,prices:f.items.map(item=>({sku:item.sku,unitCents:9999,minQty:1}))}});
 await h.command('seller.identity',{revision:f.seller.revision,legalName:'Changed current seller',address:'Changed current address'});
 await page.reload();await page.getByRole('button',{name:'Orders',exact:true}).click();
 for(const current of [order,legacy])for(const format of ['pdf','csv']) {
  const link=page.getByRole('link',{name:`Download invoice ${format.toUpperCase()}`,exact:true}).and(page.locator(`[href="/api/barrow/invoices/${current.id}.${format}"]`));
  const [file]=await Promise.all([page.waitForEvent('download'),link.click()]);
  assert.deepEqual(await readFile(await file.path()),downloads.get(`${current.id}.${format}`));
 }
 assert.equal((await h.api('/api/barrow/orders/'+order.id,undefined,buyer)).totalCents,157906);
}
