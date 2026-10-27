import {cardFixture} from './card-fixture.mjs';
export async function exposureFixture(t,options={}) {
 const f=await cardFixture(t,options),{h,buyer,edge}=f;
 let account=await h.api('/api/barrow/accounts/by-id/cedar');
 account=await h.command('account.save',{id:'cedar',revision:account.revision,value:{...account.value,minimumCents:0,prices:[{sku:'OAT-1',unitCents:100000,minQty:1}]}});
 account=await h.command('credit.policy',{accountId:'cedar',revision:account.revision,termsDays:30,currency:'USD',limitCents:1000000,reason:'Finance approved net 30 and a ten thousand dollar ceiling.'});
 const draft=async(quantity,reference)=>h.command('order.prepare',{accountId:'cedar',reference,lines:[{sku:'OAT-1',quantity}]},buyer);
 const initial=await draft(3,'Three thousand already owed');await h.command('order.submit',{orderId:initial.id},buyer);const owed=await h.command('order.approve',{orderId:initial.id});
 const candidate=await draft(8,'Eight thousand credit review');
 return {...f,account,draft,owed,candidate,async pay(){let payment=await h.command('card.prepare',{orderId:owed.id},buyer);edge.complete(payment);payment=await h.command('card.refresh',{paymentId:payment.id},buyer);payment=await h.command('card.authorize',{paymentId:payment.id,consent:true,amountCents:payment.amountCents,surchargeCents:payment.surchargeCents},buyer);payment=await h.command('card.capture',{paymentId:payment.id,reason:'Capture the verified existing invoice payment.'});return payment}};
}
