import { allocateDeposit,depositReceipts } from './deposits'
import { creditBasis } from './credit-basis'
import { companyOrderScope } from './company-access'
import type { Bindings } from '../auth.server'
import { audit,changed,commit } from './access'
import { account } from './accounts'
import { requireCompanyRight } from './company-policy'
import { creditAuthority } from './credit-access'
import { storedCard } from './card-ledger'
import { reconcileCard } from './card-ledger'
import { provider } from './card-provider'
import { creditAvailable,creditRecords,financialGuard,invoiceOutstanding,publicCredit,storedCredit } from './credit-ledger'
import { fail,integer,requirePerson,text,type Actor,type Order } from './model'
import { readOrder } from './orders'
import type { CreditApplication,CreditLine,CreditNote,PaymentAllocation } from './credit-model'

export async function creditAccess(env:Bindings,actor:Actor,accountId:string,orderId?:string) {
 requirePerson(actor);await account(env.DB,actor,accountId);const order=orderId?await readOrder(env.DB,actor,orderId):undefined;await requireCompanyRight(env.DB,actor,accountId,'finance',order?.shipTo?.id)
}
export async function readCredit(env:Bindings,actor:Actor,id:string) {
 const credit=await storedCredit(env.DB,id);await creditAccess(env,actor,credit.accountId,credit.orderId)
 const records=await creditRecords(env.DB)
 return {...publicCredit(credit),availableCents:creditAvailable(credit,records),applications:records.applications.filter(row=>row.creditId===id),refunds:records.refunds.filter(row=>row.creditId===id)}
}
export async function readCredits(env:Bindings,actor:Actor,orderId:string) {
 const order=await readOrder(env.DB,actor,orderId);await creditAccess(env,actor,order.accountId,order.id)
 const records=await creditRecords(env.DB),scope=companyOrderScope(actor),visible=new Set((await env.DB.prepare('SELECT id FROM bw_orders WHERE account_id=?'+scope.sql).bind(order.accountId,...scope.values).all<{id:string}>()).results.map(row=>row.id))
 return {depositReceipts:await depositReceipts(env,actor,order,records),creditLimitCents:actor.staff?actor.staff.creditLimitCents??0:null,refundLimitCents:actor.staff?actor.staff.refundLimitCents??0:null,canAct:!actor.agent&&(!actor.staff&&['owner','admin'].includes(actor.role)||actor.staff?.role==='finance'&&!!((actor.staff.creditLimitCents??0)+(actor.staff.refundLimitCents??0))),credits:records.credits.filter(row=>row.accountId===order.accountId&&visible.has(row.orderId)).map(row=>({...publicCredit(row),availableCents:creditAvailable(row,records)})),applications:records.applications.filter(row=>row.orderId===orderId),allocations:records.allocations.filter(row=>row.orderId===orderId),refunds:records.refunds.filter(row=>row.accountId===order.accountId&&visible.has(row.orderId)),outstandingCents:invoiceOutstanding(orderId,order.totalCents,records)}
}
function issued(order:Order,allowCancelled=false) {
 if((order.status!=='approved'&&!(allowCancelled&&order.status==='cancelled'&&order.release?.confirmedAt))||!order.invoice||!order.pierOrderId)fail('CREDIT_ORDER','Use a fully reserved approved order with an issued invoice.',409)
}
export async function allocateCard(env:Bindings,actor:Actor,p:any) {
 requirePerson(actor)
 const payment=(await storedCard(env,text(p.paymentId,'Payment'))).value,order=await readOrder(env.DB,actor,text(p.orderId,'Invoice order'));issued(order,true)
 if(payment.orderId!==order.id)return allocateDeposit(env,actor,p,order,payment)
 if(payment.restored)fail('RESTORED','Restored receipts cannot create new allocations.',409)
 if(payment.accountId!==order.accountId||payment.orderId!==order.id||payment.currency!==order.currency)fail('ALLOCATION_SCOPE','Allocate a captured receipt only to its original invoice and currency.',409)
 const amountCents=integer(p.amountCents,'Allocation cents',1);creditAuthority(actor,order.accountId,amountCents,order.currency??'AUD')
 const reason=text(p.reason,'Allocation reason',1000),guards=await financialGuard(env.DB),records=await creditRecords(env.DB),existing=records.allocations.find(row=>row.paymentId===payment.id)
 if(existing){if(existing.amountCents!==amountCents)fail('ALLOCATION_EXISTS','This receipt already has an immutable allocation.',409);return existing}
 const stripe=await provider(env)
 if(stripe.config.account_id!==payment.providerAccountId||!payment.providerPaymentId)fail('STRIPE_MISMATCH','The receipt has no authorization at the connected merchant.',409)
 const verified=await reconcileCard(env,payment.id,await stripe.call(`/payment_intents/${encodeURIComponent(payment.providerPaymentId)}?expand[]=latest_charge`),undefined,actor.id)
 if(verified.state!=='captured'||amountCents>verified.amountCents||amountCents>invoiceOutstanding(order.id,order.totalCents,records))fail('ALLOCATION_AMOUNT','Only verified captured principal up to the unpaid invoice can be allocated.',409)
 const id=`allocation-${payment.id}`,revision=crypto.randomUUID(),value:PaymentAllocation={id,paymentId:payment.id,accountId:order.accountId,orderId:order.id,currency:payment.currency,amountCents,createdAt:new Date().toISOString(),actorId:actor.id,reason,revision,providerPaymentId:payment.providerPaymentId,providerAccountId:payment.providerAccountId,installationId:payment.installationId}
 await commit(env.DB,actor,[...guards,env.DB.prepare('INSERT INTO bw_card_allocations VALUES(?,?,?,?,?,?)').bind(id,order.accountId,order.id,payment.id,JSON.stringify(value),revision),audit(env.DB,actor,id,'card.allocated',{accountId:order.accountId,orderId:order.id,revision,source:'card.allocate',reason})])
 return value
}
export async function issueCredit(env:Bindings,actor:Actor,p:any) {
 requirePerson(actor)
 const order=await readOrder(env.DB,actor,text(p.orderId,'Original order'));if(!order.invoice||!order.pierOrderId||!['approved','cancelled'].includes(order.status))fail('CREDIT_ORDER','Credit needs an originally approved and invoiced order.',409)
 const reason=text(p.reason,'Credit reason',1000),guards=await financialGuard(env.DB),records=await creditRecords(env.DB)
 const sourceKey=p.kind==='price-correction'?`price-correction:${order.id}:${typeof p.sourceReference==='string'?p.sourceReference.trim():''}`:p.kind==='cancellation'?`cancellation:${order.id}`:p.returnId
 const existing=records.credits.find(row=>row.returnId===sourceKey&&row.orderId===order.id)
 if(existing){creditAuthority(actor,order.accountId,existing.amountCents,order.currency??'AUD');return publicCredit(existing)}
 const basis=await creditBasis(env,order,p,records.credits),returnId=basis.sourceId
 creditAuthority(actor,order.accountId,basis.amountCents,order.currency??'AUD')
 const {id,lines,amountCents,freightCents,taxCents,kind,sourceId}=basis,revision=crypto.randomUUID(),at=new Date().toISOString(),commission=await env.DB.prepare('SELECT value_json FROM bw_order_commissions WHERE order_id=?').bind(order.id).first<{value_json:string}>()
 const credit:CreditNote={id,kind,sourceId,freightCents,taxCents,taxBasis:'not recorded',...(order.delivery?{freightBasis:order.delivery}:{}),accountId:order.accountId,orderId:order.id,orderRevision:order.revision,currency:order.currency??'AUD',amountCents,returnId,createdAt:at,actorId:actor.id,reason,revision,lines,...(commission?{commissionSnapshot:JSON.parse(commission.value_json)}:{})}
 const autoApplied=Math.min(amountCents,invoiceOutstanding(order.id,order.totalCents,records)),application:CreditApplication={id:`application-${id}-${order.id}`,creditId:id,accountId:order.accountId,orderId:order.id,currency:credit.currency,amountCents:autoApplied,createdAt:at,actorId:actor.id,reason:'Credit first reduces the original unpaid invoice principal.',revision:crypto.randomUUID()}
 await commit(env.DB,actor,[...guards,env.DB.prepare('INSERT INTO bw_credit_notes VALUES(?,?,?,?,?,?)').bind(id,order.accountId,order.id,returnId,JSON.stringify(credit),revision),...(autoApplied?[env.DB.prepare('INSERT INTO bw_credit_applications VALUES(?,?,?,?,?,?)').bind(application.id,order.accountId,order.id,id,JSON.stringify(application),application.revision)]:[]),audit(env.DB,actor,id,'credit.issued',{accountId:order.accountId,orderId:order.id,revision,source:returnId,reason})])
 return publicCredit(credit)
}
export async function applyCredit(env:Bindings,actor:Actor,p:any) {
 requirePerson(actor)
 const credit=await storedCredit(env.DB,text(p.creditId,'Credit note')),order=await readOrder(env.DB,actor,text(p.orderId,'Invoice order'));issued(order)
 if(credit.accountId!==order.accountId||credit.currency!==order.currency)fail('CREDIT_SCOPE','Apply credit only within its original company and currency.',409)
 const amountCents=integer(p.amountCents,'Applied cents',1);creditAuthority(actor,order.accountId,amountCents,order.currency??'AUD')
 const reason=text(p.reason,'Application reason',1000),guards=await financialGuard(env.DB),records=await creditRecords(env.DB),id=`application-${credit.id}-${order.id}`,existing=records.applications.find(row=>row.id===id)
 if(existing){if(existing.amountCents!==amountCents)fail('CREDIT_APPLIED','This credit already has an immutable application to this invoice.',409);return existing}
 if(p.revision!==credit.revision)fail('REVISION','Reload the current credit note.',409)
 if(amountCents>creditAvailable(credit,records)||amountCents>invoiceOutstanding(order.id,order.totalCents,records))fail('CREDIT_AMOUNT','The application exceeds available credit or unpaid invoice principal.',409)
 const revision=crypto.randomUUID(),value:CreditApplication={id,creditId:credit.id,accountId:order.accountId,orderId:order.id,currency:credit.currency,amountCents,createdAt:new Date().toISOString(),actorId:actor.id,reason,revision}
 await commit(env.DB,actor,[...guards,env.DB.prepare('UPDATE bw_credit_notes SET revision=? WHERE id=? AND revision=?').bind(crypto.randomUUID(),credit.id,credit.revision),changed(env.DB),env.DB.prepare('INSERT INTO bw_credit_applications VALUES(?,?,?,?,?,?)').bind(id,order.accountId,order.id,credit.id,JSON.stringify(value),revision),audit(env.DB,actor,id,'credit.applied',{accountId:order.accountId,orderId:order.id,revision,source:credit.id,reason})])
 return value
}
