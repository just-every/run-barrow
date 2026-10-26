import { companyOrderScope } from './company-access'
import type { Bindings } from '../auth.server'
import { audit,changed,commit } from './access'
import { account } from './accounts'
import { requireCompanyRight } from './company-policy'
import { cardMerchant } from './card-settings'
import { storedCard } from './card-ledger'
import { reconcileCard } from './card-ledger'
import { provider } from './card-provider'
import { creditAvailable,creditRecords,financialGuard,invoiceOutstanding,publicCredit,storedCredit } from './credit-ledger'
import { commissionSources } from './commission-source'
import { decimal,pierOrigin,pierState } from './pier'
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
 return {canAct:!actor.agent&&!actor.staff&&['owner','admin'].includes(actor.role),credits:records.credits.filter(row=>row.accountId===order.accountId&&visible.has(row.orderId)).map(row=>({...publicCredit(row),availableCents:creditAvailable(row,records)})),applications:records.applications.filter(row=>row.orderId===orderId),allocations:records.allocations.filter(row=>row.orderId===orderId),refunds:records.refunds.filter(row=>row.accountId===order.accountId&&visible.has(row.orderId)),outstandingCents:invoiceOutstanding(orderId,order.totalCents,records)}
}
function issued(order:Order) {
 if(order.status!=='approved'||!order.invoice||!order.pierOrderId)fail('CREDIT_ORDER','Use a fully reserved approved order with an issued invoice.',409)
}
export async function allocateCard(env:Bindings,actor:Actor,p:any) {
 cardMerchant(actor)
 const payment=(await storedCard(env,text(p.paymentId,'Payment'))).value,order=await readOrder(env.DB,actor,text(p.orderId,'Invoice order'));issued(order)
 if(payment.restored)fail('RESTORED','Restored receipts cannot create new allocations.',409)
 if(payment.accountId!==order.accountId||payment.orderId!==order.id||payment.currency!==order.currency)fail('ALLOCATION_SCOPE','Allocate a captured receipt only to its original invoice and currency.',409)
 const amountCents=integer(p.amountCents,'Allocation cents',1),reason=text(p.reason,'Allocation reason',1000),guards=await financialGuard(env.DB),records=await creditRecords(env.DB),existing=records.allocations.find(row=>row.paymentId===payment.id)
 if(existing){if(existing.amountCents!==amountCents)fail('ALLOCATION_EXISTS','This receipt already has an immutable allocation.',409);return existing}
 const stripe=await provider(env)
 if(stripe.config.account_id!==payment.providerAccountId||!payment.providerPaymentId)fail('STRIPE_MISMATCH','The receipt has no authorization at the connected merchant.',409)
 const verified=await reconcileCard(env,payment.id,await stripe.call(`/payment_intents/${encodeURIComponent(payment.providerPaymentId)}?expand[]=latest_charge`),undefined,actor.id)
 if(verified.state!=='captured'||amountCents>verified.amountCents||amountCents>invoiceOutstanding(order.id,order.totalCents,records))fail('ALLOCATION_AMOUNT','Only verified captured principal up to the unpaid invoice can be allocated.',409)
 const id=`allocation-${payment.id}`,revision=crypto.randomUUID(),value:PaymentAllocation={id,paymentId:payment.id,accountId:order.accountId,orderId:order.id,currency:payment.currency,amountCents,createdAt:new Date().toISOString(),actorId:actor.id,reason,revision}
 await commit(env.DB,actor,[...guards,env.DB.prepare('INSERT INTO bw_card_allocations VALUES(?,?,?,?,?,?)').bind(id,order.accountId,order.id,payment.id,JSON.stringify(value),revision),audit(env.DB,actor,id,'card.allocated',{accountId:order.accountId,orderId:order.id,revision,source:'card.allocate',reason})])
 return value
}
export async function issueCredit(env:Bindings,actor:Actor,p:any) {
 cardMerchant(actor)
 const order=await readOrder(env.DB,actor,text(p.orderId,'Original order'));issued(order)
 const returnId=text(p.returnId,'Physical return receipt'),reason=text(p.reason,'Credit reason',1000),guards=await financialGuard(env.DB),records=await creditRecords(env.DB),existing=records.credits.find(row=>row.returnId===returnId)
 if(existing){if(existing.orderId!==order.id)fail('CREDIT_SOURCE','Return receipt is already credited to another order.',409);return publicCredit(existing)}
 const [state,origin]=await Promise.all([pierState(env),pierOrigin(env)])
 let sources:ReturnType<typeof commissionSources>
 try{sources=commissionSources(order,state,origin)}catch{fail('RETURN_SOURCE','The connected physical return does not reconcile with the original approved order.',409)}
 const received=state.returns.find((row:any)=>row.id===returnId)
 if(!received||!sources.get(received.itemId)?.returnIds.includes(returnId))fail('RETURN_SOURCE','Use a received Pier return linked to this order and shipment.',409)
 if(!Array.isArray(p.lines)||!p.lines.length||new Set(p.lines.map((row:any)=>row.line)).size!==p.lines.length)fail('CREDIT_LINES','Choose distinct original invoice lines and returned quantities.',400)
 let used=0n
 const lines:CreditLine[]=p.lines.map((entry:any)=>{
  const number=integer(entry.line,'Original line',1,order.lines.length),basis=order.lines[number-1],quantity=integer(entry.quantity,'Returned selling units',1,basis.quantity)
  if(basis.itemId!==received.itemId)fail('RETURN_SOURCE','Credit lines must name this physical return’s item.',409)
  const previous=records.credits.filter(row=>row.orderId===order.id).flatMap(row=>row.lines).filter(row=>row.line===number).reduce((sum,row)=>sum+row.quantity,0)
  if(previous+quantity>basis.quantity)fail('CREDIT_LIMIT','Total credited units exceed the original accepted line.',409)
  const numerator=decimal(basis.baseQuantity??String(basis.quantity))*BigInt(quantity)
  if(numerator%BigInt(basis.quantity)!==0n)fail('CREDIT_UNITS','The returned selling units must map exactly to physical units.',409)
  used+=numerator/BigInt(basis.quantity)
  const full=BigInt(basis.lineCents!),denominator=BigInt(basis.quantity)
  const cumulative=(units:number)=>Number((full*BigInt(units)+denominator/2n)/denominator)
  return {line:number,sku:basis.sku,quantity,amountCents:cumulative(previous+quantity)-cumulative(previous),basis,...(basis.substitutedFrom?{original:basis.substitutedFrom}:{})}
 })
 if(used>decimal(received.quantity))fail('CREDIT_LIMIT','Credit units exceed the verified physical return receipt.',409)
 const amountCents=lines.reduce((sum,line)=>sum+line.amountCents,0)
 if(amountCents<=0)fail('CREDIT_AMOUNT','The credit must have a positive original-line value.',409)
 const id=`credit-${returnId}`,revision=crypto.randomUUID(),at=new Date().toISOString(),commission=await env.DB.prepare('SELECT value_json FROM bw_order_commissions WHERE order_id=?').bind(order.id).first<{value_json:string}>()
 const credit:CreditNote={id,accountId:order.accountId,orderId:order.id,orderRevision:order.revision,currency:order.currency??'AUD',amountCents,returnId,createdAt:at,actorId:actor.id,reason,revision,lines,...(commission?{commissionSnapshot:JSON.parse(commission.value_json)}:{})}
 const autoApplied=Math.min(amountCents,invoiceOutstanding(order.id,order.totalCents,records)),application:CreditApplication={id:`application-${id}-${order.id}`,creditId:id,accountId:order.accountId,orderId:order.id,currency:credit.currency,amountCents:autoApplied,createdAt:at,actorId:actor.id,reason:'Credit first reduces the original unpaid invoice principal.',revision:crypto.randomUUID()}
 await commit(env.DB,actor,[...guards,env.DB.prepare('INSERT INTO bw_credit_notes VALUES(?,?,?,?,?,?)').bind(id,order.accountId,order.id,returnId,JSON.stringify(credit),revision),...(autoApplied?[env.DB.prepare('INSERT INTO bw_credit_applications VALUES(?,?,?,?,?,?)').bind(application.id,order.accountId,order.id,id,JSON.stringify(application),application.revision)]:[]),audit(env.DB,actor,id,'credit.issued',{accountId:order.accountId,orderId:order.id,revision,source:returnId,reason})])
 return publicCredit(credit)
}
export async function applyCredit(env:Bindings,actor:Actor,p:any) {
 cardMerchant(actor)
 const credit=await storedCredit(env.DB,text(p.creditId,'Credit note')),order=await readOrder(env.DB,actor,text(p.orderId,'Invoice order'));issued(order)
 if(credit.accountId!==order.accountId||credit.currency!==order.currency)fail('CREDIT_SCOPE','Apply credit only within its original company and currency.',409)
 const amountCents=integer(p.amountCents,'Applied cents',1),reason=text(p.reason,'Application reason',1000),guards=await financialGuard(env.DB),records=await creditRecords(env.DB),id=`application-${credit.id}-${order.id}`,existing=records.applications.find(row=>row.id===id)
 if(existing){if(existing.amountCents!==amountCents)fail('CREDIT_APPLIED','This credit already has an immutable application to this invoice.',409);return existing}
 if(p.revision!==credit.revision)fail('REVISION','Reload the current credit note.',409)
 if(amountCents>creditAvailable(credit,records)||amountCents>invoiceOutstanding(order.id,order.totalCents,records))fail('CREDIT_AMOUNT','The application exceeds available credit or unpaid invoice principal.',409)
 const revision=crypto.randomUUID(),value:CreditApplication={id,creditId:credit.id,accountId:order.accountId,orderId:order.id,currency:credit.currency,amountCents,createdAt:new Date().toISOString(),actorId:actor.id,reason,revision}
 await commit(env.DB,actor,[...guards,env.DB.prepare('UPDATE bw_credit_notes SET revision=? WHERE id=? AND revision=?').bind(crypto.randomUUID(),credit.id,credit.revision),changed(env.DB),env.DB.prepare('INSERT INTO bw_credit_applications VALUES(?,?,?,?,?,?)').bind(id,order.accountId,order.id,credit.id,JSON.stringify(value),revision),audit(env.DB,actor,id,'credit.applied',{accountId:order.accountId,orderId:order.id,revision,source:credit.id,reason})])
 return value
}
