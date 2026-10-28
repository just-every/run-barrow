import { useState } from 'react'
import { request, errorMessage } from './api'
import { Notice } from './primitives'
import type { Order } from './types'
import type { trackingView } from '../shipment-tracking'
type View=Awaited<ReturnType<typeof trackingView>>
export function ShipmentTracking({order}:{order:Order}) {
 const [view,setView]=useState<View|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const [shipmentId,setShipment]=useState(''),[trackerId,setTracker]=useState(''),[carrier,setCarrier]=useState(''),[code,setCode]=useState(''),[quantities,setQuantities]=useState<Record<string,string>>({}),[reasons,setReasons]=useState<Record<string,string>>({})
 const load=async()=>setView(await request<View>(`/api/barrow/orders/${order.id}/tracking`))
 async function act(type:string,payload:Record<string,unknown>){setBusy(true);setError('');try{const result=await request<{result:View}>('/api/barrow/commands',{type,payload:{orderId:order.id,...payload}});setView(result.result)}catch(e){setError(errorMessage(e))}finally{setBusy(false)}}
 return <details className="br-details" onToggle={e=>{if(e.target===e.currentTarget&&e.currentTarget.open)void load().catch(e=>setError(errorMessage(e)))}}><summary>Package tracking</summary>
 <section className="br-stack" aria-label={`Package tracking ${order.id}`}>
 {error&&<Notice error>{error}</Notice>}{view&&<><h3>Packages and delivery</h3><p>{view.note}</p>{!view.sourceAvailable&&<Notice>Inventory source unavailable; retained observations are historical.</Notice>}
 {!view.packages.length&&<p>No packages tracked. Delivery unknown.</p>}
 {view.packages.map(p=><article key={p.id} className="br-card br-stack" aria-label={`Package ${p.code}`}><h4>{p.carrier} · {p.code}</h4>{p.restored&&<p>Restored history; no new carrier effect is permitted.</p>}<p>Status: {p.status} · delivered {p.deliveredAt??'unknown'} · estimated {p.estimatedDate??'unknown'}</p><p>Pier shipment {p.shipmentId} · {p.lines.map(l=>`${l.quantity} ${l.sku}`).join(', ')} · {p.warehouses.join(', ')}</p>{p.link&&<a href={p.link} target="_blank" rel="noreferrer">Open carrier tracking</a>}<p>Last authenticated read: {p.checkedAt??'Not recorded'}</p>
 <ul>{p.events.map(e=><li key={e.id}>{e.at} · {e.status} · {e.message} · EasyPost</li>)}</ul>
 {view.canManage&&<button disabled={busy||p.restored} className="br-secondary" onClick={()=>void act('tracking.refresh',{packageId:p.id,revision:p.revision})}>Refresh carrier status</button>}
 <label>Missing-package report<textarea value={reasons[p.id]??''} maxLength={1000} onChange={e=>setReasons(r=>({...r,[p.id]:e.target.value}))}/></label><button disabled={busy||!reasons[p.id]?.trim()||p.restored} className="br-secondary" onClick={()=>void act('tracking.dispute',{packageId:p.id,revision:p.revision,reason:reasons[p.id]})}>Report missing package</button>
 </article>)}
 {view.tasks.map(t=><div key={t.id} className="br-card"><strong>{t.title}</strong><p>{t.status} · supplier follow-up assigned · {t.reason}</p>{t.resolution&&<p>Resolution: {t.resolution}</p>}</div>)}
 {view.canManage&&<details><summary>Link a dispatched package</summary><div className="br-stack"><label>Pier shipment<select aria-label="Pier shipment" value={shipmentId} onChange={e=>setShipment(e.target.value)}><option value="">Choose dispatched shipment</option>{view.shipments.map(s=><option key={s.id} value={s.id}>{s.reference||s.id}</option>)}</select></label><label>EasyPost tracker identity<input value={trackerId} onChange={e=>setTracker(e.target.value)}/></label><label>Carrier<input value={carrier} onChange={e=>setCarrier(e.target.value)}/></label><label>Tracking code<input value={code} onChange={e=>setCode(e.target.value)}/></label>{[...new Map(order.lines.map(l=>[l.itemId,l])).values()].map(l=><label key={l.itemId}>{l.sku} package base quantity<input inputMode="decimal" value={quantities[l.itemId]??''} onChange={e=>setQuantities(q=>({...q,[l.itemId]:e.target.value}))}/></label>)}<button disabled={busy||!shipmentId||!trackerId||!carrier||!code} onClick={()=>void act('tracking.bind',{shipmentId,trackerId,carrier,code,lines:Object.entries(quantities).filter(([,q])=>q&&q!=='0').map(([itemId,quantity])=>({itemId,quantity}))})}>Link package</button></div></details>}
 </>}
 </section></details>
}
