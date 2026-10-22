import { installation, stock, accountValue } from './harness.mjs';
export async function sheetFixture(t,options={}) {
 const pier=await installation({pier:true});t.after(()=>pier.close());const source=await stock(pier,'200');
 const variants=[];
 for(const size of ['S','M','3XL']) {
  const item=await pier.command('item.save',{sku:`TEE-BLUE-${size}`,name:`Blue linen tee ${size}`,barcode:`synthetic-barrow-${variants.length+1}`,unit:'each',packSize:'1'});variants.push(item);
  const po=await pier.command('po.draft',{supplierId:source.supplier.id,promiseDate:'2026-10-20',reason:'Synthetic spring line-sheet stock',lines:[{itemId:item.id,quantity:'100',price:'5.00'}]});
  await pier.command('po.approve',{poId:po.id,version:po.version});await pier.command('po.commit',{poId:po.id,version:po.version});await pier.command('receipt.create',{poId:po.id,supplierReference:item.sku,lines:[{poLineId:po.lines[0].id,locationId:source.location.id,quantity:'100',cost:'5.00'}]});
 }
 const customer=await pier.command('party.save',{name:'Wren Market',kind:'customer'});
 const h=await installation({...options,bindings:{...options.bindings,PIER_ORIGIN:pier.origin,PIER_SESSION:pier.cookie}});t.after(()=>h.close());
 let cedar=await h.command('account.save',{id:'cedar',value:{...accountValue(source.customer.id),minimumCents:0,prices:variants.map(item=>({sku:item.sku,unitCents:1000,minQty:1})),priceDisplay:{confirmation:'both',orderCsv:'both'}}});
 let wren=await h.command('account.save',{id:'wren',value:{...accountValue(customer.id,'wren@example.test'),name:'Wren Market',minimumCents:0,prices:variants.map(item=>({sku:item.sku,unitCents:900,minQty:1})),priceDisplay:{confirmation:'wholesale',orderCsv:'wholesale'}}});
 const buyers={cedar:{as:await h.signIn(cedar.value.email)},wren:{as:await h.signIn(wren.value.email)}};
 const importBook=async(account,currency,base)=>h.command('price-book.import',{accountId:account.id,revision:account.revision,csv:['sku,currency,unitCents,msrpCents,minQty',...variants.map((item,i)=>`${item.sku},${currency},${base+(i===2?400:0)},${i===1?'':(base+(i===2?400:0))*2},1`)].join('\n')});
 cedar=await importBook(cedar,'USD',1201);wren=await importBook(wren,'CAD',1303);
 const skus=variants.map(item=>item.sku),packs=[{id:'size-run',name:'One full size run',kind:'run',lines:skus.map(sku=>({sku,quantity:1}))},{id:'case',name:'Fixed six-piece case',kind:'assortment',lines:skus.map(sku=>({sku,quantity:2}))}];
 const year=new Date().getUTCFullYear()+1;
 const publish=(account,display)=>h.command('sheet.publish',{accountId:account.id,name:'Spring collection',season:`Spring ${year}`,display,shipStart:`${year}-03-01`,shipEnd:`${year}-03-31`,skus,packs});
 const sheet=await publish(cedar,'both'),other=await publish(wren,'wholesale');
 const preview=(s,p,who=buyers.cedar)=>h.command('sheet.preview',{sheetId:s.id,revision:s.revision,mode:'replace',...p},who);
 const prepare=(s,p,who=buyers.cedar)=>h.command('order.prepare',{accountId:who===buyers.wren?'wren':'cedar',lineSheetId:s.id,lineSheetRevision:s.revision,reference:`synthetic-barrow-${Date.now()}`,lines:p.cart},who);
 return {h,pier,source,variants,cedar,wren,buyers,sheet,other,skus,packs,publish,preview,prepare,importBook};
}
export const csvRows=text=>{const [header,...rows]=text.trim().split('\r\n').map(line=>line.slice(1,-1).split('","'));return {header,rows:rows.map(row=>Object.fromEntries(header.map((key,i)=>[key,row[i]])))};};
