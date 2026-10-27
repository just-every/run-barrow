import test from 'node:test';
import assert from 'node:assert/strict';
import {sparkFixture} from './sparklayer-fixture.mjs';
import {nuorderInput} from './nuorder-fixture.mjs';
import {imageSha,jpeg} from '../fixtures/confirmation-image.mjs';
import {archive,installation,restore} from './harness.mjs';
const base='/api/barrow/imports/nuorder';

test('NuORDER CSV and mapped XLSX reconcile history, open quantities, product keys and primary JPEGs with fingerprint approval and replay',async t=>{
 const {h,pier}=await sparkFixture(t);await pier.command('item.save',{sku:'RYE-1',name:'Rye crisps',unit:'case',packSize:'1'});const original=await h.api('/api/barrow/accounts/by-id/cedar');await h.command('account.save',{id:original.id,revision:original.revision,value:{...original.value,prices:[...original.value.prices,{sku:'RYE-1',unitCents:1200,minQty:6}]}});const input=nuorderInput('csv',{retired:true}),before=await h.api('/api/barrow/export.json'),stockBefore=await pier.api('/api/pier/state'),mail=h.mail.deliveries.length;
 const preview=await h.api(base+'/preview',input);
 assert.equal(preview.matches,true);assert.deepEqual(preview.source,{documents:2,lines:2,lists:1,listLines:1});
 assert.deepEqual(preview.catalog.source,{products:2,archivedProducts:1,images:1});assert.deepEqual(preview.catalog.planned,preview.catalog.source);
 assert.deepEqual(preview.catalog.images.map(({sku,slot,sha256,size})=>({sku,slot,sha256,size})),[{sku:'OAT-1',slot:1,sha256:imageSha,size:jpeg.length}]);assert.deepEqual(preview.catalog.missingImages,[]);
 assert.deepEqual(preview.totals,[{currency:'CAD',orders:1,quotes:0,totalCents:7000,shippingCents:0,quantity:1,openQuantity:0},{currency:'USD',orders:1,quotes:0,totalCents:26000,shippingCents:0,quantity:4,openQuantity:2}]);assert.deepEqual(preview.plannedTotals,preview.totals);
 assert.deepEqual(preview.rejectedFields,['orders: Brand Notes retained only']);assert.match(preview.missing.join(' '),/retailer-network orders stop arriving/);
 const afterPreview=await h.api('/api/barrow/export.json');afterPreview.manifest.exportedAt=before.manifest.exportedAt;assert.deepEqual(afterPreview,before);assert.equal((await h.db.prepare('SELECT count(*) AS n FROM bw_product_images').first()).n,0);
 const apply=report=>h.api(base+'/apply',{...input,fingerprint:report.fingerprint,reason:'Owner reviewed source columns, currencies, open quantities and primary images.'});
 await apply(preview);assert.equal((await apply(preview)).replayed,true);
 const rows=(await h.api(base)).history;assert.equal(rows.length,2);const order=rows.find(row=>row.source_id==='NU-1').value;
 assert.equal(order.label,'retained source history');assert.deepEqual(order.sourceFacts,{po:'PO-100',shipStart:'2027-01-01',shipEnd:'2027-01-31'});assert.equal(order.totalCents,26000);assert.deepEqual([order.lines[0].quantity,order.lines[0].unitCents,order.lines[0].openQuantity],[4,6500,2]);const cad=rows.find(row=>row.source_id==='NU-2').value;assert.deepEqual([cad.currency,cad.totalCents,cad.lines[0].unitCents,cad.lines[0].openQuantity],['CAD',7000,7000,0]);assert.equal(order.originals[0].fields['Brand Notes'],'Retain this source field');
 const settings=await h.db.prepare("SELECT value_json FROM bw_settings WHERE key='catalog-maintenance'").first();const listings=JSON.parse(settings.value_json),product=listings.find(p=>p.sku==='OAT-1');assert.equal(listings.find(p=>p.sku==='RYE-1').listing,'removed');assert.deepEqual([product.variantKey,product.style,product.color,product.size,product.attributes.season,product.mediaSha256],['product-1','OAT','Natural','Case','Spring 2027',imageSha]);
 assert.deepEqual(JSON.parse((await h.db.prepare("SELECT value_json FROM bw_settings WHERE key='variant-attributes'").first()).value_json)['OAT-1'].image,{sha256:imageSha,width:4,height:6,size:jpeg.length});
 const account=await h.api('/api/barrow/accounts/by-id/cedar');assert.deepEqual([account.value.prices[0].casePack,account.value.prices[0].increment],[2,2]);assert.deepEqual([account.value.prices[1].casePack,account.value.prices[1].increment],[6,6]);
 const lists=(await h.api('/api/barrow/lists?accountId=cedar')).lists;assert.equal(lists.length,1);assert.equal(lists[0].shared,false);assert.deepEqual(lists[0].lines,[{sku:'OAT-1',quantity:'4'}]);
 await h.command('account.save',{id:account.id,revision:account.revision,value:{...account.value,prices:account.value.prices.map(p=>({...p,unitCents:7000}))}});assert.equal((await h.command('cart.preview',{listId:lists[0].id,mode:'replace'})).totalCents,28000);
 const workbook=nuorderInput('xlsx',{retired:true}),replay=await h.api(base+'/preview',workbook);assert.equal(replay.matches,true);assert.equal(replay.planned.newDocuments,0);assert.equal(replay.planned.newLists,0);await h.api(base+'/apply',{...workbook,fingerprint:replay.fingerprint,reason:'Owner reviewed the equivalent workbook.'});assert.equal((await h.api(base)).history.length,2);
 const exported=await h.api('/api/barrow/export.json');assert.equal(exported.sourcehistory.length,2);assert.equal(exported.lists.length,1);assert.match(await(await h.request('/api/barrow/export/sourcehistory.csv')).text(),/PO-100/);assert.match(await(await h.request('/api/barrow/export/lists.csv')).text(),/Store assortment/);
 const audit=(await h.api('/api/barrow/audit?action=import.approved')).events.find(e=>e.revision===preview.fingerprint);assert.equal(audit.source,'nuorder.apply');assert.equal(audit.actorKind,'human');
 assert.equal((await h.api('/api/barrow/state')).orders.length,0);assert.deepEqual((await pier.api('/api/pier/state')).orders,stockBefore.orders);assert.equal(h.mail.deliveries.length,mail);
 const lines=await archive(h),restored=await installation();t.after(()=>restored.close());await restore(restored,lines);assert.equal((await restored.api(base)).history.length,2);assert.equal((await restored.db.prepare('SELECT count(*) AS n FROM bw_product_images').first()).n,1);assert.equal(restored.mail.deliveries.length,0);
});

test('NuORDER refuses unmapped identities, changed approval, invalid source quantities and unauthorized activation without writes',async t=>{
 const {h}=await sparkFixture(t),input=nuorderInput();
 for(const mutate of [p=>delete p.authority.products['product-1'],p=>delete p.authority.customers['store-1'],p=>p.orders.csv=p.orders.csv.replace('"4","65.00","2"','"4","65.00","5"'),p=>p.orders.columns.id='Absent column',p=>p.products.csv=p.products.csv.replace('false','maybe'),p=>p.orders.csv=p.orders.csv.replace('\"Order\"','\"Quote\"'),p=>p.orders.csv=p.orders.csv.replace('2026-10-01','2026-02-31'),p=>p.images[0].base64=Buffer.from('synthetic-barrow-62').toString('base64')]){
  const bad=structuredClone(input);mutate(bad);assert.equal((await h.request(base+'/preview',{method:'POST',body:bad})).status,400);
 }
 const upc=structuredClone(input);upc.products.csv=upc.products.csv.replace('\"Case\",\"\"','\"Case\",\"synthetic-barrow-63\"');const mismatch=await h.api(base+'/preview',upc);assert.equal(mismatch.matches,false);assert.match(mismatch.errors.join(' '),/UPC/);
 const preview=await h.api(base+'/preview',input),account=await h.api('/api/barrow/accounts/by-id/cedar');await h.command('account.save',{id:account.id,revision:account.revision,value:{...account.value,termsDays:45}});
 assert.equal((await h.api(base+'/apply',{...input,fingerprint:preview.fingerprint,reason:'Old approval'},{status:409})).error.code,'IMPORT_CHANGED');
 const buyer={as:await h.signIn('buyer@example.test')};for(const suffix of ['', '/preview','/apply'])assert.equal((await h.request(base+suffix,{...buyer,...(suffix?{method:'POST',body:{...input,fingerprint:preview.fingerprint,reason:'Forbidden'}}:{})})).status,403);
 const {token}=await h.api('/api/barrow/agent-token',{});assert.equal((await h.request(base+'/apply',{method:'POST',body:{...input,fingerprint:preview.fingerprint,reason:'Forbidden'},as:'',headers:{authorization:`Bearer ${token}`}})).status,403);
 assert.equal((await h.api(base)).history.length,0);assert.equal((await h.db.prepare('SELECT count(*) AS n FROM bw_product_images').first()).n,0);
 await h.configure({PIER_SESSION:undefined});const unavailable=await h.api(base+'/preview',input);assert.equal(unavailable.matches,false);assert.match(unavailable.errors.join(' '),/Pier product check did not run/);assert.equal((await h.api(base+'/apply',{...input,fingerprint:unavailable.fingerprint,reason:'No source check'},{status:409})).error.code,'IMPORT_UNRESOLVED');
});
