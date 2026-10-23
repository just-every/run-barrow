import {installation,stock,accountValue} from './harness.mjs';
export async function proposalFixture(t,options={}) {
 const pier=await installation({pier:true});t.after(()=>pier.close());const inventory=await stock(pier,'24');
 const items=[];
 for(const [sku,name] of [['MAPLE-1','Maple granola'],['HONEY-1','Honey granola']])items.push(await pier.command('item.save',{sku,name,unit:'case',packSize:'1'}));
 const po=await pier.command('po.draft',{supplierId:inventory.supplier.id,promiseDate:'2026-10-20',reason:'Current substitutes',lines:items.map(item=>({itemId:item.id,quantity:'24',price:'20.00'}))});
 await pier.command('po.approve',{poId:po.id,version:po.version});await pier.command('po.commit',{poId:po.id,version:po.version});
 await pier.command('receipt.create',{poId:po.id,supplierReference:'Substitute inventory',lines:po.lines.map(line=>({poLineId:line.id,locationId:inventory.location.id,quantity:'24',cost:'20.00'}))});
 const h=await installation({...options,bindings:{PIER_ORIGIN:pier.origin,PIER_SESSION:pier.cookie,...options.bindings}});t.after(()=>h.close());
 let account=await h.command('account.save',{id:'cedar',value:{...accountValue(inventory.customer.id),minimumCents:0,prices:[{sku:'OAT-1',unitCents:6500,minQty:1},{sku:'MAPLE-1',unitCents:4400,minQty:1},{sku:'HONEY-1',unitCents:3100,minQty:1}]}});
 const buyer={as:await h.signIn(account.value.email)};
 let order=await h.command('order.prepare',{accountId:account.id,reference:'PO-SPRING-1042',lines:[{sku:'OAT-1',quantity:8}]},buyer);
 await h.command('order.submit',{orderId:order.id},buyer);order=await h.command('order.approve',{orderId:order.id});
 account=await h.command('account.save',{id:account.id,revision:account.revision,value:{...account.value,prices:account.value.prices.filter(price=>price.sku!=='OAT-1')}});
 const grantInput={accountId:account.id,costLimitCents:10,contactLimit:9,approvedSubstitutes:[{fromSku:'OAT-1',skus:['MAPLE-1','HONEY-1']}],consent:true,reason:'Owner reviewed this account, approved replacement assortment and limited proposal tools and contacts.'};
 const grant=async(more={})=>h.api('/api/barrow/proposal-grants',{...grantInput,...more});
 const agent=g=>({as:'',headers:{authorization:`Bearer ${g.token}`}});
 const candidates=[{lines:[{fromSku:'OAT-1',sku:'MAPLE-1',quantity:8}]},{lines:[{fromSku:'OAT-1',sku:'HONEY-1',quantity:8}]}];
 const submit=(g,more={})=>h.command('proposal.submit',{orderId:order.id,model:'synthetic-barrow-101',runId:'synthetic-barrow-102',reportedCostCents:2,candidates,...more},agent(g));
 const offer=p=>h.command('proposal.offer',{id:p.id,number:p.number,revision:p.revision,candidate:0,reason:'Manager reviewed exact units, prices, fulfillment difference and unverified tax; offer this basket to the buyer.'});
 const approve=p=>h.command('substitution.accept',{orderId:order.id,number:p.offerNumber,acknowledged:true},buyer);
 const execute=(p,extra={},options={})=>h.command('proposal.execute',{id:p.id,number:p.number,revision:p.revision,idempotencyKey:p.executionKey,...extra},options);
 const history=()=>h.api(`/api/barrow/orders/${order.id}/agent-proposals`);
 const withdraw=p=>h.command('proposal.withdraw',{id:p.id,number:p.number,revision:p.revision,reason:'Withdraw this unexecuted review; preserve the old approval and request a fresh source-bound revision.'});
 return {h,pier,inventory,items,account,buyer,order,grantInput,grant,agent,candidates,submit,offer,approve,execute,history,withdraw};
}
