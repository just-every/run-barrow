import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import {jpeg,withExif,imageSha} from '../fixtures/confirmation-image.mjs';
import { installation, stock, accountValue, archive, restore, activateStaff } from './harness.mjs';
import { sheetFixture, csvRows } from './line-sheet-fixture.mjs';
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

const sized=skus=>skus.map(sku=>({sku,style:'TEE-BLUE',color:'Blue',size:sku.split('-').at(-1)}));
// A 4x6 RGB JPEG; the test adds an EXIF segment that Barrow must strip before hashing and embedding.

test('ORD-014: a seasonal matrix order with two ship windows is confirmed with seller identity and variants, revised once by its buyer, emailed per exact revision and kept for buyer and rep',async t=>{
 const f=await sheetFixture(t),{h,buyers,sheet,skus}=f,year=new Date().getUTCFullYear()+1,w1=[`${year}-03-02`,`${year}-03-14`],w2=[`${year}-03-16`,`${year}-03-30`];
 await h.command('seller.identity',{revision:null,legalName:'Wrong buyer edit',address:'Nowhere'},{...buyers.cedar,status:403});
 const identity=await h.command('seller.identity',{revision:null,legalName:'Mill House Apparel LLC',address:'12 Spring St, New York, NY',registration:'synthetic-barrow-7'});
 let catalog=await h.command('variant.attributes',{revision:(await h.api('/api/barrow/variant-attributes')).revision,variants:sized(skus)});
 for(const [payload,who,status] of [[{sku:skus[2],contentBase64:Buffer.from('%PDF-1.4 synthetic').toString('base64')},{},400],[{sku:'UNRECORDED',contentBase64:withExif.toString('base64')},{},404],[{sku:skus[2],contentBase64:withExif.toString('base64')},buyers.cedar,403]])await h.command('variant.image',{revision:catalog.revision,...payload},{...who,status});
 catalog=await h.command('variant.image',{revision:catalog.revision,sku:skus[2],contentBase64:withExif.toString('base64')});
 assert.deepEqual(catalog.variants[skus[2]].image,{sha256:imageSha,width:4,height:6,size:jpeg.length});
 await h.command('terms.publish',{series:'Wholesale terms',title:'Wholesale terms 2027',body:'Synthetic cancellation and returns terms.'});
 await h.command('terms.assign',{accountId:'cedar',series:'Wholesale terms',requireAcceptance:true});
 const rep=await activateStaff(h,'rep@example.test',{role:'rep',accounts:[],warehouses:[],reports:[],discountLimitCents:0,stockExceptionLimitCents:0});
 await h.command('rep.assign',{userId:rep.id,kind:'account',target:'cedar',reason:'The rep sells Cedar.'});
 const window=([requestedDate,cancelAfter])=>({requestedDate,cancelAfter});
 let order=await h.command('order.prepare',{accountId:'cedar',lineSheetId:sheet.id,lineSheetRevision:sheet.revision,reference:'SPRING-MATRIX',lines:[{sku:skus[0],quantity:4,...window(w1)},{sku:skus[1],quantity:6,...window(w1)},{sku:skus[2],quantity:2,...window(w2)}]},buyers.cedar);
 assert.equal(order.season,`Spring ${year}`);
 assert.deepEqual(order.lines.map(l=>l.image?.sha256),[undefined,undefined,imageSha]);
 assert.deepEqual(order.lines.map(l=>[l.style,l.color,l.size,l.requestedDate,l.cancelAfter]),[['TEE-BLUE','Blue','S',...w1],['TEE-BLUE','Blue','M',...w1],['TEE-BLUE','Blue','3XL',...w2]]);
 order=await h.command('order.submit',{orderId:order.id,termsAcceptance:{version:1,accepted:true}},buyers.cedar);
 const path=`/api/barrow/orders/${order.id}/confirmations`;
 const download=async(number,who)=>{
  const pdf=await h.request(`${path}/${number}.pdf`,who),csv=await h.request(`${path}/${number}.csv`,who);assert.equal(pdf.status,200);assert.equal(csv.status,200);
  const text=Buffer.from(await pdf.arrayBuffer()).toString('latin1');
  for(const value of ['Seller: Mill House Apparel LLC',`Season: Spring ${year}`,`Ship windows: ${w1[0]} to cancel ${w1[1]}; ${w2[0]} to cancel ${w2[1]}`,'Style TEE-BLUE | Color Blue | Size 3XL',`Ship window: ${w2[0]} | Cancel after: ${w2[1]}`,'Sales terms: Wholesale terms 2027','Terms accepted by the buyer in the portal',`Image sha256 ${imageSha}`,'/Subtype /Image /Width 4 /Height 6 /ColorSpace /DeviceRGB',jpeg.toString('latin1')])assert.ok(text.includes(value),value);
  assert.ok(!text.includes('GPS-1234'));
  return {pdf:text,csv:await csv.text()};
 };
 const c1=await download(1,buyers.cedar);assert.deepEqual(await download(1,rep.who),c1);
 const first=csvRows(c1.csv).rows;
 assert.deepEqual(first.map(r=>[r.sku,r.style,r.color,r.size,r.requested_date,r.cancel_after,r.season,r.quantity]),[[skus[0],'TEE-BLUE','Blue','S',...w1,`Spring ${year}`,'4'],[skus[1],'TEE-BLUE','Blue','M',...w1,`Spring ${year}`,'6'],[skus[2],'TEE-BLUE','Blue','3XL',...w2,`Spring ${year}`,'2']]);
 assert.ok(first.every(r=>r.seller==='Mill House Apparel LLC | 12 Spring St, New York, NY | synthetic-barrow-7'));assert.deepEqual(first.map(r=>r.image_sha256),['','',imageSha]);
 // Only the buyer revises a submitted order; stale, unaccepted-terms and supplier attempts change nothing.
 const change={orderId:order.id,revision:order.revision,changes:[{line:1,quantity:3}]},accept={termsAcceptance:{version:1,accepted:true}};
 await h.command('order.revise',{...change,...accept},{...rep.who,status:403});
 await h.command('order.revise',{...change,...accept},{status:403});
 await h.command('order.revise',{...change,revision:'stale',...accept},{...buyers.cedar,status:409});
 assert.equal((await h.command('order.revise',change,{...buyers.cedar,status:409})).error.code,'TERMS_REQUIRED');
 await h.command('order.revise',{...change,changes:[{line:1,quantity:6}],...accept},{...buyers.cedar,status:400});
 order=await h.command('order.revise',{...change,...accept},buyers.cedar);
 assert.equal(order.status,'submitted');
 const records=(await h.api(path,undefined,rep.who)).confirmations;
 assert.deepEqual(records.map(r=>[r.number,r.stage]),[[1,'submitted'],[2,'revised']]);
 assert.equal(records[1].snapshot.revises,1);assert.deepEqual(records[1].snapshot.changes,[{line:1,sku:skus[1],unit:'each',before:{quantity:6,lineCents:7206},after:{quantity:3,lineCents:3603}}]);
 const c2=await download(2,rep.who);assert.deepEqual(await download(2,buyers.cedar),c2);
 assert.ok(c2.pdf.includes(`Revises confirmation C1: line 2 ${skus[1]} quantity 6 -> 3`));
 // Both revisions stay downloadable and differ only in the changed line (plus their own identity and total).
 const own=['confirmation','stage','recorded_at','order_revision','order_total_cents'],strip=row=>Object.fromEntries(Object.entries(row).filter(([key])=>!own.includes(key)));
 const before=first.map(strip),after=csvRows(c2.csv).rows.map(strip);
 assert.deepEqual(after[0],before[0]);assert.deepEqual(after[2],before[2]);
 assert.deepEqual(Object.keys(before[1]).filter(key=>before[1][key]!==after[1][key]),['quantity','base_quantity','line_cents']);
 assert.deepEqual(await download(1,buyers.cedar),c1);
 for(const suffix of ['','/1.pdf','/2.csv'])assert.equal((await h.request(path+suffix,buyers.wren)).status,404);
 // A size-matrix layout puts recorded sizes across, one row per ship window.
 let layouts=await h.api('/api/barrow/confirmation-layouts');
 await h.command('confirmation-layout.save',{revision:layouts.revision,name:'Wrong matrix',shape:'matrix',columns:['sku']},{status:400});
 layouts=await h.command('confirmation-layout.save',{revision:layouts.revision,name:'Cutting matrix',shape:'matrix',columns:['confirmation','po','style','color','requested_date','cancel_after']});
 const matrix=csvRows(await(await h.request(`${path}/2.csv?layout=${layouts.layouts.at(-1).id}`,rep.who)).text());
 assert.deepEqual(matrix.header,['confirmation','po','style','color','requested_date','cancel_after','unit','S','M','3XL']);
 assert.deepEqual(matrix.rows.map(r=>[r.requested_date,r.S,r.M,r['3XL']]),[[w1[0],'4','3',''],[w2[0],'','','2']]);
 // Each recorded revision is emailed once to the account contact with links to that exact revision only.
 order=await h.command('order.approve',{orderId:order.id});
 await h.command('order.revise',{orderId:order.id,revision:order.revision,changes:[{line:0,quantity:2}],...accept},{...buyers.cedar,status:409});
 const promise=(await f.pier.api('/api/pier/state')).orders.find(o=>o.id===order.pierOrderId).promiseDate;assert.equal(promise,w1[0]);
 assert.deepEqual((await h.api(`/api/barrow/orders/${order.id}/timeline`,undefined,buyers.cedar)).entries.filter(e=>e.confirmation).map(e=>[e.confirmation,e.state]),[[1,'Order confirmation recorded'],[2,'Order confirmation recorded'],[3,'Order confirmation recorded']]);
 const sent=h.mail.requests.map(r=>r.message).filter(m=>m.subject.startsWith(`Order confirmation ${order.id}`));
 assert.deepEqual(sent.map(m=>[m.to,m.subject]),[[['buyer@example.test'],`Order confirmation ${order.id}-C1 (submitted)`],[['buyer@example.test'],`Order confirmation ${order.id}-C2 (revised)`],[['buyer@example.test'],`Order confirmation ${order.id}-C3 (accepted)`]]);
 const link=sent[1].text.match(/https?:\/\/\S+\/confirmations\/2\.pdf/)[0];assert.ok(sent[1].html.includes(link));assert.ok(!sent[1].text.includes('3603')&&!sent[1].text.includes('TEE-BLUE'));
 assert.equal(Buffer.from(await(await h.request(new URL(link).pathname,buyers.cedar)).arrayBuffer()).toString('latin1'),c2.pdf);
 assert.equal((await h.request(new URL(link).pathname,buyers.wren)).status,404);
 assert.deepEqual(Object.entries((await h.api(path,undefined,buyers.cedar)).emails).map(([number,email])=>[number,email.status]),[['1','accepted'],['2','accepted'],['3','accepted']]);
 // A later seller identity or removed image never rewrites recorded documents; restore keeps both revisions byte-identical and sends nothing.
 await h.command('seller.identity',{revision:identity.revision,legalName:'Renamed Seller LLC',address:'1 Other St'});
 await h.command('variant.image',{revision:(await h.api('/api/barrow/variant-attributes')).revision,sku:skus[2],remove:true});
 assert.deepEqual(await download(1,buyers.cedar),c1);
 const target=await installation();t.after(()=>target.close());await restore(target,await archive(h));
 for(const number of [1,2])assert.equal(await(await target.request(`${path}/${number}.csv`)).text(),await(await h.request(`${path}/${number}.csv`)).text());
 assert.equal(Buffer.from(await(await target.request(`${path}/1.pdf`)).arrayBuffer()).toString('latin1'),c1.pdf);
 assert.equal(target.mail.requests.length,0);
});

test('ORD-014: fifty recorded orders of one season export per line and as style, color and size production totals equal to their lines',async t=>{
 const f=await sheetFixture(t),{h,buyers,sheet,skus}=f,year=new Date().getUTCFullYear()+1,season=`Spring ${year}`;
 await h.command('variant.attributes',{revision:null,variants:sized(skus)});
 const summer=await h.command('sheet.publish',{accountId:'cedar',name:'Summer collection',season:`Summer ${year}`,display:'both',shipStart:`${year}-06-01`,shipEnd:`${year}-06-30`,skus});
 const prepare=(s,reference,lines)=>h.command('order.prepare',{accountId:'cedar',lineSheetId:s.id,lineSheetRevision:s.revision,reference,lines},buyers.cedar);
 const ids=[];
 for(let i=0;i<50;i++){const o=await prepare(sheet,`SPRING-${i+1}`,[{sku:skus[0],quantity:i%3+1},{sku:skus[1],quantity:2},{sku:skus[2],quantity:i%2+1}]);await h.command('order.submit',{orderId:o.id},buyers.cedar);ids.push(o.id)}
 for(const reference of ['SUMMER-1','SUMMER-2']){const o=await prepare(summer,reference,[{sku:skus[0],quantity:5}]);await h.command('order.submit',{orderId:o.id},buyers.cedar)}
 await prepare(sheet,'SPRING-DRAFT',[{sku:skus[0],quantity:9}]);
 const choice=await h.api('/api/barrow/confirmations/selection',{season});
 assert.equal(choice.season,season);assert.deepEqual(choice.orders.map(o=>o.orderId),ids);assert.ok(choice.orders.every(o=>o.season===season&&o.confirmations.length===1));
 await h.api('/api/barrow/confirmations/selection',{season},{...buyers.wren,status:404});
 const confirmations=choice.orders.map(o=>({orderId:o.orderId,number:o.confirmations.at(-1).number}));
 const exported=async body=>{const response=await h.request('/api/barrow/confirmations/export.csv',{method:'POST',body});assert.equal(response.status,200);return csvRows(await response.text())};
 const lines=await exported({confirmations});
 assert.equal(lines.rows.length,150);assert.equal(new Set(lines.rows.map(r=>r.order)).size,50);assert.ok(lines.rows.every(r=>r.season===season&&!r.po.startsWith('SUMMER')));
 const totals=await exported({confirmations,shape:'totals'}),expected=new Map();
 for(const r of lines.rows)expected.set([r.style,r.color,r.size].join('|'),(expected.get([r.style,r.color,r.size].join('|'))??0)+Number(r.base_quantity));
 assert.deepEqual(totals.rows.map(r=>[[r.style,r.color,r.size].join('|'),Number(r.base_quantity)]),[...expected]);
 assert.deepEqual([...expected.values()],[99,100,75]);
 assert.ok(totals.rows.every(r=>r.order_count==='50'&&r.line_count==='50'&&r.sources.split(' ').length===50&&r.base_unit==='each'));
 assert.deepEqual(new Set(totals.rows[0].sources.split(' ')),new Set(lines.rows.map(r=>r.confirmation)));
 await h.api('/api/barrow/confirmations/export.csv',{confirmations,shape:'pivot'},{status:400});
});

async function prebookFixture(t,networkEdge) {
 const pier=await installation({pier:true});t.after(()=>pier.close());const inventory=await stock(pier,'2');
 const po=await pier.command('po.draft',{supplierId:inventory.supplier.id,destinationWarehouse:'New York',promiseDate:'2035-03-01',reason:'Synthetic seasonal supply',lines:[{itemId:inventory.item.id,quantity:'30',price:'20.00'}]});
 await pier.command('po.approve',{poId:po.id,version:po.version});await pier.command('po.commit',{poId:po.id,version:po.version});
 const h=await installation({bindings:{PIER_ORIGIN:pier.origin,PIER_SESSION:pier.cookie},networkEdge:networkEdge?.(pier)});t.after(()=>h.close());
 const account=await h.command('account.save',{id:'cedar',value:{...accountValue(inventory.customer.id),minimumCents:0,warehouses:['New York'],prices:[{sku:'OAT-1',unitCents:101,minQty:1,units:[{code:'pair',baseQuantity:'2',unitCents:201,packContents:'Two base cases'}]}]}}),buyer={as:await h.signIn('buyer@example.test')};
 const season=await h.command('prebook.season',{id:'spring-2035',name:'Spring 2035',opensAt:'2020-01-01T00:00:00Z',closesAt:'2034-12-31T23:59:59Z',depositBps:5000,reason:'Owner published seasonal intake.'});
 const prepare=(lines,extra={},who=buyer)=>h.command('prebook.prepare',{accountId:'cedar',seasonId:season.id,lines,...extra},who);
 const line=(quantity=10,unit='case',requestedDate='2035-03-02',cancelAfter='2035-03-20')=>({sku:'OAT-1',unit,quantity,requestedDate,cancelAfter});
 const submit=(book,who=buyer)=>h.command('prebook.commit',{prebookId:book.id,revision:book.revision},who);
 return {h,pier,inventory,account,buyer,season,prepare,line,submit};
}

test('seasonal prebook intake holds competing future demand atomically without reserving available stock or recording a payment',async t=>{
 let synchronize=false,arrivals=0,releasePricing,releaseCapacity;
 const pricingBarrier=new Promise(resolve=>releasePricing=resolve),capacityBarrier=new Promise(resolve=>releaseCapacity=resolve);
 const f=await prebookFixture(t,pier=>async request=>{
  if(synchronize&&new URL(request.url).pathname==='/api/pier/state'){
   arrivals++;
   if(arrivals<=2){if(arrivals===2)releasePricing();await pricingBarrier}
   else{if(arrivals===4)releaseCapacity();await capacityBarrier}
   return pier.raw('/api/pier/state',{headers:{cookie:pier.cookie}});
  }
 }),{h,pier,prepare,line,submit,buyer}=f;
 await h.command('order.prepare',{accountId:'cedar',lines:[{sku:'OAT-1',quantity:3}]},{...buyer,status:409});
 const a=await prepare([line(10,'pair')]),b=await prepare([line(20)]);
 assert.deepEqual(a.lines.map(l=>[l.unit,l.quantity,l.baseQuantity,l.unitCents,l.lineCents]),[['pair',10,'20',201,2010]]);
 assert.deepEqual(a.deposit,{requiredCents:1005,currency:'USD',collectedCents:null});
 assert.equal(a.state,'draft');assert.equal((await pier.api('/api/pier/state')).orders.length,0);
 const first=await submit(a);assert.equal(first.state,'committed');
 await submit(b).then(()=>assert.fail('Competing demand must be refused'),error=>assert.match(error.message,/PREBOOK_CAPACITY/));
 const c=await prepare([line(5)]),d=await prepare([line(6)]);
 // 10 base units remain. The concurrent requests cannot both admit 11.
 synchronize=true;
 const outcomes=await Promise.all([c,d].map(book=>h.request('/api/barrow/commands',{...buyer,method:'POST',body:{type:'prebook.commit',payload:{prebookId:book.id,revision:book.revision}}})));
 synchronize=false;
 assert.equal(arrivals,4);assert.deepEqual(outcomes.map(r=>r.status).sort(),[200,409]);
 const records=(await h.db.prepare("SELECT value_json FROM bw_prebooks WHERE json_extract(value_json,'$.state')='committed'").all()).results.map(r=>JSON.parse(r.value_json));
 assert.equal(records.length,2);assert.ok(records.reduce((n,r)=>n+Number(r.lines[0].baseQuantity),0)<=30);
 assert.deepEqual(await submit(a),first);
 assert.equal((await pier.api('/api/pier/state')).orders.length,0);
 for(const type of ['order.submit','order.approve','order.cancel','order.revise','shipping.select'])await h.command(type,{orderId:a.id,reason:'Attempt ordinary mutation',changes:[{line:0,quantity:1}]},{...buyer,status:404});
 assert.equal((await h.request(`/api/barrow/invoices/${a.id}.csv`,buyer)).status,404);
 assert.equal((await h.request('/api/barrow/payments?orderId='+a.id,buyer)).status,404);
 const exported=await h.api('/api/barrow/export.json',undefined,buyer);assert.deepEqual(exported.cardpayments,[]);assert.deepEqual(exported.invoices,[]);assert.equal(exported.prebooks.length,2+2);assert.equal(exported.manifest.counts.prebooks,4);
 assert.equal((await h.api('/api/barrow/prebooks/'+a.id,undefined,buyer)).deposit.collectedCents,null);
 const target=await installation();t.after(()=>target.close());await restore(target,await archive(h));
 assert.deepEqual(await target.api('/api/barrow/prebooks/'+a.id),first);
 await target.command('prebook.prepare',{accountId:'cedar',seasonId:'spring-2035',lines:[line(1)]},{status:409});
 assert.equal((await target.api('/api/barrow/export.json')).prebooks.length,4);
});

test('seasonal prebook preparation enforces published opening and closing instants, required future windows, exact deposits and attributed closure',async t=>{
 const f=await prebookFixture(t),{h,pier,inventory,account,buyer,season,prepare,line,submit}=f;
 for(const invalid of [{...line(),requestedDate:undefined},{...line(),cancelAfter:undefined},line(1,'case','2020-01-01'),line(1,'case','2035-03-02','2035-03-01'),line(1,'undefined'),line(1,'pair','2035-02-28')])await h.command('prebook.prepare',{accountId:'cedar',seasonId:season.id,lines:[invalid]},{...buyer,status:invalid.requestedDate==='2035-02-28'?409:400});
 const exact=await prepare([line(1)]);assert.deepEqual(exact.deposit,{requiredCents:51,currency:'USD',collectedCents:null});
 const half=await prepare([line(1,'pair')]);assert.equal(half.deposit.requiredCents,101);
 const other={as:await h.signIn('other@example.test')};assert.equal((await h.request('/api/barrow/prebooks/'+exact.id,other)).status,404);
 const future=await h.command('prebook.season',{id:'future',name:'Future',opensAt:'2034-01-01T00:00:00Z',closesAt:'2034-12-31T00:00:00Z',depositBps:3000,reason:'Published future opening.'});
 await h.command('prebook.prepare',{accountId:'cedar',seasonId:future.id,lines:[line()]},{...buyer,status:409});
 const expired=await h.command('prebook.season',{id:'expired',name:'Expired',opensAt:'2020-01-01T00:00:00Z',closesAt:'2021-01-01T00:00:00Z',depositBps:3000,reason:'Past closing instant.'});
 await h.command('prebook.prepare',{accountId:'cedar',seasonId:expired.id,lines:[line()]},{...buyer,status:409});
 await h.command('prebook.close',{id:season.id,revision:season.revision,reason:'Buyer is not season owner.'},{...buyer,status:403});
 const closed=await h.command('prebook.close',{id:season.id,revision:season.revision,reason:'Season intake finished.'});
 const owner=(await h.db.prepare("SELECT id FROM oa_operators WHERE role='owner'").first()).id;
 assert.deepEqual(closed.closed,{by:owner,at:closed.closed.at,reason:'Season intake finished.'});assert.ok(Number.isFinite(Date.parse(closed.closed.at)));
 const event=await h.db.prepare("SELECT actor_id,created_at,context_json FROM bw_audit WHERE action='prebook.close'").first();assert.equal(event.actor_id,owner);assert.equal(JSON.parse(event.context_json).reason,'Season intake finished.');assert.ok(Math.abs(Date.parse(event.created_at)-Date.parse(closed.closed.at))<1000);
 await submit(exact).then(()=>assert.fail('Closed intake must refuse commitment'),error=>assert.match(error.message,/PREBOOK_CLOSED/));
 await h.command('prebook.prepare',{accountId:'cedar',seasonId:season.id,lines:[line()]},{...buyer,status:409});
 assert.equal((await pier.api('/api/pier/state')).orders.length,0);
});

test('seasonal prebook admission rechecks live commercial authority and preserves the accepted snapshot after later configuration changes',async t=>{
 const {h,pier,inventory,account,buyer,prepare,line,submit}=await prebookFixture(t);
 const original=await prepare([line(2)]);
 const brand=await h.command('brand.save',{id:'spring-brand',value:{name:'Spring Brand',currency:'CAD',seller:{legalName:'Synthetic supplier',address:'12 Spring St'}}});
 let profile=await h.command('profile.save',{id:'spring-profile',accountId:'cedar',value:{brandId:brand.id,name:'Spring CAD',prices:[{sku:'OAT-1',unitCents:151,minQty:2}],minimumCents:500,termsDays:15}});
 await h.command('prebook.prepare',{accountId:'cedar',profileId:profile.id,seasonId:'spring-2035',lines:[line(4)]},{...buyer,status:404});
 const member=(await h.api('/api/barrow/company/members?accountId=cedar',undefined,buyer)).members.find(m=>m.email==='buyer@example.test');
 await h.command('profile.grant',{profileId:profile.id,userId:member.userId,approved:true,reason:'Explicit seasonal profile approval.'});
 await h.command('prebook.prepare',{accountId:'cedar',profileId:profile.id,seasonId:'spring-2035',lines:[line(1)]},{...buyer,status:409});
 await h.command('prebook.prepare',{accountId:'cedar',profileId:profile.id,seasonId:'spring-2035',lines:[line(2)]},{...buyer,status:409});
 const branded=await prepare([line(4)],{profileId:profile.id});assert.equal(branded.currency,'CAD');assert.equal(branded.totalCents,604);assert.equal(branded.buyingProfile.seller.legalName,'Synthetic supplier');
 await h.command('profile.grant',{profileId:profile.id,userId:member.userId,approved:false,reason:'Purchasing approval revoked before commitment.'});
 await submit(branded).then(()=>assert.fail('Revoked profile must refuse'),error=>assert.match(error.message,/NOT_FOUND/));
 const committed=await submit(original);assert.equal(committed.totalCents,202);
 const changed=await h.command('account.save',{id:'cedar',revision:account.revision,value:{...account.value,termsDays:7,prices:[{sku:'OAT-1',unitCents:999,minQty:1}]}});
 assert.deepEqual(await h.api('/api/barrow/prebooks/'+committed.id,undefined,buyer),committed);
 await h.command('profile.grant',{profileId:profile.id,userId:member.userId,approved:true,reason:'Restored deliberate profile approval.'});
 const stale=await prepare([line(4)],{profileId:profile.id});
 await h.command('profile.save',{id:profile.id,accountId:'cedar',revision:profile.revision,value:{...profile.value,prices:[{sku:'OAT-1',unitCents:152,minQty:2}]}});
 await submit(stale).then(()=>assert.fail('Changed profile must refuse'),error=>assert.match(error.message,/PROFILE_CHANGED/));
 // Incoming supply in an unpermitted destination or without a known destination is never admitted.
 const restricted=await h.command('account.save',{id:'cedar',revision:changed.revision,value:{...changed.value,warehouses:['Newark']}});
 await h.command('prebook.prepare',{accountId:'cedar',seasonId:'spring-2035',lines:[line(1)]},{...buyer,status:409});
 await h.command('account.save',{id:'cedar',revision:restricted.revision,value:{...restricted.value,warehouses:['New York']}});
 const unknown=await pier.command('po.draft',{supplierId:inventory.supplier.id,promiseDate:'2035-03-01',reason:'Unknown receiving warehouse',lines:[{itemId:inventory.item.id,quantity:'100',price:'20.00'}]});
 await pier.command('po.approve',{poId:unknown.id,version:unknown.version});await pier.command('po.commit',{poId:unknown.id,version:unknown.version});
 await h.command('prebook.prepare',{accountId:'cedar',seasonId:'spring-2035',lines:[line(31)]},{...buyer,status:409});
 assert.equal((await pier.api('/api/pier/state')).orders.length,0);
});

test('seasonal prebook commitment refuses stale observations and company purchasing limits without losing the reviewed draft',async t=>{
 const {h,buyer,prepare,line,submit}=await prebookFixture(t);
 const book=await prepare([line(4)]);
 const members=(await h.api('/api/barrow/company/members?accountId=cedar',undefined,buyer)).members,member=members.find(m=>m.email==='buyer@example.test');
 const limited=await h.command('company.update',{accountId:'cedar',memberId:member.id,revision:member.revision,policy:{rights:member.rights,locations:'all',perOrderLimitCents:300,approvalLimitCents:null},reason:'Company reduced this purchaser allowance.'});
 await submit(book).then(()=>assert.fail('Current purchasing limit must refuse'),error=>assert.match(error.message,/COMPANY_APPROVAL/));
 assert.equal((await h.api('/api/barrow/prebooks/'+book.id,undefined,buyer)).state,'draft');
 await h.command('company.update',{accountId:'cedar',memberId:limited.id,revision:limited.revision,policy:{rights:member.rights,locations:'all',perOrderLimitCents:null,approvalLimitCents:null},reason:'Company restored this purchaser allowance.'});
 await h.command('settings.save',{stockFreshnessMinutes:15});
 // Move only the source-observation fixture back twenty minutes; assertions do not depend on a date boundary.
 const older={...book,preparedAt:new Date(Date.now()-20*60000).toISOString()};await h.db.prepare('UPDATE bw_prebooks SET value_json=? WHERE id=?').bind(JSON.stringify(older),book.id).run();
 await submit(book).then(()=>assert.fail('Stale observation must refuse'),error=>assert.match(error.message,/STOCK_STALE/));
 const refreshed=await prepare([line(4)]),accepted=await submit(refreshed);assert.equal(accepted.state,'committed');assert.equal(accepted.totalCents,404);
 const supplier={};await h.command('prebook.commit',{prebookId:book.id,revision:book.revision},{...supplier,status:403});
 const {token}=await h.api('/api/barrow/agent-token',{});await h.command('prebook.prepare',{accountId:'cedar',seasonId:'spring-2035',lines:[line(1)]},{as:'',headers:{authorization:`Bearer ${token}`},status:403});
});
