import {cardFixture} from './card-fixture.mjs';
export async function creditFixture(t,options={}) {
 const f=await cardFixture(t,options),{h,pier,buyer,product}=f;
 const rule={id:'original-split',rep:'avery',from:'2000-01-01',rateBps:1000,basis:'acceptance',splits:[{rep:'avery',shareBps:6000},{rep:'blair',shareBps:4000}]};
 const account=await h.api('/api/barrow/accounts/by-id/cedar');await h.command('account.save',{id:'cedar',revision:account.revision,value:{...account.value,assignedRep:'avery'}});await h.command('commission.settings',{revision:null,rules:[rule],reason:'Freeze the supplier-approved original commission split.'});
 const initial=await f.prepared(),order=initial.order;let payment=initial.payment;
 payment=await h.command('card.authorize',{paymentId:payment.id,consent:true,amountCents:payment.amountCents,surchargeCents:payment.surchargeCents},buyer);payment=await h.command('card.capture',{paymentId:payment.id,reason:'Capture the original approved invoice balance.'});
 if(options.allocate!==false)await h.command('card.allocate',{paymentId:payment.id,orderId:order.id,amountCents:order.totalCents,reason:'Allocate verified captured principal to the original invoice.'});
 const upstream=(await pier.api('/api/pier/state')).orders.find(row=>row.id===order.pierOrderId),shipment=await pier.command('dispatch.create',{orderId:upstream.id,shipmentReference:'Return source shipment',lines:[{orderLineId:upstream.lines[0].id,quantity:'2'}]});
 const returned=await pier.command('return.create',{shipmentId:shipment.id,shipmentLineId:shipment.lines[0].id,locationId:product.location.id,quantity:'1',reason:'Supplier physically received one returned unit.'});
 const credit=options.issue===false?undefined:await h.command('credit.issue',{orderId:order.id,returnId:returned.id,lines:[{line:1,quantity:1}],reason:'Credit one received unit at its original approved price.'});
 return {...f,source:order,payment,shipment,returned,credit};
}
