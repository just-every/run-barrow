import { useState } from 'react'
import { request, errorMessage } from './api'
import { ConfirmationLayoutTools } from './confirmation-layouts'
import type { ConfirmationChoice } from '../bulk-confirmations'

export function BulkConfirmations({orderIds}:{orderIds:string[]}) {
 const [orders,setOrders]=useState<ConfirmationChoice[]|null>(null),[selected,setSelected]=useState<Record<string,number>>({})
 const [layout,setLayout]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[downloaded,setDownloaded]=useState(false)
 const count=Object.keys(selected).length
 async function load() {
  setBusy(true);setError('');setDownloaded(false);setOrders(null);setSelected({})
  try {setOrders((await request<{orders:ConfirmationChoice[]}>('/api/barrow/confirmations/selection',{orderIds})).orders)}
  catch(cause){setError(errorMessage(cause))}finally{setBusy(false)}
 }
 function choose(id:string,number?:number) {
  setDownloaded(false)
  setSelected(current=>{const next={...current};if(number===undefined)delete next[id];else next[id]=number;return next})
 }
 async function download() {
  setBusy(true);setError('');setDownloaded(false)
  try {
   const response=await fetch('/api/barrow/confirmations/export.csv',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({confirmations:Object.entries(selected).map(([orderId,number])=>({orderId,number})),...(layout?{layout}:{})})})
   if(!response.ok){const value=await response.json() as {error?:{message?:string}};throw new Error(value?.error?.message??'The confirmation export failed.')}
   const url=URL.createObjectURL(await response.blob()),link=document.createElement('a')
   link.href=url;link.download='barrow-confirmations.csv';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)
   setDownloaded(true)
  }catch(cause){setError(errorMessage(cause))}finally{setBusy(false)}
 }
 return <details className="br-card br-stack"><summary>Bulk confirmation CSV</summary>
  <div className="br-stack">
  <p>Load up to 50 orders from the current order view, then choose one recorded confirmation revision per order. The latest recorded revision is preselected when you select an order. Drafts and historical orders without confirmations cannot be exported.</p>
  <button type="button" className="br-secondary" disabled={busy||!orderIds.length} onClick={()=>void load()}>{busy?'Working…':'Load current view'}</button>
  {error&&<p role="alert">{error}</p>}
  {orders&&<>
   <div className="br-actions"><button type="button" className="br-secondary" disabled={busy} onClick={()=>{setSelected(Object.fromEntries(orders.filter(order=>order.confirmations.length).map(order=>[order.orderId,order.confirmations.at(-1)!.number])));setDownloaded(false)}}>Select all recorded</button><button type="button" className="br-secondary" disabled={busy||!count} onClick={()=>{setSelected({});setDownloaded(false)}}>Clear selection</button></div>
   <fieldset className="br-stack" disabled={busy}><legend>Recorded confirmations</legend>
    {orders.map(order=><div className="br-stack" key={order.orderId}>
     <div className="br-actions"><button type="button" className={selected[order.orderId]===undefined?'br-secondary':undefined} disabled={!order.confirmations.length} aria-pressed={selected[order.orderId]!==undefined} onClick={()=>choose(order.orderId,selected[order.orderId]===undefined?order.confirmations.at(-1)!.number:undefined)}>{selected[order.orderId]===undefined?'Include':'Included'} {order.reference||order.orderId} · {order.orderId}</button></div>
     {order.confirmations.length?<label>Revision for {order.reference||order.orderId}<select aria-label={`Revision for ${order.reference||order.orderId}`} disabled={selected[order.orderId]===undefined} value={selected[order.orderId]??order.confirmations.at(-1)!.number} onChange={event=>choose(order.orderId,Number(event.target.value))}>{order.confirmations.map(record=><option key={record.number} value={record.number}>C{record.number} · {record.stage} · {record.orderRevision}</option>)}</select></label>:<p>No recorded confirmation.</p>}
    </div>)}
   </fieldset>
   <ConfirmationLayoutTools selected={layout} onSelect={id=>{setLayout(id);setDownloaded(false)}}/>
   <p>One row per recorded selling-unit line. Order, order revision and confirmation identifiers are always included. Quantities are not combined across units or currencies. Matrix and style/color/size production totals are not available.</p>
   <button type="button" disabled={busy||!count} onClick={()=>void download()}>Download {count} selected confirmations CSV</button>
   {downloaded&&<p role="status">The selected confirmation CSV was downloaded.</p>}
  </>}
  </div>
 </details>
}
