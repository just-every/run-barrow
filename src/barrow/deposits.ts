import type { Bindings } from '../auth.server'
import { audit,commit } from './access'
import { now } from './clock'
import { storedCard,reconcileCard } from './card-ledger'
import { publicCard } from './card-payments'
import type { CardPayment } from './card-model'
import { creditAuthority } from './credit-access'
import { creditRecords,financialGuard,invoiceOutstanding } from './credit-ledger'
import type { PaymentAllocation } from './credit-model'
import { readOrder } from './orders'
import { provider } from './card-provider'
import { cardInstallation } from './card-installation'
import { fail,integer,text,type Actor,type Order } from './model'

type Records=Awaited<ReturnType<typeof creditRecords>>
/** Reserved and returned principal never becomes new allocatable cash. Surcharges are excluded. */
export function unappliedPrincipal(payment:CardPayment,records:Records) {
 return Math.max(0,payment.amountCents-records.allocations.filter(row=>row.paymentId===payment.id).reduce((sum,row)=>sum+row.amountCents,0)-records.refunds.filter(row=>row.paymentId===payment.id&&!['failed','cancelled'].includes(row.status)).reduce((sum,row)=>sum+row.amountCents,0))
}
const seller=(order:Order)=>JSON.stringify([order.buyingProfile?.brandId??null,order.buyingProfile?.seller??null])
async function sourceOrder(env:Bindings,actor:Actor,order:Order) {
 if(!order.prebookRelease)return null
 const source=await readOrder(env.DB,actor,order.prebookRelease.orderId)
 const window=source.prebook?.windows.find(row=>row.id===order.prebookRelease!.windowId&&row.releaseId===order.id)
 if(!window||source.status!=='approved'||source.accountId!==order.accountId||source.currency!==order.currency||seller(source)!==seller(order))fail('DEPOSIT_SCOPE','Use an original commitment and its linked release in the same company, seller and currency.',409)
 return source
}
export async function depositReceipts(env:Bindings,actor:Actor,order:Order,records:Records) {
 const source=await sourceOrder(env,actor,order)
 if(!source)return []
 const rows=await env.DB.prepare("SELECT value_json FROM bw_card_payments WHERE order_id=? AND json_extract(value_json,'$.state')='captured'").bind(source.id).all<{value_json:string}>()
 return rows.results.map(row=>JSON.parse(row.value_json) as CardPayment).map(payment=>({...publicCard(payment),availableCents:unappliedPrincipal(payment,records),sourceRevision:source.revision}))
}
export async function allocateDeposit(env:Bindings,actor:Actor,p:any,order:Order,payment:CardPayment) {
 const source=await sourceOrder(env,actor,order)
 if(!source||source.id!==payment.orderId||payment.accountId!==order.accountId||payment.currency!==order.currency||payment.amountCents!==source.prebook!.depositCents)fail('DEPOSIT_SCOPE','Allocate only the verified deposit of this release’s original seasonal commitment.',409)
 if(source.prebook!.restored||order.prebookRelease?.restored||payment.restored)fail('RESTORED','Restored financial history cannot create allocations.',409)
 const amountCents=integer(p.amountCents,'Allocation cents',1);creditAuthority(actor,order.accountId,amountCents,payment.currency)
 const reason=text(p.reason,'Allocation reason',1000),guards=await financialGuard(env.DB),records=await creditRecords(env.DB),id=`allocation-${payment.id}-${order.id}`,existing=records.allocations.find(row=>row.id===id)
 if(existing){if(existing.amountCents!==amountCents)fail('ALLOCATION_EXISTS','This receipt already has an immutable allocation to this release.',409);return existing}
 if(p.orderRevision!==order.revision||p.sourceRevision!==source.revision)fail('CHANGED','Reload the release and original commitment before allocating its deposit.',409)
 const stripe=await provider(env)
 if(stripe.config.account_id!==payment.providerAccountId||!!stripe.config.livemode!==!!payment.livemode||payment.installationId!==await cardInstallation(env.DB)||!payment.providerPaymentId)fail('STRIPE_MISMATCH','The deposit must belong to the current installation and connected merchant.',409)
 const verified=await reconcileCard(env,payment.id,await stripe.call(`/payment_intents/${encodeURIComponent(payment.providerPaymentId)}?expand[]=latest_charge`),undefined,actor.id)
 const stored=await storedCard(env,payment.id)
 if(verified.state!=='captured'||amountCents>unappliedPrincipal(verified,records)||amountCents>invoiceOutstanding(order.id,order.totalCents,records))fail('ALLOCATION_AMOUNT','Use only unallocated verified principal up to the unpaid release invoice, excluding surcharges and refund reservations.',409)
 const revision=crypto.randomUUID(),value:PaymentAllocation={id,paymentId:payment.id,accountId:order.accountId,orderId:order.id,currency:payment.currency,amountCents,createdAt:(await now()).toISOString(),actorId:actor.id,reason,revision,sourceOrderId:source.id,sourceRevision:source.revision,orderRevision:order.revision,windowId:order.prebookRelease!.windowId,providerPaymentId:payment.providerPaymentId,providerAccountId:payment.providerAccountId,installationId:payment.installationId}
 await commit(env.DB,actor,[...guards,...[order,source].map(row=>env.DB.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_orders WHERE id=? AND revision=?) THEN 1 ELSE 0 END').bind(row.id,row.revision)),env.DB.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_card_payments WHERE id=? AND revision=?) THEN 1 ELSE 0 END').bind(payment.id,stored.revision),env.DB.prepare('INSERT INTO bw_card_allocations VALUES(?,?,?,?,?,?)').bind(id,order.accountId,order.id,payment.id,JSON.stringify(value),revision),audit(env.DB,actor,id,'deposit.allocated',{accountId:order.accountId,orderId:order.id,revision,source:payment.id,reason})])
 return value
}
