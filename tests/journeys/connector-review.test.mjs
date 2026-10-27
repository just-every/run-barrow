import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {installation,stock,accountValue} from '../api/harness.mjs';
import {captureRegionWidths,signedContext} from './browser-helpers.mjs';

test('owner inspects and repairs a missing connector item, then sees retained source history after revocation at desktop and phone',async t=>{
 const pier=await installation({pier:true});t.after(()=>pier.close());const source=await stock(pier,'30');
 const h=await installation({built:true,https:true,bindings:{PIER_ORIGIN:pier.origin,PIER_SESSION:pier.cookie}});t.after(()=>h.close());
 const account=await h.command('account.save',{id:'cedar',value:{...accountValue(source.customer.id),prices:[{sku:'OAT-1',unitCents:6500,minQty:1},{sku:'MISSING-1',unitCents:100,minQty:1}]}});
 const buyer={as:await h.signIn('buyer@example.test')};
 let order=await h.command('order.prepare',{accountId:account.id,lines:[{sku:'OAT-1',quantity:2}]},buyer);await h.command('order.submit',{orderId:order.id},buyer);order=await h.command('order.approve',{orderId:order.id});
 await h.db.prepare("UPDATE bw_orders SET value_json=json_set(value_json,'$.lines[0].quantity',3,'$.lines[0].baseQuantity','3') WHERE id=?").bind(order.id).run();
 const browser=await chromium.launch({headless:true,...(process.env.BARROW_CHROMIUM_EXECUTABLE?{executablePath:process.env.BARROW_CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});t.after(()=>browser.close());
 const context=await signedContext(browser,h);t.after(()=>context.close());const page=await context.newPage();await page.goto(h.origin+'/app');
 if(new URL(page.url()).pathname==='/setup'){await page.getByLabel('Your name').fill('Supplier owner');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click()}
 await page.getByRole('button',{name:'Data',exact:true}).click();
 const region=page.getByRole('region',{name:'Connector reconciliation',exact:true});
 const inspect=async reason=>{await region.getByLabel('Connector review reason').fill(reason);await region.getByRole('button',{name:'Inspect connectors',exact:true}).click();await expect(region.getByLabel('Connector review reason')).toHaveValue('')};
 await inspect('Owner previews current source records and the missing assortment mapping.');
 await expect(region).toContainText('Source items: 1; source customers: 1; mapped accounts: 1; source orders: 1; native orders: 1.');
 await expect(region).toContainText('OAT-1');await expect(region).toContainText('28 case available');await expect(region).toContainText('cedar:MISSING-1');await expect(region).toContainText('Records needing attention: 2');await expect(region).toContainText('Native ordered 3; Pier ordered 2 base units.');
 await captureRegionWidths(page,region,'connector-missing-item');
 await h.command('account.save',{id:account.id,revision:account.revision,value:{...account.value,prices:[account.value.prices[0]]}});
 await h.db.prepare('UPDATE bw_orders SET value_json=? WHERE id=?').bind(JSON.stringify(order),order.id).run();
 await inspect('Owner repaired the priced SKU through the account command and reconciles again.');
 await expect(region).toContainText('No discrepancies found in this inspection.');await expect(region).not.toContainText('cedar:MISSING-1');
 await captureRegionWidths(page,region,'connector-repaired');
 await h.configure({PIER_SESSION:undefined});await inspect('Owner reviews the records needing attention after credential revocation.');
 await expect(region).toContainText('Connection: unavailable.');await expect(region).toContainText('Records needing attention: 1');await expect(region).toContainText('Reconnect Pier with a current authorized supplier session');await expect(region).toContainText('28 case available');
 await captureRegionWidths(page,region,'connector-revoked');
 assert.deepEqual(await region.locator('button').evaluateAll(buttons=>buttons.filter(button=>!button.textContent?.trim()).map(button=>button.getAttribute('aria-label'))),[]);
});
