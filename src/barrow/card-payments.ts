import { assertCollection, collectionState, newCollection, scheduleCollections } from './card-collections'
import { assertSavedConsent } from './saved-cards'
import { reviewedCard } from './card-review'
import { cardInstallation } from './card-installation'
import { cardCustomer } from './card-customer'
import type { Bindings } from '../auth.server'
import { audit,changed,commit } from './access'
import { requireCompanyRight } from './company-policy'
import { readOrder } from './orders'
import { account } from './accounts'
import { fail,requirePerson,text,type Actor,type Order } from './model'
import { connection,provider,hostedUrl } from './card-provider'
import { cardMerchant } from './card-settings'
import { reconcileCard,reconcileHostedState,storedCard } from './card-ledger'
import type { CardPayment } from './card-model'
export function publicCard(p:CardPayment) {const {paymentMethodId,setupSessionId,providerCustomerId,savedCardRevision,...value}=p;return value}
async function permitted(env:Bindings,actor:Actor,p:CardPayment) {
 requirePerson(actor);await account(env.DB,actor,p.accountId)
 const row=await env.DB.prepare('SELECT value_json FROM bw_orders WHERE id=? AND account_id=?').bind(p.orderId,p.accountId).first<{value_json:string}>()
 if(!row)fail('NOT_FOUND','Payment source not found.',404)
 await requireCompanyRight(env.DB,actor,p.accountId,'finance',(JSON.parse(row.value_json) as Order).shipTo?.id)
}
function payable(order:Order) {if(order.prebook){if(order.status!=='approved'||order.prebook.restored||order.prebook.depositCents<=0)fail('PAYMENT_ORDER','An accepted active prebook with a recorded deposit requirement is required.',409);return order.prebook.depositCents}if(order.status!=='approved'||!order.invoice||!order.pierOrderId)fail('PAYMENT_ORDER','Card collection needs a fully reserved approved order and issued invoice.',409);return order.totalCents}
export async function readCards(env:Bindings,actor:Actor,orderId:string) {
 const order=await readOrder(env.DB,actor,orderId);await permitted(env,actor,{accountId:order.accountId,orderId:order.id} as CardPayment)
 const rows=await env.DB.prepare('SELECT value_json FROM bw_card_payments WHERE order_id=?').bind(orderId).all<{value_json:string}>()
 const state=await collectionState(env,order)
 return {configured:!!await env.DB.prepare('SELECT 1 FROM bw_card_connection').first(),outstandingCents:state.outstandingCents,availableCents:state.availableCents,currency:order.currency??'AUD',orderRevision:order.revision,payments:rows.results.map(row=>publicCard(JSON.parse(row.value_json)))}
}
export async function readCard(env:Bindings,actor:Actor,id:string) {const p=(await storedCard(env,id)).value;await permitted(env,actor,p);return publicCard(p)}
async function save(env:Bindings,actor:Actor,value:CardPayment,previous:string,action:string,reason:string) {
 const revision=crypto.randomUUID()
 await commit(env.DB,actor,[env.DB.prepare('UPDATE bw_card_payments SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify(value),revision,value.id,previous),changed(env.DB),audit(env.DB,actor,value.id,action,{accountId:value.accountId,orderId:value.orderId,revision,source:action,reason})])
 return value
}
export async function cardCommand(env:Bindings,actor:Actor,type:string,p:any) {
 requirePerson(actor)
 if(actor.staff)fail('FORBIDDEN','Only company finance and the supplier owner or admin may initiate card operations.',403)
 if(type==='card.prepare'||type==='card.schedule') {
  const order=await readOrder(env.DB,actor,text(p.orderId,'Order'));await permitted(env,actor,{accountId:order.accountId,orderId:order.id} as CardPayment);payable(order)
  const config=await connection(env)
  if(type==='card.schedule'){cardMerchant(actor);const schedule=await scheduleCollections(env,actor,order,p,config);return {payments:schedule.payments.map(publicCard)}}
  const value=p.paymentId?(await storedCard(env,text(p.paymentId,'Payment'))).value:await newCollection(env,actor,order,p,config),id=value.id
  if(value.orderId!==order.id||value.accountId!==order.accountId)fail('NOT_FOUND','Payment source not found.',404)
  if(value.providerAccountId!==config.account_id||!!value.livemode!==!!config.livemode)fail('PAYMENT_SCOPE','Use the planned payment of this invoice and connected merchant.',409)
  const row=await storedCard(env,id)
  if(row.value.restored)fail('RESTORED','Restored payment history cannot initiate charges.',409)
  if(p.amountCents!==undefined&&p.amountCents!==row.value.amountCents)fail('PAYMENT_CHANGED','A collection identity retains its original exact principal.',409)
  if(row.value.checkoutUrl||row.value.state!=='prepared')return publicCard(row.value)
  await assertCollection(env,order,row.value)
  const customerId=row.value.providerCustomerId??await cardCustomer(env,order.accountId)
  const stripe=await provider(env,config),session=await stripe.call('/checkout/sessions',{mode:'setup',customer:customerId,'payment_method_types[0]':'card',billing_address_collection:'required',currency:value.currency.toLowerCase(),client_reference_id:id,'setup_intent_data[metadata][barrowPaymentId]':id,'setup_intent_data[metadata][barrowInstallationId]':row.value.installationId!,success_url:`${env.AUTH_ORIGIN}/app?cardPayment=${encodeURIComponent(id)}`,cancel_url:`${env.AUTH_ORIGIN}/app?cardPayment=${encodeURIComponent(id)}`},`barrow-setup-${row.value.installationId}-${id}`)
  const checkoutUrl=hostedUrl(session.url)
  if(!checkoutUrl)fail('STRIPE_CHECKOUT','Stripe did not provide a hosted card-entry page.',409)
  return publicCard(await save(env,actor,{...row.value,providerCustomerId:customerId,setupSessionId:session.id,checkoutUrl},row.revision,'card.prepared',order.prebook?'Buyer requested Stripe-hosted card entry for the recorded prebook deposit; no invoice allocation.':'Buyer requested Stripe-hosted card entry for the exact issued order.'))
 }
 const id=text(p.paymentId,'Payment'),row=await storedCard(env,id),value=row.value
 await permitted(env,actor,value)
 if(value.restored)fail('RESTORED','Restored payment history cannot initiate provider operations.',409)
 const stripe=await provider(env)
 if(stripe.config.account_id!==value.providerAccountId)fail('STRIPE_ACCOUNT','This payment belongs to a different Stripe merchant.',409)
 if(type==='card.refresh') {
  if(value.providerPaymentId)return publicCard(await reconcileCard(env,id,await stripe.call(`/payment_intents/${value.providerPaymentId}?expand[]=latest_charge`),undefined,actor.id))
  if(!value.setupSessionId)return publicCard(value)
  const session=await stripe.call(`/checkout/sessions/${value.setupSessionId}?expand[]=setup_intent.payment_method`),setup=session.setup_intent,method=setup?.payment_method
  if(session.client_reference_id!==id||session.livemode!==(value.livemode??false)||session.customer!==value.providerCustomerId)fail('STRIPE_MISMATCH','Stripe checkout does not match this payment.',409)
  if(setup?.last_setup_error&&setup.status==='requires_payment_method')return publicCard(await reconcileHostedState(env,id,'declined',actor.id))
  if(session.status!=='complete'||setup?.status!=='succeeded'||method?.type!=='card')return publicCard(value)
  if(method.customer!==value.providerCustomerId)fail('STRIPE_MISMATCH','Stripe card belongs to another customer.',409)
  const order=await readOrder(env.DB,actor,value.orderId),a=await account(env.DB,actor,value.accountId)
  const review=reviewedCard(stripe.config,order,a.value.state??'',method,value.amountCents)
  return publicCard(await save(env,actor,{...value,paymentMethodId:method.id,...review,checkoutUrl:undefined,updatedAt:new Date().toISOString()},row.revision,'card.reviewed','Stripe verified the hosted card funding and billing state; surcharge calculated only for an explicitly permitted matching US credit card.'))
 }
 if(type==='card.authorize') {
  if(value.state==='cancelled'||value.state==='declined')fail('PAYMENT_STATE','This card attempt has ended; it cannot create a new authorization.',409)
  const order=await readOrder(env.DB,actor,value.orderId);payable(order)
  if(order.revision!==value.orderRevision||(order.currency??'AUD')!==value.currency)fail('PAYMENT_CHANGED','The order changed after this payment was prepared.',409)
  if(p.consent!==true||p.amountCents!==value.amountCents||p.surchargeCents!==value.surchargeCents||!value.paymentMethodId)fail('CONSENT','Review and explicitly accept the exact amount and disclosed surcharge after hosted card entry.',400)
  if(value.providerPaymentId)return publicCard(await reconcileCard(env,id,await stripe.call(`/payment_intents/${value.providerPaymentId}?expand[]=latest_charge`),undefined,actor.id))
  await assertCollection(env,order,value)
  const guards=await assertSavedConsent(env,actor,value)
  if(guards.length)await commit(env.DB,actor,[...guards,audit(env.DB,actor,id,'saved-card.authorization-requested',{accountId:value.accountId,orderId:value.orderId,revision:row.revision,source:type,reason:'Buyer explicitly authorized the exact reviewed later amount and surcharge before collection.'})])
  const intent=await stripe.call('/payment_intents',{amount:String(value.amountCents+value.surchargeCents),currency:value.currency.toLowerCase(),customer:value.providerCustomerId!,payment_method:value.paymentMethodId,'payment_method_types[0]':'card',capture_method:'manual',confirm:'true',...(value.savedCardId?{off_session:'true'}:{}),return_url:`${env.AUTH_ORIGIN}/app?cardPayment=${encodeURIComponent(id)}`,'metadata[barrowPaymentId]':id,'metadata[barrowInstallationId]':value.installationId!,'metadata[barrowOrderId]':value.orderId,'metadata[barrowAccountId]':value.accountId},`barrow-authorize-${value.installationId}-${id}`)
  return publicCard(await reconcileCard(env,id,intent,undefined,actor.id))
 }
 cardMerchant(actor);const reason=text(p.reason,'Payment decision reason',1000)
 if(!value.providerPaymentId) {
  if(type==='card.cancel'&&!value.setupSessionId&&value.state==='prepared')return publicCard(await reconcileHostedState(env,id,'cancelled',actor.id))
  if(type!=='card.cancel'||!value.setupSessionId)fail('PAYMENT_STATE','There is no authorization to capture.',409)
  const session=await stripe.call(`/checkout/sessions/${value.setupSessionId}`)
  if(session.status==='open')await stripe.call(`/checkout/sessions/${value.setupSessionId}/expire`,{},`barrow-expire-${value.installationId}-${id}`)
  await commit(env.DB,actor,[audit(env.DB,actor,id,'card.cancel-requested',{accountId:value.accountId,orderId:value.orderId,revision:row.revision,source:type,reason})])
  return publicCard(await reconcileHostedState(env,id,'cancelled',actor.id))
 }
 if(type==='card.capture') {
  const order=await readOrder(env.DB,actor,value.orderId);payable(order)
  const current=await reconcileCard(env,id,await stripe.call(`/payment_intents/${value.providerPaymentId}?expand[]=latest_charge`),undefined,actor.id)
  if(current.state==='captured')return publicCard(current)
  await assertCollection(env,order,current)
  if(current.state!=='authorized')fail('PAYMENT_STATE','Stripe must verify authorization before capture.',409)
 } else if(type!=='card.cancel')fail('COMMAND','Unknown card command.',404)
 await commit(env.DB,actor,[audit(env.DB,actor,id,type==='card.capture'?'card.capture-requested':'card.cancel-requested',{accountId:value.accountId,orderId:value.orderId,revision:row.revision,source:type,reason})])
 const endpoint=type==='card.capture'?'capture':'cancel',result=await stripe.call(`/payment_intents/${value.providerPaymentId}/${endpoint}`,{},`barrow-${endpoint}-${value.installationId}-${id}`)
 return publicCard(await reconcileCard(env,id,result,undefined,actor.id))
}
