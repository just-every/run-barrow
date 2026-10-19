import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {installation,stock,accountValue,archive,restore} from './harness.mjs';

const cells=text=>{const [columns,...rows]=text.trim().split('\r\n').map(row=>row.slice(1,-1).split('","'));return rows.map(row=>Object.fromEntries(columns.map((key,i)=>[key,row[i]])))};
test('BAR-002: USD and legacy AUD orders retain exact human snapshots, one acknowledged Pier handoff, and invoice only fully eligible quantities',async t=>{
 const pier=await installation({pier:true});t.after(()=>pier.close());const source=await stock(pier,'120');
 const attempts=new Map();
 // The real stock authority executes each command; only the first response is lost.
 const proxy=createServer(async(request,response)=>{
  try{
   const chunks=[];for await(const chunk of request)chunks.push(chunk);
   const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):undefined;
   const upstream=await pier.request(request.url,{method:request.method,...(body?{body}:{})}),bytes=Buffer.from(await upstream.arrayBuffer());
   if(body?.type==='order.create'){
    const count=(attempts.get(body.commandId)??0)+1;attempts.set(body.commandId,count);
    if(count===1){assert.ok(upstream.ok);response.destroy();return}
   }
   response.writeHead(upstream.status,{'content-type':upstream.headers.get('content-type')??'application/json'});response.end(bytes);
  }catch(error){response.destroy(error)}
 });proxy.listen(0,'127.0.0.1');await once(proxy,'listening');t.after(async()=>{proxy.closeAllConnections();await new Promise(resolve=>proxy.close(resolve))});
 const h=await installation({bindings:{PIER_ORIGIN:`http://127.0.0.1:${proxy.address().port}`,PIER_SESSION:pier.cookie}});t.after(()=>h.close());
 let account=await h.command('account.save',{id:'cedar',value:{...accountValue(source.customer.id),prices:[{sku:'OAT-1',unitCents:6501,minQty:1}]}});
 const buyer=await h.signIn(account.value.email),as={as:buyer},buyerId=(await h.api('/api/barrow/state',undefined,as)).actor.id,ownerId=(await h.api('/api/barrow/state')).actor.id;
 const prepare=async(currency,quantity,reference)=>{
  let order=await h.command('order.prepare',{accountId:account.id,reference,lines:[{sku:'OAT-1',quantity}]},as);
  // Historical test fixture only: pre-currency orders have no currency field.
  if(currency==='AUD'){delete order.currency;await h.db.prepare('UPDATE bw_orders SET value_json=? WHERE id=?').bind(JSON.stringify(order),order.id).run()}
  return order;
 };
 const originals=[];
 for(const currency of ['USD','AUD']){
  const draft=await prepare(currency,3,`PO-${currency}-SNAPSHOT`);assert.equal(draft.preparedBy,buyerId);assert.equal(draft.totalCents,19503);assert.equal(draft.termsDays,30);
  await h.command('order.submit',{orderId:draft.id},as);
  const lost=await h.command('order.approve',{orderId:draft.id},{status:503});assert.equal(lost.error.code,'PIER_UNAVAILABLE');
  const pending=(await h.api('/api/barrow/state',undefined,as)).orders.find(o=>o.id===draft.id);assert.equal(pending.status,'reserving');assert.equal(pending.invoice,undefined);assert.equal(pending.submittedBy,buyerId);assert.equal(pending.approvedBy,ownerId);assert.ok(pending.approvedAt);
  assert.equal((await h.request(`/api/barrow/invoices/${draft.id}.csv`,as)).status,409);
  const approved=await h.command('order.approve',{orderId:draft.id});await h.command('order.approve',{orderId:draft.id});assert.equal(approved.status,'approved');assert.ok(approved.pierOrderId);assert.ok(approved.pierReference);
  const upstream=(await pier.api('/api/pier/state')).orders.filter(o=>o.id===approved.pierOrderId);assert.equal(upstream.length,1);assert.equal(upstream[0].lines[0].quantity,'3');assert.equal(upstream[0].lines[0].reserved,'3');assert.equal(attempts.get(`barrow-${draft.id}`),2);
  const text=await (await h.request(`/api/barrow/invoices/${draft.id}.csv`,as)).text(),[line]=cells(text);assert.equal(line.currency,currency);assert.equal(line.quantity,'3');assert.equal(line.unit_cents,'6501');assert.equal(line.line_cents,'19503');assert.equal(line.invoice_total_cents,'19503');assert.equal(line.customer_reference,`PO-${currency}-SNAPSHOT`);
  const due=new Date(approved.invoice.issuedAt+'T00:00:00Z');due.setUTCDate(due.getUTCDate()+30);assert.equal(approved.invoice.dueAt,due.toISOString().slice(0,10));
  originals.push({approved,text});
 }
 // Real stock contention after draft preparation produces explicit shortfalls, never invoices.
 const shorts=[];for(const currency of ['USD','AUD'])shorts.push(await prepare(currency,10,`PO-${currency}-SHORT`));
 await pier.command('order.create',{customerId:source.customer.id,lines:[{itemId:source.item.id,quantity:'112'}]});
 for(const [index,draft] of shorts.entries()){
  await h.command('order.submit',{orderId:draft.id},as);await h.command('order.approve',{orderId:draft.id},{status:503});const short=await h.command('order.approve',{orderId:draft.id});
  assert.equal(short.status,'shortfall');assert.equal(short.reservation[0].quantity,'10');assert.equal(short.reservation[0].reserved,index===0?'2':'0');assert.equal(short.invoice,undefined);assert.equal((await h.request(`/api/barrow/invoices/${draft.id}.csv`,as)).status,409);
 }
 account=await h.command('account.save',{id:account.id,revision:account.revision,value:{...account.value,termsDays:7,prices:[{sku:'OAT-1',unitCents:9999,minQty:1}]}});
 const target=await installation();t.after(()=>target.close());await restore(target,await archive(h));
 for(const {approved,text} of originals){
  assert.deepEqual((await h.api('/api/barrow/state',undefined,as)).orders.find(o=>o.id===approved.id),approved);
  assert.equal(await (await h.request(`/api/barrow/invoices/${approved.id}.csv`,as)).text(),text);
  assert.equal(await (await target.request(`/api/barrow/invoices/${approved.id}.csv`)).text(),text);
 }
 assert.equal((await pier.api('/api/pier/state')).orders.length,5);assert.ok([...attempts.values()].every(n=>n===2));
});
