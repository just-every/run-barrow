import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {sparkFixture} from '../api/sparklayer-fixture.mjs';
import {nuorderInput} from '../api/nuorder-fixture.mjs';
import {captureRegionWidths,signedContext} from './browser-helpers.mjs';

test('owner uploads mapped NuORDER sources, reviews exact reconciliation and applies retained history once',async t=>{
 const {h}=await sparkFixture(t,{built:true,https:true,networkEdge:request=>new URL(request.url).hostname==='media.example.test'?new Response('Missing',{status:404}):undefined}),input=nuorderInput('xlsx');
 input.images.push({...input.images[0],name:'OAT_Natural_2.jpg'},{...input.images[0],name:'GRAIN_Natural_3.jpg'});
 input.images.push({name:'OAT_Natural_4.jpg',url:'https://media.example.test/missing.jpg',style:'OAT'});input.retrieveImages=true;input.imageHosts=['media.example.test'];input.priceBooks=[{customerId:'store-1',file:{name:'current-prices.csv',csv:'Product ID,Currency,Wholesale Price,Minimum Quantity\nproduct-1,USD,72.00,2\n'}}];
 const browser=await chromium.launch({headless:true,...(process.env.BARROW_CHROMIUM_PATH?{executablePath:process.env.BARROW_CHROMIUM_PATH}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});t.after(()=>browser.close());
 const context=await signedContext(browser,h);t.after(()=>context.close());const page=await context.newPage();await page.goto(h.origin+'/app');
 if(new URL(page.url()).pathname==='/setup'){await page.getByLabel('Your name').fill('Supplier owner');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click()}
 await page.getByRole('button',{name:'Move in',exact:true}).click();await page.getByLabel('Source system',{exact:true}).selectOption('nuorder');const region=page.getByRole('region',{name:'NuORDER move-in',exact:true});
 await region.getByLabel('Choose NuORDER manifest').setInputFiles({name:'synthetic-barrow-61.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(input))});
 await region.getByRole('button',{name:'Preview NuORDER import',exact:true}).click();const preview=region.getByRole('region',{name:'NuORDER preview',exact:true});await expect(preview).toContainText('Source and planned totals match.');await expect(preview).toContainText('26000');await expect(preview).toContainText('7000');await expect(preview).toContainText('NuORDER retailer-network orders stop arriving at cutover');
 assert.equal((await h.api('/api/barrow/imports/nuorder')).history.length,0);await expect(region.getByRole('button',{name:'Apply reviewed NuORDER import',exact:true})).toBeDisabled();
 await expect(preview.getByRole('table',{name:'Supplied current price books, in exact currency cents'})).toContainText('7200');await region.getByText('Review product coverage and image slots',{exact:true}).click();await expect(preview).toContainText('OAT-1');await expect(preview).toContainText('"slot": 1');await expect(preview).toContainText('"slot": 2');await expect(preview).toContainText('GRAIN_Natural_3.jpg');await expect(preview).toContainText('held privately');await expect(preview).toContainText('Image retrieval returned HTTP 404');await captureRegionWidths(page,region,'nuorder-reviewed-image-slots');
 await region.getByLabel('NuORDER approval reason').fill('Owner reviewed mapped products, exact USD and CAD history and primary image.');await region.getByRole('checkbox').check();await region.getByRole('button',{name:'Apply reviewed NuORDER import',exact:true}).click();await expect(region).toContainText('NuORDER import completed.');
 await region.getByRole('button',{name:'Replay reviewed NuORDER import',exact:true}).click();await expect(region).toContainText('Replay confirmed');assert.equal((await h.api('/api/barrow/imports/nuorder')).history.length,2);await captureRegionWidths(page,region,'nuorder-completed-replay');
 assert.deepEqual(await region.locator('button').evaluateAll(buttons=>buttons.filter(button=>!button.textContent?.trim()).map(button=>button.getAttribute('aria-label'))),[]);
 const bad=structuredClone(input);bad.authority.customers['store-1']='missing';await region.getByLabel('NuORDER source',{exact:true}).fill(JSON.stringify(bad));await region.getByRole('button',{name:'Preview NuORDER import',exact:true}).click();await expect(region).toContainText('Missing mapped account missing');await expect(region.getByRole('button',{name:'Apply reviewed NuORDER import',exact:true})).toBeDisabled();await captureRegionWidths(page,region,'nuorder-unresolved-account');
});
