import { ServiceExchange } from './service-exchange'
import { useState } from 'react'
import { request, errorMessage } from './api'
import { Notice } from './primitives'
import type { Order } from './types'
import type { readServiceCases } from '../service-resolution'

type Report=Awaited<ReturnType<typeof readServiceCases>>
type Case=Report['cases'][number]
function ServiceReview({value,report,busy,act}:{value:Case;report:Report;busy:boolean;act:(type:string,payload:Record<string,unknown>)=>Promise<void>}) {
 const [ownerId,setOwner]=useState(value.ownerId),[responseDeadline,setDeadline]=useState(value.responseDeadline),[response,setResponse]=useState('')
 return <article className="br-card br-stack" aria-label={`Service case ${value.id}`}>
  <h4>{value.kind==='shortage'?'Reported shortage':'Reported defect'} · {value.basis.sku}</h4>
  <p>Case {value.id} · original line {value.line} · buyer reported {value.quantity} {value.basis.unit??'units'}</p>
  <p>{value.reason}</p>
  <p>{value.evidence.available?`Pier confirms dispatch of ${value.evidence.dispatchedBaseQuantity} physical units.`:'Pier dispatch evidence unavailable.'} {value.evidence.note}</p>
  {value.rma&&<p>Linked RMA {value.rma.id} · requested {value.rma.quantity} · approved {value.rma.approvedQuantity??'awaiting decision'} · disputed {value.rma.disputedQuantity??'awaiting decision'}. Return decisions remain separate.</p>}
  <p>Requested replacement: {value.requestedReplacement?`${value.requestedReplacement.quantity} × ${value.requestedReplacement.sku}`:'None specified'}. Request only; no replacement order has been accepted.</p>
  <p>Owner: {report.people.find(person=>person.id===value.ownerId)?.name??'Supplier reviewer'} · response deadline {value.responseDeadline} ({value.timeZone}){value.overdue?' · Overdue response':''}</p>
  <p>{value.resolution}</p>
  {value.restored&&<p>Inert restored history. Review and retry commands are refused.</p>}
  <ol aria-label="Service response history">{value.history.map(event=><li key={event.revision}>{event.reason} · {report.people.find(person=>person.id===event.by)?.name??(event.by==='supplier'?'Supplier reviewer':'Company buyer')} · {event.at}</li>)}</ol>
  <ServiceExchange value={value} report={report} busy={busy} act={act}/>
  {report.canReview&&!value.restored&&<details><summary>Review service case</summary><div className="br-stack">
   <label>Service owner<select value={ownerId} onChange={event=>setOwner(event.target.value)}>{!report.people.some(person=>person.id===ownerId)&&<option value={ownerId}>Former supplier — assign an active owner</option>}{report.people.map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
   <label>Response deadline<input type="date" value={responseDeadline} onChange={event=>setDeadline(event.target.value)}/></label>
   <label>Buyer-visible response<textarea maxLength={2000} value={response} onChange={event=>setResponse(event.target.value)}/></label>
   <button disabled={busy||!response.trim()} onClick={()=>void act('service.review',{id:value.id,revision:value.revision,orderRevision:report.orderRevision,ownerId,responseDeadline,response})}>Record service response</button>
  </div></details>}
 </article>
}
export function ServiceResolution({order}:{order:Order}) {
 const [report,setReport]=useState<Report|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const [requestId,setRequestId]=useState(()=>crypto.randomUUID()),[line,setLine]=useState('1'),[kind,setKind]=useState('shortage'),[quantity,setQuantity]=useState('1'),[reason,setReason]=useState(''),[sku,setSku]=useState(''),[replacementQuantity,setReplacementQuantity]=useState('1'),[rmaId,setRma]=useState('')
 const load=async()=>setReport(await request<Report>(`/api/barrow/orders/${order.id}/service-cases`))
 async function act(type:string,payload:Record<string,unknown>) {
  setBusy(true);setError('')
  try{await request('/api/barrow/commands',{type,payload});await load();if(type==='service.report'){setRequestId(crypto.randomUUID());setReason('');setSku('');setRma('')}}catch(cause){setError(errorMessage(cause))}finally{setBusy(false)}
 }
 return <details className="br-details" onToggle={event=>{if(event.target===event.currentTarget&&event.currentTarget.open)void load().catch(cause=>setError(errorMessage(cause)))}}>
  <summary>Shortages and service</summary><section className="br-stack" aria-label={`Service for ${order.id}`}>
   <h3>Service cases</h3>{error&&<Notice error>{error}</Notice>}
   {report&&<>
    <details><summary>Report a shortage or defect</summary><div className="br-stack">
     <label>Service order line<select value={line} onChange={event=>setLine(event.target.value)}>{order.lines.map((row,index)=><option key={index} value={index+1}>{index+1} · {row.sku} · {row.quantity} {row.unit??'units'}</option>)}</select></label>
     <label>Report type<select value={kind} onChange={event=>setKind(event.target.value)}><option value="shortage">Shortage</option><option value="defect">Defect</option></select></label>
     <label>Reported units<input type="number" min="1" max={order.lines[Number(line)-1].quantity} value={quantity} onChange={event=>setQuantity(event.target.value)}/></label>
     <label>Buyer report<textarea maxLength={2000} value={reason} onChange={event=>setReason(event.target.value)}/></label>
     <label>Linked RMA ID (optional)<input value={rmaId} onChange={event=>setRma(event.target.value)}/></label>
     <label>Requested replacement SKU (optional)<input maxLength={160} value={sku} onChange={event=>setSku(event.target.value)}/></label>
     <label>Requested replacement units<input type="number" min="1" value={replacementQuantity} onChange={event=>setReplacementQuantity(event.target.value)}/></label>
     <button disabled={busy||!reason.trim()} onClick={()=>void act('service.report',{requestId,orderId:order.id,orderRevision:order.revision,line:Number(line),quantity:Number(quantity),kind,reason,rmaId:rmaId||undefined,requestedReplacement:sku.trim()?{sku,quantity:Number(replacementQuantity)}:undefined})}>Submit service report</button>
    </div></details>
    <button className="br-secondary" disabled={busy} onClick={()=>void load().catch(cause=>setError(errorMessage(cause)))}>Reload service cases</button>
    {!report.cases.length&&<p>No service cases for this order.</p>}
    {report.cases.map(value=><ServiceReview key={`${value.id}:${value.revision}`} value={value} report={report} busy={busy} act={act}/>)}
   </>}
  </section>
 </details>
}
