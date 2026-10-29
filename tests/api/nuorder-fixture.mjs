import {readFileSync} from 'node:fs';
import {csv,wizWorkbook} from './wizcommerce-fixture.mjs';
import {withExif} from '../fixtures/confirmation-image.mjs';
export function nuorderInput(format='csv',{retired=false}={}) {
 const products=[['Product ID','Style Number','Color','Size','UPC','Season','Archived','Case Pack','Increment'],['product-1','OAT','Natural','Case','','Spring 2027','false','2','2']];
 if(retired)products.push(['product-2','RYE','Natural','Case','','Winter 2026','true','6','6']);
 const orders=[['Brand Order','Company Code','Currency','Order Total','Shipping','Status','Order Date','Product ID','Quantity','Wholesale Price','Open Quantity','Customer PO','Ship Start','Ship End','Brand Notes'],['NU-1','store-1','USD','260.00','0.00','Open','2026-10-01','product-1','4','65.00','2','PO-100','2027-01-01','2027-01-31','Retain this source field'],['NU-2','store-1','CAD','70.00','0.00','Shipped','2026-10-02','product-1','1','70.00','0','PO-200','','','']];
 orders[0].push('Type');for(const row of orders.slice(1))row.push('Order');
 const file=(name,rows)=>format==='xls'?{name:name.toLowerCase()+'.xls',base64:readFileSync(new URL('../fixtures/nuorder/'+name.toLowerCase()+(name==='Products'&&retired?'-retired':'')+'.xls',import.meta.url)).toString('base64'),sheet:name}:format==='csv'?{name:name.toLowerCase()+'.csv',csv:csv(rows)}:{...wizWorkbook('split',{entityOnly:true,entities:{[name]:rows}}),name:name.toLowerCase()+'.xlsx',sheet:name};
 return {tenant:'synthetic-barrow-61',products:file('Products',products),orders:{...file('Orders',orders),columns:{id:'Brand Order'}},images:[{name:'OAT_Natural_1.jpg',base64:withExif.toString('base64')}],lists:[{id:'list-1',name:'Store assortment.csv',customerId:'store-1',csv:'SKU,Name,Unit Price,Quantity\nproduct-1,Granola,999.00,4\n'}],authority:{system:'supplied',customers:{'store-1':'cedar'},products:{'product-1':'OAT-1',...(retired?{'product-2':'RYE-1'}:{})}},scope:{from:null,to:null,filters:[],fullTenant:true}};
}

export function nuorderNetworkEdge(image, {addresses=['93.184.215.14'],dns=[]}={}) {
 return async request=>{
  const url=new URL(request.url);
  if(url.hostname==='cloudflare-dns.com'){dns.push(request.url);const type=url.searchParams.get('type')==='A'?1:28;return Response.json({Status:0,Answer:addresses.filter(address=>(type===1)===!address.includes(':')).map(data=>({type,data}))})}
  return image(request);
 };
}
