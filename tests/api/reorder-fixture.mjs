import { installation, stock, accountValue } from './harness.mjs';
/** Real public-door setup; only the historical date/currency is fixture data. */
export async function reorderFixture(t) {
 const pier=await installation({pier:true});t.after(()=>pier.close());
 const products=await stock(pier,'100');
 for(const sku of ['TEA-1','JAM-1','OAT-2']) {
  const item=await pier.command('item.save',{sku,name:sku==='OAT-2'?'Replacement oat granola':sku==='TEA-1'?'Breakfast tea':'Strawberry jam',unit:'case',packSize:'1'});
  const po=await pier.command('po.draft',{supplierId:products.supplier.id,promiseDate:'2026-10-20',reason:'Reorder assortment',lines:[{itemId:item.id,quantity:'100',price:'20.00'}]});
  await pier.command('po.approve',{poId:po.id,version:po.version});await pier.command('po.commit',{poId:po.id,version:po.version});
  await pier.command('receipt.create',{poId:po.id,supplierReference:sku,lines:[{poLineId:po.lines[0].id,locationId:products.location.id,quantity:'100',cost:'20.00'}]});
 }
 const h=await installation({bindings:{PIER_ORIGIN:pier.origin,PIER_SESSION:pier.cookie}});t.after(()=>h.close());
 let account=await h.command('account.save',{id:'cedar',value:{...accountValue(products.customer.id),minimumCents:0,prices:['OAT-1','TEA-1','JAM-1'].map(sku=>({sku,unitCents:6500,minQty:1}))}});
 const buyer=await h.signIn(account.value.email);
 let original=await h.command('order.prepare',{accountId:account.id,reference:'SPRING-PO-2026',deliveryLocation:'Brooklyn flagship',lines:account.value.prices.map(price=>({sku:price.sku,quantity:3}))},{as:buyer});
 await h.command('order.submit',{orderId:original.id},{as:buyer});original=await h.command('order.approve',{orderId:original.id});
 // Historical fixture only: six calendar months before this test, at an Eastern date boundary.
 const sixMonths=new Date();sixMonths.setUTCMonth(sixMonths.getUTCMonth()-6);
 const date=sixMonths.toISOString().slice(0,10);original={...original,preparedAt:`${date}T12:00:00.000Z`};
 delete original.currency;
 await h.db.prepare('UPDATE bw_orders SET value_json=? WHERE id=?').bind(JSON.stringify(original),original.id).run();
 const snapshot=JSON.stringify(original);

 return {pier,products,h,account,buyer,original,snapshot,date};
}
