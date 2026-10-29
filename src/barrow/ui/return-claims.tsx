import { useState } from 'react'
import { request, errorMessage } from './api'
import { Notice } from './primitives'
import { money, type Order } from './types'
import type { readReturnClaims } from '../return-claims'

type Report=Awaited<ReturnType<typeof readReturnClaims>>
type Claim=Report['claims'][number]
function ClaimReview({claim,report,busy,act}:{claim:Claim;report:Report;busy:boolean;act:(type:string,payload:Record<string,unknown>)=>Promise<void>}) {
 const [approved,setApproved]=useState(String(claim.quantity)),[instructions,setInstructions]=useState(''),[reason,setReason]=useState(''),[receipt,setReceipt]=useState(''),[quantity,setQuantity]=useState('1'),[creditReason,setCreditReason]=useState('')
 return <article className="br-card br-stack" aria-label={`Return case ${claim.id}`}>
  <h4>Return case · {claim.basis.sku}</h4><p>Case {claim.id}</p>
  <p>Original line {claim.line} · requested {claim.quantity} {claim.basis.unit??'units'} · {claim.reason} · condition: {claim.condition}</p>
  {!!claim.original&&<p>Replacement basis retained with its original order and line linkage.</p>}
  <p>{claim.evidence.reason}</p>
  {claim.decision?<><p>Approved {claim.decision.quantity} of {claim.quantity} · disputed {claim.disputedQuantity}</p><p>Instructions: {claim.decision.instructions}</p><p>Decision: {claim.decision.reason} · {report.people[claim.decision.by]??'Supplier reviewer'} · {claim.decision.at}</p></>:<p>Awaiting supplier authorization. The request changes no stock or money.</p>}
  {claim.receipts.map(row=><p key={row.returnId}>Pier receipt {row.returnId} · {row.quantity} selling units · {row.baseQuantity} physical units</p>)}
  {claim.evidence.inspections.map((row,index)=>row?<p key={row.returnId}>Pier inspection · {row.condition} · {row.disposition} · {row.inspectedAt} · source revision {row.version}</p>:<p key={index}>Warehouse inspection is not yet verified.</p>)}
  {claim.credits.map(credit=><p key={credit.id}>Issued return credit: {money(credit.amountCents,credit.currency as Claim['currency'])} · {credit.id} · {credit.createdAt}</p>)}
  {claim.creditProposal?<p>Original-priced credit proposal: {money(claim.creditProposal.amountCents,claim.creditProposal.currency??'AUD')}. {claim.creditProposal.note}</p>:<p>Credit proposal unresolved. Approved physical receipts and the original credit basis must reconcile.</p>}
  {claim.canCredit&&claim.creditProposal&&<details><summary>Issue inspected return credit</summary><div className="br-stack">
   <p>This separate financial decision reduces the invoice balance. The disputed remainder stays open. No card refund or inventory command is sent.</p>
   <label>Credit decision reason<textarea value={creditReason} maxLength={1000} onChange={e=>setCreditReason(e.target.value)}/></label>
   {claim.creditProposal.lines.map(row=><button key={row.returnId} disabled={busy||!creditReason.trim()} onClick={()=>void act('credit.issue',{orderId:claim.orderId,returnId:row.returnId,claimId:claim.id,claimRevision:claim.revision,inspectionVersion:row.inspection?.version,expectedCents:row.amountCents,lines:[{line:claim.line,quantity:row.quantity}],reason:creditReason})}>Issue {money(row.amountCents,claim.currency??'AUD')} credit for {row.quantity} inspected units</button>)}
  </div></details>}
  {claim.restored&&<p>Restored history only. No return authority is restored.</p>}
  {report.canReview&&!claim.restored&&!claim.decision&&<details><summary>Review return quantities</summary><div className="br-stack">
   <label>Approved units<input type="number" min="0" max={claim.quantity} value={approved} onChange={e=>setApproved(e.target.value)}/></label>
   <label>Return instructions<textarea value={instructions} maxLength={2000} onChange={e=>setInstructions(e.target.value)}/></label>
   <label>Decision reason<textarea value={reason} maxLength={2000} onChange={e=>setReason(e.target.value)}/></label>
   <button disabled={busy||!instructions.trim()||!reason.trim()} onClick={()=>void act('return.decide',{id:claim.id,revision:claim.revision,orderRevision:claim.orderRevision,quantity:Number(approved),instructions,reason})}>Record return authorization</button>
  </div></details>}
  {report.canReview&&!claim.restored&&!!claim.decision?.quantity&&<details><summary>Match physical return receipt</summary><div className="br-stack">
   <p>Record the receipt in Pier first. Matching it here makes no stock change and grants no credit.</p>
   <label>Pier return receipt ID<input value={receipt} onChange={e=>setReceipt(e.target.value)}/></label>
   <label>Received selling units<input type="number" min="1" max={claim.decision.quantity} value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>
   <button disabled={busy||!receipt.trim()} onClick={()=>void act('return.reconcile',{id:claim.id,revision:claim.revision,receipts:[{returnId:receipt,quantity:Number(quantity)}]})}>Match recorded receipt</button>
  </div></details>}
  {claim.tasks.map((task:any)=><p key={task.id}>{task.title}: {task.status} · owner {report.people[task.ownerId]??'Former supplier'} · next contact {task.nextContactDate}{task.resolution?` · ${task.resolution}`:''}</p>)}
 </article>
}
export function ReturnClaims({order}:{order:Order}) {
 const [report,setReport]=useState<Report|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const [line,setLine]=useState('1'),[quantity,setQuantity]=useState('1'),[reason,setReason]=useState(''),[condition,setCondition]=useState('')
 const load=async()=>setReport(await request<Report>(`/api/barrow/orders/${order.id}/return-claims`))
 async function act(type:string,payload:Record<string,unknown>) {
  setBusy(true);setError('')
  try{await request('/api/barrow/commands',{type,payload});await load();if(type==='return.request'){setReason('');setCondition('')}}catch(cause){setError(errorMessage(cause))}finally{setBusy(false)}
 }
 return <details className="br-details" onToggle={e=>{if(e.target===e.currentTarget&&e.currentTarget.open)void load().catch(cause=>setError(errorMessage(cause)))}}>
  <summary>Returns and claims</summary><section className="br-stack" aria-label={`Returns for ${order.id}`}>
   <h3>Return requests</h3>{error&&<Notice error>{error}</Notice>}
   {report&&<><p>Text-only return review. Record inspection and stock disposition in Pier. Authorization and receipt matching grant no credit; issuing inspected credit is a separate financial decision. Photos and labels require separate handling.</p>
    {report.canRequest&&<details><summary>Request a return</summary><div className="br-stack">
     <label>Original order line<select value={line} onChange={e=>setLine(e.target.value)}>{order.lines.map((row,index)=><option key={index} value={index+1}>{index+1} · {row.sku} · {row.quantity} {row.unit??'units'}</option>)}</select></label>
     <label>Requested units<input type="number" min="1" max={order.lines[Number(line)-1].quantity} value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>
     <label>Return reason<textarea value={reason} maxLength={2000} onChange={e=>setReason(e.target.value)}/></label>
     <label>Goods condition<textarea value={condition} maxLength={2000} onChange={e=>setCondition(e.target.value)}/></label>
     <button disabled={busy||!reason.trim()||!condition.trim()} onClick={()=>void act('return.request',{orderId:order.id,line:Number(line),quantity:Number(quantity),reason,condition})}>Submit return request</button>
    </div></details>}
    <button className="br-secondary" disabled={busy} onClick={()=>void load().catch(cause=>setError(errorMessage(cause)))}>Reload return evidence</button>
    {!report.claims.length&&<p>No return requests for this order.</p>}
    {report.claims.map(claim=><ClaimReview key={`${claim.id}:${claim.revision}`} claim={claim} report={report} busy={busy} act={act}/>)}
   </>}
  </section>
 </details>
}
