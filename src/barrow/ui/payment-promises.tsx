import { useEffect, useState } from 'react'
import type { readPaymentPromises } from '../payment-promises'
import { request, errorMessage } from './api'
import { Notice } from './primitives'
import { money, when, type Account } from './types'

type View = Awaited<ReturnType<typeof readPaymentPromises>>
const amount = (cents: number, currency: string) => money(cents, currency as 'USD')
export function PaymentPromises({ accounts }: { accounts: Account[] }) {
 const [accountId, setAccount] = useState(''), [view, setView] = useState<View | null>(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [refresh, setRefresh] = useState(0)
 const [orderId, setOrder] = useState(''), [buyerId, setBuyer] = useState(''), [minorUnits, setMinor] = useState(''), [dueDate, setDue] = useState(''), [reason, setReason] = useState('')
 useEffect(() => {
  let current = true; setView(null); setError(''); setOrder(''); setBuyer(''); setMinor(''); setDue(''); setReason('')
  if (accountId) void request<View>(`/api/barrow/payment-promises?accountId=${encodeURIComponent(accountId)}`).then(value => { if (current) setView(value) }).catch(cause => { if (current) setError(errorMessage(cause)) })
  return () => { current = false }
 }, [accountId, refresh])
 const invoice = view?.invoices.find(row => row.orderId === orderId), existing = view?.promises.find(row => row.orderId === orderId)
 async function act(type: string, payload: Record<string, unknown>) {
  if (busy) return; setBusy(true); setError(''); setNotice('')
  try { await request('/api/barrow/commands', { type, payload: { accountId, ...payload } }); setNotice('Promise decision recorded.'); setRefresh(n => n + 1) }
  catch (cause) { setError(errorMessage(cause)) }
  finally { setBusy(false) }
 }
 function choose(id: string) {
  setOrder(id); const previous = view?.promises.find(row => row.orderId === id), source = view?.invoices.find(row => row.orderId === id)
  setBuyer(previous?.buyerId ?? source?.buyers[0]?.id ?? ''); setMinor(previous ? String(previous.amountCents) : ''); setDue(previous?.dueDate ?? ''); setReason('')
 }
 return <section className="br-card br-stack" aria-label="Buyer payment promises" style={{ minWidth: 0, overflowWrap: 'anywhere' }}><h2>Buyer payment promises</h2>
  <p>Record a buyer’s commitment against an issued invoice. Only matching verified allocations made after that commitment, or an explicit finance decision, close its owned task. Contact notes and unallocated receipts do not close it.</p>
  <label>Promise account<select aria-label="Promise account" value={accountId} onChange={e => { setAccount(e.target.value); setNotice('') }} disabled={busy}><option value="">Choose a trade account</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.value.name}</option>)}</select></label>
  {error && <Notice error>{error}</Notice>}{notice && <Notice>{notice}</Notice>}
  {view && <><div className="br-actions"><button className="br-secondary" disabled={busy} onClick={() => void act('promise.refresh', {})}>Reconcile buyer promises</button></div>
   {!view.promises.length && <p>No buyer promises have been recorded for this account.</p>}
   {view.promises.map(p => <PromiseCard key={`${p.id}:${p.revision}`} promise={p} busy={busy} act={act} />)}
   <details><summary>Record or revise a buyer promise</summary>
    <form className="br-stack" aria-label="Record buyer promise" onSubmit={e => { e.preventDefault(); if (invoice) void act(existing ? 'promise.revise' : 'promise.record', { orderId, sourceRevision: invoice.sourceRevision, revision: existing?.revision ?? null, currency: invoice.currency, amountCents: Number(minorUnits), buyerId, dueDate, reason }) }}>
     <label>Promise invoice<select aria-label="Promise invoice" required value={orderId} onChange={e => choose(e.target.value)} disabled={busy}><option value="">Choose an issued invoice</option>{view.invoices.map(row => <option key={row.orderId} value={row.orderId}>{row.invoiceNumber} · outstanding {amount(row.outstandingCents, row.currency)}</option>)}</select></label>
     {invoice && <><p>Current invoice: {invoice.invoiceNumber} · {invoice.currency} · supplier calendar {view.timeZone}. Revising records a new commitment for remaining principal and preserves every earlier decision.</p>
      <div className="br-form-grid"><label>Promising buyer<select aria-label="Promising buyer" required value={buyerId} onChange={e => setBuyer(e.target.value)} disabled={busy}><option value="">Choose a current buyer</option>{invoice.buyers.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
       <label>Promised amount ({invoice.currency} minor units)<input required inputMode="numeric" type="number" min="1" step="1" max={invoice.outstandingCents} value={minorUnits} onChange={e => setMinor(e.target.value)} disabled={busy} /></label>
       <label>Promise due date<input required type="date" value={dueDate} onChange={e => setDue(e.target.value)} disabled={busy} /></label></div>
      <label>Promise decision reason<textarea required maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} disabled={busy} /></label>
      <div className="br-actions"><button disabled={busy || existing?.restored || !invoice.buyers.length}>{existing ? 'Save revised promise' : 'Record buyer promise'}</button></div>
     </>}
    </form>
   </details>
  </>}
 </section>
}
function PromiseCard({ promise: p, busy, act }: { promise: View['promises'][number]; busy: boolean; act: (type: string, payload: Record<string, unknown>) => Promise<void> }) {
 const [decision, setDecision] = useState('resolve'), [reason, setReason] = useState(''), [until, setUntil] = useState('')
 const open = p.state === 'open' || p.state === 'missed'
 return <article className="br-card br-stack" aria-label={`Promise ${p.invoiceNumber}`}><h3>{p.invoiceNumber} · {p.state}</h3>
  <p>{amount(p.amountCents, p.currency)} due {p.dueDate} · {p.timeZone}</p>
  <p>Buyer identity: {p.buyerId} · last decision {when(p.updatedAt)}</p>
  {p.pause && <p>Approved collection pause through {p.pause.until}: {p.pause.reason}. This is not a provider dispute.</p>}
  {!p.sourceAvailable && <Notice error>The named invoice source is unavailable. This does not resolve the promise or its owned task.</Notice>}
  {p.restored && <Notice>Restored history is inactive. It cannot resume collection work.</Notice>}
  <div className="br-actions"><a href={`/api/barrow/invoices/${p.orderId}.csv`} download>Named invoice</a><a href={`/api/barrow/orders/${p.orderId}`}>Order source</a><a href={`/api/barrow/followups?view=all`}>Owned finance tasks</a></div>
  <details><summary>Promise decision history ({p.history.length})</summary><ol>{p.history.map((row, index) => <li key={index}><strong>{row.action}</strong> · {amount(row.amountCents, row.currency)} · due {row.dueDate} ({row.timeZone})<p>{row.reason} · by {row.by} · buyer {row.buyerId} · {when(row.at)}</p><p>Invoice source revision: {row.sourceRevision}</p>{row.allocationIds && <p>Verified allocations: {row.allocationIds.join(', ')}</p>}</li>)}</ol></details>
  {open && !p.restored && <details><summary>Review a finance decision</summary><form className="br-stack" aria-label={`Finance decision ${p.invoiceNumber}`} onSubmit={e => { e.preventDefault(); void act(`promise.${decision === 'resume' ? 'pause' : decision}`, { orderId: p.orderId, revision: p.revision, reason, ...(decision === 'pause' ? { pause: { until } } : decision === 'resume' ? { pause: null } : {}) }) }}>
   <label>Finance decision<select aria-label="Finance decision" value={decision} onChange={e => setDecision(e.target.value)} disabled={busy}><option value="resolve">Explicit finance resolution</option><option value="withdraw">Record buyer withdrawal</option><option value="pause">Approve collection pause</option>{p.pause && <option value="resume">End collection pause</option>}</select></label>
   {decision === 'pause' && <label>Pause through<input required type="date" value={until} onChange={e => setUntil(e.target.value)} disabled={busy} /></label>}
   <label>Finance decision reason<textarea required maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} disabled={busy} /></label>
   <div className="br-actions"><button disabled={busy}>Record finance decision</button></div>
  </form></details>}
 </article>
}
