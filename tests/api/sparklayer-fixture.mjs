import {installation,stock,accountValue} from './harness.mjs';
export const sparkInput=()=>({tenant:'synthetic-barrow-41',activity:{name:'activity.csv',mode:'detailed',csv:'ID,Customer ID,Type,Currency,Total,Shipping,Status,Tracking,Date,Product ID,Quantity,Unit Price,Case Pack,Increment,Custom PO\norder-1,store-1,Order,USD,136.00,6.00,Shipped,synthetic-barrow-1,2026-10-01,product-1,2,65.00,2,2,PO-source-1\nquote-1,store-1,Quote,CAD,70.00,0.00,Open,,2026-10-02,product-1,1,70.00,,,PO-quote-1\n'},lists:[{id:'list-1',name:'Store replenishment.csv',customerId:'store-1',csv:'SKU,Name,Unit Price,Quantity\nsource-oat,Granola,999.00,4\n'}],authority:{system:'supplied',customers:{'store-1':'cedar'},products:{'product-1':'OAT-1','source-oat':'OAT-1'}},scope:{from:'2026-10-01',to:'2026-10-22',filters:['customer store-1'],fullTenant:false}});
export async function sparkFixture(t,options={}) {
 const pier=await installation({pier:true});t.after(()=>pier.close());const products=await stock(pier,'120');
 const h=await installation({...options,bindings:{PIER_ORIGIN:pier.origin,PIER_SESSION:pier.cookie}});t.after(()=>h.close());
 await h.command('account.save',{id:'cedar',value:{...accountValue(products.customer.id),minimumCents:0}});
 const input=sparkInput(),preview=()=>h.api('/api/barrow/imports/sparklayer/preview',input),apply=report=>h.api('/api/barrow/imports/sparklayer/apply',{...input,fingerprint:report.fingerprint,reason:'Owner checked source scope, mapped identities and reconciled history and private lists.'});
 return {h,pier,products,input,preview,apply};
}
