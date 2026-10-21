import { useEffect, useState, type FormEvent } from 'react'
import { request, errorMessage } from './api'
import { OrderTerms, type TermsChoice } from './sales-terms'
import { QuoteShippingFields,AgreedQuoteDelivery } from './quote-shipping'
import type { Delivery } from '../shipping-rules'
import { Notice } from './primitives'
import { day, money, orderNumber, when, type RunCommand } from './types'
import { QuoteConversation, QuoteNotices, RevisionHistoryList, type QuoteNotice, type ThreadEntry } from './quote-thread'

interface QuoteLine { sku: string; name: string; unit?: string; quantity: number | string; unitCents: number; lineCents?: number; basisUnitCents?: number; basisLineCents?: number; discountBps?: number; negotiatedUnitCents?: number; pricing?: { reason: string } }
interface Revision { delivery?:Delivery; number: number; lines: QuoteLine[]; basisCents: number; totalCents: number; termsDays: number; shipping: string; validUntil: string; note: string; proposedAt: string; proposedByEmail?: string; changes?: string[]; discounted: boolean; approved?: boolean; approval?: { reason: string; at: string } }
export interface Quote { id: string; accountId: string; customerName: string; status: 'requested' | 'awaiting-approval' | 'proposed' | 'accepted'; requestedAt: string; note: string; request: QuoteLine[]; revisions: Revision[]; accepted?: { revision: number; at: string; orderId: string }; expired: boolean; revision: string; thread: ThreadEntry[]; notices: QuoteNotice[] }

const statusLabel = (quote: Quote) => quote.accepted ? `Accepted · order ${orderNumber(quote.accepted.orderId)}` : quote.expired ? 'Expired' : { requested: 'Requested', 'awaiting-approval': 'Discount awaiting approval', proposed: 'Ready to accept', accepted: 'Accepted' }[quote.status]
// Exact dollars-and-cents text to integer cents; blank keeps the current price basis.
const cents = (value: string) => /^\d{1,7}(\.\d{1,2})?$/.test(value.trim()) ? Number(value.trim().split('.')[0]) * 100 + Number((value.trim().split('.')[1] ?? '').padEnd(2, '0')) : NaN

// ORD-004: quotes on the Orders page. The supplier proposes revisions and approves discounts; the buyer accepts the
// latest approved revision before its valid-through date, which converts it into one order for supplier review.
export function Quotes({ supplier, busy, run, version, canPurchase=true }: { supplier: boolean; busy: boolean; run: RunCommand; version: unknown; canPurchase?:boolean }) {
  const [terms,setTerms]=useState<Record<string,TermsChoice>>({})
  const [deliveryAccepted,setDeliveryAccepted]=useState<Record<string,boolean>>({})
  const [quotes, setQuotes] = useState<Quote[] | null>(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState('')
  useEffect(() => {
    let current = true
    void request<{ quotes: Quote[] }>('/api/barrow/quotes').then(data => { if (current) { setQuotes(data.quotes); setError('') } }).catch(failure => { if (current) setError(errorMessage(failure)) })
    return () => { current = false }
  }, [version])
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('quote')
    if (id && quotes?.some(quote => quote.id === id)) document.getElementById(`quote-${id}`)?.scrollIntoView({ block: 'start' })
  }, [quotes])
  if (!quotes?.length && !error) return null
  return <section className="br-card br-stack" aria-label="Quotes">
    <h2>Quotes</h2>
    {error && <Notice error>{error}</Notice>}
    {quotes?.map(quote => {
      const latest = quote.revisions.at(-1), lines = latest?.lines ?? quote.request
      return <article id={`quote-${quote.id}`} style={{scrollMarginTop: '7rem'}} key={quote.id} className="br-stack">
        <div className="br-order-meta"><span className="br-order-id">{quote.id}</span><span className="br-status">{statusLabel(quote)}</span>{quote.notices.length > 0 && <span className="br-status">{quote.notices.length} new</span>}</div>
        <QuoteNotices quoteId={quote.id} notices={quote.notices} busy={busy} run={run} />
        <h3>{quote.customerName}</h3>
        <p className="br-quiet-text">Requested {when(quote.requestedAt)}{quote.note && ` · ${quote.note}`}{latest && ` · revision ${latest.number}, valid through ${day(latest.validUntil)} (Eastern time)`}</p>
        <table className="br-order-lines"><caption className="br-sr-only">Quote {quote.id} lines</caption>
          <thead><tr><th scope="col">SKU</th><th scope="col">Quantity</th><th scope="col">Current price</th><th scope="col">Quoted</th><th scope="col">Total</th></tr></thead>
          <tbody>{lines.map(line => <tr key={`${line.sku}-${line.unit ?? ''}`}><th scope="row">{line.name}<small>{line.sku}{line.unit && ` · ${line.unit}`}</small></th><td>{String(line.quantity)}</td><td>{money(line.basisLineCents ?? line.lineCents ?? 0)}</td><td>{line.negotiatedUnitCents !== undefined ? `${money(line.negotiatedUnitCents)} each` : line.discountBps !== undefined ? `${line.discountBps / 100}% off` : 'Current price'}</td><td>{money(line.lineCents ?? 0)}</td></tr>)}</tbody>
        </table>
        {latest && <p>{money(latest.totalCents)} quoted against {money(latest.basisCents)} at current prices · {latest.termsDays === 0 ? 'Due on receipt' : `Net ${latest.termsDays} days`}{latest.shipping && ` · Shipping: ${latest.shipping}`}</p>}
        {latest?.delivery && <AgreedQuoteDelivery delivery={latest.delivery} />}
        {latest?.delivery && quote.accepted && <p className="br-quiet-text">Delivery accepted with revision {quote.accepted.revision} {when(quote.accepted.at)}.</p>}
        {latest?.shipping && !latest.delivery && <p className="br-quiet-text">This is a shipping note; no shipping charge was recorded.</p>}
        {latest?.note && <p>{latest.note}</p>}
        {supplier && latest?.approval && <p className="br-quiet-text">Discount approved {when(latest.approval.at)}: {latest.approval.reason}</p>}
        <div className="br-actions">
          {supplier && !quote.accepted && <button type="button" className="br-secondary" disabled={busy} onClick={() => setEditing(editing === quote.id ? '' : quote.id)}>{latest ? 'Revise quote' : 'Propose quote'}</button>}
          {supplier && quote.status === 'awaiting-approval' && latest && <button type="button" disabled={busy} onClick={() => { const reason = window.prompt(`Why approve ${money(latest.basisCents - latest.totalCents)} below current prices?`); if (reason?.trim()) void run('quote.approve', { quoteId: quote.id, revision: quote.revision, number: latest.number, reason: reason.trim() }) }}>Approve discount</button>}
          {!supplier && quote.status==='proposed' && !quote.expired && latest?.delivery && <label><input type="checkbox" checked={Boolean(deliveryAccepted[quote.id+':'+latest.delivery.fingerprint])} onChange={event=>setDeliveryAccepted(current=>({...current,[quote.id+':'+latest.delivery!.fingerprint]:event.target.checked}))}/>I accept this delivery method, cost and window.</label>}
          {!supplier && canPurchase && quote.status === 'proposed' && !quote.expired && <OrderTerms accountId={quote.accountId} supplier={false} onChange={choice=>setTerms(current=>({...current,[quote.id]:choice}))} />}
          {!supplier && canPurchase && quote.status === 'proposed' && !quote.expired && latest && <button type="button" disabled={busy||Boolean(terms[quote.id]?.required&&!terms[quote.id]?.payload)} onClick={() => void run('quote.accept', { quoteId: quote.id, number: latest.number,termsAcceptance:terms[quote.id]?.payload,deliveryAcknowledged:latest.delivery?Boolean(deliveryAccepted[quote.id+':'+latest.delivery.fingerprint]):undefined })}>Accept revision {latest.number} and place order</button>}
          {!supplier && quote.status === 'awaiting-approval' && <p className="br-quiet-text">Your supplier is preparing this quote.</p>}
          {!supplier && quote.expired && <p className="br-quiet-text">This quote expired. Ask your supplier for a revised quote.</p>}
        </div>
        <RevisionHistoryList revisions={quote.revisions} />
        <QuoteConversation quoteId={quote.id} thread={quote.thread} supplier={supplier} busy={busy} run={run} />
        {editing === quote.id && <Proposal quote={quote} lines={lines} busy={busy} run={run} onDone={() => setEditing('')} />}
      </article>
    })}
  </section>
}

function Proposal({ quote, lines, busy, run, onDone }: { quote: Quote; lines: QuoteLine[]; busy: boolean; run: RunCommand; onDone: () => void }) {
  const latest = quote.revisions.at(-1)
  const [rows, setRows] = useState(lines.map(line => ({ sku: line.sku, unit: line.unit, quantity: String(line.quantity), price: line.negotiatedUnitCents !== undefined ? (line.negotiatedUnitCents / 100).toFixed(2) : '' })))
  const [validUntil, setValidUntil] = useState(latest?.validUntil ?? '')
  const [termsDays, setTermsDays] = useState(latest ? String(latest.termsDays) : '')
  const [deliveryFields,setDeliveryFields]=useState<Record<string,unknown>>({})
  const [shipping, setShipping] = useState(latest?.shipping ?? '')
  const invalid = rows.some(row => row.price.trim() && Number.isNaN(cents(row.price)))
  async function propose(event: FormEvent) {
    event.preventDefault()
    if (invalid) return
    const done = await run('quote.propose', { quoteId: quote.id, revision: quote.revision, validUntil, shipping, ...deliveryFields, ...(termsDays.trim() ? { termsDays: Number(termsDays) } : {}), lines: rows.map(row => ({ sku: row.sku, ...(row.unit ? { unit: row.unit } : {}), quantity: Number(row.quantity), ...(row.price.trim() ? { unitCents: cents(row.price) } : {}) })) })
    if (done) onDone()
  }
  return <form className="br-stack" aria-label={`Propose revision for ${quote.id}`} onSubmit={event => void propose(event)}>
    {rows.map((row, index) => <fieldset key={`${row.sku}-${row.unit ?? ''}`} className="br-actions"><legend>{row.sku}{row.unit && ` · ${row.unit}`}</legend>
      <label>Quantity<input inputMode="numeric" value={row.quantity} disabled={busy} onChange={event => setRows(current => current.map((value, at) => at === index ? { ...value, quantity: event.target.value } : value))} /></label>
      <label>Quoted unit price (USD, blank for current price)<input inputMode="decimal" value={row.price} disabled={busy} onChange={event => setRows(current => current.map((value, at) => at === index ? { ...value, price: event.target.value } : value))} /></label>
    </fieldset>)}
    <label>Valid through (Eastern time, inclusive)<input type="date" required value={validUntil} disabled={busy} onChange={event => setValidUntil(event.target.value)} /></label>
    <label>Payment terms (days, blank for the account’s terms)<input inputMode="numeric" value={termsDays} disabled={busy} onChange={event => setTermsDays(event.target.value)} /></label>
    <label>Shipping note<input maxLength={160} value={shipping} disabled={busy} onChange={event => setShipping(event.target.value)} placeholder="Freight prepaid over $5,000" /></label>
    <QuoteShippingFields quoteId={quote.id} onChange={setDeliveryFields} />
    {invalid && <p role="alert">Enter quoted prices as dollars and cents, for example 58.50.</p>}
    <p className="br-quiet-text">A price below today’s price needs a recorded discount approval before the buyer can accept.</p>
    <div className="br-actions"><button disabled={busy || invalid || !validUntil}>Send revision {(latest?.number ?? 0) + 1}</button><button type="button" className="br-secondary" disabled={busy} onClick={onDone}>Close</button></div>
  </form>
}
