import {cardFixture} from './card-fixture.mjs';
export async function returnClaimsFixture(t,options={}) {
 const f=await cardFixture(t,{...options,connect:false}),{h,pier,buyer}=f;
 const draft=await h.command('order.prepare',{accountId:'cedar',reference:'synthetic-barrow-940',lines:[{sku:'OAT-1',quantity:6}]},buyer);
 await h.command('order.submit',{orderId:draft.id},buyer);
 const order=await h.command('order.approve',{orderId:draft.id});
 const upstream=(await pier.api('/api/pier/state')).orders.find(row=>row.id===order.pierOrderId);
 const shipment=await pier.command('dispatch.create',{orderId:upstream.id,shipmentReference:'synthetic-barrow-941',lines:[{orderLineId:upstream.lines[0].id,quantity:'6'}]});
 const receive=quantity=>pier.command('return.create',{shipmentId:shipment.id,shipmentLineId:shipment.lines[0].id,locationId:f.product.location.id,quantity:String(quantity),reason:'Supplier physically received these units in Pier.'});
 const claims=(who={})=>h.api(`/api/barrow/orders/${order.id}/return-claims`,undefined,who);
 const request=(quantity=3)=>h.command('return.request',{orderId:order.id,line:1,quantity,reason:'Damaged cartons',condition:'Packaging crushed; goods held for review.'},buyer);
 return {...f,order,shipment,receive,claims,request};
}
