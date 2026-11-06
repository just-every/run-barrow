import { useEffect, useState } from 'react'
import { request, errorMessage } from './api'
import { Notice } from './primitives'
import { when } from './types'
import type { readOrderNotices, noticePreferences, orderNoticeSource } from '../order-notices'
type Data = Awaited<ReturnType<typeof readOrderNotices>>
type Preferences = Awaited<ReturnType<typeof noticePreferences>>
const command = <T,>(type:string,payload:unknown) => request<{result:T}>('/api/barrow/commands',{type,payload}).then(row=>row.result)
export function OrderNotices({version,onOpen}:{version:unknown;onOpen:(id:string)=>void}) {
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const [source,setSource]=useState<Awaited<ReturnType<typeof orderNoticeSource>>|null>(null)
 async function reload(){setData(await request<Data>('/api/barrow/order-notices'))}
 useEffect(()=>{let live=true;void request<Data>('/api/barrow/order-notices').then(value=>{if(live)setData(value)}).catch(cause=>{if(live)setError(errorMessage(cause))});return()=>{live=false}},[version])
 async function open(path:string){setBusy(true);setError('');setSource(null);try{setSource(await request(path))}catch(cause){setError(errorMessage(cause))}finally{setBusy(false)}}
 async function read(id:string){setBusy(true);setError('');try{await command('order-notice.read',{id});await reload()}catch(cause){setError(errorMessage(cause))}finally{setBusy(false)}}
 return <section className="br-card br-stack" aria-label="Order notices"><h2>Order notices</h2>
  {error&&<Notice error>{error}</Notice>}
  {data&&!data.notices.length&&<p>No order notices to show.</p>}
  {data?.notices.map(item=><article className="br-stack" key={item.id} aria-label={`${item.title} for ${item.orderId}`}>
   <h3>{item.title} · {item.orderId}</h3><p>{item.readAt?'Read':'Unread'} · {when(item.createdAt)}</p>
   <p>{item.sourceOrigin==='Barrow'?'Barrow':'Connected Pier'} · source {item.sourceId} · revision {item.sourceRevision}</p>
   <div className="br-actions"><button className="br-secondary" disabled={busy} onClick={()=>void open(item.sourcePath)}>Open current source</button>{!item.readAt&&<button className="br-secondary" disabled={busy} onClick={()=>void read(item.id)}>Mark as read</button>}</div>
  </article>)}
  {source&&<section className="br-stack" aria-label="Current notice source"><h3>{source.notice.title} · current source</h3><p>Recorded source revision: {source.notice.sourceRevision}</p>
   <SourceDetails value={source.current}/> 
   <button className="br-secondary" onClick={()=>onOpen(source.orderId)}>View order</button></section>}
  {data&&<p>{data.note}</p>}
 </section>
}
export function OrderNoticePreferences() {
 const [data,setData]=useState<Preferences|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{void request<Preferences>('/api/barrow/order-notice-preferences').then(setData).catch(cause=>setError(errorMessage(cause)))},[])
 async function save(accountId:string,kind:string,enabled:boolean){setBusy(true);setError('');try{setData(await command<Preferences>('order-notice.preferences',{accountId,kind,enabled}))}catch(cause){setError(errorMessage(cause))}finally{setBusy(false)}}
 return <section className="br-card br-stack" aria-label="Order notice preferences"><h2>Order notice preferences</h2><p>Choose which recorded facts appear in your in-app notices. These choices apply only to your sign-in. Email delivery is not configured here.</p>
 {error&&<Notice error>{error}</Notice>}{data?.accounts.map(account=><fieldset className="br-stack" key={account.id}><legend>{account.name}</legend>{account.kinds.map(item=><label key={item.kind}><input type="checkbox" checked={item.enabled} disabled={busy} onChange={event=>void save(account.id,item.kind,event.target.checked)}/>{item.title}</label>)}</fieldset>)}</section>
}

function SourceDetails({value}:{value:unknown}) {
 const current=value as {status?:string;acceptedAt?:string;requested?:number;approved?:number;lines?:{itemId:string;quantity?:string;reserved?:string;backorder?:string}[]}
 return <div className="br-stack">{current.status&&<p>Current order status: {current.status}</p>}{current.acceptedAt&&<p>Accepted {when(current.acceptedAt)}</p>}{current.requested!==undefined&&<p>Requested {current.requested} · approved {current.approved??'Awaiting decision'}</p>}{current.lines?.map(line=><p key={line.itemId}>Item {line.itemId}{line.quantity!==undefined?` · ${line.quantity} base units dispatched`:` · reserved ${line.reserved??'unknown'} · backordered ${line.backorder??'unknown'}`}</p>)}</div>
}
