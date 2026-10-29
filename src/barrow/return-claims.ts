import { returnReviewer as reviewer, reviewReturn as review, returnWarehouseAuthority, returnWarehouses, returnAmountAuthority } from './return-access'
import { returnInspection } from './return-inspection'
import { creditAuthority } from './credit-access'
import type { Bindings } from '../auth.server'
import { audit, changed, commit } from './access'
import { account } from './accounts'
import { requireCompanyRight } from './company-policy'
import { creditBasis } from './credit-basis'
import { creditRecords } from './credit-ledger'
import { commissionSources } from './commission-source'
import { now } from './clock'
import { fail, integer, requirePerson, text, type Actor, type Order } from './model'
import { readOrder } from './orders'
import { decimal, format, pierOrigin, pierState } from './pier'
import { calendarDate, reportZone } from './report-zone'

type Receipt = { returnId: string; quantity: number; baseQuantity: string; by: string; at: string }
type Event = { action: string; by: string; at: string; reason: string; revision: string }
export type ReturnClaim = {
 id: string; accountId: string; orderId: string; orderRevision: string; line: number; currency: Order['currency'];
 warehouses?:string[]; basis: Order['lines'][number]; original: unknown; pierOrigin: string; pierOrderId: string;
 quantity: number; reason: string; condition: string; createdBy: string; createdAt: string;
 decision?: { quantity: number; instructions: string; reason: string; by: string; at: string; requestRevision: string };
 receipts: Receipt[]; history: Event[]; revision: string; restored?: boolean
}
export async function returnRecords(db: D1Database): Promise<ReturnClaim[]> {
 const rows=await db.prepare('SELECT value_json,revision FROM bw_return_claims ORDER BY id').all<{value_json:string;revision:string}>()
 return rows.results.map(row=>({...JSON.parse(row.value_json),revision:row.revision}))
}
const units = (claim: Pick<ReturnClaim,'basis'>, quantity: number) => {
 const base=decimal(claim.basis.baseQuantity??String(claim.basis.quantity))*BigInt(quantity)
 if(base%BigInt(claim.basis.quantity))fail('RETURN_UNITS','Choose selling units that map exactly to the accepted physical units.',400)
 return base/BigInt(claim.basis.quantity)
}
async function source(env: Bindings, order: Order) {
 const [state,origin]=await Promise.all([pierState(env),pierOrigin(env)])
 const sources=commissionSources(order,state,origin)
 return {state,origin,sources}
}
async function observation(env: Bindings, order: Order, claim: ReturnClaim) {
 try {
  const evidence=await source(env,order),linked=evidence.sources.get(claim.basis.itemId)
  if(!linked || claim.pierOrigin!==evidence.origin || claim.pierOrderId!==order.pierOrderId)throw Error('Source changed')
  for(const entry of claim.receipts) {
   const received=evidence.state.returns.find((row:any)=>row.id===entry.returnId)
   if(!received || !linked.returnIds.includes(entry.returnId) || decimal(received.quantity)<decimal(entry.baseQuantity))throw Error('Receipt unavailable')
  }
  const quantity=claim.receipts.reduce((sum,entry)=>sum+entry.quantity,0)
  return {available:true,quantity,inspections:claim.receipts.map(entry=>returnInspection(evidence.state.returns.find((row:any)=>row.id===entry.returnId))),reason:quantity?'Connected Pier receipts verified.':'Awaiting physical receipt in the connected Pier installation.'}
 } catch { return {available:false,quantity:0,inspections:[],reason:'Connected return evidence is unavailable or does not reconcile. Receipt and credit remain unresolved.'} }
}
async function proposal(env: Bindings, order: Order, claim: ReturnClaim, evidence: Awaited<ReturnType<typeof observation>>) {
 if(!evidence.available || !claim.decision?.quantity || evidence.quantity!==claim.decision.quantity)return null
 try {
  const previous=[...(await creditRecords(env.DB)).credits],lines=[]
  for(const receipt of claim.receipts) {
   if(previous.some(note=>(note.kind??'return')==='return'&&note.returnId===receipt.returnId))return null
   const basis=await creditBasis(env,order,{returnId:receipt.returnId,lines:[{line:claim.line,quantity:receipt.quantity}]},previous)
   lines.push({returnId:receipt.returnId,quantity:receipt.quantity,amountCents:basis.amountCents,inspection:returnInspection(basis.received)})
   previous.push({orderId:order.id,kind:'return',lines:basis.lines} as any)
  }
  return {currency:claim.currency,amountCents:lines.reduce((sum,line)=>sum+line.amountCents,0),lines,note:'Proposal only. A current Pier inspection and a separate authorized credit decision are required. No refund or stock command is issued by Barrow.'}
 } catch { return null }
}
export async function readReturnClaims(env: Bindings, actor: Actor, orderId: string) {
 requirePerson(actor)
 if(actor.staff&&actor.staff.role!=='finance')review(actor)
 const order=await readOrder(env.DB,actor,orderId),claims=(await returnRecords(env.DB)).filter(row=>row.orderId===order.id)
 if(actor.staff?.role==='operations'){const current=await source(env,order);returnWarehouseAuthority(actor,returnWarehouses(order,current.state))}
 const names=reviewer(actor)?(await env.DB.prepare('SELECT id,display_name FROM oa_operators').all<{id:string;display_name:string}>()).results:[]
 const shown=await Promise.all(claims.map(async claim=>{
  const evidence=await observation(env,order,claim),creditProposal=await proposal(env,order,claim,evidence)
  let canCredit=false
  if(!claim.restored&&creditProposal&&creditProposal.lines.every(line=>line.inspection)){try{creditAuthority(actor,claim.accountId,creditProposal.amountCents,claim.currency??'AUD');canCredit=true}catch{}}
  const credits=(await creditRecords(env.DB)).credits.filter(note=>note.returnAuthorization?.claimId===claim.id).map(note=>({id:note.id,amountCents:note.amountCents,currency:note.currency,createdAt:note.createdAt,returnId:note.returnId}))
  const disputedQuantity=claim.decision?claim.quantity-claim.decision.quantity:0
  const tasks=reviewer(actor)?(await env.DB.prepare("SELECT value_json,revision FROM bw_followups WHERE id IN (?,?) ORDER BY id").bind(`return:${claim.id}`,`return-dispute:${claim.id}`).all<{value_json:string;revision:string}>()).results.map(row=>({...JSON.parse(row.value_json),revision:row.revision})):[]
  const visible=reviewer(actor)?claim:{...claim,history:claim.history.map(event=>({...event,by:event.by===actor.id?actor.id:'supplier'})),createdBy:claim.createdBy===actor.id?actor.id:'company buyer',decision:claim.decision?{...claim.decision,by:'supplier'}:undefined,receipts:claim.receipts.map(receipt=>({...receipt,by:'supplier'}))}
  return {...visible,evidence:{...evidence,inspections:evidence.inspections.map(row=>row?{...row,inspectedBy:reviewer(actor)?row.inspectedBy:'warehouse reviewer'}:null)},creditProposal:creditProposal?{...creditProposal,lines:creditProposal.lines.map(line=>({...line,inspection:line.inspection?{...line.inspection,inspectedBy:reviewer(actor)?line.inspection.inspectedBy:'warehouse reviewer'}:null}))}:null,canCredit,credits,disputedQuantity,tasks}
 }))
 const attributed=new Set(shown.flatMap(claim=>[claim.createdBy,claim.decision?.by,...claim.history.map(event=>event.by),...claim.receipts.map(receipt=>receipt.by),...claim.tasks.map(task=>task.ownerId)]))
 const people=Object.fromEntries(names.filter(row=>!actor.staff||attributed.has(row.id)).map(row=>[row.id,row.display_name]))
 return {orderId,canReview:reviewer(actor),canRequest:reviewer(actor)||!!actor.company?.rights.some(right=>right==='purchaser'||right==='approver'),claims:shown,people}
}
export async function returnClaimCommand(env: Bindings, actor: Actor, type: string, p: any) {
 requirePerson(actor)
 if(actor.staff)review(actor)
 if(!['return.request','return.revise','return.decide','return.reconcile'].includes(type))fail('COMMAND','Unknown return command.',400)
 const epoch=(await env.DB.prepare('SELECT revision FROM bw_return_claim_epoch WHERE id=1').first<{revision:number}>())!.revision
 const all=await returnRecords(env.DB),before=type==='return.request'?undefined:all.find(row=>row.id===p.id)
 if(type!=='return.request'&&!before)fail('NOT_FOUND','Return claim not found.',404)
 const order=await readOrder(env.DB,actor,before?.orderId??text(p.orderId,'Original order'))
 if(!order.invoice || !order.pierOrderId || !order.pierOrigin || !order.approvedBy)fail('RETURN_ORDER','Use an originally approved and invoiced order.',409)
 if(before&&before.revision!==p.revision)fail('REVISION','The return request changed. Reload before deciding or reconciling.',409)
 if(before?.restored)fail('RETURN_RESTORED','Restored return records are history only; reconcile their authority with the supplier separately.',409)
 const accountRow=await account(env.DB,actor,order.accountId)
 const guards=[env.DB.prepare('UPDATE bw_return_claim_epoch SET revision=revision+1 WHERE id=1 AND revision=?').bind(epoch),changed(env.DB),env.DB.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_orders WHERE id=? AND revision=?) THEN 1 ELSE 0 END').bind(order.id,order.revision),env.DB.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_accounts WHERE id=? AND revision=?) THEN 1 ELSE 0 END').bind(accountRow.id,accountRow.revision)]
 if(actor.staff?.role==='operations'){const current=await source(env,order);returnWarehouseAuthority(actor,returnWarehouses(order,current.state,before?.basis.itemId))}
 const at=(await now()).toISOString(),revision=crypto.randomUUID()
 let claim:ReturnClaim
 if(type==='return.request'||type==='return.revise') {
  if(!reviewer(actor))await requireCompanyRight(env.DB,actor,order.accountId,'purchasing',order.shipTo?.id)
  if(before?.decision)fail('RETURN_DECIDED','A decided return preserves its original request.',409)
  const line=before?.line??integer(p.line,'Original line',1,order.lines.length),basis=order.lines[line-1],quantity=integer(p.quantity,'Requested units',1,basis.quantity)
  if(all.filter(row=>row.orderId===order.id&&row.line===line&&row.id!==before?.id).reduce((sum,row)=>sum+row.quantity,0)+quantity>basis.quantity)fail('RETURN_LIMIT','Requested quantities across cases exceed the original line.',409)
  claim={...(before??{}),id:before?.id??crypto.randomUUID(),accountId:order.accountId,orderId:order.id,orderRevision:order.revision,line,currency:order.currency??'AUD',basis,original:basis.substitutedFrom??order.fromSubstitution??null,pierOrigin:order.pierOrigin,pierOrderId:order.pierOrderId,quantity,reason:text(p.reason,'Return reason',2000),condition:text(p.condition,'Condition',2000),createdBy:before?.createdBy??actor.id,createdAt:before?.createdAt??at,receipts:[],history:before?.history??[],revision}
  // A return request records a claim, never a stock receipt or financial entitlement.
  const requested=units(claim,quantity)
  let available:Awaited<ReturnType<typeof source>>
  try{available=await source(env,order)}catch{fail('RETURN_SOURCE','Current dispatched quantities are unavailable; no return entitlement is inferred.',409)}
  claim.warehouses=returnWarehouses(order,available.state,basis.itemId)
  const used=all.filter(row=>row.orderId===order.id&&row.basis.itemId===basis.itemId&&row.id!==before?.id).reduce((sum,row)=>sum+units(row,row.quantity),0n)
  if(used+requested>(available.sources.get(basis.itemId)?.dispatched??0n))fail('RETURN_LIMIT','Requested physical units exceed the connected order’s dispatched quantity.',409)
 } else {
  review(actor);claim={...before!,revision}
  if(type==='return.decide') {
   if(claim.decision)fail('RETURN_DECIDED','This request already has an attributed decision.',409)
   if(p.orderRevision!==order.revision || claim.orderRevision!==order.revision)fail('REVISION','The original order changed. Review its current accepted basis before deciding.',409)
   const approved=integer(p.quantity,'Approved units',0,claim.quantity);returnAmountAuthority(actor,claim,approved)
   claim.decision={quantity:approved,instructions:text(p.instructions,'Return instructions',2000),reason:text(p.reason,'Decision reason',2000),by:actor.id,at,requestRevision:before!.revision}
  } else {
   if(!claim.decision?.quantity)fail('RETURN_APPROVAL','Approve quantities before matching physical receipts.',409)
   if(!Array.isArray(p.receipts)||!p.receipts.length||new Set(p.receipts.map((row:any)=>row.returnId)).size!==p.receipts.length)fail('INPUT','Choose distinct physical receipts.',400)
   let evidence:Awaited<ReturnType<typeof source>>
   try{evidence=await source(env,order)}catch{fail('RETURN_SOURCE','Connected return evidence is unavailable; the claim remains unresolved.',409)}
   const linked=evidence.sources.get(claim.basis.itemId)
   if(claim.pierOrigin!==evidence.origin || !linked)fail('RETURN_SOURCE','The connected source does not match the original order.',409)
   returnWarehouseAuthority(actor,returnWarehouses(order,evidence.state,claim.basis.itemId));returnAmountAuthority(actor,claim,claim.decision.quantity)
   claim.warehouses=returnWarehouses(order,evidence.state,claim.basis.itemId)
   const additions:Receipt[]=[]
   for(const entry of p.receipts) {
    const returnId=text(entry.returnId,'Physical return receipt'),quantity=integer(entry.quantity,'Received selling units',1,claim.decision.quantity),base=units(claim,quantity)
    const existing=claim.receipts.find(row=>row.returnId===returnId)
    if(existing){if(existing.quantity!==quantity)fail('RETURN_RECEIPT','A reconciled receipt allocation is immutable.',409);continue}
    const received=evidence.state.returns.find((row:any)=>row.id===returnId)
    if(!received || !linked.returnIds.includes(returnId) || received.itemId!==claim.basis.itemId)fail('RETURN_SOURCE','Use an actual connected Pier return linked to this order line.',409)
    const used=all.flatMap(row=>row.pierOrigin===claim.pierOrigin?row.receipts.filter(receipt=>receipt.returnId===returnId):[]).reduce((sum,row)=>sum+decimal(row.baseQuantity),0n)
    if(used+base>decimal(received.quantity))fail('RETURN_RECEIPT','Receipt quantities are already allocated to another claim or exceed physical receipt.',409)
    additions.push({returnId,quantity,baseQuantity:format(base),by:actor.id,at})
   }
   if(claim.receipts.concat(additions).reduce((sum,row)=>sum+row.quantity,0)>claim.decision.quantity)fail('RETURN_LIMIT','Received quantities exceed this case’s approved quantities.',409)
   if(!additions.length)return (await readReturnClaims(env,actor,order.id)).claims.find(row=>row.id===claim.id)
   claim.receipts=[...claim.receipts,...additions]
  }
 }
 claim.history=[...claim.history,{action:type,by:actor.id,at,reason:type==='return.reconcile'?'Matched physical return receipts; no inventory or financial command issued.':text(p.reason,'Reason',2000),revision}]
 const statements=[...guards]
 if(before)statements.push(env.DB.prepare('UPDATE bw_return_claims SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify(claim),revision,claim.id,before.revision),changed(env.DB))
 else statements.push(env.DB.prepare('INSERT INTO bw_return_claims VALUES(?,?,?,?,?)').bind(claim.id,claim.accountId,claim.orderId,JSON.stringify(claim),revision))
 const ownerId=(await env.DB.prepare("SELECT id FROM oa_operators WHERE status='active' AND role='owner' ORDER BY id LIMIT 1").first<{id:string}>())?.id
 if(!ownerId)fail('RETURN_OWNER','An active installation owner must own unresolved returns.',409)
 const today=calendarDate(new Date(at),await reportZone(env.DB))
 for(const [id,title,reason] of [[`return:${claim.id}`,'Return receipt review','Inspection and a separate disposition or credit decision remain unresolved.'],...(claim.decision&&claim.quantity>claim.decision.quantity?[[`return-dispute:${claim.id}`,'Disputed return remainder',`${claim.quantity-claim.decision.quantity} requested units remain disputed after partial authorization.`]]:[])]) {
  const value={id,kind:'return',warehouses:claim.warehouses??[],accountId:claim.accountId,sourceId:claim.id,sourcePath:`/api/barrow/orders/${claim.orderId}/return-claims`,title,reason,priority:1,ownerId,nextContactDate:today,status:'open',createdAt:at,contacts:[]}
  statements.push(env.DB.prepare('INSERT OR IGNORE INTO bw_followups(id,account_id,value_json,revision) VALUES(?,?,?,?)').bind(id,claim.accountId,JSON.stringify(value),crypto.randomUUID()))
 }
 statements.push(audit(env.DB,actor,claim.id,type,{accountId:claim.accountId,orderId:claim.orderId,revision,source:type,reason:claim.history.at(-1)!.reason}))
 await commit(env.DB,actor,statements)
 return (await readReturnClaims(env,actor,order.id)).claims.find(row=>row.id===claim.id)
}
