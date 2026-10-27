import { installation, stock, accountValue } from '../api/harness.mjs';
export async function catalogFixture(t,count=32,bindings={}) {
 const pier=await installation({pier:true});t.after(()=>pier.close());
 const products=await stock(pier);
 const items=Array.from({length:count},(_,i)=>({id:'synthetic-barrow-'+i,version:1,sku:'STYLE-'+String(i).padStart(5,'0'),name:'Wholesale cotton shirt '+i,barcode:'synthetic-barrow-barcode-'+i,unit:'case',packSize:'1',archived:false,createdAt:'2026-10-23T00:00:00.000Z'}));
 // Populate the real pinned Pier's fixture store; all discovery reads go through its HTTP Worker.
 for(let offset=0;offset<items.length;offset+=100)await pier.db.prepare(`INSERT INTO pier_records SELECT 'items',json_extract(value,'$.id'),1,value FROM json_each(?)`).bind(JSON.stringify(items.slice(offset,offset+100))).run();
 const h=await installation({bindings:{PIER_ORIGIN:pier.origin,PIER_SESSION:pier.cookie,...bindings}});t.after(()=>h.close());
 const value={...accountValue(products.customer.id),prices:[{sku:'OAT-1',unitCents:6500,minQty:2},...items.map(item=>({sku:item.sku,unitCents:1200,minQty:1}))]};
 // Large fixtures exceed the account editor's batch cap; this is fixture creation, never a product import claim.
 await h.db.prepare('INSERT INTO bw_accounts VALUES(?,?,?)').bind('cedar',JSON.stringify(value),'synthetic-barrow-account-revision').run();
 const variants=Object.fromEntries(items.map((item,i)=>[item.sku,{style:'Cotton',color:i%2?'Blue':'Red',size:i%3?'M':'L'}]));
 await h.db.prepare("INSERT INTO bw_settings VALUES('variant-attributes',?,?)").bind(JSON.stringify(variants),'synthetic-barrow-attributes-revision').run();
 const buyer={as:await h.signIn('buyer@example.test')};
 const search=(query={},options=buyer)=>h.api('/api/barrow/catalogue/search?'+new URLSearchParams({accountId:'cedar',...query}),undefined,options);
 return {h,pier,products,items,value,buyer,search};
}
