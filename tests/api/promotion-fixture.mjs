import {sheetFixture} from './line-sheet-fixture.mjs';
export async function promotionFixture(t,options={}) {
 const f=await sheetFixture(t,options),{h,cedar,skus,buyers}=f;
 await h.command('account.save',{id:cedar.id,revision:cedar.revision,value:{...cedar.value,prices:cedar.value.prices.map(p=>({...p,unitCents:1001,pricing:{effectiveFrom:'2000-01-01',effectiveTo:'2099-12-31',accountDiscountBps:2000}}))}});
 const offer={id:'spring-mix',name:'Spring mix',kind:'mix',accounts:['cedar'],skus:skus.slice(0,2),minimumUnits:4,from:'2000-01-01',to:'2099-12-31',bps:1000,priority:10,stackable:false};
 let settings=await h.command('promotion.save',{revision:null,offers:[offer]});
 const lines=skus.slice(0,2).map(sku=>({sku,quantity:2})),buyer=buyers.cedar;
 const preview=(rows=lines,costCents=1200)=>h.command('promotion.preview',{accountId:'cedar',lines:rows,costCents});
 let sequence=0;const prepare=(rows=lines,extra={})=>h.command('order.prepare',{accountId:'cedar',reference:'synthetic-barrow-promotion-'+(++sequence),lines:rows,...extra},buyer);
 const save=async offers=>settings=await h.command('promotion.save',{revision:settings.revision,offers});
 return {...f,offer,lines,buyer,preview,prepare,save,get settings(){return settings}};
}
export async function promotedReturn(f) {
 const {h,pier,buyer,source}=f;
 await f.save([f.offer,{...f.offer,id:'exclusive',name:'Priority exclusive',bps:2500,priority:20}]);
 let order=await f.prepare();await h.command('order.submit',{orderId:order.id},buyer);order=await h.command('order.approve',{orderId:order.id});
 const upstream=(await pier.api('/api/pier/state')).orders.find(o=>o.id===order.pierOrderId),shipment=await pier.command('dispatch.create',{orderId:upstream.id,shipmentReference:'Promoted shipment',lines:upstream.lines.map(l=>({orderLineId:l.id,quantity:l.quantity}))});
 const returned=await pier.command('return.create',{shipmentId:shipment.id,shipmentLineId:shipment.lines[0].id,locationId:source.location.id,quantity:'1',reason:'Received one promoted unit.'});
 const payload={orderId:order.id,returnId:returned.id,lines:[{line:1,quantity:1}],reason:'Credit only original discounted merchandise.'};
 const credit=await h.command('credit.issue',payload);
 return {order,returned,credit,payload,shipment};
}
