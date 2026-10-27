import type { Bindings } from '../auth.server'
import { account, prepareAccountSave } from './accounts'
import { audit, commit, digest } from './access'
import { creditAuthority } from './credit-access'
import { creditRecords, financialGuard } from './credit-ledger'
import { now } from './clock'
import { fail, integer, requirePerson, text, type Actor, type Account, type Order } from './model'
import { readStaffGrant, staffGuard } from './staff-policy'
export type CreditPolicy = { currency:'USD'|'CAD'; limitCents:number }
export type CreditException = { by:string; version:number; at:string; reason:string; basis:string; excessCents:number }
const committed = ['awaiting-company-approval','submitted','reserving','shortfall','approved','releasing']
/** Current receivables, never a currency conversion or an inferred bank receipt. */
export async function exposure(db:D1Database, selected:Account, excludeId='') {
 const financialGuards=await financialGuard(db)
 const [result,records]=await Promise.all([db.prepare('SELECT id,value_json,revision FROM bw_orders WHERE account_id=? ORDER BY id').bind(selected.id).all<{id:string;value_json:string;revision:string}>(),creditRecords(db)])
 const policy=selected.value.credit, currency=policy?.currency??selected.value.currency??'USD'
 const sources=result.results.filter(row=>row.id!==excludeId).map(row=>JSON.parse(row.value_json) as Order).filter(order=>committed.includes(order.status)||Boolean(order.invoice))
 const rows=sources.map(order=>{
  const allocations=records.allocations.filter(row=>row.orderId===order.id&&row.currency===(order.currency??'AUD')),applications=records.applications.filter(row=>row.orderId===order.id&&row.currency===(order.currency??'AUD'))
  const paidCents=allocations.reduce((n,row)=>n+row.amountCents,0),appliedCreditCents=applications.reduce((n,row)=>n+row.amountCents,0)
  return {orderId:order.id,currency:order.currency??'AUD',kind:order.invoice?'invoice':'open-order',amountCents:order.totalCents,paidCents,appliedCreditCents,exposureCents:Math.max(0,order.totalCents-paidCents-appliedCreditCents),path:`/api/barrow/orders/${order.id}`,paymentSources:allocations.map(row=>({id:row.id,path:`/api/barrow/payments/${row.paymentId}`})),creditSources:applications.map(row=>({id:row.id,path:`/api/barrow/credits/${row.creditId}`}))}
 })
 const exposureCents=rows.filter(row=>row.currency===currency).reduce((n,row)=>n+row.exposureCents,0)
 if(!Number.isSafeInteger(exposureCents))fail('CREDIT_RANGE','Exposure is outside the supported exact-cent range.')
 const foreign=rows.some(row=>row.currency!==currency&&row.exposureCents>0)
 const basis=await digest(JSON.stringify([selected.revision,policy,rows]))
 const query='SELECT json_group_array(json_array(id,value_json,revision)) FROM (SELECT id,value_json,revision FROM bw_orders WHERE account_id=? ORDER BY id)'
 const snapshot=JSON.stringify(result.results.map(row=>[row.id,row.value_json,row.revision]))
 const guards=[db.prepare(`INSERT INTO bw_guard(value) SELECT CASE WHEN (${query})=? THEN 1 ELSE 0 END`).bind(selected.id,snapshot),db.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_accounts WHERE id=? AND revision=?) THEN 1 ELSE 0 END').bind(selected.id,selected.revision),...financialGuards]
 return {accountId:selected.id,currency,limitCents:policy?.limitCents??null,exposureCents,availableCents:policy?Math.max(0,policy.limitCents-exposureCents):null,foreign,rows,basis,guards}
}
export async function creditAdmission(env:Bindings,selected:Account,order:Order) {
 if(!selected.value.credit)return []
 const current=await exposure(env.DB,selected,order.id), excess=Math.max(0,current.exposureCents+order.totalCents-selected.value.credit.limitCents)
 if(current.currency!==(order.currency??'AUD')||current.foreign)fail('CREDIT_CURRENCY','Credit currency does not cover every outstanding commitment. Finance must reconcile the currency policy before submission.')
 if(excess) {
  const exception=order.creditException
  let authorized=false
  if(exception&&exception.basis===await digest(JSON.stringify([current.basis,order.totalCents,order.currency,order.lines]))&&exception.excessCents===excess) {
   const person=await env.DB.prepare("SELECT id,email,role,version FROM oa_operators WHERE id=? AND status='active' AND version=?").bind(exception.by,exception.version).first<any>()
   if(person){const staff=await readStaffGrant(env.DB,{...person,agent:false});try{creditAuthority({...person,agent:false,staff},order.accountId,excess,current.currency);authorized=true;current.guards.push(env.DB.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND status='active' AND role=?) THEN 1 ELSE 0 END").bind(person.id,person.version,person.role));if(staff)current.guards.push(staffGuard(env.DB,staff))}catch{}}
  }
  if(!authorized)fail('CREDIT_LIMIT',`Available credit is ${current.availableCents} ${current.currency} cents; this order needs ${order.totalCents}. Exposure is ${current.exposureCents}; finance approval of the current excess ${excess} is required.`)
 }
 return current.guards
}
export async function creditExposure(env:Bindings,actor:Actor,accountId:string,orderId='') {
 requirePerson(actor)
 const selected=await account(env.DB,actor,accountId)
 if(orderId){const row=await env.DB.prepare('SELECT account_id FROM bw_orders WHERE id=?').bind(orderId).first<{account_id:string}>();if(!row||row.account_id!==selected.id)fail('NOT_FOUND','Order not found.',404)}
 const {guards,basis,...result}=await exposure(env.DB,selected,orderId)
 return result
}
export async function saveCreditPolicy(env:Bindings,actor:Actor,p:any) {
 const selected=await account(env.DB,actor,text(p.accountId,'Account')),limitCents=integer(p.limitCents,'Credit limit'),currency=p.currency
 if(!['USD','CAD'].includes(currency))fail('INPUT','Credit currency must be USD or CAD.',400)
 creditAuthority(actor,selected.id,limitCents,currency)
 const reason=text(p.reason,'Credit policy reason',240)
 const saved=await prepareAccountSave(env,actor,{id:selected.id,revision:p.revision,value:{...selected.value,termsDays:integer(p.termsDays,'Terms days',0,365),credit:{currency,limitCents}},reason})
 await commit(env.DB,actor,[...saved.statements,audit(env.DB,actor,selected.id,'credit.policy-set',{accountId:selected.id,revision:saved.record.revision,source:'credit.policy',reason})])
 return saved.record
}
export async function creditException(env:Bindings,actor:Actor,order:Order,p:any) {
 if(!['draft','submitted','awaiting-company-approval'].includes(order.status))fail('CREDIT_STATE','Credit exceptions require an unapproved order.')
 if(p.revision!==order.revision)fail('CHANGED','Review the current order revision before a credit exception.')
 const selected=await account(env.DB,actor,order.accountId),current=await exposure(env.DB,selected,order.id)
 if(current.limitCents===null||current.foreign||current.currency!==order.currency)fail('CREDIT_CURRENCY','Configure a matching credit policy before an exception.')
 const excessCents=Math.max(0,current.exposureCents+order.totalCents-current.limitCents)
 creditAuthority(actor,selected.id,excessCents,current.currency)
 if(!excessCents)fail('CREDIT_EXCEPTION','This order does not exceed the current credit limit.')
 return {exception:{by:actor.id,version:actor.version,at:(await now()).toISOString(),reason:text(p.reason,'Credit exception reason',240),basis:await digest(JSON.stringify([current.basis,order.totalCents,order.currency,order.lines])),excessCents},guards:current.guards}
}
