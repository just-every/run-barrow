import type { Bindings } from '../auth.server'
import { audit, commit } from './access'
import { now } from './clock'
import { cardInstallation } from './card-installation'
import type { CardPayment, CardConnection } from './card-model'
import { creditRecords, financialGuard, invoiceOutstanding } from './credit-ledger'
import { unappliedPrincipal } from './deposits'
import { fail, integer, text, type Actor, type Order } from './model'

export async function collectionState(env:Bindings,order:Order,omitId='') {
 const records=await creditRecords(env.DB)
 const rows=(await env.DB.prepare('SELECT value_json FROM bw_card_payments WHERE order_id=? ORDER BY id').bind(order.id).all<{value_json:string}>()).results.map(row=>JSON.parse(row.value_json) as CardPayment)
 const outstandingCents=order.prebook?.depositCents??invoiceOutstanding(order.id,order.totalCents,records)
 const reserved=rows.filter(row=>row.id!==omitId&&!['cancelled','declined'].includes(row.state)).reduce((sum,row)=>sum+(order.prebook?row.amountCents:row.state==='captured'?unappliedPrincipal(row,records):row.restored?0:row.amountCents),0)
 return {rows,outstandingCents,availableCents:Math.max(0,outstandingCents-reserved)}
}
export function collectionKey(value:unknown) {
 const key=text(value,'Collection identity',80)
 if(!/^[A-Za-z0-9-]+$/.test(key))fail('INPUT','Use letters, numbers and hyphens for the collection identity.',400)
 return key
}
export const orderGuard=(env:Bindings,order:Order)=>env.DB.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_orders WHERE id=? AND revision=?) THEN 1 ELSE 0 END').bind(order.id,order.revision)
export async function assertCollection(env:Bindings,order:Order,payment:CardPayment) {
 const current=await collectionState(env,order,payment.id)
 if(current.rows.some(row=>row.restored)||payment.amountCents>current.availableCents)fail('PAYMENT_BALANCE','This collection exceeds current unpaid principal after other receipts and planned payments. Review credits and cancel unused attempts first.',409)
}
export async function newCollection(env:Bindings,actor:Actor,order:Order,p:any,config:CardConnection):Promise<CardPayment> {
 if(order.prebookRelease?.restored)fail('RESTORED','Restored release history cannot initiate collections.',409)
 const key=p.collectionKey===undefined?undefined:collectionKey(p.collectionKey)
 if(order.prebook&&(key||p.amountCents!==undefined&&p.amountCents!==order.prebook.depositCents))fail('PREBOOK_DEPOSIT','Collect the original deposit requirement once; partial balance collections belong to release invoices.',409)
 const id=key?`card-${order.id}-${key}`:`card-${order.id}`
 const guards=await financialGuard(env.DB),current=await collectionState(env,order),existing=current.rows.find(row=>row.id===id)
 if(existing){if(p.amountCents!==undefined&&p.amountCents!==existing.amountCents)fail('PAYMENT_CHANGED','A collection identity retains its original exact principal.',409);return existing}
 if(current.rows.some(row=>row.restored))fail('RESTORED','Restored financial history cannot initiate collections.',409)
 const amountCents=p.amountCents===undefined?current.availableCents:integer(p.amountCents,'Collection cents',1)
 if(amountCents<=0||amountCents>current.availableCents)fail('PAYMENT_BALANCE','Collect only the available unpaid principal after other receipts and planned payments.',409)
 const at=(await now()).toISOString(),value:CardPayment={id,collectionKey:key,installationId:await cardInstallation(env.DB),orderId:order.id,accountId:order.accountId,orderRevision:order.revision,currency:order.currency??'AUD',amountCents,surchargeCents:0,state:'prepared',createdAt:at,updatedAt:at,latestFinancialAt:at,providerAccountId:config.account_id,livemode:!!config.livemode}
 await commit(env.DB,actor,[...guards,orderGuard(env,order),env.DB.prepare('INSERT INTO bw_card_payments VALUES(?,?,?,?,?)').bind(id,order.accountId,order.id,JSON.stringify(value),crypto.randomUUID()),audit(env.DB,actor,id,'card.collection-prepared',{accountId:order.accountId,orderId:order.id,revision:order.revision,source:order.id,reason:'Explicitly prepared exact invoice principal; hosted verification and separate authorization remain required.'})])
 return value
}
export async function scheduleCollections(env:Bindings,actor:Actor,order:Order,p:any,config:CardConnection) {
 if(order.prebook||order.prebookRelease?.restored)fail('PAYMENT_ORDER','Schedule remaining payments only on active issued invoices.',409)
 if(p.orderRevision!==order.revision)fail('CHANGED','Reload the invoice before scheduling its balance.',409)
 const key=collectionKey(p.scheduleKey),scheduleId=`schedule-${order.id}-${key}`,reason=text(p.reason,'Schedule reason',1000)
 if(!Array.isArray(p.entries)||p.entries.length<1||p.entries.length>8)fail('INPUT','Schedule one to eight dated payments.',400)
 const entries=p.entries.map((entry:any)=>{
  const dueDate=text(entry.dueDate,'Payment due date',10)
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)||!Number.isFinite(Date.parse(dueDate+'T00:00:00Z'))||new Date(dueDate+'T00:00:00Z').toISOString().slice(0,10)!==dueDate)fail('INPUT','Use a valid payment calendar date.',400)
  return {dueDate,amountCents:integer(entry.amountCents,'Scheduled cents',1)}
 }) as {dueDate:string;amountCents:number}[]
 const guards=await financialGuard(env.DB),current=await collectionState(env,order),existing=current.rows.filter(row=>row.scheduleId===scheduleId)
 if(existing.length){if(JSON.stringify(existing.map(row=>({dueDate:row.dueDate,amountCents:row.amountCents})))!==JSON.stringify(entries))fail('PAYMENT_CHANGED','A saved schedule keeps its original dated amounts.',409);return {payments:existing}}
 if(current.rows.some(row=>row.restored))fail('RESTORED','Restored financial history cannot schedule new collections.',409)
 if(entries.reduce((sum,row)=>sum+row.amountCents,0)!==current.availableCents)fail('PAYMENT_BALANCE','Scheduled principal must equal the available invoice balance after receipts and other planned payments.',409)
 const at=(await now()).toISOString(),installationId=await cardInstallation(env.DB)
 const payments:CardPayment[]=entries.map((entry,index)=>({id:`card-${order.id}-${key}-${index+1}`,collectionKey:`${key}-${index+1}`,scheduleId,...entry,scheduledBy:actor.id,scheduledAt:at,scheduleReason:reason,installationId,orderId:order.id,accountId:order.accountId,orderRevision:order.revision,currency:order.currency??'AUD',surchargeCents:0,state:'prepared',createdAt:at,updatedAt:at,latestFinancialAt:at,providerAccountId:config.account_id,livemode:!!config.livemode}))
 await commit(env.DB,actor,[...guards,orderGuard(env,order),...payments.map(value=>env.DB.prepare('INSERT INTO bw_card_payments VALUES(?,?,?,?,?)').bind(value.id,order.accountId,order.id,JSON.stringify(value),crypto.randomUUID())),audit(env.DB,actor,scheduleId,'card.balance-scheduled',{accountId:order.accountId,orderId:order.id,revision:order.revision,source:order.id,reason})])
 return {payments}
}
