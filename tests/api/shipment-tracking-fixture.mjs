import assert from 'node:assert/strict';
import {installation,stock,accountValue} from './harness.mjs';
export async function shipmentTrackingFixture(t,{built=false}={}) {
 const pier=await installation({pier:true});t.after(()=>pier.close());const product=await stock(pier,'40');
 const trackers=new Map(),calls=[];let down=false,foreign=false;
 const edge=async request=>{
  if(new URL(request.url).hostname!=='api.easypost.com')return;
  calls.push(request.url);assert.equal(request.method,'GET');assert.equal(request.headers.get('authorization'),'Basic '+Buffer.from('synthetic-barrow-310:').toString('base64'));
  if(down)return new Response('Unavailable',{status:503});
  const id=new URL(request.url).pathname.split('/').at(-1),value=trackers.get(id);
  return Response.json(foreign?{...value,id:'trk_syntheticbarrowforeign'}:value??{}, {status:value?200:404});
 };
 const h=await installation({captureLogs:true,built,https:built,bindings:{PIER_ORIGIN:pier.origin,PIER_SESSION:pier.cookie,EASYPOST_API_KEY:'synthetic-barrow-310',BARROW_TEST_CLOCK:'2031-01-15T12:00:00.000Z'},...(built?{clock:'2031-01-15T12:00:00.000Z'}:{}),networkEdge:edge});t.after(()=>h.close());
 const email=['synthetic-barrow-311','example.test'].join('@');
 await h.command('account.save',{id:'cedar',value:{...accountValue(product.customer.id,email),currency:'USD'}});
 const buyer={as:await h.signIn(email)};
 const order=await h.command('order.prepare',{accountId:'cedar',reference:'synthetic-barrow-312',requestedDate:'2031-01-15',lines:[{sku:'OAT-1',quantity:10}]},buyer);
 await h.command('order.submit',{orderId:order.id},buyer);const approved=await h.command('order.approve',{orderId:order.id});
 assert.equal(approved.status,'approved');
 const upstream=(await pier.api('/api/pier/state')).orders.find(o=>o.id===approved.pierOrderId);
 const shipment=await pier.command('dispatch.create',{orderId:upstream.id,shipmentReference:'synthetic-barrow-313',lines:[{orderLineId:upstream.lines[0].id,quantity:'10'}]});
 const event=(status,at,message=status,status_detail='unknown')=>({status,datetime:at,message,status_detail});
 const set=(n,events)=>trackers.set('trk_syntheticbarrow'+n,{id:'trk_syntheticbarrow'+n,object:'Tracker',carrier:'UPS',tracking_code:'synthetic-barrow-'+n,status:events.at(-1)?.status??'unknown',public_url:'https://track.easypost.com/synthetic-barrow-'+n,est_delivery_date:'2031-01-16T18:00:00Z',tracking_details:events});
 set(1,[event('in_transit','2031-01-15T08:00:00Z','Carrier delay','delayed')]);set(2,[event('pre_transit','2031-01-15T08:00:00Z','Label created')]);
 const bind=(n,quantity,opts={})=>h.command('tracking.bind',{orderId:order.id,shipmentId:shipment.id,trackerId:'trk_syntheticbarrow'+n,carrier:'UPS',code:'synthetic-barrow-'+n,lines:[{itemId:product.item.id,quantity}]},opts);
 const view=(opts={})=>h.api(`/api/barrow/orders/${order.id}/tracking`,undefined,opts);
 const refresh=async(n,opts={})=>{const p=(await view()).packages.find(p=>p.trackerId==='trk_syntheticbarrow'+n);return h.command('tracking.refresh',{orderId:order.id,packageId:p.id,revision:p.revision},opts)};
 return {h,pier,product,buyer,order:approved,shipment,bind,view,refresh,set,event,calls,email,down(v){down=v},foreign(v){foreign=v}};
}

export async function trackedReplacement(f) {
 const {h,pier,buyer,product,event,set}=f;
 const draft=await h.command('order.prepare',{accountId:'cedar',reference:'synthetic-barrow-318',lines:[{sku:'OAT-1',quantity:2}]},buyer);await h.command('order.submit',{orderId:draft.id},buyer);const original=await h.command('order.approve',{orderId:draft.id});
 const offered=await h.command('substitution.propose',{orderId:original.id,orderRevision:original.revision,reason:'Buyer requested four cases instead of two.',lines:[{fromSku:'OAT-1',sku:'OAT-1',quantity:4}]});const offer=offered.substitutions.at(-1);assert.deepEqual(offer.carrierDelivery.original,[]);assert.match(offer.carrierDelivery.replacement,/Unknown/);
 await h.command('substitution.accept',{orderId:original.id,number:offer.number,acknowledged:true},buyer);await h.command('substitution.execute',{orderId:original.id,number:offer.number});
 const after=await h.api('/api/barrow/orders/'+original.id),replacement=await h.api('/api/barrow/orders/'+after.substitutions.at(-1).replacementId);assert.equal(replacement.status,'approved');
 const upstream=(await pier.api('/api/pier/state')).orders.find(o=>o.id===replacement.pierOrderId),shipment=await pier.command('dispatch.create',{orderId:upstream.id,shipmentReference:'synthetic-barrow-319',lines:[{orderLineId:upstream.lines[0].id,quantity:'4'}]});
 set(3,[event('delivered','2031-01-15T11:00:00Z','Replacement carrier delivery confirmed')]);await h.command('tracking.bind',{orderId:replacement.id,shipmentId:shipment.id,trackerId:'trk_syntheticbarrow3',carrier:'UPS',code:'synthetic-barrow-3',lines:[{itemId:product.item.id,quantity:'4'}]});
 return {original:after,replacement};
}
