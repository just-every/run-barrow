import { assertCollection, newCollection } from './card-collections'
import type { Bindings } from '../auth.server'
import { audit,changed,commit } from './access'
import { account } from './accounts'
import { companyLocationAllowed,companyRightsGuard,requireCompanyRight } from './company-policy'
import { fail,requirePerson,supplier,text,type Actor,type Order } from './model'
import { readOrder } from './orders'
import { provider } from './card-provider'
import { storedCard } from './card-ledger'
import { cardInstallation } from './card-installation'
import { reviewedCard } from './card-review'
import { openWebhookSecret,sealWebhookSecret } from './webhook-security'
import type { CardPayment } from './card-model'

type SavedCard={id:string;accountId:string;locationId:string;sourcePaymentId:string;providerAccountId:string;installationId:string;customerId:string;livemode:boolean;brand:string;last4:string;status:'active'|'revoked';consentedBy:string;consentedAt:string;revokedAt?:string;revision:string}
type SavedRow={value:SavedCard;cipher:string}
export function publicSavedCard(value:SavedCard) {
 const {id,locationId,sourcePaymentId,brand,last4,status,consentedAt,revokedAt,revision}=value
 return {id,locationId,sourcePaymentId,brand,last4,status,consentedAt,revokedAt,revision}
}
async function savedCard(env:Bindings,id:string):Promise<SavedRow> {
 const row=await env.DB.prepare('SELECT value_json,method_cipher,revision FROM bw_saved_cards WHERE id=?').bind(id).first<{value_json:string;method_cipher:string;revision:string}>()
 if(!row)fail('NOT_FOUND','Saved card not found.',404)
 return {value:{...JSON.parse(row.value_json),revision:row.revision},cipher:row.method_cipher}
}
async function permitted(env:Bindings,actor:Actor,accountId:string,locationId:string) {
 requirePerson(actor);await account(env.DB,actor,accountId)
 if(actor.staff&&actor.staff.role!=='finance')fail('FORBIDDEN','Only finance may read masked saved cards.',403)
 const member=await requireCompanyRight(env.DB,actor,accountId,'finance',locationId||undefined)
 if(member&&!companyLocationAllowed(member,locationId||undefined))fail('FORBIDDEN','Saved card consent requires finance permission at this delivery location.',403)
 return member
}
function buyerConsent(actor:Actor) {
 if(supplier(actor))fail('CONSENT','A company buyer with finance permission must explicitly grant saved-card consent.',403)
}
export async function readSavedCards(env:Bindings,actor:Actor,orderId:string) {
 const order=await readOrder(env.DB,actor,orderId),locationId=order.shipTo?.id??''
 await permitted(env,actor,order.accountId,locationId)
 const rows=await env.DB.prepare('SELECT value_json,revision FROM bw_saved_cards WHERE account_id=? AND location_id=? ORDER BY id').bind(order.accountId,locationId).all<{value_json:string;revision:string}>()
 return {methods:rows.results.map(row=>publicSavedCard({...JSON.parse(row.value_json),revision:row.revision})),canConsent:!supplier(actor)}
}
export async function assertSavedConsent(env:Bindings,actor:Actor,payment:CardPayment) {
 if(!payment.savedCardId)return []
 buyerConsent(actor)
 const {value}=await savedCard(env,payment.savedCardId),order=await readOrder(env.DB,actor,payment.orderId)
 const member=await permitted(env,actor,value.accountId,value.locationId)
 if(value.status!=='active'||value.revision!==payment.savedCardRevision||value.accountId!==order.accountId||value.locationId!==(order.shipTo?.id??''))fail('CONSENT_REVOKED','Saved-card consent is absent or changed; no new collection is permitted.',409)
 return [companyRightsGuard(env.DB,member),env.DB.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_saved_cards WHERE id=? AND revision=? AND json_extract(value_json,'$.status')='active') THEN 1 ELSE 0 END").bind(value.id,value.revision)]
}
export async function savedCardCommand(env:Bindings,actor:Actor,type:string,p:any) {
 requirePerson(actor)
 if(type==='saved-card.save') {
  buyerConsent(actor)
  const {value:payment}=await storedCard(env,text(p.paymentId,'Payment')),order=await readOrder(env.DB,actor,payment.orderId),locationId=order.shipTo?.id??''
  const member=await permitted(env,actor,payment.accountId,locationId)
  if(p.consent!==true)fail('CONSENT','Explicitly consent to saving this card for later separately authorized charges at this company and delivery location.',400)
  const reason=text(p.reason,'Consent reason',1000)
  if(payment.restored||payment.savedCardId||!payment.paymentMethodId||!payment.providerCustomerId||!payment.card||['cancelled','declined'].includes(payment.state))fail('CARD_STATE','Complete fresh Stripe-hosted card verification before saving consent.',409)
  const id=`saved-${payment.id}`,previous=await env.DB.prepare('SELECT 1 FROM bw_saved_cards WHERE id=?').bind(id).first()
  if(previous)fail('CONSENT_EXISTS','This card entry already has a consent record. Removed consent requires fresh hosted card entry.',409)
  const config=(await provider(env)).config
  if(config.account_id!==payment.providerAccountId||!!config.livemode!==payment.livemode)fail('STRIPE_MISMATCH','The reviewed card belongs to another Stripe connection.',409)
  const revision=crypto.randomUUID(),value:SavedCard={id,accountId:payment.accountId,locationId,sourcePaymentId:payment.id,providerAccountId:payment.providerAccountId,customerId:payment.providerCustomerId,installationId:payment.installationId!,livemode:!!payment.livemode,brand:payment.card.brand,last4:payment.card.last4,status:'active',consentedBy:actor.id,consentedAt:new Date().toISOString(),revision}
  const cipher=await sealWebhookSecret(env,`saved-card:${id}`,payment.paymentMethodId)
  await commit(env.DB,actor,[companyRightsGuard(env.DB,member),env.DB.prepare('INSERT INTO bw_saved_cards VALUES(?,?,?,?,?,?,?)').bind(id,value.accountId,locationId,payment.id,JSON.stringify(value),cipher,revision),audit(env.DB,actor,id,'saved-card.consented',{accountId:value.accountId,orderId:payment.orderId,revision,source:type,reason})])
  return publicSavedCard(value)
 }
 const row=await savedCard(env,text(p.methodId,'Saved card')),value=row.value
 const member=await permitted(env,actor,value.accountId,value.locationId)
 if(type==='saved-card.revoke') {
  if(actor.staff)fail('FORBIDDEN','A company finance buyer or supplier owner or admin must withdraw consent.',403)
  if(value.status==='revoked')return publicSavedCard(value)
  if(p.revision!==value.revision)fail('REVISION','Reload the current saved-card consent.',409)
  const reason=text(p.reason,'Withdrawal reason',1000),revision=crypto.randomUUID(),after={...value,status:'revoked' as const,revokedAt:new Date().toISOString(),revision}
  await commit(env.DB,actor,[companyRightsGuard(env.DB,member),env.DB.prepare('UPDATE bw_saved_cards SET value_json=?,method_cipher=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify(after),'',revision,value.id,value.revision),changed(env.DB),audit(env.DB,actor,value.id,'saved-card.revoked',{accountId:value.accountId,revision,source:type,reason})])
  return publicSavedCard(after)
 }
 if(type!=='saved-card.prepare')fail('COMMAND','Unknown saved-card command.',404)
 buyerConsent(actor)
 if(value.status!=='active'||p.revision!==value.revision)fail('CONSENT_REVOKED','Saved-card consent is absent or changed; no new collection is permitted.',409)
 const order=await readOrder(env.DB,actor,text(p.orderId,'Order'))
 if(order.accountId!==value.accountId||value.locationId!==(order.shipTo?.id??''))fail('CONSENT_SCOPE','This saved card is not authorized for this company and delivery location.',403)
 if(order.status!=='approved'||!order.invoice||!order.pierOrderId)fail('PAYMENT_ORDER','Saved-card collection needs a fully reserved approved order and issued invoice.',409)
 const stripe=await provider(env),installationId=await cardInstallation(env.DB)
 if(stripe.config.account_id!==value.providerAccountId||!!stripe.config.livemode!==value.livemode||installationId!==value.installationId)fail('STRIPE_MISMATCH','Saved-card consent belongs to another Stripe connection.',409)
 const paymentMethodId=await openWebhookSecret(env,`saved-card:${value.id}`,row.cipher),method=await stripe.call(`/payment_methods/${encodeURIComponent(paymentMethodId)}`)
 if(method.customer!==value.customerId||method.type!=='card'||method.livemode!==undefined&&method.livemode!==value.livemode)fail('STRIPE_MISMATCH','Stripe did not verify this saved card and customer.',409)
 const selected=await account(env.DB,actor,value.accountId)
 const base=await newCollection(env,actor,order,p,stripe.config)
 if(base.state!=='prepared'||base.paymentMethodId)return base
 await assertCollection(env,order,base)
 const stored=await storedCard(env,base.id)
 const payment:CardPayment={...base,...reviewedCard(stripe.config,order,selected.value.state??'',method,base.amountCents),providerCustomerId:value.customerId,paymentMethodId,savedCardId:value.id,savedCardRevision:value.revision}
 await commit(env.DB,actor,[...await assertSavedConsent(env,actor,payment),env.DB.prepare('UPDATE bw_card_payments SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify(payment),crypto.randomUUID(),payment.id,stored.revision),changed(env.DB),audit(env.DB,actor,payment.id,'saved-card.reviewed',{accountId:value.accountId,orderId:order.id,revision:order.revision,source:type,reason:'Buyer reviewed the exact invoice principal with saved-card consent; collection requires separate exact-amount authorization.'})])
 return (await storedCard(env,payment.id)).value
}
