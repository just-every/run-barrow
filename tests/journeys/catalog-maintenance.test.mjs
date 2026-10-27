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
 const browser=await chromium.launch({headless:true,...(process.env.BARROW_CHROMIUM_PATH?{executablePath:process.env.BARROW_CHROMIUM_PATH}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});t.after(()=>browser.close());
 const context=await signedContext(browser,h);t.after(()=>context.close());const page=await context.newPage();await page.goto(h.origin+'/app');
 if(new URL(page.url()).pathname==='/setup'){await page.getByLabel('Your name').fill('Supplier owner');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click()}
 await page.getByRole('button',{name:'Move in',exact:true}).click();const region=page.getByRole('region',{name:'Bulk catalog maintenance',exact:true});await region.waitFor();
 const imageFile=name=>({name,mimeType:'image/jpeg',buffer:withExif});
 await region.getByLabel('Product image files',{exact:true}).setInputFiles([imageFile('Pantry_Natural_1.jpg'),imageFile('Panrty_Natural_2.jpg'),imageFile('Future_Blue_1.jpg')]);
 await region.getByText('Image batch selected.',{exact:true}).waitFor();await region.getByRole('button',{name:'Preview image batch',exact:true}).click();
 const imageTable=region.getByRole('list',{name:'Image batch preview',exact:true});await expect(imageTable).toContainText('OAT-1');await expect(imageTable).toContainText('Unknown style, color or variant');
 assert.equal(await region.locator('button,a,[role=button]').evaluateAll(elements=>elements.filter(element=>element.getBoundingClientRect().width>0&&!/[A-Za-z0-9]/.test(element.textContent??'')&&!element.getAttribute('aria-describedby')).length),0);
 await captureRegionWidths(page,region,'catalog-image-preview');
 await region.getByRole('button',{name:'Apply reviewed images',exact:true}).click();await expect(region.getByText('Saved image slots: 1. Held files: 2.',{exact:true})).toBeVisible();
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
 // Later workbook import is the public door that resolves a held style.
 const later=file('synthetic-barrow-22.xlsx',{...fields,C3:'Future',D3:'Blue',L2:''});
 const laterInput={workbook:{name:later.name,base64:later.buffer.toString('base64')}};
 const laterPreview=await h.api('/api/barrow/catalog-maintenance/preview',laterInput);assert.equal(laterPreview.canApply,true);
 await h.api('/api/barrow/catalog-maintenance/apply',{...laterInput,fingerprint:laterPreview.fingerprint,reason:'Imported the later Future style after reviewing source identities.'});
 await region.getByRole('button',{name:'Refresh saved images',exact:true}).click();await expect(region.getByText('Saved image slots: 2. Held files: 1.',{exact:true})).toBeVisible();
 const heldState=await h.api('/api/barrow/catalog-maintenance/images');assert.deepEqual(heldState.slots.filter(row=>row.sku==='RYE-1').map(row=>[row.position,row.sha256]),[['1',imageSha]]);assert.deepEqual(heldState.held.map(row=>row.name),['Panrty_Natural_2.jpg']);
 await region.getByLabel('Product image files',{exact:true}).setInputFiles(imageFile('Pantry_Natural_1.jpg'));await region.getByText('Image batch selected.',{exact:true}).waitFor();await region.getByRole('button',{name:'Preview image batch',exact:true}).click();await imageTable.waitFor();await region.getByRole('button',{name:'Apply reviewed images',exact:true}).click();await expect(region.getByText('Saved image slots: 2. Held files: 1.',{exact:true})).toBeVisible();
 await captureRegionWidths(page,region,'catalog-image-held-and-replaced');
 await captureRegionWidths(page,region,'catalog-maintenance-applied');
 const jsonDownload=page.waitForEvent('download');await region.getByRole('link',{name:'Export JSON and manifest',exact:true}).click();const exported=JSON.parse(await readFile(await (await jsonDownload).path(),'utf8'));
 const oat=exported.listings.find(row=>row.sku==='OAT-1');assert.equal(oat.sourceItemId,products.item.id);assert.equal(oat.variantKey,'oat-case');assert.equal(oat.mediaSha256,imageSha);assert.deepEqual(oat.categories,['Food','Pantry']);assert.deepEqual(oat.assortments,['Spring']);
 const approvals=(await h.api('/api/barrow/audit')).events.filter(row=>row.action==='import.approved'&&row.source==='catalog-maintenance.apply');assert.equal(approvals.length,2);assert.ok(approvals.some(row=>JSON.parse(row.reason).fingerprint===fingerprint));
});
