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

test('buyer books a spring season with a deposit and two windows; supplier closes intake, releases once and records a delayed style visible to buyer and operations',async t=>{
 const {prebookFixture}=await import('../api/prebook-fixture.mjs');
 const f=await prebookFixture(t,{built:true}),{h,pier,product,po,buyer,publication}=f;
 const browser=await chromium.launch({headless:true,...(process.env.BARROW_CHROMIUM_PATH?{executablePath:process.env.BARROW_CHROMIUM_PATH}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});t.after(()=>browser.close());
 const owner=await signedContext(browser,h);t.after(()=>owner.close());const page=await owner.newPage();await app(page,h);
 await page.getByRole('button',{name:'Data',exact:true}).click();await page.getByText('Settings: seasonal prebooks',{exact:true}).click();
 const settings=page.getByRole('region',{name:'Seasonal prebook settings',exact:true});
 for(const[label,value]of [['Season ID',publication.id],['Season name',publication.name],['Opens at with timezone',publication.opensAt],['Closes at with timezone',publication.closesAt],['Season minimum in minor units','20000'],['Deposit in basis points','3000'],['Season decision reason','Supplier approved these spring terms.']])await settings.getByLabel(label,{exact:true}).fill(value);
 for(let index=0;index<2;index++){
  const group=settings.getByRole('group',{name:`Ship window ${index+1}`,exact:true}),window=publication.windows[index];
  for(const[label,key]of [['Window ID','id'],['Window name','name'],['Ship date','shipDate'],['Cancel after','cancelAfter']])await group.getByLabel(label,{exact:true}).fill(window[key]);
 }
 await settings.getByRole('button',{name:'Publish season',exact:true}).click();await expect(settings.getByRole('heading',{name:'Spring 2027',exact:true})).toBeVisible();
 const buyerContext=await signedContext(browser,h,buyer.as);t.after(()=>buyerContext.close());const buy=await buyerContext.newPage();await app(buy,h);
 const orderForm=buy.getByRole('region',{name:'Seasonal prebook order',exact:true});await orderForm.getByLabel('Buying season',{exact:true}).selectOption(publication.id);
 await expect(orderForm).toContainText('Available now: 4 case. Incoming: 30 on 2027-03-01.');await expect(orderForm).toContainText('deposit requirement 30%');
 await orderForm.getByLabel('Prebook PO reference',{exact:true}).fill('SPRING-2027');
 for(const[sku,quantity,window]of [['OAT-1','8','first'],['RYE-1','6','second']]){await orderForm.getByLabel(`${sku} prebook quantity`,{exact:true}).fill(quantity);await orderForm.getByLabel(`${sku} ship window`,{exact:true}).selectOption(window)}
 await captureRegionWidths(buy,orderForm,'prebook-order');
 await orderForm.getByRole('button',{name:'Prepare seasonal prebook',exact:true}).click();await buy.getByRole('heading',{name:'Your orders',exact:true}).waitFor();
 let order=(await h.api('/api/barrow/orders/history',undefined,buyer)).orders.find(row=>row.prebook);assert.ok(order);
 const buyerCommitment=buy.getByRole('region',{name:`Seasonal commitment ${order.id}`,exact:true});await expect(buyerCommitment).toContainText('USD 210.00');await expect(buyerCommitment).toContainText('Committed 8 · released 0 · outstanding 8');
 await buy.locator('article.br-order').filter({has:buyerCommitment}).getByRole('button',{name:'Submit for supplier review',exact:true}).click();await expect(buy.locator('article.br-order').filter({has:buyerCommitment}).getByText('submitted',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Orders',exact:true}).click();
 const parent=page.locator('article.br-order').filter({has:page.getByRole('region',{name:`Seasonal commitment ${order.id}`,exact:true})});
 await parent.getByRole('button',{name:'Accept seasonal commitment',exact:true}).click();await expect(parent.getByRole('heading',{name:'Prebook deposit by card',exact:true})).toBeVisible();
 order=await h.api('/api/barrow/orders/'+order.id);const payment=await f.deposit(order);assert.equal(payment.amountCents,21000);
 await page.getByRole('button',{name:'Data',exact:true}).click();await page.getByText('Settings: seasonal prebooks',{exact:true}).click();await settings.getByLabel('Season decision reason',{exact:true}).fill('Season intake complete; retain accepted commitments.');await settings.getByRole('button',{name:'Close Spring 2027',exact:true}).click();await expect(settings).toContainText('closed');await captureRegionWidths(page,settings,'prebook-closed-season');assert.equal(await settings.locator('button,a,[role=button]').evaluateAll(elements=>elements.filter(element=>element.getBoundingClientRect().width>0&&!/[A-Za-z0-9]/.test(element.textContent??'')&&!element.getAttribute('aria-describedby')).length),0);
 await pier.command('receipt.create',{poId:po.id,supplierReference:'First spring stock arrived',lines:[{poLineId:po.lines[0].id,locationId:product.location.id,quantity:'12',cost:'20.00'}]});
 await page.getByRole('button',{name:'Orders',exact:true}).click();
 const commitment=page.getByRole('region',{name:`Seasonal commitment ${order.id}`,exact:true});await commitment.getByLabel('Commitment window',{exact:true}).selectOption('first');await commitment.getByLabel('Release or delay reason',{exact:true}).fill('First window stock is ready.');await commitment.getByRole('button',{name:'Release selected window',exact:true}).click();await expect(commitment).toContainText('Committed 8 · released 8 · outstanding 0');
 const releaseOrder=page.locator('article.br-order').filter({hasText:`Release of seasonal commitment ${order.id}`});await releaseOrder.getByRole('button',{name:'Approve & reserve stock',exact:true}).click();await expect(releaseOrder.getByText('approved',{exact:true})).toBeVisible();
 await commitment.getByLabel('Commitment window',{exact:true}).selectOption('second');await commitment.getByLabel('Release or delay reason',{exact:true}).fill('Source supplier delayed the rye style.');await commitment.getByLabel('New estimated ship date',{exact:true}).fill('2027-03-15');await commitment.getByRole('button',{name:'Record delayed style',exact:true}).click();await expect(commitment).toContainText('2027-03-15 · backordered');await expect(commitment).toContainText('Committed 6 · released 0 · outstanding 6');await captureRegionWidths(page,parent,'prebook-supplier-commitment');
 await buy.reload();await buy.getByRole('button',{name:'Orders',exact:true}).click();await expect(buyerCommitment).toContainText('2027-03-15 · backordered');await expect(buyerCommitment).toContainText('Committed 8 · released 8 · outstanding 0');await captureRegionWidths(buy,buy.locator('article.br-order').filter({has:buyerCommitment}),'prebook-buyer-commitment');
 await page.getByRole('button',{name:'Data',exact:true}).click();const report=page.locator('.br-card').filter({has:page.getByRole('heading',{name:'Fulfillment & backorders',exact:true})}).first();await report.getByRole('button',{name:'Refresh fulfillment',exact:true}).click();await expect(report).toContainText('First spring shipment: committed 8 · released 8 · outstanding 0');await expect(report).toContainText('Late spring shipment: committed 6 · released 0 · outstanding 6');await expect(report).toContainText('2027-03-15 · backordered');await captureRegionWidths(page,report,'prebook-fulfillment');
 for(const region of [report])assert.equal(await region.locator('button,a,[role=button]').evaluateAll(elements=>elements.filter(element=>element.getBoundingClientRect().width>0&&!/[A-Za-z0-9]/.test(element.textContent??'')&&!element.getAttribute('aria-describedby')).length),0);
 const sales=await h.api('/api/barrow/reports/sales?from=2027-01-01&to=2027-12-31');assert.equal(sales.totals[0].bookedCents,70000);assert.equal(sales.rows.filter(row=>row.bookingType==='prebook').length,2);assert.equal(sales.rows.filter(row=>row.bookingType==='prebook-release').length,1);
});
