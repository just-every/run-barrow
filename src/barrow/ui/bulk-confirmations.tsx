import { useState } from 'react'
import { request, errorMessage } from './api'
import { ConfirmationLayoutTools } from './confirmation-layouts'
import type { ConfirmationChoice } from '../bulk-confirmations'

export function BulkConfirmations({orderIds}:{orderIds:string[]}) {
 const [orders,setOrders]=useState<ConfirmationChoice[]|null>(null),[selected,setSelected]=useState<Record<string,number>>({})
 const [layout,setLayout]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[downloaded,setDownloaded]=useState(''),[season,setSeason]=useState('')
 const count=Object.keys(selected).length
 async function load() {
  setBusy(true);setError('');setDownloaded('');setOrders(null);setSelected({})
  try {setOrders((await request<{orders:ConfirmationChoice[]}>('/api/barrow/confirmations/selection',season.trim()?{season:season.trim()}:{orderIds})).orders)}
  catch(cause){setError(errorMessage(cause))}finally{setBusy(false)}
 }
 function choose(id:string,number?:number) {
  setDownloaded('')
  setSelected(current=>{const next={...current};if(number===undefined)delete next[id];else next[id]=number;return next})
 }
 async function download(totals:boolean) {
  setBusy(true);setError('');setDownloaded('')
  try {
   const response=await fetch('/api/barrow/confirmations/export.csv',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({confirmations:Object.entries(selected).map(([orderId,number])=>({orderId,number})),...(layout?{layout}:{}),...(totals?{shape:'totals'}:{})})})
   if(!response.ok){const value=await response.json() as {error?:{message?:string}};throw new Error(value?.error?.message??'The confirmation export failed.')}
   const url=URL.createObjectURL(await response.blob()),link=document.createElement('a')
   link.href=url;link.download=totals?'barrow-production-totals.csv':'barrow-confirmations.csv';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)
   setDownloaded(totals?'The style, color and size totals CSV was downloaded.':'The selected confirmation CSV was downloaded.')
  }catch(cause){setError(errorMessage(cause))}finally{setBusy(false)}
 }
 return <details className="br-card br-stack"><summary>Bulk confirmation CSV</summary>
  <div className="br-stack">
  <p>Load up to 50 orders from the current order view, or every recorded order of one season, then choose one recorded confirmation revision per order. The latest recorded revision is preselected when you select an order. Drafts and historical orders without confirmations cannot be exported.</p>
  <label>Season (optional, exactly as published on the line sheet)<input value={season} maxLength={80} disabled={busy} onChange={event=>setSeason(event.target.value)}/></label>
  <button type="button" className="br-secondary" disabled={busy||!season.trim()&&!orderIds.length} onClick={()=>void load()}>{busy?'Working…':season.trim()?'Load season orders':'Load current view'}</button>
  {error&&<p role="alert">{error}</p>}
  {orders&&<>
   <div className="br-actions"><button type="button" className="br-secondary" disabled={busy} onClick={()=>{setSelected(Object.fromEntries(orders.filter(order=>order.confirmations.length).map(order=>[order.orderId,order.confirmations.at(-1)!.number])));setDownloaded('')}}>Select all recorded</button><button type="button" className="br-secondary" disabled={busy||!count} onClick={()=>{setSelected({});setDownloaded('')}}>Clear selection</button></div>
   <fieldset className="br-stack" disabled={busy}><legend>Recorded confirmations</legend>
    {orders.map(order=><div className="br-stack" key={order.orderId}>
     <div className="br-actions"><button type="button" className={selected[order.orderId]===undefined?'br-secondary':undefined} disabled={!order.confirmations.length} aria-pressed={selected[order.orderId]!==undefined} onClick={()=>choose(order.orderId,selected[order.orderId]===undefined?order.confirmations.at(-1)!.number:undefined)}>{selected[order.orderId]===undefined?'Include':'Included'} {order.reference||order.orderId} · {order.orderId}</button></div>
     {order.confirmations.length?<label>Revision for {order.reference||order.orderId}<select aria-label={`Revision for ${order.reference||order.orderId}`} disabled={selected[order.orderId]===undefined} value={selected[order.orderId]??order.confirmations.at(-1)!.number} onChange={event=>choose(order.orderId,Number(event.target.value))}>{order.confirmations.map(record=><option key={record.number} value={record.number}>C{record.number} · {record.stage} · {record.orderRevision}</option>)}</select></label>:<p>No recorded confirmation.</p>}
    </div>)}
   </fieldset>
   <ConfirmationLayoutTools selected={layout} onSelect={id=>{setLayout(id);setDownloaded('')}}/>
   <p>The layout file has one row per recorded selling-unit line, or one row per style and color with sizes across for a size-matrix layout; order, order revision and confirmation identifiers are always included. Totals add exact base quantities by style, color and size and name every source confirmation. Money is never combined across currencies.</p>
   <div className="br-actions"><button type="button" disabled={busy||!count} onClick={()=>void download(false)}>Download {count} selected confirmations CSV</button>
   <button type="button" className="br-secondary" disabled={busy||!count} onClick={()=>void download(true)}>Download style, color and size totals</button></div>
   {downloaded&&<p role="status">{downloaded}</p>}
  </>}
  </div>
 </details>
}
