import type { Bindings } from '../auth.server'
import { account } from './accounts'
import { audit, commit, digest } from './access'
import { creditAuthority } from './credit-access'
import { creditRecords, financialGuard, invoiceOutstanding } from './credit-ledger'
import { fail, integer, requirePerson, text, type Actor, type Order } from './model'
import { requireCompanyRight, companyRightsGuard } from './company-policy'
import { supplierDate } from './model'
import { now } from './clock'

type Hold = { kind:'overdue'|'manual'|'provider'; reason:string; expiresAt:string; ownerId:string }
type Release = { orderId:string; commercial:string; fingerprint:string; ceilingCents:number; by:string; at:string; reason:string }
export type CreditPolicy = { currency:string; limitCents:number; termsDays:number; hold?:Hold; releases:Release[]; revision:string }
const key = (id:string) => `credit-policy:${id}`
export async function creditPolicy(db:D1Database,id:string):Promise<CreditPolicy|null> {
 const row=await db.prepare('SELECT value_json,revision FROM bw_settings WHERE key=?').bind(key(id)).first<{value_json:string;revision:string}>()
 return row?{...JSON.parse(row.value_json),revision:row.revision}:null
}
export const creditSignature=(policy:CreditPolicy|null)=>policy?JSON.stringify([policy.currency,policy.limitCents,policy.termsDays]):'unconfigured'
export async function assertCreditSignature(db:D1Database,order:Order) {
 if((order.creditPolicySnapshot??'unconfigured')!==creditSignature(await creditPolicy(db,order.accountId)))fail('CREDIT_CHANGED','Finance credit policy changed. Prepare a fresh draft and obtain fresh company approvals.')
}
const commercial=(order:Order)=>JSON.stringify([order.id,order.currency,order.totalCents,order.termsDays,order.lines,order.delivery])
export async function creditExposure(db:D1Database,accountId:string,currency:string,excludeOrderId='') {
 const financial=await creditRecords(db)
 const rows=await db.prepare('SELECT value_json,revision FROM bw_orders WHERE account_id=? ORDER BY id').bind(accountId).all<{value_json:string;revision:string}>()
 const sources=rows.results.map(row=>({...JSON.parse(row.value_json),revision:row.revision}) as Order).filter(order=>order.id!==excludeOrderId&&(order.currency??'AUD')===currency).flatMap(order=>{
  const invoiced=!!order.invoice
  if(!invoiced&&!['awaiting-company-approval','submitted','reserving','shortfall','approved','releasing'].includes(order.status))return []
  const amountCents=invoiced?invoiceOutstanding(order.id,order.totalCents,financial):order.totalCents
  return [{orderId:order.id,revision:order.revision,kind:invoiced?'invoice':'open-order',amountCents,path:`/api/barrow/orders/${order.id}`}]
 })
 const exposureCents=sources.reduce((sum,row)=>sum+row.amountCents,0)
 if(!Number.isSafeInteger(exposureCents))fail('MONEY','Credit exposure exceeds the exact-cent range.')
 // Deposits are not admitted by PAY-003 yet. No unallocated receipt reduces exposure.
 const fingerprint=await digest(JSON.stringify([currency,sources,financial.allocations.filter(row=>row.accountId===accountId),financial.applications.filter(row=>row.accountId===accountId)]))
 return {accountId,currency,exposureCents,openOrdersCents:sources.filter(row=>row.kind==='open-order').reduce((sum,row)=>sum+row.amountCents,0),unpaidInvoicesCents:sources.filter(row=>row.kind==='invoice').reduce((sum,row)=>sum+row.amountCents,0),depositsCents:0,sources,fingerprint}
}
async function creditGuards(db:D1Database,id:string,policy:CreditPolicy|null) {
 const rows=await db.prepare('SELECT id,revision FROM bw_orders WHERE account_id=? ORDER BY id').bind(id).all<{id:string;revision:string}>()
 return [db.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN COALESCE((SELECT revision FROM bw_settings WHERE key=?),'')=? THEN 1 ELSE 0 END").bind(key(id),policy?.revision??''),db.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN (SELECT json_group_array(json_array(id,revision)) FROM (SELECT id,revision FROM bw_orders WHERE account_id=? ORDER BY id))=? THEN 1 ELSE 0 END').bind(id,JSON.stringify(rows.results.map(row=>[row.id,row.revision]))),...await financialGuard(db)]
}
export async function readAccountCredit(env:Bindings,actor:Actor,id:string) {
 requirePerson(actor);const selected=await account(env.DB,actor,id),policy=await creditPolicy(env.DB,id)
 const value=await creditExposure(env.DB,id,policy?.currency??selected.value.currency??'USD')
 const held=!!policy?.hold&&Date.parse(policy.hold.expiresAt)>(await now()).getTime()
 return {...value,configured:!!policy,limitCents:policy?.limitCents??null,availableCents:policy?policy.limitCents-value.exposureCents:null,termsDays:policy?.termsDays??selected.value.termsDays,revision:policy?.revision??null,held,explanation:held?'Credit hold: contact finance to request a reviewed release.':'Orders above available credit require a finance decision.',...(['owner','admin'].includes(actor.role)||actor.staff?.role==='finance'?{policy}:{}),sources:actor.staff||['owner','admin'].includes(actor.role)?value.sources:[]}
}
export async function admitCredit(env:Bindings,order:Order) {
 const policy=await creditPolicy(env.DB,order.accountId),guards=await creditGuards(env.DB,order.accountId,policy)
 if(!policy)return guards
 await assertCreditSignature(env.DB,order)
 if(order.currency!==policy.currency)fail('CREDIT_CURRENCY','The order currency differs from the finance credit currency. Ask finance to review it.')
 const value=await creditExposure(env.DB,order.accountId,policy.currency,order.id),projected=value.exposureCents+order.totalCents
 const held=!!policy.hold&&Date.parse(policy.hold.expiresAt)>(await now()).getTime()
 if(held||projected>policy.limitCents) {
  const release=policy.releases.find(row=>row.orderId===order.id&&row.commercial===commercial(order)&&row.fingerprint===value.fingerprint&&projected<=row.ceilingCents)
  if(!release)fail(held?'CREDIT_HOLD':'CREDIT_LIMIT',`${held?'Credit hold: contact finance for release.':'Available credit is insufficient; request finance approval.'} Current exposure ${value.exposureCents} ${policy.currency} cents; this order ${order.totalCents}; limit ${policy.limitCents}.`)
  // A revoked or narrowed finance grant cannot authorize acceptance later.
  const person=await env.DB.prepare("SELECT role,status,version FROM oa_operators WHERE id=?").bind(release.by).first<{role:string;status:string;version:number}>()
  if(!person||person.status!=='active')fail('CREDIT_RELEASE_STALE','Finance release authority ended. Request a new decision.')
  guards.push(env.DB.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND status='active' AND version=? AND role=?) THEN 1 ELSE 0 END").bind(release.by,person.version,person.role))
  if(!['owner','admin'].includes(person.role)) {
   const grant=await env.DB.prepare("SELECT policy_json,state,native_version,revision FROM bw_staff_members WHERE user_id=?").bind(release.by).first<{policy_json:string;state:string;native_version:number;revision:string}>()
   const policy=grant?JSON.parse(grant.policy_json):null
   if(!grant||grant.state!=='active'||grant.native_version!==person.version||policy?.role!=='finance'||policy.creditLimitCents<release.ceilingCents||policy.accounts!=='all'&&!policy.accounts?.includes(order.accountId))fail('CREDIT_RELEASE_STALE','Finance release authority changed. Request a new decision.')
   guards.push(env.DB.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_staff_members WHERE user_id=? AND revision=? AND state='active') THEN 1 ELSE 0 END").bind(release.by,grant.revision))
  }
 }
 return guards
}
export async function creditPolicyCommand(env:Bindings,actor:Actor,type:string,p:any) {
 requirePerson(actor);const id=text(p.accountId,'Account'),selected=await account(env.DB,actor,id),before=await creditPolicy(env.DB,id)
 if(type==='credit-policy.request') {
  const member=await requireCompanyRight(env.DB,actor,id,'purchaser'),taskId=`credit-review:${id}`
  const existing=await env.DB.prepare('SELECT value_json FROM bw_followups WHERE id=?').bind(taskId).first<{value_json:string}>()
  if(existing&&JSON.parse(existing.value_json).status==='open')return {id:taskId,status:'open'}
  const owner=await env.DB.prepare("SELECT id FROM oa_operators WHERE status='active' AND role='owner' ORDER BY id LIMIT 1").first<{id:string}>()
  if(!owner)fail('CREDIT_REVIEW','An active installation owner must receive this request.')
  const at=await now(),revision=crypto.randomUUID(),reason='Buyer or rep requested a finance credit review from checkout.'
  const task={id:taskId,kind:'credit',accountId:id,sourceId:id,sourcePath:`/api/barrow/account-credit?accountId=${encodeURIComponent(id)}`,title:`Credit review for ${selected.value.name}`,reason,priority:1,createdAt:at.toISOString(),ownerId:owner.id,nextContactDate:supplierDate(at),status:'open',contacts:[]}
  await commit(env.DB,actor,[companyRightsGuard(env.DB,member),env.DB.prepare("INSERT INTO bw_followups(id,account_id,value_json,revision) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET value_json=excluded.value_json,revision=excluded.revision WHERE json_extract(bw_followups.value_json,'$.status')='closed'").bind(taskId,id,JSON.stringify(task),revision),audit(env.DB,actor,id,type,{accountId:id,revision,source:type,reason})])
  return {id:taskId,status:'open'}
 }
 if(p.revision!==(before?.revision??null))fail('CHANGED','Reload current credit settings before deciding.')
 const reason=text(p.reason,'Finance decision reason',500),revision=crypto.randomUUID(),at=(await now()).toISOString()
 const guards=await creditGuards(env.DB,id,before)
 let after:CreditPolicy
 if(type==='credit-policy.save') {
  const currency=text(p.currency,'Credit currency',3),limitCents=integer(p.limitCents,'Credit limit cents'),termsDays=integer(p.termsDays,'Net terms days',0,365)
  if(currency!==(selected.value.currency??'USD'))fail('CREDIT_CURRENCY','Credit currency must match the account currency.')
  creditAuthority(actor,id,limitCents,currency)
  after={currency,limitCents,termsDays,releases:[],...(before?.hold?{hold:before.hold}:{}),revision}
 } else {
  if(!before)fail('CREDIT_POLICY','Finance must configure terms and limit first.')
  after={...before,revision,releases:[]}
  if(type==='credit-policy.hold') {
   creditAuthority(actor,id,before.limitCents,before.currency)
   if(!['manual','overdue','provider'].includes(p.kind)||!Number.isFinite(Date.parse(p.expiresAt))||Date.parse(p.expiresAt)<=Date.parse(at))fail('INPUT','Choose a hold kind and a future expiry.',400)
   const ownerId=text(p.ownerId,'Hold owner')
   const owner=await env.DB.prepare("SELECT role FROM oa_operators WHERE id=? AND status='active'").bind(ownerId).first<{role:string}>()
   if(!owner||!['owner','admin'].includes(owner.role)&&ownerId!==actor.id)fail('INPUT','Name yourself as the authorized finance owner, or an active supplier owner or admin.',400)
   after.hold={kind:p.kind,reason,expiresAt:new Date(p.expiresAt).toISOString(),ownerId}
  } else if(type==='credit-policy.release') {
   const row=await env.DB.prepare('SELECT value_json,revision FROM bw_orders WHERE id=? AND account_id=?').bind(p.orderId,id).first<{value_json:string;revision:string}>()
   if(!row)fail('NOT_FOUND','Release order not found.',404)
   const order={...JSON.parse(row.value_json),revision:row.revision} as Order
   if(!['draft','awaiting-company-approval','submitted'].includes(order.status))fail('CREDIT_RELEASE','Only a current unaccepted order may receive a release.')
   if(order.currency!==before.currency)fail('CREDIT_CURRENCY','Release cannot change currency.')
   const value=await creditExposure(env.DB,id,before.currency,order.id),ceilingCents=integer(p.ceilingCents,'Maximum resulting exposure cents')
   creditAuthority(actor,id,ceilingCents,before.currency)
   if(ceilingCents<value.exposureCents+order.totalCents)fail('CREDIT_LIMIT','The release ceiling is below current resulting exposure.')
   after.releases=[...before.releases.filter(row=>row.orderId!==order.id),{orderId:order.id,commercial:commercial(order),fingerprint:value.fingerprint,ceilingCents,by:actor.id,at,reason}]
  } else fail('COMMAND','Unknown credit policy decision.',404)
 }
 await commit(env.DB,actor,[...guards,env.DB.prepare('INSERT INTO bw_settings(key,value_json,revision) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,revision=excluded.revision').bind(key(id),JSON.stringify(after),revision),audit(env.DB,actor,id,type,{accountId:id,...(p.orderId?{orderId:p.orderId}:{}),revision,source:type,reason})])
 return readAccountCredit(env,actor,id)
}
