import { useState } from 'react'
import { request, errorMessage } from './api'
import { Dialog } from './dialog'
import { Notice } from './primitives'
import { money, orderNumber, terms, type Order, type RunCommand } from './types'
import type { ReorderReview } from '../reorders'

const lineKey = (line:{sku:string;unit?:string}) => JSON.stringify([line.sku,line.unit??''])

export function Reorder({ order, run, busy, onClose }: {order:Order;run:RunCommand;busy:boolean;onClose:()=>void}) {
 const [selected,setSelected] = useState(new Set(order.lines.map(lineKey)))
 const [replacements,setReplacements] = useState<Record<string,string>>({})
 const [replacementUnits,setReplacementUnits] = useState<Record<string,string>>({})
 const [review,setReview] = useState<ReorderReview|null>(null)
 const [acknowledged,setAcknowledged] = useState(false)
 const [reference,setReference] = useState('')
 const [loading,setLoading] = useState(false)
 const [error,setError] = useState('')
 const selections = order.lines.filter(line => selected.has(lineKey(line))).map(line => ({sku:line.sku,...(line.unit ? {unit:line.unit} : {}),...(replacements[lineKey(line)]?.trim() ? {replacementSku:replacements[lineKey(line)].trim()} : {}),...(replacementUnits[lineKey(line)]?.trim() ? {replacementUnit:replacementUnits[lineKey(line)].trim()} : {})}))
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
  <div className="br-actions"><button type="button" className="br-secondary" disabled={busy || loading} onClick={() => {setSelected(new Set(order.lines.map(lineKey)));invalidate()}}>Select all lines</button><button type="button" className="br-secondary" disabled={busy || loading} onClick={() => {setSelected(new Set());invalidate()}}>Clear selected lines</button></div>
  <div className="br-stack">{order.lines.map(line => <div className="br-card br-stack" key={lineKey(line)}>
   <button type="button" className="br-secondary" aria-pressed={selected.has(lineKey(line))} disabled={busy || loading} onClick={() => {setSelected(current => {const next=new Set(current);if(next.has(lineKey(line)))next.delete(lineKey(line));else next.add(lineKey(line));return next});invalidate()}}>{selected.has(lineKey(line)) ? 'Selected' : 'Select'} {line.sku}{line.unit ? ` (${line.unit})` : ''} · {line.quantity} units · {money(line.unitCents,order.currency ?? 'AUD')} per {line.unit??'unit'}</button>
   {selected.has(lineKey(line)) && <label>Replacement SKU for {line.sku} (optional)<input value={replacements[lineKey(line)] ?? ''} maxLength={100} disabled={busy || loading} onChange={event => {setReplacements(current => ({...current,[lineKey(line)]:event.target.value}));invalidate()}} /></label>}
   {selected.has(lineKey(line)) && line.unit && <label>Replacement unit for {line.sku} ({line.unit}) (optional)<input value={replacementUnits[lineKey(line)]??''} maxLength={32} disabled={busy || loading} onChange={event=>{setReplacementUnits(current=>({...current,[lineKey(line)]:event.target.value}));invalidate()}} /></label>}
  </div>)}</div>
  <div className="br-actions"><button className="br-secondary" disabled={!selections.length || busy || loading} onClick={() => void compare()}>{loading ? 'Comparing…' : 'Compare current terms'}</button></div>
  {review && <section className="br-stack" aria-label="Reorder difference summary">
   <h3>Current comparison</h3>
   {review.lines.map(line => <div className="br-card" key={JSON.stringify([line.originalSku,line.originalUnit])}>
    <p><strong>{line.originalSku}{line.sku !== line.originalSku ? ` → ${line.sku}` : ''}</strong> · {line.quantity} {line.unit??'units'}{line.baseQuantity ? ` · ${line.baseQuantity} base units` : ''}</p>
    <p>Selling basis: {line.originalUnit??'not recorded'} → {line.unit??'unavailable'}.</p>
    <p>Conversion: {line.originalConversion} → {line.conversion??'Unknown'} base units per selling unit. Base quantity: {line.originalBaseQuantity} → {line.baseQuantity??'Unknown'} {line.baseUnit??'base units'}.</p>
    <p>Unit price: {money(line.originalUnitCents,review.originalCurrency)} → {line.unitCents === null ? 'Unavailable' : money(line.unitCents,review.currency)}</p>
    <p>Minimum base units: {line.originalMinQty} → {line.minQty ?? 'Unknown'} · Available now: {line.available ?? 'Unknown'}</p>
    {line.pricing && <p>{line.pricing.reason} · {money(line.pricing.lineCents,review.currency)}</p>}
    <p>{line.differences.join('; ') || 'SKU, price and minimum unchanged.'}</p>
   </div>)}
   <p>Payment terms: {terms(review.originalTermsDays)} → {terms(review.termsDays)}. Current order minimum: {money(review.minimumCents,review.currency)}.</p>
   <p>Selected original total: {money(review.lines.reduce((sum,line) => sum+line.originalLineCents,0),review.originalCurrency)}. New draft total: <strong>{money(review.totalCents,review.currency)}</strong>.</p>
   {review.blockers.length > 0 ? <Notice error>{review.blockers.map(message => <p key={message}>{message}</p>)}</Notice> : <>
    <label>New purchase order / reference<input value={reference} onChange={event => setReference(event.target.value)} maxLength={100} disabled={busy} /></label>
    <button type="button" className="br-secondary" aria-pressed={acknowledged} onClick={() => setAcknowledged(value => !value)} disabled={busy}>{acknowledged ? 'Acknowledged' : 'Acknowledge'} current SKU, currency, price, minimum, availability and terms differences</button>
    <button disabled={busy || !acknowledged} onClick={() => void prepare()}>Prepare reorder draft</button>
   </>}
  </section>}
  <div className="br-actions"><button className="br-secondary" onClick={onClose} disabled={busy || loading}>Cancel</button></div>
 </Dialog>
}
