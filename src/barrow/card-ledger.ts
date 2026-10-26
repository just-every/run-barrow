import type { Bindings } from '../auth.server'
import type { CardPayment } from './card-model'
import { changed } from './access'
import { commercialAuditEvent } from './audit-event'
import { fail,supplierDate } from './model'
import { hostedUrl } from './card-provider'
export async function storedCard(env:Bindings,id:string) {
 const row=await env.DB.prepare('SELECT value_json,revision FROM bw_card_payments WHERE id=?').bind(id).first<{value_json:string;revision:string}>()
 if(!row)fail('NOT_FOUND','Card payment not found.',404)
 return {value:JSON.parse(row.value_json) as CardPayment,revision:row.revision}
}
export async function paymentTaskStatements(env:Bindings,payment:CardPayment) {
 if(!payment.exception?.verifiedAt)return []
 const id=`card-payment:${payment.id}`,row=await env.DB.prepare('SELECT value_json FROM bw_followups WHERE id=?').bind(id).first<{value_json:string}>()
 const prior=row?JSON.parse(row.value_json):null,owner=await env.DB.prepare("SELECT id FROM oa_operators WHERE status='active' AND role='owner' ORDER BY email=? DESC,created_at,id LIMIT 1").bind(env.OWNER_EMAIL).first<{id:string}>()
 if(!owner)return []
 const closed=!!payment.exception.resolvedAt&&!!payment.exception.resolution
 const value={...prior,id,kind:'card-payment',accountId:payment.accountId,sourceId:payment.id,sourcePath:`/api/barrow/payments/${payment.id}`,title:`Card payment exception ${payment.id}`,reason:payment.exception.reason,priority:1,createdAt:prior?.createdAt??payment.updatedAt,ownerId:prior?.ownerId??owner.id,nextContactDate:prior?.nextContactDate??supplierDate(new Date(payment.updatedAt)),status:closed?'closed':'open',contacts:prior?.contacts??[],...(closed?{resolution:payment.exception.resolution}:{})}
 return [env.DB.prepare('INSERT INTO bw_followups VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET value_json=excluded.value_json,revision=excluded.revision').bind(id,payment.accountId,JSON.stringify(value),crypto.randomUUID())]
}
/** Only an authenticated provider read can change money state. Browser redirect parameters are never evidence. */
export async function reconcileCard(env:Bindings,id:string,intent:any,event?:{id:string;type:string;created:number},actorId='system:stripe') {
 const before=await storedCard(env,id),p=before.value
 if(p.installationId&&intent.metadata?.barrowInstallationId!==p.installationId||p.providerPaymentId&&intent.id!==p.providerPaymentId)fail('STRIPE_MISMATCH','Stripe payment belongs to another installation or attempt.',409)
 if(p.providerCustomerId&&intent.customer!==p.providerCustomerId)fail('STRIPE_MISMATCH','Stripe payment belongs to another customer.',409)
 if(intent.livemode!==(p.livemode??false)||intent.id!==p.providerPaymentId&&intent.metadata?.barrowPaymentId!==p.id||intent.metadata?.barrowPaymentId!==p.id||intent.amount!==p.amountCents+p.surchargeCents||intent.currency!==p.currency.toLowerCase())fail('STRIPE_MISMATCH','Stripe payment references or amount do not match this agreed order.',409)
 const states:Record<string,CardPayment['state']>={requires_action:'requires_action',requires_capture:'authorized',succeeded:'captured',canceled:'cancelled',requires_payment_method:'declined',processing:'requires_action',requires_confirmation:'prepared'}
 const state=states[intent.status]
 if(!state)fail('STRIPE_STATE','Stripe has not provided a supported payment state.',409)
 if(state==='captured'&&intent.amount_received!==p.amountCents+p.surchargeCents)fail('STRIPE_MISMATCH','Stripe did not confirm receipt of the exact disclosed amount.',409)
 if(p.state==='captured'&&state!=='captured')fail('STRIPE_STATE','A captured receipt cannot be reversed by an older event.',409)
 const observed=new Date().toISOString(),at=event?new Date(event.created*1000).toISOString():observed
 const financial=!!event||['authorized','captured','declined','cancelled'].includes(state)
 const eventId=event?.id??`api:${intent.id}:${state}`
 if(await env.DB.prepare('SELECT 1 FROM bw_card_events WHERE id=?').bind(eventId).first())return p
 const exception=state==='declined'||event?.type==='payment_intent.payment_failed'?{reason:'Stripe verified that card authorization failed. The order is not paid.',verifiedAt:at}:p.exception
 const after:CardPayment={...p,state,providerPaymentId:intent.id,updatedAt:observed,...(financial?{latestFinancialAt:[p.latestFinancialAt??'',at].sort().at(-1)}:{}),...(state==='captured'?{capturedAt:p.capturedAt??at}:{}),actionUrl:p.restored?undefined:hostedUrl(intent.next_action?.redirect_to_url?.url),...(intent.latest_charge?.payment_method_details?.card?.capture_before?{captureBefore:new Date(intent.latest_charge.payment_method_details.card.capture_before*1000).toISOString()}:{}),...(exception?{exception:{...exception,...(['captured','cancelled'].includes(state)?{resolvedAt:at,resolution:`Stripe verified ${state} for ${intent.id}.`}:{})}}:{})}
 const revision=crypto.randomUUID(),receipt={id:eventId,type:event?.type??`api.${state}`,providerPaymentId:intent.id,state,amountCents:intent.amount,currency:intent.currency,verifiedAt:observed}
 const audit=commercialAuditEvent(actorId,id,`card.${state}`,{accountId:p.accountId,orderId:p.orderId,revision,source:event?'stripe.signed-event':'stripe.authenticated-response',reason:`Verified Stripe ${state}; exact agreed currency and amount retained.`})
 await env.DB.batch([env.DB.prepare('INSERT OR IGNORE INTO bw_card_events VALUES(?,?,?,?)').bind(eventId,p.id,at,JSON.stringify(receipt)),env.DB.prepare('UPDATE bw_card_payments SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify(after),revision,id,before.revision),changed(env.DB),...await paymentTaskStatements(env,after),env.DB.prepare(audit.sql).bind(...audit.params)])
 return (await storedCard(env,id)).value
}

export async function reconcileHostedState(env:Bindings,id:string,state:'declined'|'cancelled',actorId:string) {
 const before=await storedCard(env,id),p=before.value,at=new Date().toISOString(),eventId=`hosted:${id}:${state}`
 if(p.providerPaymentId)fail('PAYMENT_STATE','Reconcile the existing Stripe authorization instead.',409)
 if(await env.DB.prepare('SELECT 1 FROM bw_card_events WHERE id=?').bind(eventId).first())return p
 const exception=state==='declined'?{reason:'Stripe verified that hosted card verification failed; no charge is confirmed.',verifiedAt:at}:p.exception
 const after:CardPayment={...p,state,updatedAt:at,latestFinancialAt:at,checkoutUrl:undefined,actionUrl:undefined,...(exception?{exception:{...exception,...(state==='cancelled'?{resolvedAt:at,resolution:'Stripe checkout was ended before any payment authorization.'}:{})}}:{})},revision=crypto.randomUUID()
 const audit=commercialAuditEvent(actorId,id,`card.${state}`,{accountId:p.accountId,orderId:p.orderId,revision,source:'stripe.hosted-checkout-reconciliation',reason:state==='declined'?'Verified hosted card failure; no charge assumed.':'Owner ended the hosted attempt after verifying that no payment authorization exists.'})
 await env.DB.batch([env.DB.prepare('INSERT INTO bw_card_events VALUES(?,?,?,?)').bind(eventId,id,at,JSON.stringify({id:eventId,type:`hosted.${state}`,state,amountCents:0,currency:p.currency,verifiedAt:at})),env.DB.prepare('UPDATE bw_card_payments SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify(after),revision,id,before.revision),changed(env.DB),...await paymentTaskStatements(env,after),env.DB.prepare(audit.sql).bind(...audit.params)])
 return after
}
