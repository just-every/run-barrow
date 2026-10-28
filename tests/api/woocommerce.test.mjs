import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {installation,accountValue,archive,restore} from './harness.mjs';
import {controlledWoo,wooStock} from '../woocommerce-store.mjs';

test('controlled WooCommerce variation, protected prices, durable approval, source fulfillment and refunds survive replay while unsafe authority and stock paths refuse', {timeout:360000}, async t=>{
 const store=await controlledWoo();t.after(()=>store.close());const source=await wooStock(store);
 let lose=true,creates=0;
 const h=await installation({bindings:{...store.bindings,BARROW_TEST_CLOCK:'2026-10-28T12:00:00Z'},networkEdge:async request=>{
  if(new URL(request.url).pathname!=='/wp-json/barrow/v1/handoffs')return;
  creates++;const response=await fetch(request.url,{method:'POST',headers:Object.fromEntries([...request.headers].filter(([name])=>!['connection','transfer-encoding','content-length','host','expect'].includes(name))),body:await request.text()});
  if(lose){lose=false;throw Error('Synthetic lost acknowledgment after the real controlled store committed')}
  return response;
 }});t.after(()=>h.close());
 await h.command('woocommerce.connect',{reason:'Owner authorizes this controlled store as the sole stock authority.'});
 const email='synthetic-barrow-1'+'@'+'example.test';
 let account=await h.command('account.save',{id:'cedar',value:{...accountValue('unused-pier',email),minimumCents:0,providerReferences:{woocommerce:String(source.customer.id)},prices:[{sku:source.variation.sku,unitCents:6501,minQty:1}]}});
 const buyer={as:await h.signIn(email)},owner=(await h.api('/api/barrow/state')).actor.id;
 const catalog=await h.api('/api/barrow/catalogue?accountId=cedar',undefined,buyer);
 assert.equal(catalog.source,'WooCommerce');assert.equal(catalog.items[0].itemId,String(source.variation.id));assert.equal(catalog.items[0].unitCents,6501);assert.equal(catalog.items[0].available,'30');assert.equal(catalog.items[0].warehouses[0].warehouse,'Unknown warehouse');assert.match(catalog.incomingNote,/unknown/);assert.ok(Date.parse(catalog.observedAt));
 await h.command('woocommerce.revoke',{reason:'Buyer must not revoke a supplier credential.'},{...buyer,status:403});
 const draft=await h.command('order.prepare',{accountId:account.id,reference:'SYNTHETIC-APPROVED',lines:[{sku:source.variation.sku,quantity:3}]},buyer);
 assert.equal(draft.totalCents,19503);assert.equal(draft.termsDays,30);assert.equal(draft.currency,'USD');
 await h.command('settings.save',{stockFreshnessMinutes:15});await h.configure({BARROW_TEST_CLOCK:'2026-10-28T12:20:00Z'});
 const stale=await h.command('order.submit',{orderId:draft.id},{...buyer,status:409});assert.equal(stale.error.code,'STOCK_STALE');
 await h.command('order.stock-exception',{orderId:draft.id,reason:'Unauthorized buyer exception.'},{...buyer,status:403});
 await h.command('order.stock-exception',{orderId:draft.id,reason:'Owner rechecked the controlled source and accepts this observation.'});
 await h.command('order.submit',{orderId:draft.id},buyer);
 await h.command('order.approve',{orderId:draft.id},{...buyer,status:403});
 const lost=await h.command('order.approve',{orderId:draft.id},{status:503});assert.equal(lost.error.code,'WOO_UNAVAILABLE');
 const pending=(await h.api('/api/barrow/state')).orders.find(order=>order.id===draft.id);
 assert.equal(pending.status,'reserving');assert.equal(pending.approvedBy,owner);assert.equal(pending.pierOrderId,undefined);assert.equal((await h.request(`/api/barrow/invoices/${draft.id}.csv`,buyer)).status,409);
 assert.equal((await store.request('/wp-json/wc/v3/orders')).length,1);
 const approved=await h.command('order.approve',{orderId:draft.id});assert.equal(approved.status,'approved');assert.equal(creates,2);assert.equal(approved.woocommerce.identity,`barrow:${draft.id}`);assert.equal(approved.woocommerce.lines[0].reserved,'3');
 const external=(await store.request('/wp-json/wc/v3/orders'))[0];assert.equal(external.id,Number(approved.pierOrderId));assert.equal(external.total,'195.03');assert.equal(external.line_items[0].variation_id,source.variation.id);assert.equal(external.customer_id,source.customer.id);
 await h.command('order.approve',{orderId:draft.id});assert.equal((await store.request('/wp-json/wc/v3/orders')).length,1);assert.equal(creates,2);
 const invoice=await(await h.request(`/api/barrow/invoices/${draft.id}.csv`,buyer)).text();assert.match(invoice,/19503/);assert.match(invoice,/6501/);assert.match(invoice,/USD/);
 // Exact native Woo fulfillment and refund references, with no inference from an order status.
 const lineId=String(external.line_items[0].id);
 await store.request(`/wp-json/barrow/v1/orders/${external.id}/fulfillments`,{reference:'SYNTHETIC-SHIPMENT-1',lines:[{lineId,quantity:2}]});
 const refund=await store.request(`/wp-json/wc/v3/orders/${external.id}/refunds`,{amount:'65.01',reason:'Controlled source partial refund',api_refund:false,api_restock:false,line_items:[{id:Number(lineId),quantity:1,refund_total:65.01}]});
 const send=async event=>{const raw=JSON.stringify(event),signature=createHmac('sha256',store.bindings.WOO_WEBHOOK_SECRET).update(raw).digest('base64');return h.raw('/api/barrow/woocommerce/webhook',{method:'POST',headers:{'content-type':'application/json','x-wc-webhook-signature':signature},body:raw})};
 assert.equal((await h.raw('/api/barrow/woocommerce/webhook',{method:'POST',headers:{'x-wc-webhook-signature':'invalid'},body:JSON.stringify({id:external.id})})).status,401);
 assert.equal((await send({id:external.id,status:'completed'})).status,200);
 const linked=(await h.api(`/api/barrow/orders/${draft.id}`,undefined,buyer));
 assert.equal(linked.woocommerce.lines[0].dispatched,'2');assert.equal(linked.woocommerce.fulfillments[0].reference,'SYNTHETIC-SHIPMENT-1');assert.equal(linked.woocommerce.fulfillments[0].warehouse,null);assert.equal(linked.woocommerce.refunds[0].id,String(refund.id));assert.equal(linked.woocommerce.refunds[0].amount,'65.01');
 for(const event of [{id:external.id,status:'pending',refunds:[]},{id:external.id,status:'completed'}])assert.equal((await send(event)).status,200);
 assert.deepEqual((await h.api(`/api/barrow/orders/${draft.id}`,undefined,buyer)).woocommerce,linked.woocommerce);
 const variation=await store.request(`/wp-json/wc/v3/products/${source.product.id}/variations/${source.variation.id}`);assert.equal(variation.regular_price,'120.00');assert.equal(variation.stock_quantity,27);assert.equal((await store.request('/wp-json/wc/v3/orders')).length,1);
 account=await h.command('account.save',{id:account.id,revision:account.revision,value:{...account.value,termsDays:7,prices:[{sku:source.variation.sku,unitCents:9999,minQty:1}]}});
 assert.equal(await(await h.request(`/api/barrow/invoices/${draft.id}.csv`,buyer)).text(),invoice);
 // A short source allocation remains visible and cannot become a whole-order invoice.
 const short=await h.command('order.prepare',{accountId:account.id,lines:[{sku:source.variation.sku,quantity:5}]},buyer);await h.command('order.submit',{orderId:short.id},buyer);
 await store.request(`/wp-json/wc/v3/products/${source.product.id}/variations/${source.variation.id}`,{stock_quantity:2},'PUT');
 const shortfall=await h.command('order.approve',{orderId:short.id});assert.equal(shortfall.status,'shortfall');assert.equal(shortfall.woocommerce.lines[0].reserved,'2');assert.equal(shortfall.woocommerce.lines[0].backorder,'3');assert.equal((await h.request(`/api/barrow/invoices/${short.id}.csv`,buyer)).status,409);
 const other=await h.signIn('synthetic-barrow-other'+'@'+'example.test');assert.equal((await h.request(`/api/barrow/orders/${draft.id}`,{as:other})).status,404);assert.equal((await h.request(`/api/barrow/invoices/${draft.id}.csv`,{as:other})).status,404);
 account=await h.command('account.save',{id:account.id,revision:account.revision,value:{...account.value,warehouses:['Restricted warehouse']}});
 const restricted=await h.api('/api/barrow/catalogue?accountId=cedar',undefined,{...buyer,status:409});assert.equal(restricted.error.code,'WOO_WAREHOUSE');
 const audit=await h.api('/api/barrow/audit?accountId=cedar');assert.ok(audit.events.some(event=>event.action==='woocommerce.reconciled'&&event.orderId===draft.id&&event.source==='woocommerce.webhook'&&event.revision&&event.reason));
 const csv=await(await h.request('/api/barrow/audit.csv')).text();assert.match(csv,/woocommerce.connected/);assert.match(csv,/woocommerce.reconciled/);assert.ok(!csv.includes(store.bindings.WOO_KEY)&&!csv.includes(store.bindings.WOO_SECRET));assert.equal((await h.request('/api/barrow/audit',buyer)).status,403);
 await h.configure({WOO_ORIGIN:'http://127.0.0.1:1'});await h.command('order.approve',{orderId:approved.id},{status:503});
 await h.configure({WOO_ORIGIN:store.origin});await h.command('woocommerce.revoke',{reason:'Owner disables the source; signed replay must not reauthorize it.'});assert.equal((await send({id:external.id})).status,503);
 await h.command('woocommerce.connect',{reason:'Owner deliberately reconnects the same controlled destination.'});
 await store.revoke();await h.command('order.refresh',{orderId:approved.id},{status:503});
 assert.equal((await h.api(`/api/barrow/orders/${draft.id}`,undefined,buyer)).woocommerce.refunds[0].id,String(refund.id));
 console.log('CONTROLLED_WOOCOMMERCE',JSON.stringify({version:store.version,order:external.id,fulfillment:'SYNTHETIC-SHIPMENT-1',refund:refund.id,orders:2,retailPrice:'120.00'}));
});
