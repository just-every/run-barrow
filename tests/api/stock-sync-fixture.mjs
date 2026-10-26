import assert from 'node:assert/strict';
import {installation,stock,accountValue} from './harness.mjs';
export async function syncFixture(t,{pier: suppliedPier,built=false}={}) {
 const pier=suppliedPier??await installation({pier:true});if(!suppliedPier)t.after(()=>pier.close());
 const inventory=await stock(pier,'12');
 const holds=[];
 for(let n=0;n<2;n++)holds.push(await pier.command('order.create',{customerId:inventory.customer.id,lines:[{itemId:inventory.item.id,quantity:'6'}]}));
 let interrupt=false,fail=false;
 const h=await installation({built,https:true,bindings:{PIER_ORIGIN:pier.origin,PIER_SESSION:pier.cookie},networkEdge:async request=>{
  if(fail&&new URL(request.url).pathname.startsWith('/api/pier/stock-changes'))throw Error('Synthetic interrupted transport');
  if(interrupt&&new URL(request.url).pathname.endsWith('/stock-changes/ack')){interrupt=false;throw Error('Synthetic ACK interruption')}
 }});t.after(()=>h.close());
 const account=await h.command('account.save',{id:'synthetic-barrow-901',value:{...accountValue(inventory.customer.id),minimumCents:0,prices:[{sku:'OAT-1',unitCents:6500,minQty:1}]}});
 const buyer={as:await h.signIn(account.value.email)};
 await h.api('/api/barrow/state',undefined,buyer);
 const sync=async()=>{await new Promise(resolve=>setTimeout(resolve,1100));return (await h.command('stock.sync',{})).sync};
 const read=()=>h.api('/api/barrow/stock-watches?accountId='+account.id,undefined,buyer);
 const ready=async()=>{await h.command('stock.sync-settings',{enabled:true,pageSize:2});let state=await sync();assert.equal(state.has_more,1);while(state.has_more)state=await sync();return state};
 const restock=()=>pier.command('order.cancel',{orderId:holds[0].id,reason:'Restored watched stock'});
 return {pier,h,inventory,account,buyer,sync,read,ready,restock,interruptAck(){interrupt=true},failure(value){fail=value}};
}
