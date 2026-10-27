import { installation, stock, accountValue } from './harness.mjs';
export const clock='2027-01-15T15:00:00.000Z';
export const season={id:'spring-2027',name:'Spring 2027',opensAt:'2027-01-01T00:00:00Z',closesAt:'2027-01-15T23:00:00Z',minimumCents:10000,depositBps:3000,windows:[{id:'first',requestedDate:'2027-01-15',cancelAfter:'2027-01-31'},{id:'second',requestedDate:'2027-02-15',cancelAfter:'2027-02-28'}],reason:'Supplier published spring terms.'};
export async function prebookFixture(t,{built=false,https=false}={}){
 const pier=await installation({pier:true,clock});t.after(()=>pier.close());const source=await stock(pier,'4');
 const po=await pier.command('po.draft',{supplierId:source.supplier.id,promiseDate:'2027-01-15',reason:'Spring incoming supply',lines:[{itemId:source.item.id,quantity:'20',price:'20.00'}]});
 await pier.command('po.approve',{poId:po.id,version:po.version});await pier.command('po.commit',{poId:po.id,version:po.version});
 const late=await pier.command('po.draft',{supplierId:source.supplier.id,promiseDate:'2027-03-15',reason:'Supply after both booked windows',lines:[{itemId:source.item.id,quantity:'100',price:'20.00'}]});
 await pier.command('po.approve',{poId:late.id,version:late.version});await pier.command('po.commit',{poId:late.id,version:late.version});
 const h=await installation({clock,built,https,bindings:{PIER_ORIGIN:pier.origin,PIER_SESSION:pier.cookie}});t.after(()=>h.close());
 const account=await h.command('account.save',{id:'cedar',value:{...accountValue(source.customer.id),minimumCents:0}}),buyer={as:await h.signIn(account.value.email)};
 const published=await h.command('prebook.season',season);
 const payload={accountId:account.id,seasonId:season.id,reference:'SPRING-2027',lines:[{sku:'OAT-1',quantity:6,...season.windows[0]},{sku:'OAT-1',quantity:4,...season.windows[1]}]};
 return {h,pier,source,po,account,buyer,published,payload};
}
