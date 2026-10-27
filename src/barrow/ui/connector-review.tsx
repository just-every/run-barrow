import { useEffect, useState } from 'react'
import { request, errorMessage } from './api'
import { Notice } from './primitives'
import { when } from './types'
import type { connectorReview } from '../connector-review'
type Review = Awaited<ReturnType<typeof connectorReview>>
export function ConnectorReview() {
 const [data,setData]=useState<Review|null>(null),[reason,setReason]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{void request<Review>('/api/barrow/connectors').then(setData).catch(cause=>setError(errorMessage(cause)))},[])
 async function inspect(){setBusy(true);setError('');try{setData(await request<Review>('/api/barrow/connectors/inspect',{revision:data?.revision??null,reason}));setReason('')}catch(cause){setError(errorMessage(cause))}finally{setBusy(false)}}
 const review=data?.review
 return <section className="br-card br-stack" aria-label="Connector reconciliation" style={{minWidth:0,overflowWrap:'anywhere'}}><h2>Connector reconciliation</h2>
  <p>Review source records and repair their existing mappings. Enable Pier observations under Stock synchronization after reconciliation; configure and approve feed mappings and record authority under Move in.</p>
  {error&&<Notice error>{error}</Notice>}
  <label>Connector review reason<input value={reason} onChange={event=>setReason(event.target.value)} maxLength={1000}/></label>
  <button type="button" disabled={busy||!data||!reason.trim()} onClick={()=>void inspect()}>{busy?'Inspecting…':'Inspect connectors'}</button>
  {review?<>
   <p>Observed {when(review.at)} · responsible owner <code>{review.owner}</code>. Retained inspection; inspect again to read the source now.</p>
   <h3>Pier source preview</h3><p>Connection: {review.pier.state}. Stock authority: Pier. Commerce authority: Barrow.</p>
   <p>Customer mapping: Pier customer ID to party ID. Item mapping: priced SKU to Pier SKU. Repair these fields in Accounts.</p>
   {review.pier.counts&&<p>Source items: {review.pier.counts.sourceItems}; source customers: {review.pier.counts.sourceCustomers}; mapped accounts: {review.pier.counts.mappedAccounts}; source orders: {review.pier.counts.sourceOrders}; native orders: {review.pier.counts.nativeOrders}.</p>}
   <p>Last successful source preview: {review.pier.lastSuccessfulAt?when(review.pier.lastSuccessfulAt):'not recorded'}. Samples below retain that observation when the connection fails.</p>
   <ul>{review.pier.samples.map((item:any)=><li key={item.id}><strong>{item.sku}</strong> · {item.name} · {item.available} {item.unit} available</li>)}</ul>
   <p>Source permission: {review.pier.state==='answered'?'authorized owner or stock operator':'not verified'}. Inspection never sends an order.</p>
   <p>Last successful stock synchronization: {review.sync?.completed_at?when(review.sync.completed_at):'not recorded'}. Lag: {review.sync?.lagSeconds??'unknown'} seconds. Failures: {review.sync?.failures??'not recorded'}. {review.sync?.pending?'Source acknowledgment pending.':review.sync?.has_more?'More source pages pending.':'No source page pending.'}</p>
   <h3>Records needing attention: {review.issues.length}</h3>
   {review.issues.length?<ul className="br-stack">{review.issues.map((issue:any,index:number)=><li key={index}><code>{issue.record}</code> · {issue.kind}: {issue.message}<br/>Next: {issue.action} Owner: <code>{issue.owner}</code></li>)}</ul>:<p>No discrepancies found in this inspection.</p>}
   <h3>Flat-file history</h3>
   {review.feeds.length===0?<p>No retained feed sessions.</p>:review.feeds.map((feed:any)=><details key={feed.id}><summary>Feed {feed.id} · {feed.state}</summary>
    <p>Connection: {feed.connectionState}. Last successful feed read: {feed.lastSuccessfulReadAt?when(feed.lastSuccessfulReadAt):'not recorded'}. Lag: {feed.lagSeconds??'unknown'} seconds.</p>
    <p>Responsible source system: {feed.sourceSystem}. Record authorities: {Object.entries(feed.authorities).map(([record,system])=>`${record}: ${system}`).join('; ')||'not signed off'}.</p>
    <p>{feed.balanceNote}</p>
    <ul>{feed.totals.map((total:any,index:number)=><li key={index}>{total.kind} {total.currency||'units'}: source count {total.sourceCount}, native count {total.targetCount}; source minor units {total.sourceCents}, native minor units {total.targetCents}, difference {total.differenceCents}; source quantity {total.sourceQuantity??'unknown'}, native quantity {total.targetQuantity??'unknown'}.</li>)}</ul>
    <details><summary>Source identity mappings</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(feed.mappings,null,2)}</pre></details>
    <p>Products: {feed.counts?.products??0}; customers: {feed.counts?.customers??0}; ATS: {feed.counts?.ats??0}; unresolved errors: {feed.counts?.unresolvedErrors??0}.</p>
    {feed.mapping&&<pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(feed.mapping,null,2)}</pre>}
    <ul>{feed.files.map((file:any)=><li key={file.id}>{file.name} · {file.rowsAccepted} accepted · {file.errors.length} quarantined · received {when(file.receivedAt)} · owner {file.owner}<ul>{file.errors.map((row:any)=><li key={row.row}>Row {row.row}: {row.message}</li>)}</ul></li>)}</ul>
    <ul>{feed.deliveries.map((file:any)=><li key={file.id}>{file.filename} · order {file.orderId} · {file.state}{file.error?` · ${file.error}`:''}</li>)}</ul>
   </details>)}
  </>:<p>No inspection recorded.</p>}
 </section>
}
