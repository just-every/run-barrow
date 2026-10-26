import type { Bindings } from '../auth.server'
import { audit,changed,commit } from './access'
import { commercialAuditEvent } from './audit-event'
import { cardMerchant } from './card-settings'
import { storedCard } from './card-ledger'
import { provider } from './card-provider'
import { cardInstallation } from './card-installation'
import { creditAccess } from './credit-notes'
import { creditAvailable,creditRecords,financialGuard,storedCredit,storedRefund } from './credit-ledger'
import { fail,integer,text,type Actor } from './model'
import type { CreditRefund } from './credit-model'

export async function readRefund(env:Bindings,actor:Actor,id:string) {
 const value=await storedRefund(env.DB,id);await creditAccess(env,actor,value.accountId,value.orderId);return value
}
/** Authenticated provider reads, never browser callbacks, establish refund effects. */
export async function reconcileRefund(env:Bindings,id:string,result:any,event?:{id:string;type:string;created:number},actorId='system:stripe') {
 const before=await storedRefund(env.DB,id)
 if(result.metadata?.barrowRefundId!==id||result.metadata?.barrowInstallationId!==before.installationId||result.livemode!==before.livemode||result.payment_intent!==before.providerPaymentId||result.amount!==before.amountCents||result.currency!==before.currency.toLowerCase()||before.providerRefundId&&before.providerRefundId!==result.id)fail('STRIPE_MISMATCH','Stripe refund does not match the approved credit, receipt, amount and currency.',409)
 const statuses:Record<string,CreditRefund['status']>={pending:'pending',requires_action:'pending',succeeded:'succeeded',failed:'failed',canceled:'cancelled'},status=statuses[result.status]
 if(!status)fail('STRIPE_STATE','Stripe has not confirmed a supported refund state.',409)
 if(before.status==='succeeded'&&status!=='succeeded')fail('STRIPE_STATE','A completed refund cannot be reversed by an older callback.',409)
 const eventId=event?.id??`api:${result.id}:${status}`
 if(await env.DB.prepare('SELECT 1 FROM bw_refund_events WHERE id=?').bind(eventId).first())return before
 const observed=new Date().toISOString(),at=event?new Date(event.created*1000).toISOString():observed,revision=crypto.randomUUID(),after:CreditRefund={...before,status,providerRefundId:result.id,updatedAt:observed,latestFinancialAt:[before.latestFinancialAt,at].sort().at(-1)!,revision,...(status==='succeeded'?{completedAt:before.completedAt??at}:{})}
 const entry={id:eventId,type:event?.type??`api.${status}`,providerRefundId:result.id,status,amountCents:before.amountCents,currency:before.currency,verifiedAt:observed},decision=commercialAuditEvent(actorId,id,`refund.${status}`,{accountId:before.accountId,orderId:before.orderId,revision,source:event?'stripe.signed-event':'stripe.authenticated-response',reason:`Stripe verified refund ${status} for the exact approved credit amount.`})
 await env.DB.batch([env.DB.prepare('UPDATE bw_credit_refunds SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify(after),revision,id,before.revision),changed(env.DB),env.DB.prepare('INSERT INTO bw_refund_events VALUES(?,?,?,?)').bind(eventId,id,at,JSON.stringify(entry)),env.DB.prepare(decision.sql).bind(...decision.params)])
 return after
}
export async function refundCommand(env:Bindings,actor:Actor,type:string,p:any) {
 cardMerchant(actor)
 if(type==='refund.refresh') {
  const value=await storedRefund(env.DB,text(p.refundId,'Refund'))
  if(value.restored)fail('RESTORED','Restored refund history cannot initiate provider operations.',409)
  if(!value.providerRefundId)fail('REFUND_UNCERTAIN','Retry the same approved refund request to reconcile its stable Stripe idempotency key.',409)
  const stripe=await provider(env)
  if(stripe.config.account_id!==value.providerAccountId)fail('STRIPE_MISMATCH','This refund belongs to another Stripe merchant.',409)
  return reconcileRefund(env,value.id,await stripe.call(`/refunds/${encodeURIComponent(value.providerRefundId)}`),undefined,actor.id)
 }
 const credit=await storedCredit(env.DB,text(p.creditId,'Credit note')),payment=(await storedCard(env,text(p.paymentId,'Captured payment'))).value
 const amountCents=integer(p.amountCents,'Refund cents',1),reason=text(p.reason,'Refund reason',1000)
 if(p.consent!==true)fail('CONSENT','Explicitly approve the exact credit amount returning to the original card.',400)
 if(payment.restored||payment.state!=='captured'||!payment.providerPaymentId||payment.orderId!==credit.orderId||payment.accountId!==credit.accountId||payment.currency!==credit.currency)fail('REFUND_SOURCE','Refund only a captured receipt for the credit’s original order and currency.',409)
 const stripe=await provider(env),installationId=await cardInstallation(env.DB)
 if(stripe.config.account_id!==payment.providerAccountId||!!stripe.config.livemode!==payment.livemode||payment.installationId!==installationId)fail('STRIPE_MISMATCH','The captured payment belongs to another Stripe connection.',409)
 const guards=await financialGuard(env.DB),records=await creditRecords(env.DB),id=`refund-${credit.id}`,existing=records.refunds.find(row=>row.id===id)
 let value:CreditRefund
 if(existing) {
  if(existing.amountCents!==amountCents||existing.paymentId!==payment.id)fail('REFUND_EXISTS','This credit already has an immutable approved refund request.',409)
  if(existing.restored)fail('RESTORED','Restored refund history cannot initiate provider operations.',409)
  if(existing.providerRefundId)return reconcileRefund(env,id,await stripe.call(`/refunds/${encodeURIComponent(existing.providerRefundId)}`),undefined,actor.id)
  value=existing
 } else {
  if(p.revision!==credit.revision)fail('REVISION','Reload the current credit note.',409)
  const paid=records.allocations.filter(row=>row.paymentId===payment.id).reduce((sum,row)=>sum+row.amountCents,0),refunded=records.refunds.filter(row=>row.paymentId===payment.id&&!['failed','cancelled'].includes(row.status)).reduce((sum,row)=>sum+row.amountCents,0)
  if(amountCents>creditAvailable(credit,records)||amountCents>paid-refunded)fail('REFUND_AMOUNT','Refund cannot exceed unused credit and verified allocated paid principal.',409)
  const at=new Date().toISOString(),revision=crypto.randomUUID()
  value={id,creditId:credit.id,accountId:credit.accountId,orderId:credit.orderId,paymentId:payment.id,providerPaymentId:payment.providerPaymentId,providerAccountId:payment.providerAccountId,installationId,livemode:!!payment.livemode,currency:credit.currency,amountCents,status:'requested',createdAt:at,updatedAt:at,latestFinancialAt:at,actorId:actor.id,reason,revision}
  await commit(env.DB,actor,[...guards,env.DB.prepare('UPDATE bw_credit_notes SET revision=? WHERE id=? AND revision=?').bind(crypto.randomUUID(),credit.id,credit.revision),changed(env.DB),env.DB.prepare('INSERT INTO bw_credit_refunds VALUES(?,?,?,?,?,?)').bind(id,credit.accountId,credit.orderId,credit.id,JSON.stringify(value),revision),audit(env.DB,actor,id,'refund.requested',{accountId:credit.accountId,orderId:credit.orderId,revision,source:credit.id,reason})])
 }
 const result=await stripe.call('/refunds',{payment_intent:value.providerPaymentId,amount:String(value.amountCents),'metadata[barrowRefundId]':id,'metadata[barrowInstallationId]':installationId,'metadata[barrowCreditId]':credit.id},`barrow-refund-${installationId}-${id}`)
 return reconcileRefund(env,id,result,undefined,actor.id)
}
