import { useState } from 'react'
import type { Order, RunCommand } from './types'
import { OrderTerms, type TermsChoice } from './sales-terms'

// ORD-011 slice: the buyer changes quantities on a submitted order before the supplier accepts it. Each saved change
// becomes one new confirmation revision carrying exactly the changed lines.
export function OrderRevision({ order, busy, run }: { order: Order; busy: boolean; run: RunCommand }) {
 const [quantities, setQuantities] = useState<Record<number, string>>({}), [terms, setTerms] = useState<TermsChoice>({ required: false })
 const changes = order.lines.flatMap((line, index) => quantities[index] !== undefined && quantities[index] !== String(line.quantity) ? [{ line: index, quantity: Number(quantities[index]) }] : [])
 return <details className="br-details"><summary>Revise quantities before acceptance</summary><div className="br-stack">
  <p className="br-quiet-text">The supplier has not accepted this order, so no stock is reserved yet. Saving records one new confirmation revision with only the changed lines; earlier revisions stay downloadable.</p>
  {order.lines.map((line, index) => <label key={`${line.sku}|${line.unit ?? ''}`}>{line.sku}{line.size ? ` · ${line.style} ${line.color} ${line.size}` : ''} ({line.unit ?? 'units'})
   <input type="number" min={1} step={1} inputMode="numeric" value={quantities[index] ?? String(line.quantity)} disabled={busy} onChange={event => setQuantities(current => ({ ...current, [index]: event.target.value }))} /></label>)}
  <OrderTerms accountId={order.accountId} supplier={false} onChange={setTerms} />
  <div className="br-actions"><button type="button" disabled={busy || !changes.length || changes.some(change => !Number.isSafeInteger(change.quantity) || change.quantity < 1) || Boolean(terms.required && !terms.payload)} onClick={() => void run('order.revise', { orderId: order.id, revision: order.revision, changes, termsAcceptance: terms.payload }).then(done => { if (done) setQuantities({}) })}>Save revised quantities</button></div>
 </div></details>
}
