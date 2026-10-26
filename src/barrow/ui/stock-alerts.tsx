import { useEffect, useState } from 'react'
import { request, errorMessage } from './api'
import { Notice } from './primitives'
type Data={watches:{id:string;sku:string;active:number}[];notices:{id:string;sku:string;created_at:string}[]}
export function StockAlerts({accountId,skus}:{accountId:string;skus:string[]}) {
 const [data,setData]=useState<Data|null>(null),[sku,setSku]=useState(skus[0]??''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 async function load(){setData(await request<Data>('/api/barrow/stock-watches?'+new URLSearchParams({accountId})))}
 useEffect(()=>{void load().catch(cause=>setError(errorMessage(cause)))},[accountId])
 async function change(type:string,selected:string){setBusy(true);setError('');try{await request('/api/barrow/commands',{type,payload:{accountId,sku:selected}});await load()}catch(cause){setError(errorMessage(cause))}finally{setBusy(false)}}
 return <section className="br-card br-stack" aria-label="Stock notices"><h2>Stock notices</h2>{error&&<Notice error>{error}</Notice>}<p>Request a private notice here when a product is available again. Review live stock before ordering.</p><label>Product for stock notice<select value={sku} onChange={event=>setSku(event.target.value)}>{skus.map(value=><option key={value}>{value}</option>)}</select></label><div><button disabled={!sku||busy} onClick={()=>void change('stock.watch',sku)}>Notify me here</button></div>{data?.watches.filter(row=>row.active).map(row=><div className="br-actions" key={row.id}><span>{row.sku} · Waiting for stock</span><button className="br-secondary" disabled={busy} onClick={()=>void change('stock.unwatch',row.sku)}>Cancel notice</button></div>)}{data?.notices.map(row=><p key={row.id} role="status">{row.sku} is back in stock. Open your order pad to check current availability.</p>)}</section>
}
