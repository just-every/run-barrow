import { useState } from 'react'
import { request, errorMessage } from './api'
import { Dialog } from './dialog'
import { Notice } from './primitives'
import { money, orderNumber, terms, type Order, type RunCommand } from './types'
import type { ReorderReview } from '../reorders'

export function Reorder({ order, run, busy, onClose }: {order:Order;run:RunCommand;busy:boolean;onClose:()=>void}) {
 const [selected,setSelected] = useState(new Set(order.lines.map(line => line.sku)))
 const [replacements,setReplacements] = useState<Record<string,string>>({})
 const [review,setReview] = useState<ReorderReview|null>(null)
 const [acknowledged,setAcknowledged] = useState(false)
 const [reference,setReference] = useState('')
 const [loading,setLoading] = useState(false)
 const [error,setError] = useState('')
 const selections = order.lines.filter(line => selected.has(line.sku)).map(line => ({sku:line.sku,...(replacements[line.sku]?.trim() ? {replacementSku:replacements[line.sku].trim()} : {})}))
 const invalidate = () => {setReview(null);setAcknowledged(false);setError('')}
 async function compare() {
  setLoading(true);setError('');setAcknowledged(false)
  try { const value = await request<{result:ReorderReview}>('/api/barrow/commands',{type:'order.reorder-preview',payload:{orderId:order.id,selections}});setReview(value.result) }
  catch(error) {setError(errorMessage(error));setReview(null)}
  finally {setLoading(false)}
 }
 async function prepare() {
  if(!review || !acknowledged || review.blockers.length) return
  const success = await run('order.reorder',{orderId:order.id,selections,reference,fingerprint:review.fingerprint,acknowledged})
  if(success) onClose()
  else {setAcknowledged(false);setReview(null)}
 }
 return <Dialog title={`Reorder ${orderNumber(order.id)}`} busy={busy || loading} onClose={onClose}>
  <p>Select all or some original lines. Compare current prices, minimums and stock before preparing a new draft. The original order stays unchanged.</p>
  {order.deliveryLocation && <p>Delivery location label: {order.deliveryLocation}</p>}
  {error && <Notice error>{error}</Notice>}
  <div className="br-actions"><button type="button" className="br-secondary" disabled={busy || loading} onClick={() => {setSelected(new Set(order.lines.map(line => line.sku)));invalidate()}}>Select all lines</button><button type="button" className="br-secondary" disabled={busy || loading} onClick={() => {setSelected(new Set());invalidate()}}>Clear selected lines</button></div>
  <div className="br-stack">{order.lines.map(line => <div className="br-card br-stack" key={line.sku}>
   <button type="button" className="br-secondary" aria-pressed={selected.has(line.sku)} disabled={busy || loading} onClick={() => {setSelected(current => {const next=new Set(current);if(next.has(line.sku))next.delete(line.sku);else next.add(line.sku);return next});invalidate()}}>{selected.has(line.sku) ? 'Selected' : 'Select'} {line.sku} · {line.quantity} units · {money(line.unitCents,order.currency ?? 'AUD')} each</button>
   {selected.has(line.sku) && <label>Replacement SKU for {line.sku} (optional)<input value={replacements[line.sku] ?? ''} maxLength={100} disabled={busy || loading} onChange={event => {setReplacements(current => ({...current,[line.sku]:event.target.value}));invalidate()}} /></label>}
  </div>)}</div>
  <div className="br-actions"><button className="br-secondary" disabled={!selections.length || busy || loading} onClick={() => void compare()}>{loading ? 'Comparing…' : 'Compare current terms'}</button></div>
  {review && <section className="br-stack" aria-label="Reorder difference summary">
   <h3>Current comparison</h3>
   {review.lines.map(line => <div className="br-card" key={line.originalSku}>
    <p><strong>{line.originalSku}{line.sku !== line.originalSku ? ` → ${line.sku}` : ''}</strong> · {line.quantity} units</p>
    <p>Unit price: {money(line.originalUnitCents,review.originalCurrency)} → {line.unitCents === null ? 'Unavailable' : money(line.unitCents)}</p>
    <p>Minimum units: {line.originalMinQty} → {line.minQty ?? 'Unknown'} · Available now: {line.available ?? 'Unknown'}</p>
    <p>{line.differences.join('; ') || 'SKU, price and minimum unchanged.'}</p>
   </div>)}
   <p>Payment terms: {terms(review.originalTermsDays)} → {terms(review.termsDays)}. Current order minimum: {money(review.minimumCents)}.</p>
   <p>Selected original total: {money(review.lines.reduce((sum,line) => sum+line.quantity*line.originalUnitCents,0),review.originalCurrency)}. New draft total: <strong>{money(review.totalCents)}</strong>.</p>
   {review.blockers.length > 0 ? <Notice error>{review.blockers.map(message => <p key={message}>{message}</p>)}</Notice> : <>
    <label>New purchase order / reference<input value={reference} onChange={event => setReference(event.target.value)} maxLength={100} disabled={busy} /></label>
    <button type="button" className="br-secondary" aria-pressed={acknowledged} onClick={() => setAcknowledged(value => !value)} disabled={busy}>{acknowledged ? 'Acknowledged' : 'Acknowledge'} current SKU, currency, price, minimum, availability and terms differences</button>
    <button disabled={busy || !acknowledged} onClick={() => void prepare()}>Prepare reorder draft</button>
   </>}
  </section>}
  <div className="br-actions"><button className="br-secondary" onClick={onClose} disabled={busy || loading}>Cancel</button></div>
 </Dialog>
}
