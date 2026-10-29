import {cardFixture} from './card-fixture.mjs';
export async function returnClaimsFixture(t,options={}) {
 const f=await cardFixture(t,{...options,connect:false}),{h,pier,buyer}=f;
 const profile=await h.api('/api/barrow/accounts/by-id/cedar');
 await h.command('account.save',{id:'cedar',revision:profile.revision,value:{...profile.value,assignedRep:'avery'}});
 await h.command('commission.settings',{revision:null,rules:[{id:'return-original-split',rep:'avery',from:'2000-01-01',rateBps:1000,basis:'acceptance',splits:[{rep:'avery',shareBps:6000},{rep:'blair',shareBps:4000}]}],reason:'Freeze original return commission attribution.'});
 const draft=await h.command('order.prepare',{accountId:'cedar',reference:'synthetic-barrow-940',lines:[{sku:'OAT-1',quantity:6}]},buyer);
 await h.command('order.submit',{orderId:draft.id},buyer);
 const order=await h.command('order.approve',{orderId:draft.id});
 const upstream=(await pier.api('/api/pier/state')).orders.find(row=>row.id===order.pierOrderId);
 const shipment=await pier.command('dispatch.create',{orderId:upstream.id,shipmentReference:'synthetic-barrow-941',lines:[{orderLineId:upstream.lines[0].id,quantity:'6'}]});
 const receive=quantity=>pier.command('return.create',{shipmentId:shipment.id,shipmentLineId:shipment.lines[0].id,locationId:f.product.location.id,quantity:String(quantity),reason:'Supplier physically received these units in Pier.'});
 const claims=(who={})=>h.api(`/api/barrow/orders/${order.id}/return-claims`,undefined,who);
 const request=(quantity=3)=>h.command('return.request',{orderId:order.id,line:1,quantity,reason:'Damaged cartons',condition:'Packaging crushed; goods held for review.'},buyer);
 const inspect=(receipt,disposition='quarantine')=>pier.command('return.inspect',{returnId:receipt.id,version:receipt.version,condition:disposition==='restock'?'sellable':'damaged',disposition,reason:'Warehouse inspected these returned units.'});
 return {...f,order,shipment,receive,inspect,claims,request};
}
