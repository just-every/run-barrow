import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { installation, stock, accountValue, archive, restore } from './harness.mjs';
const rows = text => text.trim().split('\r\n').map(line=>line.slice(1,-1).split('","'));

test('ORD-014: numbered submitted and accepted confirmations retain exact commercial snapshots through edits, retry and cancellation', async t => {
 const pier=await installation({pier:true}); t.after(()=>pier.close());
 const products=await stock(pier);
 const h=await installation({bindings:{PIER_ORIGIN:pier.origin,PIER_SESSION:pier.cookie}});t.after(()=>h.close());
 let account=await h.command('account.save',{id:'cedar',value:{...accountValue(products.customer.id),minimumCents:0}});
 const buyer={as:await h.signIn(account.value.email)};
 const location=await h.command('location.save',{accountId:account.id,kind:'ship-to',value:{name:'Cedar receiving',line1:'25 Broadway',city:'New York',state:'NY',zip:'10004'}});
 let order=await h.command('order.prepare',{accountId:account.id,reference:'SPRING-27',requestedDate:'2026-11-21',cancelAfter:'2026-11-28',instructions:'Deliver to receiving dock',lines:[{sku:'OAT-1',quantity:3}]},buyer);
 const path=`/api/barrow/orders/${order.id}/confirmations`;
 assert.deepEqual((await h.api(path,undefined,buyer)).confirmations,[]);
 assert.equal((await h.request(path+'/1.pdf',buyer)).status,404);
 order=await h.command('order.submit',{orderId:order.id},buyer);
 let records=(await h.api(path,undefined,buyer)).confirmations;
 assert.equal(records.length,1);assert.equal(records[0].stage,'submitted');assert.equal(records[0].number,1);
 const snapshot=records[0].snapshot;
 assert.equal(snapshot.orderRevision,order.revision);assert.equal(snapshot.customerName,account.value.name);
 assert.deepEqual(snapshot.lines,order.lines);assert.deepEqual(snapshot.shipTo,order.shipTo);
 assert.equal(snapshot.reference,'SPRING-27');assert.equal(snapshot.requestedDate,'2026-11-21');assert.equal(snapshot.cancelAfter,'2026-11-28');assert.equal(snapshot.termsDays,30);
 assert.equal(snapshot.currency,'USD');assert.equal(snapshot.totalCents,19500);
 const download=async number=>{
  const csv=await h.request(`${path}/${number}.csv`,buyer),pdf=await h.request(`${path}/${number}.pdf`,buyer);
  assert.equal(csv.status,200);assert.equal(pdf.status,200);assert.equal(pdf.headers.get('content-type'),'application/pdf');
  const bytes=Buffer.from(await pdf.arrayBuffer()),text=bytes.toString();assert.ok(text.startsWith('%PDF-'));
  for(const value of [order.id,'SPRING-27','Cedar receiving','25 Broadway','2026-11-21','2026-11-28','Net 30 days','USD 195.00','OAT-1'])assert.ok(text.includes(value),value);
  if(process.env.BARROW_CONFIRMATION_PDF)await writeFile(process.env.BARROW_CONFIRMATION_PDF,bytes);
  const csvText=await csv.text(),[columns,...values]=rows(csvText),line=Object.fromEntries(columns.map((key,i)=>[key,values[0][i]]));
  assert.equal(line.confirmation,`${order.id}-C${number}`);assert.equal(line.sku,'OAT-1');assert.equal(line.quantity,'3');assert.equal(line.unit_cents,'6500');assert.equal(line.line_cents,'19500');assert.equal(line.order_total_cents,'19500');assert.equal(line.currency,'USD');assert.ok(line.ship_to.includes('25 Broadway'));
  return {csv:csvText,pdf:bytes};
 };
 const first=await download(1);
 await h.command('order.submit',{orderId:order.id},buyer);
 assert.equal((await h.api(path)).confirmations.length,1);
 order=await h.command('order.approve',{orderId:order.id});
 assert.equal(order.status,'approved');records=(await h.api(path)).confirmations;
 assert.deepEqual(records.map(({number,stage})=>[number,stage]),[[1,'submitted'],[2,'accepted']]);
 assert.deepEqual(records[1].snapshot.lines,snapshot.lines);assert.equal(records[1].snapshot.totalCents,snapshot.totalCents);
 const second=await download(2);
 await h.command('order.approve',{orderId:order.id});assert.equal((await h.api(path)).confirmations.length,2);
 account=await h.command('account.save',{id:account.id,revision:account.revision,value:{...account.value,termsDays:7,prices:[{sku:'OAT-1',unitCents:9999,minQty:1}]}});
 await h.command('location.save',{accountId:account.id,id:location.id,revision:location.revision,kind:'ship-to',value:{...location.value,line1:'99 Changed Street'}});
 await h.command('order.cancel',{orderId:order.id,reason:'Buyer cancelled after confirmation'});
 assert.deepEqual(await download(1),first);assert.deepEqual(await download(2),second);
 const timeline=await h.api(`/api/barrow/orders/${order.id}/timeline`,undefined,buyer);
 assert.deepEqual(timeline.entries.filter(entry=>entry.confirmation).map(entry=>entry.confirmation),[1,2]);
 const exported=await h.api('/api/barrow/export.json',undefined,buyer);
 assert.equal(exported.confirmations.length,2);assert.deepEqual(JSON.parse(exported.confirmations[0].snapshot),snapshot);
 const confirmationCsv=await h.request('/api/barrow/export/confirmations.csv',buyer);assert.equal(confirmationCsv.status,200);assert.ok((await confirmationCsv.text()).includes('SPRING-27'));
 const target=await installation();t.after(()=>target.close());
 await restore(target,await archive(h));
 assert.deepEqual((await target.api(path)).confirmations,(await h.api(path)).confirmations);
 for(const number of [1,2]) {
  assert.equal(await (await target.request(`${path}/${number}.csv`)).text(),await (await h.request(`${path}/${number}.csv`)).text());
  assert.deepEqual(Buffer.from(await (await target.request(`${path}/${number}.pdf`)).arrayBuffer()),Buffer.from(await (await h.request(`${path}/${number}.pdf`)).arrayBuffer()));
 }
 const other=await h.signIn('other@example.test');
 for(const suffix of ['', '/1.csv','/2.pdf'])assert.equal((await h.request(path+suffix,{as:other})).status,404);
 const {token}=await h.api('/api/barrow/agent-token',{});
 assert.equal((await h.request(path,{as:'',headers:{authorization:`Bearer ${token}`}})).status,403);
});

test('ORD-014: named per-line export layouts set default and selected column ordering without rewriting immutable confirmation values, and survive archive restore',async t=>{
 const pier=await installation({pier:true});t.after(()=>pier.close());const inventory=await stock(pier);
 const h=await installation({bindings:{PIER_ORIGIN:pier.origin,PIER_SESSION:pier.cookie}});t.after(()=>h.close());
 let account=await h.command('account.save',{id:'cedar',value:{...accountValue(inventory.customer.id),minimumCents:0}});
 const buyer={as:await h.signIn(account.value.email)},other={as:await h.signIn('other@example.test')};
 let order=await h.command('order.prepare',{accountId:account.id,reference:'AUTUMN-27',lines:[{sku:'OAT-1',quantity:3}]},buyer);
 order=await h.command('order.submit',{orderId:order.id},buyer);
 const path=`/api/barrow/orders/${order.id}/confirmations/1.csv`,standard=await(await h.request(path,buyer)).text();
 const initial=await h.api('/api/barrow/confirmation-layouts');
 let settings=await h.command('confirmation-layout.save',{revision:initial.revision,name:'Warehouse pick',columns:['sku','quantity','po','confirmation']});
 const first=settings.layouts.at(-1).id;
 settings=await h.command('confirmation-layout.save',{revision:settings.revision,name:'Commercial review',columns:['po','currency','unit_cents','quantity','line_cents','order_total_cents','sku']});
 const second=settings.layouts.at(-1).id;
 settings=await h.command('confirmation-layout.default',{revision:settings.revision,id:second});
 let result=rows(await(await h.request(path,buyer)).text());
 assert.deepEqual(result,[['po','currency','unit_cents','quantity','line_cents','order_total_cents','sku'],['AUTUMN-27','USD','6500','3','19500','19500','OAT-1']]);
 const selected=await(await h.request(path+'?layout='+first)).text();
 assert.deepEqual(rows(selected),[['sku','quantity','po','confirmation'],['OAT-1','3','AUTUMN-27',`${order.id}-C1`]]);
 assert.equal((await h.request(path+'?layout=missing')).status,404);
 assert.equal((await h.request(path+'?layout='+first,buyer)).status,403);
 assert.equal((await h.request('/api/barrow/confirmation-layouts',buyer)).status,403);
 assert.equal((await h.request(path,other)).status,404);
 await h.command('confirmation-layout.save',{revision:settings.revision,name:'Buyer edit',columns:['sku']},{...buyer,status:403});
 await h.command('confirmation-layout.default',{revision:initial.revision,id:first},{status:409});
 await h.command('confirmation-layout.save',{revision:settings.revision,name:'Bad columns',columns:['sku','sku']},{status:400});
 await h.command('confirmation-layout.save',{revision:settings.revision,name:'Unrecorded field',columns:['secret']},{status:400});
 await h.command('confirmation-layout.save',{revision:settings.revision,name:'Unimplemented matrix',columns:['sku'],shape:'matrix'},{status:400});
 account=await h.command('account.save',{id:account.id,revision:account.revision,value:{...account.value,termsDays:7,prices:[{sku:'OAT-1',unitCents:9999,minQty:1}]}});
 assert.equal(await(await h.request(path+'?layout='+first)).text(),selected);
 const standardId=initial.defaultId;assert.equal(await(await h.request(path+'?layout='+standardId)).text(),standard);
 const {token}=await h.api('/api/barrow/agent-token',{});assert.equal((await h.request(path,{as:'',headers:{authorization:`Bearer ${token}`}})).status,403);
 const target=await installation();t.after(()=>target.close());await restore(target,await archive(h));
 assert.deepEqual(await target.api('/api/barrow/confirmation-layouts'),{...settings,availableColumns:initial.availableColumns});
 assert.equal(await(await target.request(path)).text(),await(await h.request(path)).text());
});

test('ORD-014: bulk CSV combines 50 explicitly selected immutable revisions with named layouts, source identities and unchanged selling-unit bases',async t=>{
 const pier=await installation({pier:true});t.after(()=>pier.close());const inventory=await stock(pier,'10000');
 const h=await installation({bindings:{PIER_ORIGIN:pier.origin,PIER_SESSION:pier.cookie}});t.after(()=>h.close());
 let account=await h.command('account.save',{id:'cedar',value:{...accountValue(inventory.customer.id),minimumCents:0,prices:[{sku:'OAT-1',unitCents:6500,minQty:1,units:[{code:'pallet',baseQuantity:'12',unitCents:74000,packContents:'12 cases'}]}]}});
 const buyer={as:await h.signIn(account.value.email)},other={as:await h.signIn('other@example.test')};
 const selected=[],expected=[];
 for(let index=0;index<50;index++) {
  let order=await h.command('order.prepare',{accountId:account.id,reference:`SPRING-${index+1}`,lines:[{sku:'OAT-1',quantity:index+1},{sku:'OAT-1',unit:'pallet',quantity:1}]},buyer);
  order=await h.command('order.submit',{orderId:order.id},buyer);
  selected.push({orderId:order.id,number:1});
  expected.push(...order.lines.map(line=>({order:order.id,order_revision:order.revision,confirmation:`${order.id}-C1`,po:order.reference,sku:line.sku,unit:line.unit,quantity:String(line.quantity),base_quantity:line.baseQuantity,currency:'USD',line_cents:String(line.lineCents)})));
 }
 const first=selected[0],draft=await h.command('order.prepare',{accountId:account.id,reference:'NOT-SELECTED',lines:[{sku:'OAT-1',quantity:2}]},buyer);
 await h.command('order.approve',{orderId:first.orderId});
 const ids=selected.map(row=>row.orderId),selectionPath='/api/barrow/confirmations/selection',exportPath='/api/barrow/confirmations/export.csv';
 const choices=(await h.api(selectionPath,{orderIds:ids},buyer)).orders;
 assert.deepEqual(choices.map(row=>row.orderId),ids);assert.deepEqual(choices[0].confirmations.map(row=>[row.number,row.stage]),[[1,'submitted'],[2,'accepted']]);
 assert.equal(choices[0].confirmations[0].orderRevision,expected[0].order_revision);
 assert.deepEqual((await h.api(selectionPath,{orderIds:[draft.id]})).orders[0].confirmations,[]);
 let settings=await h.api('/api/barrow/confirmation-layouts');
 settings=await h.command('confirmation-layout.save',{revision:settings.revision,name:'Production lines',columns:['po','sku','unit','quantity','base_quantity','currency','line_cents'],makeDefault:true});
 const layout=settings.defaultId,download=async(body,actor={})=>{
  const response=await h.request(exportPath,{...actor,method:'POST',body});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  return response.text();
 };
 const body={confirmations:selected},csv=await download(body,buyer),[columns,...values]=rows(csv);
 assert.deepEqual(columns,['po','sku','unit','quantity','base_quantity','currency','line_cents','order','order_revision','confirmation']);
 const actual=values.map(row=>Object.fromEntries(columns.map((column,index)=>[column,row[index]])));
 assert.deepEqual(actual,expected);assert.equal(new Set(actual.map(row=>row.order)).size,50);
 assert.equal(actual.reduce((sum,row)=>sum+Number(row.line_cents),0),expected.reduce((sum,row)=>sum+Number(row.line_cents),0));
 assert.equal(actual.filter(row=>row.unit==='pallet').length,50);assert.equal(actual.filter(row=>row.unit==='case').length,50);
 assert.ok(!csv.includes(draft.id));
 assert.equal(await download({...body,layout}),csv);
 // Both recorded stages exist, but a bulk export accepts one explicit revision per order.
 const accepted=await download({confirmations:[{...first,number:2}],layout});assert.ok(accepted.includes(`${first.orderId}-C2`));assert.ok(!accepted.includes(`${first.orderId}-C1`));
 account=await h.command('account.save',{id:account.id,revision:account.revision,value:{...account.value,termsDays:7,prices:[{sku:'OAT-1',unitCents:9999,minQty:1}]}});
 assert.equal(await download(body,buyer),csv);
 for(const [payload,status] of [[{confirmations:[]},400],[{confirmations:[null]},400],[{confirmations:[first,first]},400],[{confirmations:[{...first,number:0}]},400],[{confirmations:[{...first,number:999}]},404],[{confirmations:[{orderId:draft.id,number:1}]},404],[{...body,layout:'missing'},404]])await h.api(exportPath,payload,{status});
 for(const actor of [other]) {
  await h.api(selectionPath,{orderIds:ids},{...actor,status:404});
  const denied=await h.request(exportPath,{...actor,method:'POST',body});assert.equal(denied.status,404);assert.ok(!(await denied.text()).includes('SPRING-'));
 }
 // One foreign order rejects the whole selection, including otherwise authorized rows.
 const foreignCustomer=await pier.command('party.save',{name:'Separate buyer',kind:'customer'});
 const foreign=await h.command('account.save',{id:'foreign',value:{...accountValue(foreignCustomer.id,'foreign@example.test'),name:'Separate buyer',minimumCents:0}});
 let foreignOrder=await h.command('order.prepare',{accountId:foreign.id,reference:'PRIVATE-OTHER',lines:[{sku:'OAT-1',quantity:2}]});foreignOrder=await h.command('order.submit',{orderId:foreignOrder.id});
 await h.api(exportPath,{confirmations:[first,{orderId:foreignOrder.id,number:1}]},{...buyer,status:404});
 await h.api(exportPath,{...body,layout},{...buyer,status:403});
 const {token}=await h.api('/api/barrow/agent-token',{}),agent={as:'',headers:{authorization:`Bearer ${token}`}};
 await h.api(selectionPath,{orderIds:ids},{...agent,status:403});await h.api(exportPath,body,{...agent,status:403});
 await h.api(exportPath,body,{headers:{origin:'https://foreign.example.test'},status:403});
 await h.api(exportPath,body,{as:'',status:401});
 const target=await installation();t.after(()=>target.close());await restore(target,await archive(h));
 assert.equal(await(await target.request(exportPath,{method:'POST',body:{...body,layout}})).text(),csv);
});
