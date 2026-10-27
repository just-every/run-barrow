import {installation,stock,accountValue} from './harness.mjs';
export async function prebookFixture(t,options={}) {
 const pier=await installation({pier:true});t.after(()=>pier.close());
 const inventory=await stock(pier,'2');
 const second=await pier.command('item.save',{sku:'COAT-2',name:'Spring coat',unit:'case',packSize:'1'});
 const incoming=async(item,quantity,promiseDate)=>{
  const po=await pier.command('po.draft',{supplierId:inventory.supplier.id,promiseDate:promiseDate??'2099-04-01',destinationWarehouse:'New York',reason:'Seasonal incoming supply',lines:[{itemId:item.id,quantity,price:'20.00'}]});
  await pier.command('po.approve',{poId:po.id,version:po.version});await pier.command('po.commit',{poId:po.id,version:po.version});return po;
 };
 const firstPO=await incoming(inventory.item,'20','2099-03-01'),secondPO=await incoming(second,'20');
 let interrupted=false;
 const networkEdge=async request=>{
  if(interrupted&&new URL(request.url).origin===pier.origin&&request.method==='POST'){
   const body=await request.clone().json();
   if(body.type==='order.create'){
    interrupted=false;
    const response=await pier.raw('/api/pier/commands',{method:'POST',headers:Object.fromEntries(request.headers),body:JSON.stringify(body)});
    if(!response.ok)throw Error('Real Pier did not accept the interrupted release');
    return new Response('Transport interrupted after the real stock effect',{status:503});
   }
  }
  return options.networkEdge?.(request);
 };
 const h=await installation({...options,networkEdge,bindings:{PIER_ORIGIN:pier.origin,PIER_SESSION:pier.cookie,...options.bindings}});t.after(()=>h.close());
 let account=await h.command('account.save',{id:'cedar',value:{...accountValue(inventory.customer.id),minimumCents:10000,warehouses:['New York'],prices:[{sku:'OAT-1',unitCents:6500,minQty:2,units:[{code:'pair',baseQuantity:'2',unitCents:13000,packContents:'Two cases'}]},{sku:'COAT-2',unitCents:7000,minQty:2}]}});
 const buyer={as:await h.signIn(account.value.email)},other={as:await h.signIn('other@example.test')};
 const settings=await h.command('prebook.season-create',{revision:'',name:'Spring 2099',opensAt:'2000-01-01T00:00:00Z',closesAt:'2099-02-01T00:00:00Z',depositBps:2000,reason:'Published spring order intake and deposit requirement'});
 const season=settings.seasons[0],lines=[{sku:'OAT-1',quantity:4,requestedDate:'2099-03-10',cancelAfter:'2099-03-20'},{sku:'COAT-2',quantity:6,requestedDate:'2099-04-10',cancelAfter:'2099-04-30'}];
 const payload={accountId:account.id,reference:'SPRING-2099',prebookSeasonId:season.id,lines};
 const read=order=>h.api(`/api/barrow/orders/${order.id}`,undefined,buyer);
 const receive=async(po,item,quantity,locationId=inventory.location.id)=>pier.command('receipt.create',{poId:po.id,supplierReference:'Spring received',lines:[{poLineId:po.lines.find(l=>l.itemId===item.id).id,locationId,quantity,cost:'20.00'}]});
 return {interruptRelease(){interrupted=true},pier,h,inventory,second,firstPO,secondPO,account,buyer,other,settings,season,lines,payload,read,receive};
}
export async function acceptPrebook(f) {
 let order=await f.h.command('order.prepare',f.payload,f.buyer);
 order=await f.h.command('order.submit',{orderId:order.id},f.buyer);
 return f.h.command('order.approve',{orderId:order.id});
}
