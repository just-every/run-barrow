import type { Bindings } from '../auth.server'
import { audit, changed, commit, digest } from './access'
import { account } from './accounts'
import { companyRightsGuard, requireCompanyRight } from './company-policy'
import { commissionSources } from './commission-source'
import { now } from './clock'
import { fail, integer, requirePerson, text, type Actor, type Order } from './model'
import { readOrder } from './orders'
import { format, pierOrigin, pierState } from './pier'
import { calendarDate, reportZone } from './report-zone'
import { returnRecords } from './return-claims'

type Event = { action: string; by: string; at: string; reason: string; revision: string }
export type ServiceCase = {
 id: string; accountId: string; orderId: string; orderRevision: string; line: number;
 currency: Order['currency']; basis: Order['lines'][number]; commercial: unknown;
 pierOrigin: string; pierOrderId: string; rmaId?: string; rmaRevision?: string;
 kind: 'shortage' | 'defect'; quantity: number; reason: string;
 requestedReplacement: { sku: string; quantity: number } | null;
 ownerId: string; responseDeadline: string; timeZone: string; state: 'unresolved';
 createdBy: string; createdAt: string; history: Event[]; revision: string;
 requestKey: string; requestFingerprint: string; restored?: boolean
}
export const serviceReviewer = (actor: Actor) => !actor.agent && !actor.staff && ['owner','admin'].includes(actor.role)
function review(actor: Actor) { if(!serviceReviewer(actor))fail('FORBIDDEN','A current owner or admin must review service cases. Delegated service authority is not enabled.',403) }
export async function serviceRecords(db: D1Database): Promise<ServiceCase[]> {
 const rows=await db.prepare('SELECT value_json,revision FROM bw_service_cases ORDER BY id').all<{value_json:string;revision:string}>()
 return rows.results.map(row=>({...JSON.parse(row.value_json),revision:row.revision}))
}
async function authorizedOrder(env: Bindings, actor: Actor, id: string) {
 requirePerson(actor)
 if(actor.staff)review(actor)
 const order=await readOrder(env.DB,actor,id)
 if(!serviceReviewer(actor))await requireCompanyRight(env.DB,actor,order.accountId,'purchasing',order.shipTo?.id)
 return order
}
function deadline(value: unknown) {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)fail('INPUT','Use a valid YYYY-MM-DD supplier-calendar response deadline.',400)
 return value
}
export function visibleServiceCase(value: ServiceCase, actor: Actor) {
 const {requestKey,requestFingerprint,...shown}=value
 return serviceReviewer(actor)?shown:{...shown,ownerId:'supplier',createdBy:value.createdBy===actor.id?actor.id:'company buyer',history:value.history.map(event=>({...event,by:event.by===actor.id?actor.id:'supplier'}))}
}
async function dispatchEvidence(env: Bindings, order: Order, value: ServiceCase) {
 try {
  const [state,origin]=await Promise.all([pierState(env),pierOrigin(env)])
  const sources=commissionSources(order,state,origin),line=sources.get(value.basis.itemId)
  if(origin!==value.pierOrigin||order.pierOrderId!==value.pierOrderId||!line)throw Error('Missing source')
  return {available:true,sourceOrderId:line.sourceOrderId,sourceLineId:line.sourceLineId,dispatchedBaseQuantity:format(line.dispatched),orderedBaseQuantity:format(line.base),note:'These physical quantities describe the linked inventory source line. Source-confirmed dispatch is a separate fact. It does not confirm buyer receipt or disprove a reported shortage.'}
 } catch { return {available:false,dispatchedBaseQuantity:null,orderedBaseQuantity:value.basis.baseQuantity??String(value.basis.quantity),note:'Connected dispatch evidence is unavailable. The buyer report remains unresolved.'} }
}
export async function readServiceCases(env: Bindings, actor: Actor, orderId: string) {
 const order=await authorizedOrder(env,actor,orderId),all=(await serviceRecords(env.DB)).filter(value=>value.orderId===order.id),rmas=await returnRecords(env.DB)
 const people=serviceReviewer(actor)?(await env.DB.prepare("SELECT id,display_name AS name,version FROM oa_operators WHERE status='active' AND role IN ('owner','admin') ORDER BY display_name,id").all<{id:string;name:string;version:number}>()).results:[]
 const cases=await Promise.all(all.map(async value=>{
  const linked=rmas.find(row=>row.id===value.rmaId&&row.orderId===order.id&&row.accountId===value.accountId&&row.line===value.line)
  const today=calendarDate(await now(),value.timeZone)
  return {...visibleServiceCase(value,actor),overdue:!value.restored&&today>value.responseDeadline,evidence:await dispatchEvidence(env,order,value),rma:linked?{id:linked.id,revision:linked.revision,quantity:linked.quantity,approvedQuantity:linked.decision?.quantity??null,disputedQuantity:linked.decision?linked.quantity-linked.decision.quantity:null}:null,
   resolution:'Unresolved. A replacement request is not an accepted exchange. Exact price difference, verified tax and freight approvals, replacement execution, linked delivery and buyer-facing final resolution are still required.'}
 }))
 return {orderId,canReview:serviceReviewer(actor),people,cases}
}
const taskId=(id:string)=>`service:${id}`
async function taskStatements(env: Bindings, value: ServiceCase, at: string) {
 const id=taskId(value.id),row=await env.DB.prepare('SELECT value_json,revision FROM bw_followups WHERE id=?').bind(id).first<{value_json:string;revision:string}>()
 const previous=row?JSON.parse(row.value_json):undefined
 const overdue=calendarDate(new Date(at),value.timeZone)>value.responseDeadline
 const task={...previous,id,kind:'service',accountId:value.accountId,sourceId:value.id,sourcePath:`/api/barrow/orders/${value.orderId}/service-cases`,title:'Unresolved service case',reason:overdue?'Supplier-calendar response deadline missed; the case remains unresolved.':'Review the buyer report and requested replacement. Commercial approvals and delivery remain unresolved.',priority:overdue?0:1,ownerId:value.ownerId,nextContactDate:value.responseDeadline,status:'open',createdAt:previous?.createdAt??at,contacts:previous?.contacts??[],...(overdue?{escalated:{since:value.responseDeadline,toId:value.ownerId}}:{escalated:undefined})}
 return row?[env.DB.prepare('UPDATE bw_followups SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify(task),crypto.randomUUID(),id,row.revision),changed(env.DB)]:[env.DB.prepare('INSERT INTO bw_followups VALUES(?,?,?,?)').bind(id,value.accountId,JSON.stringify(task),crypto.randomUUID())]
}
export async function refreshServiceDeadlines(env: Bindings, actor: Actor) {
 review(actor)
 const at=(await now()).toISOString(),statements:D1PreparedStatement[]=[]
 for(const value of await serviceRecords(env.DB)) {
  if(value.restored)continue
  const today=calendarDate(new Date(at),value.timeZone)
  if(today<=value.responseDeadline)continue
  const row=await env.DB.prepare('SELECT value_json FROM bw_followups WHERE id=?').bind(taskId(value.id)).first<{value_json:string}>()
  if(row&&JSON.parse(row.value_json).escalated?.since===value.responseDeadline)continue
  statements.push(env.DB.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_service_cases WHERE id=? AND revision=?) THEN 1 ELSE 0 END').bind(value.id,value.revision),...await taskStatements(env,value,at),audit(env.DB,actor,value.id,'service.escalated',{accountId:value.accountId,orderId:value.orderId,revision:value.revision,source:'followup.refresh',reason:'Response deadline missed; service case remains assigned and unresolved.'}))
 }
 if(statements.length)await commit(env.DB,actor,statements)
}
export async function serviceCommand(env: Bindings, actor: Actor, type: string, p: any) {
 requirePerson(actor)
 if(actor.staff)review(actor)
 const epoch=(await env.DB.prepare('SELECT revision FROM bw_service_epoch WHERE id=1').first<{revision:number}>())!.revision
 const all=await serviceRecords(env.DB),before=type==='service.report'?undefined:all.find(row=>row.id===p.id)
 if(type!=='service.report'&&!before)fail('NOT_FOUND','Service case not found.',404)
 const order=await authorizedOrder(env,actor,before?.orderId??text(p.orderId,'Original order'))
 if(!order.approvedBy||!order.pierOrderId||!order.pierOrigin||!order.reservation)fail('SERVICE_ORDER','Use an originally approved order with an acknowledged inventory handoff.',409)
 const accountRow=await account(env.DB,actor,order.accountId)
 const at=(await now()).toISOString(),revision=crypto.randomUUID(),timeZone=await reportZone(env.DB)
 const membership=serviceReviewer(actor)?null:await requireCompanyRight(env.DB,actor,order.accountId,'purchasing',order.shipTo?.id)
 const guards=[companyRightsGuard(env.DB,membership),env.DB.prepare('UPDATE bw_service_epoch SET revision=revision+1 WHERE id=1 AND revision=?').bind(epoch),changed(env.DB),env.DB.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_orders WHERE id=? AND revision=?) THEN 1 ELSE 0 END').bind(order.id,order.revision),env.DB.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_accounts WHERE id=? AND revision=?) THEN 1 ELSE 0 END').bind(accountRow.id,accountRow.revision)]
 let value:ServiceCase
 if(type==='service.report') {
  const key=text(p.requestId,'Stable request identity',160),line=integer(p.line,'Original order line',1,order.lines.length),quantity=integer(p.quantity,'Reported units',1,order.lines[line-1].quantity)
  if(!['shortage','defect'].includes(p.kind))fail('INPUT','Choose a shortage or defect report.',400)
  const reason=text(p.reason,'Buyer report',2000)
  const requestedReplacement=p.requestedReplacement?{sku:text(p.requestedReplacement.sku,'Requested replacement SKU',160),quantity:integer(p.requestedReplacement.quantity,'Requested replacement units',1,1000000)}:null
  const rmaId=p.rmaId?text(p.rmaId,'Linked RMA'):undefined
  const requestKey=await digest(JSON.stringify([actor.id,order.accountId,key])),requestFingerprint=await digest(JSON.stringify([order.id,p.orderRevision,line,quantity,p.kind,reason,requestedReplacement,rmaId??null]))
  const existing=all.find(row=>row.requestKey===requestKey)
  if(existing) {
   if(existing.restored)fail('SERVICE_RESTORED','Restored service history cannot be replayed.',409)
   if(existing.requestFingerprint!==requestFingerprint)fail('SERVICE_RETRY','This request identity already names a different report.',409)
   return (await readServiceCases(env,actor,order.id)).cases.find(row=>row.id===existing.id)
  }
  if(p.orderRevision!==order.revision)fail('REVISION','The original order changed. Reload its accepted basis.',409)
  const rma=rmaId?(await returnRecords(env.DB)).find(row=>row.id===rmaId&&row.accountId===order.accountId&&row.orderId===order.id&&row.line===line):undefined
  if(rmaId&&!rma)fail('SERVICE_RMA','Choose an RMA for this same account, original order and exact line.',409)
  if(rma?.restored)fail('SERVICE_RESTORED','Restored RMAs are history only.',409)
  if(rma)guards.push(env.DB.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_return_claims WHERE id=? AND revision=?) THEN 1 ELSE 0 END').bind(rma.id,rma.revision))
  const owner=await env.DB.prepare("SELECT id,version FROM oa_operators WHERE status='active' AND role='owner' ORDER BY id LIMIT 1").first<{id:string;version:number}>()
  if(!owner)fail('SERVICE_OWNER','An active supplier owner must own unresolved service cases.',409)
  guards.push(env.DB.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND role='owner' AND status='active') THEN 1 ELSE 0 END").bind(owner.id,owner.version))
  value={id:crypto.randomUUID(),accountId:order.accountId,orderId:order.id,orderRevision:order.revision,line,currency:order.currency,basis:order.lines[line-1],commercial:{currency:order.currency,totalCents:order.totalCents,termsDays:order.termsDays,termsAcceptance:order.termsAcceptance,buyingProfile:order.buyingProfile,preparedBy:order.preparedBy,preparedAt:order.preparedAt,submittedBy:order.submittedBy,companyApprovedBy:order.companyApprovedBy,companyApprovedAt:order.companyApprovedAt,approvedBy:order.approvedBy,approvedAt:order.approvedAt,delivery:order.delivery},pierOrigin:order.pierOrigin,pierOrderId:order.pierOrderId,rmaId,rmaRevision:rma?.revision,kind:p.kind,quantity,reason,requestedReplacement,ownerId:owner.id,responseDeadline:calendarDate(new Date(at),timeZone),timeZone,state:'unresolved',createdBy:actor.id,createdAt:at,history:[],revision,requestKey,requestFingerprint}
 } else {
  review(actor)
  if(before!.restored)fail('SERVICE_RESTORED','Restored service cases are inert history; no authority or exchange execution is restored.',409)
  if(before!.revision!==p.revision||p.orderRevision!==order.revision)fail('REVISION','The case or original order changed. Reload before responding.',409)
  if(type==='service.close')fail('SERVICE_UNRESOLVED','Commercial approvals, replacement execution, verified delivery and buyer-facing final resolution are not established. This case cannot close.',409)
  if(type!=='service.review')fail('COMMAND','Unknown service command.',400)
  const ownerId=text(p.ownerId,'Active service owner'),responseDeadline=deadline(p.responseDeadline)
  if(responseDeadline<calendarDate(new Date(at),timeZone))fail('INPUT','Choose today or a later supplier-calendar response deadline.',400)
  const owner=await env.DB.prepare("SELECT id,version FROM oa_operators WHERE id=? AND status='active' AND role IN ('owner','admin')").bind(ownerId).first<{id:string;version:number}>()
  if(!owner)fail('SERVICE_OWNER','Assign an active supplier owner or admin.',400)
  guards.push(env.DB.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND status='active' AND role IN ('owner','admin')) THEN 1 ELSE 0 END").bind(ownerId,owner.version))
  value={...before!,ownerId,responseDeadline,timeZone,revision}
 }
 const reason=type==='service.report'?value.reason:text(p.response,'Buyer-visible response',2000)
 value.history=[...value.history,{action:type,by:actor.id,at,reason,revision}]
 const statements=[...guards]
 if(before)statements.push(env.DB.prepare('UPDATE bw_service_cases SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify(value),revision,value.id,before.revision),changed(env.DB))
 else statements.push(env.DB.prepare('INSERT INTO bw_service_cases VALUES(?,?,?,?,?,?)').bind(value.id,value.accountId,value.orderId,value.requestKey,JSON.stringify(value),revision))
 statements.push(...await taskStatements(env,value,at),audit(env.DB,actor,value.id,type,{accountId:value.accountId,orderId:value.orderId,revision,source:type,reason}))
 await commit(env.DB,actor,statements)
 return (await readServiceCases(env,actor,order.id)).cases.find(row=>row.id===value.id)
}
