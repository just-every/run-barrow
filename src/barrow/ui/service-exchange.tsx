import { useState } from 'react'
import { request, errorMessage } from './api'
import { Notice } from './primitives'
import { money } from './types'
import type { readServiceCases, previewServiceExchange } from '../service-resolution'

type Report=Awaited<ReturnType<typeof readServiceCases>>
type Case=Report['cases'][number]
type Preview=Awaited<ReturnType<typeof previewServiceExchange>>
export function ServiceExchange({value,report,busy,act}:{value:Case;report:Report;busy:boolean;act:(type:string,payload:Record<string,unknown>)=>Promise<void>}) {
 const [sku,setSku]=useState(value.requestedReplacement?.sku??''),[quantity,setQuantity]=useState(String(value.requestedReplacement?.quantity??value.quantity)),[unit,setUnit]=useState('')
 const [preview,setPreview]=useState<Preview|null>(null),[selection,setSelection]=useState(''),[reason,setReason]=useState(''),[requestId]=useState(()=>crypto.randomUUID())
 const [error,setError]=useState(''),[loading,setLoading]=useState(false),[cents,setCents]=useState(''),[start,setStart]=useState(''),[end,setEnd]=useState(''),[quoteReason,setQuoteReason]=useState(''),[carrier,setCarrier]=useState(''),[acknowledged,setAcknowledged]=useState(false)
 const latest=value.exchanges?.at(-1),identity={id:value.id,revision:value.revision,orderRevision:report.orderRevision}
 const option=preview?.deliveryOptions.options[Number(selection)]
 const input={...identity,sku,quantity:Number(quantity),...(unit?{unit}:{})}
 const reset=()=>{setPreview(null);setError('')}
 async function prepare() {
  setLoading(true);setError('')
  try {
   const {result}=await request<{result:Preview}>('/api/barrow/commands',{type:'service.exchange-preview',payload:input})
   setPreview(result);setSelection(String(Math.max(0,result.deliveryOptions.options.findIndex(row=>!row.approvalRequired))))
  } catch(cause){setError(errorMessage(cause))} finally{setLoading(false)}
 }
 return <section className="br-stack" aria-label="Replacement proposal">
  {latest&&<>
   <h5>Replacement proposal {latest.number}</h5>
   <p>{latest.line.quantity} × {latest.line.sku} · {latest.line.unit} · {money(latest.line.unitCents,latest.currency)} per selling unit</p>
   <p>Original reported merchandise: {money(latest.originalMerchandiseCents,latest.currency)}. Replacement merchandise: {money(latest.merchandiseCents,latest.currency)}. Merchandise difference: {money(latest.priceDifferenceCents,latest.currency)}.</p>
   <p>Replacement freight: {latest.freightCents===null?'Unverified':money(latest.freightCents,latest.currency)}{latest.delivery?` · ${latest.delivery.name} · ${latest.delivery.windowStart} to ${latest.delivery.windowEnd}`:''}. Terms: {latest.termsDays} days.</p>
   <p>{latest.reason}</p>
   <p>{latest.buyerApproval?'Buyer approved this exact merchandise difference and freight.':'Awaiting current purchaser approval of this exact price and freight.'} Tax remains unverified. No exchange order is accepted, no credit is issued and the case remains unresolved. An original freight credit is not included.</p>
   {!report.canReview&&!value.restored&&!latest.buyerApproval&&<>
    <label><input type="checkbox" checked={acknowledged} onChange={event=>setAcknowledged(event.target.checked)}/>I approve the displayed merchandise difference, replacement freight and terms. Tax and exchange acceptance remain pending.</label>
    <button disabled={busy||!acknowledged||latest.freightCents===null} onClick={()=>void act('service.exchange-approve',{...identity,number:latest.number,basis:latest.basis,acknowledged})}>Approve replacement price and freight</button>
   </>}
  </>}
  {report.canReview&&!value.restored&&<details><summary>Propose replacement</summary><div className="br-stack">
   {error&&<Notice error>{error}</Notice>}
   <label>Replacement SKU<input value={sku} onChange={event=>{setSku(event.target.value);reset()}}/></label>
   <label>Replacement quantity<input type="number" min="1" value={quantity} onChange={event=>{setQuantity(event.target.value);reset()}}/></label>
   <label>Replacement selling unit (optional)<input value={unit} onChange={event=>{setUnit(event.target.value);reset()}}/></label>
   <button className="br-secondary" disabled={busy||loading||!sku.trim()} onClick={()=>void prepare()}>Review replacement prices</button>
   {preview&&<>
    <p>Original reported merchandise: {money(preview.originalMerchandiseCents,preview.currency)}. Replacement merchandise: {money(preview.merchandiseCents,preview.currency)}. Merchandise difference: {money(preview.priceDifferenceCents,preview.currency)}. Tax is unverified.</p>
    {preview.deliveryOptions.options.length>0?<label>Replacement delivery<select value={selection} onChange={event=>setSelection(event.target.value)}>{preview.deliveryOptions.options.map((row,index)=><option key={index} value={index}>{row.name}{row.warehouse?` · ${row.warehouse}`:''} · {row.totalCents===null?'Quote required':money(row.totalCents,preview.currency)}</option>)}</select></label>:<p>No binding freight is configured. Price approval remains unavailable until a new proposal includes verified freight.</p>}
    {option?.approvalRequired&&<>
     <label>Replacement freight cents<input type="number" min="0" value={cents} onChange={event=>setCents(event.target.value)}/></label>
     <label>Replacement window start<input type="date" value={start} onChange={event=>setStart(event.target.value)}/></label>
     <label>Replacement window end<input type="date" value={end} onChange={event=>setEnd(event.target.value)}/></label>
     <label>Freight approval reason<input value={quoteReason} onChange={event=>setQuoteReason(event.target.value)}/></label>
    </>}
    {option?.kind==='own-carrier'&&<label>Replacement carrier account reference<input value={carrier} onChange={event=>setCarrier(event.target.value)}/></label>}
    <label>Replacement proposal reason<textarea maxLength={2000} value={reason} onChange={event=>setReason(event.target.value)}/></label>
    <button disabled={busy||loading||!reason.trim()||Boolean(option?.approvalRequired&&(!cents||!start||!end||!quoteReason.trim()))} onClick={()=>void act('service.exchange-offer',{...input,requestId,reason,...(option?{methodId:option.methodId,warehouse:option.warehouse,ownCarrierAccount:carrier,...(option.approvalRequired?{freightQuote:{methodId:option.methodId,warehouse:option.warehouse,cents:Number(cents),windowStart:start,windowEnd:end,reason:quoteReason}}:{})}:{})})}>Record replacement proposal</button>
   </>}
  </div></details>}
 </section>
}
