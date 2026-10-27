import { useEffect,useState } from 'react'
import { request,errorMessage } from './api'
import { Notice } from './primitives'
import { money } from './types'
import type { promotionSettings,promotionPreview } from '../promotions'
type Settings=Awaited<ReturnType<typeof promotionSettings>>
type Preview=Awaited<ReturnType<typeof promotionPreview>>
export function PromotionSettings() {
 const [settings,setSettings]=useState<Settings|null>(null),[offers,setOffers]=useState('[]'),[accountId,setAccount]=useState(''),[lines,setLines]=useState('[{"sku":"OAT-1","quantity":2}]'),[cost,setCost]=useState(''),[preview,setPreview]=useState<Preview|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{void request<Settings>('/api/barrow/promotions').then(s=>{setSettings(s);setOffers(JSON.stringify(s.offers,null,2))}).catch(e=>setError(errorMessage(e)))},[])
 async function act(type:'save'|'preview') {setBusy(true);setError('');try {const {result}=await request<{result:any}>('/api/barrow/commands',{type:'promotion.'+type,payload:type==='save'?{revision:settings?.revision,offers:JSON.parse(offers)}:{accountId,lines:JSON.parse(lines),...(cost?{costCents:Number(cost)}:{})}});if(type==='save'){setSettings(result);setOffers(JSON.stringify(result.offers,null,2));setPreview(null)}else setPreview(result)}catch(e){setError(errorMessage(e))}finally{setBusy(false)}}
 return <details className="br-details"><summary>Promotion settings</summary><section className="br-card br-stack" aria-label="Promotion settings"><h2>Bundles and promotions</h2>
 {error&&<Notice error>{error}</Notice>}
 <p>{settings?.rule}</p>
 <label>Offers (JSON)<textarea aria-label="Offers (JSON)" rows={10} value={offers} onChange={e=>{setOffers(e.target.value);setPreview(null)}} spellCheck={false}/></label>
 <details><summary>Offer fields and example</summary><p>Each offer names eligible accounts and SKUs, inclusive Eastern dates, discount basis points, priority and explicit stacking. Mix offers require minimumUnits; fixed bundles require quantities for every SKU. Each qualified offer redeems once per order against all eligible units. Scenario cost is entered by the supplier and is not inventory cost.</p><pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify({id:'spring',name:'Spring mix',kind:'mix',accounts:['cedar'],skus:['OAT-1','OAT-2'],minimumUnits:4,from:'2026-01-01',to:'2026-12-31',bps:1000,priority:10,stackable:false},null,2)}</pre></details>
 <button type="button" disabled={busy||!settings} onClick={()=>void act('save')}>Publish offers</button>
 <h3>Discount and margin preview</h3><label>Account ID<input aria-label="Account ID" value={accountId} onChange={e=>{setAccount(e.target.value);setPreview(null)}}/></label><label>Preview lines (JSON)<textarea aria-label="Preview lines (JSON)" rows={4} value={lines} onChange={e=>{setLines(e.target.value);setPreview(null)}}/></label><label>Scenario cost (cents, optional)<input aria-label="Scenario cost (cents, optional)" type="number" min="0" value={cost} onChange={e=>{setCost(e.target.value);setPreview(null)}}/></label><button type="button" disabled={busy} onClick={()=>void act('preview')}>Preview promotion</button>
 {preview&&<div role="status"><p>Current account total {money(preview.currentTotalCents,preview.currency)} · offer basis {money(preview.basisCents,preview.currency)} · discount {money(preview.discountCents,preview.currency)} · total {money(preview.totalCents,preview.currency)}</p><p>{preview.marginCents===null?'Enter scenario cost to compare margin.':`Scenario margin before ${money(preview.beforeMarginCents!,preview.currency)} · after ${money(preview.marginCents,preview.currency)} (${preview.marginBps===null?'not applicable':(preview.marginBps/100).toFixed(2)+'%'})`}</p>{preview.lines.map(l=><p key={l.sku+':'+l.unit}>{l.sku} · {l.quantity} · {money(l.lineCents!,preview.currency)} · {l.promotion?.offers.map(o=>o.name).join(', ')??'No eligible offer'}</p>)}</div>}
 </section></details>
}
