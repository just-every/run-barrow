import test from 'node:test';
import assert from 'node:assert/strict';
import { installation, stock, accountValue } from './harness.mjs';

const csv=text=>{const [columns,...rows]=text.trim().split('\r\n').map(line=>line.slice(1,-1).split('","'));return rows.map(row=>Object.fromEntries(columns.map((key,i)=>[key,row[i]])))};
test('PRI-004: mixed cases/each and measured units use exact base stock, unit prices and immutable invoice bases',async t=>{
 const pier=await installation({pier:true});t.after(()=>pier.close());const source=await stock(pier,'100');
 const items=[];
 for(const [sku,unit] of [['TEE-1','each'],['TAPE-1','meter']]){
  const item=await pier.command('item.save',{sku,name:sku==='TEE-1'?'Linen tee':'Cotton binding tape',unit,packSize:'1'});items.push(item);
  const po=await pier.command('po.draft',{supplierId:source.supplier.id,promiseDate:'2026-10-20',reason:'Wholesale units',lines:[{itemId:item.id,quantity:'100',price:'5.00'}]});
  await pier.command('po.approve',{poId:po.id,version:po.version});await pier.command('po.commit',{poId:po.id,version:po.version});await pier.command('receipt.create',{poId:po.id,supplierReference:sku,lines:[{poLineId:po.lines[0].id,locationId:source.location.id,quantity:'100',cost:'5.00'}]});
 }
 const h=await installation({bindings:{PIER_ORIGIN:pier.origin,PIER_SESSION:pier.cookie}});t.after(()=>h.close());
 let account=await h.command('account.save',{id:'cedar',value:{...accountValue(source.customer.id),minimumCents:0,prices:[
  {sku:'TEE-1',unitCents:1000,minQty:1,units:[{code:'case',baseQuantity:'12',unitCents:11000,packContents:'12 tees per case'},{code:'pallet',baseQuantity:'48',unitCents:44000,packContents:'4 cases of 12 tees'}]},
  {sku:'TAPE-1',unitCents:400,minQty:1,units:[{code:'yard',baseQuantity:'0.9144',unitCents:333,packContents:'0.9144 meters per yard',quantityKind:'measured'},{code:'micro',baseQuantity:'0.000001',unitCents:1,packContents:'One millionth of a meter',quantityKind:'measured'}]},
 ]}});
 const configuration=Object.fromEntries(account.value.prices.map(price=>[price.sku,price.units]));
 const accountCsv=['accountId,name,email,pierCustomerId,termsDays,minimumCents,sku,unitCents,minQty',...account.value.prices.map(price=>`cedar,${account.value.name},${account.value.email},${account.value.pierCustomerId},30,0,${price.sku},${price.unitCents},${price.minQty}`)].join('\n')+'\n';
 const imported=await h.api('/api/barrow/imports/preview',{csv:accountCsv});await h.api('/api/barrow/imports/apply',{csv:accountCsv,fingerprint:imported.fingerprint});
 account=(await h.api('/api/barrow/state')).accounts.find(a=>a.id===account.id);assert.deepEqual(Object.fromEntries(account.value.prices.map(price=>[price.sku,price.units])),configuration);
 const buyer=await h.signIn(account.value.email),as={as:buyer};
 const offers=(await h.api('/api/barrow/catalogue?accountId=cedar',undefined,as)).items;
 assert.equal(offers.find(i=>i.sku==='TEE-1').units[0].baseQuantity,'12');assert.equal(offers.find(i=>i.sku==='TEE-1').unit,'each');
 const prepare=(lines,opts={})=>h.command('order.prepare',{accountId:account.id,reference:'PO-UNIT-12',lines},{...as,...opts});
 assert.equal((await prepare([{sku:'TEE-1',unit:'dozen',quantity:2}],{status:400})).error.code,'UNIT');
 assert.equal((await prepare([{sku:'TEE-1',unit:'case',quantity:0.5}],{status:400})).error.code,'INPUT');
 assert.equal((await prepare([{sku:'TEE-1',unit:'case',quantity:8},{sku:'TEE-1',unit:'each',quantity:6}],{status:409})).error.code,'STOCK');
 assert.equal((await prepare([{sku:'TEE-1',unit:'case',quantity:1},{sku:'TEE-1',unit:'case',quantity:1}],{status:400})).error.code,'LINES');
 assert.equal((await prepare([{sku:'TAPE-1',unit:'micro',quantity:0.000001}],{status:400})).error.code,'INPUT');
 const pallet=await prepare([{sku:'TEE-1',unit:'pallet',quantity:1}]);assert.equal(pallet.lines[0].baseQuantity,'48');assert.equal(pallet.totalCents,44000);
 assert.equal((await prepare([{sku:'TEE-1',unit:'pallet',quantity:0.5}],{status:400})).error.code,'INPUT');
 let order=await prepare([{sku:'TEE-1',unit:'case',quantity:2,baseQuantity:'1',unitCents:1,lineCents:1},{sku:'TEE-1',unit:'each',quantity:6}]);
 assert.equal(order.totalCents,28000);assert.deepEqual(order.lines.map(l=>[l.quantity,l.unit,l.baseQuantity,l.baseUnit,l.unitCents,l.lineCents]),[[2,'case','24','each',11000,22000],[6,'each','6','each',1000,6000]]);
 assert.equal(order.lines[0].conversion,'12');assert.equal(order.lines[0].packContents,'12 tees per case');
 await h.command('order.submit',{orderId:order.id},as);order=await h.command('order.approve',{orderId:order.id});await h.command('order.approve',{orderId:order.id});
 assert.equal(order.status,'approved');
 const state=await pier.api('/api/pier/state');assert.equal(state.orders.length,1);assert.deepEqual(state.orders[0].lines.map(l=>[l.itemId,l.quantity,l.reserved]),[[items[0].id,'30','30']]);
 assert.equal((await h.api('/api/barrow/catalogue?accountId=cedar',undefined,as)).items.find(i=>i.sku==='TEE-1').available,'70');
 const download=()=>h.request(`/api/barrow/invoices/${order.id}.csv`,as).then(r=>r.text());const issued=await download(),rows=csv(issued);
 assert.deepEqual(rows.map(row=>[row.ordered_unit,row.quantity,row.base_quantity,row.base_unit,row.price_basis,row.conversion_to_base,row.unit_cents,row.line_cents,row.invoice_total_cents]),[['case','2','24','each','per case','12','11000','22000','28000'],['each','6','6','each','per each','1','1000','6000','28000']]);
 // Price/conversion edits affect a newly reviewed reorder, never issued history or its stock command.
 account=await h.command('account.save',{id:account.id,revision:account.revision,value:{...account.value,prices:account.value.prices.map(p=>p.sku==='TEE-1'?{...p,units:p.units.map(u=>u.code==='case'?{...u,baseQuantity:'6',unitCents:5700,packContents:'6 tees per case'}:u)}:p)}});
 assert.equal(await download(),issued);
 const selections=[{sku:'TEE-1',unit:'case'},{sku:'TEE-1',unit:'each'}];
 await h.command('order.reorder-preview',{orderId:order.id,selections:[{sku:'TEE-1'}]},{...as,status:400});
 const review=await h.command('order.reorder-preview',{orderId:order.id,selections},as);assert.deepEqual(review.blockers,[]);assert.equal(review.lines.length,2);assert.ok(review.lines.some(l=>l.conversion==='6'&&l.baseQuantity==='12'));assert.equal(review.totalCents,17400);
 const repeat=await h.command('order.reorder',{orderId:order.id,selections,fingerprint:review.fingerprint,acknowledged:true},as);assert.equal(repeat.totalCents,17400);assert.deepEqual(repeat.lines.map(l=>l.baseQuantity),review.lines.map(l=>l.baseQuantity));
 let measured=await prepare([{sku:'TAPE-1',unit:'yard',quantity:1.5}]);assert.equal(measured.lines[0].baseQuantity,'1.3716');assert.equal(measured.lines[0].lineCents,500);assert.equal(measured.totalCents,500);
 await h.command('order.submit',{orderId:measured.id},as);measured=await h.command('order.approve',{orderId:measured.id});assert.equal(measured.status,'approved');
 const tape=(await pier.api('/api/pier/state')).orders.find(o=>o.id===measured.pierOrderId);assert.equal(tape.lines[0].quantity,'1.3716');assert.equal(tape.lines[0].reserved,'1.3716');
 const measuredRows=csv(await (await h.request(`/api/barrow/invoices/${measured.id}.csv`,as)).text());assert.equal(measuredRows[0].quantity,'1.5');assert.equal(measuredRows[0].base_quantity,'1.3716');assert.equal(measuredRows[0].line_cents,'500');
});
