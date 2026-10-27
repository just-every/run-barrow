import { useEffect, useState } from 'react'
import { request, errorMessage } from './api'
import { money, type Order, type RunCommand } from './types'
import type { Season, prebookRows } from '../prebooks'
type Settings={seasons:Season[];revision:string}
export function PrebookSettings() {
 const [settings,setSettings]=useState<Settings|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{void request<Settings>('/api/barrow/prebook-seasons').then(setSettings).catch(e=>setError(errorMessage(e)))},[])
 async function act(type:string,payload:Record<string,unknown>) {
  setBusy(true);setError('')
  try {const value=await request<{result:Settings}>('/api/barrow/commands',{type,payload:{...payload,revision:settings?.revision}});setSettings(value.result)}
  catch(e){setError(errorMessage(e))}finally{setBusy(false)}
 }
 return <details className="br-details"><summary>Prebook season settings</summary><section className="br-card br-stack" aria-label="Prebook season settings"><h2>Seasonal prebooks</h2>
  <p>Opening and closing instants govern new commitments. Closing preserves accepted windows. Deposits record requirements; no money is marked paid or allocated.</p>
  {error&&<p role="alert">{error}</p>}
  <form className="br-stack" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void act('prebook.season-create',{name:f.get('name'),opensAt:f.get('opensAt'),closesAt:f.get('closesAt'),depositBps:Number(f.get('depositBps')),reason:f.get('reason')})}}>
   <label>Season name<input name="name" required maxLength={100}/></label>
   <label>Opens at (with timezone)<input name="opensAt" required placeholder="2027-01-01T00:00:00-05:00"/></label>
   <label>Closes at (with timezone)<input name="closesAt" required placeholder="2027-03-01T00:00:00-05:00"/></label>
   <label>Deposit basis points<input name="depositBps" type="number" required min={0} max={10000} defaultValue={2000}/></label>
   <label>Season decision reason<input name="reason" required maxLength={1000}/></label><button disabled={!settings||busy}>Publish prebook season</button>
  </form>
  {settings?.seasons.map(s=><article key={s.id}><h3>{s.name}</h3><p>{s.opensAt} to {s.closesAt} · deposit {s.depositBps/100}% · {s.closedAt?'Closed':'Published'}</p>{!s.closedAt&&<button disabled={busy} className="br-secondary" onClick={()=>{const reason=window.prompt('Reason for closing this season?');if(reason)void act('prebook.season-close',{id:s.id,reason})}}>Close {s.name}</button>}</article>)}
 </section></details>
}
export function PrebookChoice({value,onChange}:{value:string;onChange:(id:string)=>void}) {
 const [settings,setSettings]=useState<Settings|null>(null)
 useEffect(()=>{void request<Settings>('/api/barrow/prebook-seasons').then(setSettings).catch(()=>{})},[])
 return <label>Order timing<select aria-label="Order timing" value={value} onChange={e=>onChange(e.target.value)}><option value="">Available-now order</option>{settings?.seasons.filter(s=>!s.closedAt&&s.opensAt<=new Date().toISOString()&&s.closesAt>new Date().toISOString()).map(s=><option key={s.id} value={s.id}>{s.name} prebook · {s.depositBps/100}% deposit required</option>)}</select></label>
}
export function PrebookWindowFields({sku,onChange}:{sku:string;onChange:(dates:{requestedDate?:string;cancelAfter?:string})=>void}) {
 const [requestedDate,setDate]=useState(''),[cancelAfter,setCancel]=useState('')
 return <fieldset><legend>{sku} prebook window</legend><label>Ship date for {sku}<input type="date" required value={requestedDate} onChange={e=>{setDate(e.target.value);onChange({requestedDate:e.target.value,cancelAfter})}}/></label><label>Cancel after for {sku}<input type="date" required min={requestedDate} value={cancelAfter} onChange={e=>{setCancel(e.target.value);onChange({requestedDate,cancelAfter:e.target.value})}}/></label></fieldset>
}
export function PrebookPanel({order,canOperate,busy,run}:{order:Order;canOperate:boolean;busy:boolean;run:RunCommand}) {
 const [rows,setRows]=useState<ReturnType<typeof prebookRows>>([]),[error,setError]=useState('')
 useEffect(()=>{let current=true;void request<{rows:ReturnType<typeof prebookRows>}>(`/api/barrow/orders/${order.id}/prebook`).then(v=>{if(current)setRows(v.rows)}).catch(e=>{if(current)setError(errorMessage(e))});return()=>{current=false}},[order.revision])
 return <section className="br-stack" aria-label="Prebook commitment"><h3>{order.prebook!.seasonName} prebook</h3>
  <p>Deposit required: {money(order.prebook!.depositCents,order.currency)}. Requirement recorded; collection and allocation are separate. No invoice or card collection is created by a commitment.</p>
  <p>Incoming supply is separate from available-now stock and is never an immediate stock promise.</p>
  <ul>{order.prebook!.incoming.map((row,i)=><li key={i}>{row.sku}: incoming {row.quantity} · source promise {row.date??'date unknown'}</li>)}</ul>
  {error&&<p role="alert">{error}</p>}
  {order.prebook!.windows.map(w=><article className="br-card br-stack" key={w.id}><h4>Window {w.id} · {w.state}</h4><p>Agreed ship {w.requestedDate} · current promise {w.promiseDate} · cancel after {w.cancelAfter}</p>
   {rows.filter(r=>r.windowId===w.id).map((r,i)=><p key={i}>{r.sku}: committed {r.committed} · released {r.released} · outstanding {r.outstanding??'unknown'} {r.unit}{r.sourceOrderId?` · source ${r.sourceOrderId}`:''}</p>)}
   <p>Released means acknowledged by the stock desk; outstanding means unshipped and uncancelled. A release does not prove shipment or payment.</p>
   {w.history.map((h,i)=><p key={i}>Promise changed {h.from} → {h.to}: {h.reason} · {h.at}</p>)}
   {canOperate&&order.status==='approved'&&!w.pierOrderId&&<div className="br-actions"><button disabled={busy} onClick={()=>{const reason=window.prompt('Reason for releasing this window?');if(reason)void run('prebook.release',{orderId:order.id,windowId:w.id,revision:order.revision,reason})}}>{w.state==='releasing'?'Retry window release':'Release window '+w.id}</button>{w.state!=='releasing'&&<button className="br-secondary" disabled={busy} onClick={()=>{const promiseDate=window.prompt('New promise date inside the agreed cancel window (YYYY-MM-DD)?');if(!promiseDate)return;const reason=window.prompt('Reason this style is delayed?');if(reason)void run('prebook.delay',{orderId:order.id,windowId:w.id,revision:order.revision,promiseDate,reason})}}>Backorder window {w.id}</button>}</div>}
  </article>)}
 </section>
}
