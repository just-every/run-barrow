import {installation,stock,accountValue} from './harness.mjs';
import {cardEdge} from './card-fixture.mjs';
export async function prebookFixture(t,{built=false,surchargeBps=0}={}) {
 const pier=await installation({pier:true});t.after(()=>pier.close());const product=await stock(pier,'4');
 const rye=await pier.command('item.save',{sku:'RYE-1',name:'Delayed rye crisps',unit:'case',packSize:'1'});
 const po=await pier.command('po.draft',{supplierId:product.supplier.id,promiseDate:'2027-03-01',destinationWarehouse:'New York',reason:'Spring incoming supply',lines:[{itemId:product.item.id,quantity:'30',price:'20.00'},{itemId:rye.id,quantity:'20',price:'15.00'}]});
 await pier.command('po.approve',{poId:po.id,version:po.version});await pier.command('po.commit',{poId:po.id,version:po.version});
 const edge=cardEdge(),h=await installation({built,https:built,...(built?{clock:'2027-03-05T15:00:00Z'}:{}),networkEdge:edge.networkEdge,bindings:{...(!built?{BARROW_TEST_CLOCK:'2027-03-05T15:00:00Z'}:{}),PIER_ORIGIN:pier.origin,PIER_SESSION:pier.cookie,CARD_WEBHOOK_ORIGIN:'https://synthetic-barrow.example.test'}});t.after(()=>h.close());
 const account=await h.command('account.save',{id:'cedar',value:{...accountValue(product.customer.id),minimumCents:0,state:'NY',warehouses:['New York'],prices:[{sku:'OAT-1',unitCents:6500,minQty:1},{sku:'RYE-1',unitCents:3000,minQty:1}]}}),buyer={as:await h.signIn(account.value.email)};
 const publication={id:'spring-2027',name:'Spring 2027',opensAt:'2027-03-01T00:00:00Z',closesAt:'2027-03-06T00:00:00Z',minimumCents:20000,depositBps:3000,windows:[{id:'first',name:'First spring shipment',shipDate:'2027-03-05',cancelAfter:'2027-03-20'},{id:'second',name:'Late spring shipment',shipDate:'2027-03-10',cancelAfter:'2027-03-30'}],reason:'Supplier published the spring buying terms.'};
 // Fixed business clock keeps publication and release journeys independent of the host date.
 const publish=()=>h.command('prebook.publish',{...publication,revision:null});
 const input={accountId:account.id,reference:'SPRING-2027',prebook:{seasonId:publication.id,windowIds:['first','second']},lines:[{sku:'OAT-1',quantity:8},{sku:'RYE-1',quantity:6}]};
 const prepare=extra=>h.command('order.prepare',{...input,...extra},buyer);
 const submit=order=>h.command('order.submit',{orderId:order.id},buyer);
 const accept=order=>h.command('order.approve',{orderId:order.id});
 const deposit=async order=>{
  await h.command('card.connect',{secretKey:'synthetic-barrow-1',consent:true,reason:'Owner reviewed the card merchant.',surchargeBps,allowedStates:surchargeBps?['NY']:[]});
  let payment=await h.command('card.prepare',{orderId:order.id},buyer);edge.complete(payment);
  payment=await h.command('card.refresh',{paymentId:payment.id},buyer);
  payment=await h.command('card.authorize',{paymentId:payment.id,consent:true,amountCents:payment.amountCents,surchargeCents:payment.surchargeCents},buyer);
  return h.command('card.capture',{paymentId:payment.id,reason:'Capture the explicitly authorized seasonal deposit.'});
 };
 const day=async value=>h.configure({BARROW_TEST_CLOCK:value});
 return {pier,product,rye,po,h,edge,account,buyer,publication,publish,input,prepare,submit,accept,deposit,day};
}

export async function releasedDepositFixture(t,options={}) {
 const f=await prebookFixture(t,options),{h,pier,product,po,account,publication}=f;
 if(options.built)publication.windows[1].shipDate='2027-03-05';
 await h.command('account.save',{id:account.id,revision:account.revision,value:{...account.value,assignedRep:'Season rep'}});
 await h.command('commission.settings',{revision:null,rules:[{id:'season-paid',rep:'Season rep',from:'2020-01-01',rateBps:1000,basis:'payment',splits:[{rep:'Season rep',shareBps:6000},{rep:'Partner rep',shareBps:4000}]}],reason:'Finance approved the original payment earning split.'});
 await f.publish();let commitment=await f.accept(await f.submit(await f.prepare()));const payment=await f.deposit(commitment);
 await h.command('prebook.close',{id:publication.id,revision:(await h.api('/api/barrow/prebook-seasons')).revision,reason:'Season intake completed before release.'});
 await f.day('2027-03-12T15:00:00Z');
 await pier.command('receipt.create',{poId:po.id,supplierReference:'Both promised spring windows arrived',lines:po.lines.map(line=>({poLineId:line.id,locationId:product.location.id,quantity:'12',cost:line.itemId===product.item.id?'20.00':'15.00'}))});
 const releases=[];
 for(const windowId of ['first','second']) {
  const next=await h.command('prebook.release',{orderId:commitment.id,windowId,revision:commitment.revision,reason:'Finance and operations reviewed the received seasonal window.'});commitment=next.order;
  releases.push(await h.command('order.approve',{orderId:next.releaseId}));
 }
 const allocation=(index,amountCents)=>({paymentId:payment.id,orderId:releases[index].id,orderRevision:releases[index].revision,sourceRevision:commitment.revision,amountCents,reason:'Finance reviewed this exact deposit principal for the linked release invoice.'});
 return {...f,commitment,payment,releases,allocation};
}
