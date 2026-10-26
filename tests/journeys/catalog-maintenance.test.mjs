import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';
import {installation,stock} from '../api/harness.mjs';
import {withExif,imageSha} from '../fixtures/confirmation-image.mjs';
import {captureRegionWidths,signedContext} from './browser-helpers.mjs';

const escape=value=>value.replace(/[<>&"']/g,char=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[char]));
function correctedWorkbook(bytes,values){
 const entries=unzipSync(bytes);let xml=strFromU8(entries['xl/worksheets/sheet1.xml']);
 for(const[cell,value]of Object.entries(values))xml=xml.replace(new RegExp(`<c r="${cell}"[^>]*>[\\s\\S]*?</c>`),`<c r="${cell}" t="inlineStr"><is><t>${escape(value)}</t></is></c>`);
 entries['xl/worksheets/sheet1.xml']=strToU8(xml);return Buffer.from(zipSync(entries));
}

test('owner previews duplicate-barcode and broken-media XLSX, corrects the workbook, approves its fingerprint and downloads applied metadata at desktop and phone',async t=>{
 const pier=await installation({pier:true});t.after(()=>pier.close());const products=await stock(pier);
 const rye=await pier.command('item.save',{sku:'RYE-1',name:'Rye crisps',barcode:'synthetic-barrow-2',unit:'case',packSize:'1'});
 const h=await installation({built:true,https:true,bindings:{PIER_ORIGIN:pier.origin,PIER_SESSION:pier.cookie}});t.after(()=>h.close());
 let attrs=await h.command('variant.attributes',{revision:null,variants:[{sku:'OAT-1',style:'Pantry',color:'Natural',size:'Case'}]});
 await h.command('variant.image',{revision:attrs.revision,sku:'OAT-1',contentBase64:withExif.toString('base64')});
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});t.after(()=>browser.close());
 const context=await signedContext(browser,h);t.after(()=>context.close());const page=await context.newPage();await page.goto(h.origin+'/app');
 if(new URL(page.url()).pathname==='/setup'){await page.getByLabel('Your name').fill('Supplier owner');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click()}
 await page.getByRole('button',{name:'Move in',exact:true}).click();const region=page.getByRole('region',{name:'Bulk catalog maintenance',exact:true});await region.waitFor();
 await captureRegionWidths(page,region,'catalog-maintenance-source-workbook');
 // Use the public workbook link and the actual browser download as the editing source.
 const workbookDownload=page.waitForEvent('download');
 await region.getByRole('link',{name:'Download XLSX workbook',exact:true}).click();const download=await workbookDownload;assert.equal(await download.failure(),null);const bytes=await readFile(await download.path());
 const fields={B2:'oat-case',C2:'Pantry',D2:'Natural',E2:'Case',F2:'{"material":"oats"}',G2:'Food|Pantry',H2:'Spring',I2:imageSha,B3:'rye-case',C3:'Pantry',D3:'Natural',E3:'Case',I3:'',J3:'listed'};
 const file=(name,values)=>({name,mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:correctedWorkbook(bytes,values)});
 await region.getByLabel('Catalog workbook',{exact:true}).setInputFiles(file('synthetic-barrow-20.xlsx',{...fields,I2:'f'.repeat(64),L2:rye.barcode}));
 await region.getByText('Selected: synthetic-barrow-20.xlsx',{exact:true}).waitFor();await region.getByRole('button',{name:'Preview workbook',exact:true}).click();
 await expect(region.getByRole('alert')).toContainText('duplicates workbook row');await expect(region.getByRole('alert')).toContainText('Media reference must name');await expect(region.getByRole('button',{name:'Apply reviewed catalog',exact:true})).toBeDisabled();
 await captureRegionWidths(page,region,'catalog-maintenance-invalid-workbook');
 await region.getByLabel('Catalog workbook',{exact:true}).setInputFiles(file('synthetic-barrow-21.xlsx',{...fields,L2:''}));await region.getByText('Selected: synthetic-barrow-21.xlsx',{exact:true}).waitFor();await region.getByRole('button',{name:'Preview workbook',exact:true}).click();
 await region.getByRole('heading',{name:'2. Review and approve',exact:true}).waitFor();await expect(region.getByRole('alert')).toHaveCount(0);
 await region.getByLabel('Approval reason',{exact:true}).fill('Owner verified source identities, existing sanitized product image, categories and Spring assortment.');await region.getByLabel('I approve this exact fingerprint and its reconciliation.',{exact:true}).check();
 await captureRegionWidths(page,region,'catalog-maintenance-corrected-review');
 const fingerprint=await region.getByLabel('Reviewed fingerprint',{exact:true}).inputValue();
 await region.getByRole('button',{name:'Apply reviewed catalog',exact:true}).click();await expect(region.getByRole('status')).toContainText('The reviewed catalog was applied.');
 await captureRegionWidths(page,region,'catalog-maintenance-applied');
 const jsonDownload=page.waitForEvent('download');await region.getByRole('link',{name:'Export JSON and manifest',exact:true}).click();const exported=JSON.parse(await readFile(await (await jsonDownload).path(),'utf8'));
 const oat=exported.listings.find(row=>row.sku==='OAT-1');assert.equal(oat.sourceItemId,products.item.id);assert.equal(oat.variantKey,'oat-case');assert.equal(oat.mediaSha256,imageSha);assert.deepEqual(oat.categories,['Food','Pantry']);assert.deepEqual(oat.assortments,['Spring']);
 const approvals=(await h.api('/api/barrow/audit')).events.filter(row=>row.action==='import.approved'&&row.source==='catalog-maintenance.apply');assert.equal(approvals.length,1);assert.equal(JSON.parse(approvals[0].reason).fingerprint,fingerprint);
});
