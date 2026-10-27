// Built Worker, native synthetic sessions, real pinned Pier. Screenshots stay outside the public tree.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import {sheetFixture,csvRows} from '../api/line-sheet-fixture.mjs';
import {withExif} from '../fixtures/confirmation-image.mjs';
import {captureRegionWidths,signedContext} from './browser-helpers.mjs';
async function app(page,h) {
 await page.goto(h.origin+'/app');
 if(new URL(page.url()).pathname==='/setup'){
  await page.getByLabel('Your name').fill('Supplier owner');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();
 }
 await page.getByRole('button',{name:'Orders',exact:true}).waitFor();
}
const shot=(page,region,name)=>captureRegionWidths(page,region,name);

test('owner records seller and variant details, a buyer revises a two-window seasonal order before acceptance, and the owner exports that season as style, color and size totals at desktop and phone',async t=>{
 const f=await sheetFixture(t,{built:true,https:true}),{h,buyers,sheet,skus}=f,year=new Date().getUTCFullYear()+1,season=`Spring ${year}`;
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});t.after(()=>browser.close());
 const owner=await signedContext(browser,h);t.after(()=>owner.close());const page=await owner.newPage();await app(page,h);
 await page.getByRole('button',{name:'Line sheets',exact:true}).click();
 const settings=page.getByRole('region',{name:'Order confirmation details',exact:true});
 await settings.getByLabel('Legal name',{exact:true}).fill('Mill House Apparel LLC');await settings.getByLabel('Registered address',{exact:true}).fill('12 Spring St, New York, NY');
 await settings.getByRole('button',{name:'Save seller identity',exact:true}).click();await expect(settings.getByRole('status')).toContainText('Seller legal identity saved');
 await settings.getByLabel('One variant per line: SKU, style, color, size',{exact:true}).fill(skus.map(sku=>`${sku}, TEE-BLUE, Blue, ${sku.split('-').at(-1)}`).join('\n'));
 await settings.getByRole('button',{name:'Save variant attributes',exact:true}).click();await expect(settings.getByRole('status')).toContainText('Variant attributes saved');
 await settings.getByRole('group',{name:'Product images',exact:true}).getByRole('combobox').selectOption(skus[2]);
 await settings.getByLabel('JPEG image',{exact:true}).setInputFiles({name:'blue-tee.jpg',mimeType:'image/jpeg',buffer:withExif});
 await expect(settings.getByRole('status')).toContainText('Product image saved');
 await shot(page,settings,'confirmation-settings');
 // Two ship windows through the public preparation door; the buyer revises on their own Orders screen.
 const w1=[`${year}-03-02`,`${year}-03-14`],w2=[`${year}-03-16`,`${year}-03-30`];
 let order=await h.command('order.prepare',{accountId:'cedar',lineSheetId:sheet.id,lineSheetRevision:sheet.revision,reference:'synthetic-barrow-revise',lines:[{sku:skus[0],quantity:4,requestedDate:w1[0],cancelAfter:w1[1]},{sku:skus[1],quantity:6,requestedDate:w1[0],cancelAfter:w1[1]},{sku:skus[2],quantity:2,requestedDate:w2[0],cancelAfter:w2[1]}]},buyers.cedar);
 order=await h.command('order.submit',{orderId:order.id},buyers.cedar);
 const buyer=await signedContext(browser,h,buyers.cedar.as);t.after(()=>buyer.close());const buyerPage=await buyer.newPage();await app(buyerPage,h);
 await buyerPage.getByRole('button',{name:'Orders',exact:true}).click();
 const card=buyerPage.locator('article.br-order').filter({hasText:'synthetic-barrow-revise'});await card.waitFor();await expect(card).toContainText(season);
 await card.getByText('Revise quantities before acceptance',{exact:true}).click();await card.getByRole('spinbutton').nth(1).fill('3');
 await shot(buyerPage,card,'confirmation-buyer-revision');
 await card.getByRole('button',{name:'Save revised quantities',exact:true}).click();
 await expect.poll(async()=>(await h.api(`/api/barrow/orders/${order.id}/confirmations`,undefined,buyers.cedar)).confirmations.map(row=>row.stage)).toEqual(['submitted','revised']);
 await card.getByText('Order confirmations',{exact:true}).click();
 await expect(card).toContainText(`Revises C1: line 2 ${skus[1]} 6 → 3`);await card.getByRole('link',{name:'Download confirmation 2 PDF',exact:true}).waitFor();
 await expect(card).toContainText('Email to the account contact: accepted');
 await shot(buyerPage,card,'confirmation-revisions');
 const pdfBytes=await(await buyer.request.get(`${h.origin}/api/barrow/orders/${order.id}/confirmations/2.pdf`)).body(),pdf=pdfBytes.toString('latin1');
 if(process.env.BARROW_JOURNEY_EVIDENCE)await writeFile(`${process.env.BARROW_JOURNEY_EVIDENCE}/confirmation-revised.pdf`,pdfBytes);
 for(const value of ['Seller: Mill House Apparel LLC',`Ship windows: ${w1[0]} to cancel ${w1[1]}; ${w2[0]} to cancel ${w2[1]}`,'Style TEE-BLUE | Color Blue | Size M','/Subtype /Image'])assert.ok(pdf.includes(value),value);
 for(const reference of ['synthetic-barrow-season-2','synthetic-barrow-season-3']){const o=await h.command('order.prepare',{accountId:'cedar',lineSheetId:sheet.id,lineSheetRevision:sheet.revision,reference,lines:[{sku:skus[0],quantity:1}]},buyers.cedar);await h.command('order.submit',{orderId:o.id},buyers.cedar)}
 // The owner loads that season by filter and downloads production totals from the Orders screen.
 await page.getByRole('button',{name:'Orders',exact:true}).click();
 const bulk=page.locator('details.br-card').filter({has:page.getByText('Bulk confirmation CSV',{exact:true})});
 await bulk.getByText('Bulk confirmation CSV',{exact:true}).click();
 await bulk.getByLabel('Season (optional, exactly as published on the line sheet)',{exact:true}).fill(season);
 await bulk.getByRole('button',{name:'Load season orders',exact:true}).click();await bulk.getByRole('button',{name:'Select all recorded',exact:true}).click();
 const [download]=await Promise.all([page.waitForEvent('download'),bulk.getByRole('button',{name:'Download style, color and size totals',exact:true}).click()]);
 const totals=csvRows(await readFile(await download.path(),'utf8'));
 assert.deepEqual(totals.rows.map(row=>[row.style,row.color,row.size,row.base_quantity,row.order_count]),[['TEE-BLUE','Blue','S','6','3'],['TEE-BLUE','Blue','M','3','1'],['TEE-BLUE','Blue','3XL','2','1']]);
 await expect(bulk.getByRole('status')).toContainText('totals CSV was downloaded');
 await shot(page,bulk,'confirmation-season-totals');
 await bulk.getByText('Manage named layouts',{exact:true}).click();
 await bulk.getByLabel('Layout name',{exact:true}).fill('Spring matrix');
 await bulk.getByLabel('Layout shape').selectOption('matrix');
 await bulk.getByLabel('Columns, in export order',{exact:true}).fill('order, po, season, style, color, requested_date, cancel_after');
 await bulk.getByRole('button',{name:'Save as new layout',exact:true}).click();
 await expect.poll(async()=>(await h.api('/api/barrow/confirmation-layouts')).layouts.find(row=>row.name==='Spring matrix')?.shape).toBe('matrix');
 const layout=(await h.api('/api/barrow/confirmation-layouts')).layouts.find(row=>row.name==='Spring matrix');
 await expect(bulk.getByLabel('Download layout')).toHaveValue(layout.id);
 await bulk.getByRole('button',{name:'Make selected layout default',exact:true}).click();
 await expect.poll(async()=>(await h.api('/api/barrow/confirmation-layouts')).defaultId).toBe(layout.id);
 const [matrixFile]=await Promise.all([page.waitForEvent('download'),bulk.getByRole('button',{name:'Download 3 selected confirmations CSV',exact:true}).click()]);
 const matrix=csvRows(await readFile(await matrixFile.path(),'utf8'));
 assert.equal(matrix.rows.reduce((sum,row)=>sum+['S','M','3XL'].reduce((qty,size)=>qty+Number(row[size]||0),0),0),11);
 await shot(page,bulk,'confirmation-matrix-layout');
});

test('seasonal prebook buyer places two windows and operations closes intake, releases stock and backorders a delayed style at desktop and phone',async t=>{
 const {prebookFixture}=await import('../api/prebook-fixture.mjs'),f=await prebookFixture(t,{built:true,https:true}),{h}=f;
 const browser=await chromium.launch({headless:true,...(process.env.BARROW_CHROMIUM?{executablePath:process.env.BARROW_CHROMIUM}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});t.after(()=>browser.close());
 const owner=await signedContext(browser,h);t.after(()=>owner.close());const page=await owner.newPage();await app(page,h);
 await page.getByRole('button',{name:'Data',exact:true}).click();await page.getByText('Prebook season settings',{exact:true}).click();
 const settings=page.getByRole('region',{name:'Prebook season settings',exact:true});await expect(settings).toContainText('Spring 2099');await shot(page,settings,'prebook-season-settings');
 const buyer=await signedContext(browser,h,f.buyer.as);t.after(()=>buyer.close());const bp=await buyer.newPage();await app(bp,h);
 await bp.getByRole('button',{name:'Catalog',exact:true}).click();await bp.getByLabel('Order timing',{exact:true}).selectOption(f.season.id);
 await bp.getByRole('spinbutton',{name:'Qty quantity for Toasted oat granola',exact:true}).fill('4');
 await bp.getByRole('spinbutton',{name:'Qty quantity for Spring coat',exact:true}).fill('6');
 for(const [sku,date,cancel] of [['OAT-1','2099-03-10','2099-03-20'],['COAT-2','2099-04-10','2099-04-30']]){
  await bp.getByLabel('Ship date for '+sku,{exact:true}).fill(date);await bp.getByLabel('Cancel after for '+sku,{exact:true}).fill(cancel);
 }
 await bp.getByLabel('Your purchase order / reference',{exact:true}).fill('SPRING-BROWSER');
 await shot(bp,bp.locator('form.br-pad'),'prebook-buyer-prepare');await bp.getByRole('button',{name:'Prepare draft',exact:true}).click();
 await bp.getByRole('button',{name:'Orders',exact:true}).click();
 const card=bp.locator('article.br-order').filter({hasText:'Reference: SPRING-BROWSER'});await expect(card).toContainText('Deposit required: USD 136.00');
 await card.getByRole('button',{name:'Submit for supplier review',exact:true}).click();await expect(card).toContainText('submitted');
 await page.getByRole('button',{name:'Orders',exact:true}).click();const ops=page.locator('article.br-order').filter({hasText:'Reference: SPRING-BROWSER'});
 await ops.getByRole('button',{name:'Accept prebook commitment',exact:true}).click();await expect(ops).toContainText('Future commitment accepted');
 await page.getByRole('button',{name:'Data',exact:true}).click();await page.getByText('Prebook season settings',{exact:true}).click();
 page.once('dialog',dialog=>dialog.accept('Spring intake closed after accepted commitments'));await settings.getByRole('button',{name:'Close Spring 2099',exact:true}).click();await expect(settings).toContainText('Closed');await shot(page,settings,'prebook-season-closed');
 await f.receive(f.firstPO,f.inventory.item,'4');
 await page.getByRole('button',{name:'Orders',exact:true}).click();
 page.once('dialog',dialog=>dialog.accept('Received first window stock'));await ops.getByRole('button',{name:'Release window 1',exact:true}).click();await expect(ops).toContainText('OAT-1: committed 4 · released 4 · outstanding 4');
 const dialogs=['2099-04-20','Style delayed at supplier'];page.on('dialog',dialog=>dialog.accept(dialogs.shift()??''));await ops.getByRole('button',{name:'Backorder window 2',exact:true}).click();
 await expect(ops).toContainText('Promise changed 2099-04-10 → 2099-04-20: Style delayed at supplier');await expect(ops).toContainText('COAT-2: committed 6 · released 0 · outstanding 6');
 await shot(page,ops,'prebook-operations-released');
 await bp.reload();await bp.getByRole('button',{name:'Orders',exact:true}).click();await expect(card).toContainText('COAT-2: committed 6 · released 0 · outstanding 6');
 await expect(card.getByRole('button',{name:'Release window 2',exact:true})).toHaveCount(0);await shot(bp,card,'prebook-buyer-released');
 await page.getByRole('button',{name:'Data',exact:true}).click();
 const fulfillment=page.locator('.br-card').filter({has:page.getByRole('heading',{name:'Fulfillment & backorders',exact:true})}).first();
 await expect(fulfillment).toContainText('Prebook committed 4 · released 4 · outstanding 4');await expect(fulfillment).toContainText('Promise changed 2099-04-10 → 2099-04-20');await shot(page,fulfillment,'prebook-fulfillment');
 const sales=page.locator('.br-card').filter({has:page.getByRole('heading',{name:'Sales by account and product',exact:true})}).first();await sales.getByText(/Document lines/).click();await expect(sales).toContainText('prebook Spring 2099');await shot(page,sales,'prebook-sales');
 // Every control on these changed screens has visible words; icon-only controls require described tooltips.
 for(const [p,region] of [[page,sales],[page,fulfillment],[bp,card]])assert.equal(await region.locator('button,a,[role=button]').evaluateAll(nodes=>nodes.filter(n=>n.getBoundingClientRect().width>0&&!/[A-Za-z0-9]/.test(n.textContent??'')&&!n.getAttribute('aria-describedby')).length),0);
});
