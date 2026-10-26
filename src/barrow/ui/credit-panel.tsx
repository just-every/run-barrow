import { useEffect, useState } from 'react'
import { errorMessage, request } from './api'
import { CardConsent } from './card-consent'
import type { CardPayment } from './card-payment'
import { Notice } from './primitives'
import { money, orderNumber, when, type Order } from './types'

type Credit = {
  kind?:'return'|'price-correction'|'cancellation';sourceId?:string;freightCents?:number;taxCents?:number;id: string; revision: string; orderId: string; currency: 'USD' | 'AUD' | 'CAD'
  amountCents: number; availableCents: number; returnId: string; createdAt: string; reason: string
  lines: { line: number; sku: string; quantity: number; amountCents: number; basis: unknown; original?: unknown }[]
}
type Refund = {
  id: string; creditId: string; paymentId: string; amountCents: number; currency: Credit['currency']
  status: 'requested' | 'pending' | 'succeeded' | 'failed' | 'cancelled'; updatedAt: string
}
type CreditReport = {
  canAct: boolean; creditLimitCents:number|null;refundLimitCents:number|null;credits: Credit[]; refunds: Refund[]; outstandingCents: number
  applications: { id: string; creditId: string; orderId: string; amountCents: number }[]
  allocations: { id: string; paymentId: string; orderId: string; amountCents: number }[]
}
type Report = { credits: CreditReport; payments: CardPayment[] }
type Command = (type: string, payload: Record<string, unknown>) => Promise<void>
const creditPath = (id: string) => `/api/barrow/credits/${encodeURIComponent(id)}`
const refundPath = (id: string) => `/api/barrow/refunds/${encodeURIComponent(id)}`
const cents = (value: string) => {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return 0
  const [whole, fraction = ''] = value.split('.')
  const amount = Number(whole + fraction.padEnd(2, '0'))
  return Number.isSafeInteger(amount) ? amount : 0
}
const receiptName = (payment: CardPayment) => `${payment.card ? `${payment.card.brand} ending ${payment.card.last4}` : 'Captured card receipt'} · ${money(payment.amountCents, payment.currency)} principal · ${payment.id}`

export function CreditPanel({ order }: { order: Order }) {
  const [opened, setOpened] = useState(false)
  return <details className="br-details" onToggle={event => { if (event.currentTarget.open) setOpened(true) }}>
    <summary>Credit notes and refunds</summary>
    {opened && <CreditReportPanel order={order} />}
  </details>
}

function CreditReportPanel({ order }: { order: Order }) {
  const [report, setReport] = useState<Report | null>(null)
  const [busy, setBusy] = useState(false), [stale, setStale] = useState(false)
  const [error, setError] = useState(''), [message, setMessage] = useState('')

  async function load() {
    const query = new URLSearchParams({ orderId: order.id })
    const [credits, payments] = await Promise.allSettled([
      request<CreditReport>(`/api/barrow/credits?${query}`),
      request<{ payments: CardPayment[] }>(`/api/barrow/payments?${query}`),
    ])
    if (credits.status === 'rejected') throw credits.reason
    if (payments.status === 'rejected') throw payments.reason
    return { credits: credits.value, payments: payments.value.payments }
  }

  useEffect(() => {
    let current = true
    setBusy(true); setError(''); setStale(true)
    void load().then(value => { if (current) { setReport(value); setStale(false) } })
      .catch(cause => { if (current) setError(errorMessage(cause)) })
      .finally(() => { if (current) setBusy(false) })
    return () => { current = false }
  }, [order.id, order.revision])

  async function reload() {
    if (busy) return
    setBusy(true); setError(''); setMessage(''); setStale(true)
    try { setReport(await load()); setStale(false) }
    catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }

  async function command(type: string, payload: Record<string, unknown>) {
    if (busy || stale || !report?.credits.canAct) return
    setBusy(true); setError(''); setMessage('')
    try {
      await request('/api/barrow/commands', { type, payload })
      setStale(true)
      try { setReport(await load()); setStale(false); setMessage('Credit report refreshed. Review the recorded amounts and status below.') }
      catch (cause) { setError(`The command response was received, but the credit report could not be refreshed. Reload before another action. ${errorMessage(cause)}`) }
    } catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }

  return <section className="br-stack" style={{overflowWrap:'anywhere',minWidth:0}} aria-label="Credit report" aria-busy={busy}>
    {error && <Notice error>{error}</Notice>}
    {message && <Notice>{message}</Notice>}
    {!report && !error && <p role="status">Loading credit notes and refunds…</p>}
    {report && <>
      <p><strong>Invoice outstanding: {money(report.credits.outstandingCents, order.currency ?? 'AUD')}</strong></p>
      <CreditHistory report={report.credits} order={order} busy={busy || stale} command={command} />
      {report.credits.canAct && <CreditActions order={order} report={report} disabled={busy || stale} command={command} />}
    </>}
    <div className="br-actions"><button type="button" className="br-secondary" disabled={busy} onClick={() => void reload()}>Reload credit report</button></div>
  </section>
}

function CreditHistory({ report, order, busy, command }: { report: CreditReport; order: Order; busy: boolean; command: Command }) {
  const currency = order.currency ?? 'AUD'
  return <div className="br-stack">
    {report.credits.length === 0 && <p className="br-quiet-text">No credit notes for this company.</p>}
    {report.credits.map(credit => <div className="br-card br-stack" key={credit.id}>
      <p><a href={creditPath(credit.id)}>Credit note {credit.id}</a> · {money(credit.amountCents, credit.currency)} · available {money(credit.availableCents, credit.currency)}</p>
      <p className="br-quiet-text">Order {orderNumber(credit.orderId)} · Source {credit.sourceId??credit.returnId} · {when(credit.createdAt)}</p>
      <p>{credit.reason}</p>{!!credit.freightCents&&<p>Original freight credit: {money(credit.freightCents,credit.currency)}</p>}
      <ul>{credit.lines.map(line => <li key={line.line}>Line {line.line}: {line.sku} · {line.quantity} selling units · {money(line.amountCents, credit.currency)}{typeof line.basis === 'string' ? ` · ${line.basis}` : ''}</li>)}</ul>
    </div>)}
    {report.allocations.filter(row => row.orderId === order.id).map(row => <p key={row.id}>Card principal applied: {money(row.amountCents, currency)} · receipt {row.paymentId}</p>)}
    {report.applications.filter(row => row.orderId === order.id).map(row => <p key={row.id}><a href={creditPath(row.creditId)}>Credit {row.creditId}</a> applied: {money(row.amountCents, currency)}</p>)}
    {report.refunds.map(refund => <div className="br-stack" key={refund.id}>
      <p><a href={refundPath(refund.id)}>Refund {refund.id}</a> · {money(refund.amountCents, refund.currency)} · <strong>{refund.status}</strong></p>
      <p className="br-quiet-text"><a href={creditPath(refund.creditId)}>Credit {refund.creditId}</a> · receipt {refund.paymentId} · updated {when(refund.updatedAt)}</p>
      {report.canAct && <div className="br-actions"><button type="button" className="br-secondary" disabled={busy} onClick={() => void command('refund.refresh', { refundId: refund.id })}>Refresh refund {refund.id}</button></div>}
    </div>)}
  </div>
}

function CreditActions({ order, report, disabled, command }: { order: Order; report: Report; disabled: boolean; command: Command }) {
  const [action, setAction] = useState('allocate')
  const [creditId, setCreditId] = useState(''), [paymentId, setPaymentId] = useState('')
  const [amount, setAmount] = useState(''), [reason, setReason] = useState(''), [returnId, setReturnId] = useState('')
  const [kind,setKind]=useState('return'),[sourceReference,setSourceReference]=useState(''),[freight,setFreight]=useState(''),[priceCredits,setPriceCredits]=useState<Record<number,string>>({})
  const [quantities, setQuantities] = useState<Record<number, string>>({})
  const [consentKey, setConsentKey] = useState('')
  const currency = order.currency ?? 'AUD', data = report.credits
  const receipts = report.payments.filter(payment => payment.orderId === order.id && payment.currency === currency && payment.state === 'captured'
    && (action !== 'allocate' || !data.allocations.some(row => row.paymentId === payment.id)))
  const credits = data.credits.filter(credit => credit.currency === currency && credit.availableCents > 0 && (action === 'refund'
    ? credit.orderId === order.id && !data.refunds.some(row => row.creditId === credit.id)
    : !data.applications.some(row => row.creditId === credit.id && row.orderId === order.id)))
  const payment = receipts.find(row => row.id === paymentId), credit = credits.find(row => row.id === creditId)
  const amountCents = cents(amount)
  const allowance=action==='refund'?data.refundLimitCents:data.creditLimitCents
  const maximum = Math.min(allowance??Number.MAX_SAFE_INTEGER,action === 'allocate' ? Math.min(payment?.amountCents ?? 0, data.outstandingCents)
    : action === 'apply' ? Math.min(credit?.availableCents ?? 0, data.outstandingCents)
    : Math.min(credit?.availableCents ?? 0, payment?.amountCents ?? 0))
  const refundKey = JSON.stringify([credit?.id, credit?.revision, payment?.id, payment?.updatedAt, amountCents])
  const lines = Object.entries(quantities).filter(([, quantity]) => quantity !== '' && Number(quantity) !== 0).map(([line, quantity]) => ({ line: Number(line), quantity: Number(quantity),...(kind==='price-correction'?{amountCents:cents(priceCredits[Number(line)]??'')}:{}) }))
  const invalidLines = !lines.length || lines.some(line => !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > order.lines[line.line - 1].quantity)
  const invalid = disabled || !reason.trim() || (action === 'issue' ? (kind==='return'?!returnId.trim():kind==='price-correction'?!sourceReference.trim():false) || invalidLines || kind==='price-correction'&&lines.some(line=>!line.amountCents)
    : amountCents <= 0 || amountCents > maximum || (action === 'allocate' ? !payment : action === 'apply' ? !credit : !credit || !payment || consentKey !== refundKey))

  useEffect(() => { setConsentKey('') }, [credit?.revision, payment?.updatedAt, disabled])

  async function submit() {
    if (invalid) return
    const explanation = reason.trim()
    setConsentKey('')
    if (action === 'allocate') await command('card.allocate', { paymentId: payment!.id, orderId: order.id, amountCents, reason: explanation })
    if (action === 'issue') await command('credit.issue', { orderId: order.id,kind,sourceReference:sourceReference.trim(), returnId: returnId.trim(),freightCents:cents(freight||'0'), lines, reason: explanation })
    if (action === 'apply') await command('credit.apply', { creditId: credit!.id, revision: credit!.revision, orderId: order.id, amountCents, reason: explanation })
    if (action === 'refund') await command('refund.request', { creditId: credit!.id, revision: credit!.revision, paymentId: payment!.id, amountCents, consent: true, reason: explanation })
  }

  return <details className="br-details"><summary>Manage credits and refunds</summary><div className="br-stack">
    <label>Action<select value={action} disabled={disabled} onChange={event => { setAction(event.target.value); setCreditId(''); setPaymentId(''); setAmount(''); setReason(''); setConsentKey('') }}>
      <option value="allocate">Apply captured card principal to invoice</option><option value="issue">Issue a linked credit note</option><option value="apply">Apply available company credit</option><option value="refund">Request a card refund</option>
    </select></label>
    {(action === 'allocate' || action === 'refund') && <label>Captured receipt<select value={paymentId} disabled={disabled} onChange={event => { setPaymentId(event.target.value); setConsentKey('') }}>
      <option value="">Choose a captured receipt</option>{receipts.map(row => <option key={row.id} value={row.id}>{receiptName(row)}</option>)}
    </select></label>}
    {(action === 'apply' || action === 'refund') && <label>Available credit note<select value={creditId} disabled={disabled} onChange={event => { setCreditId(event.target.value); setConsentKey('') }}>
      <option value="">Choose a credit note</option>{credits.map(row => <option key={row.id} value={row.id}>{row.id} · order {orderNumber(row.orderId)} · {money(row.availableCents, row.currency)} available</option>)}
    </select></label>}
    {action === 'issue' ? <>
      <label>Credit basis<select value={kind} disabled={disabled} onChange={event=>setKind(event.target.value)}><option value="return">Physical return</option><option value="price-correction">Price correction</option><option value="cancellation">Confirmed cancellation</option></select></label>
      {kind==='return'&&<label>Pier physical return ID<input value={returnId} disabled={disabled} onChange={event => setReturnId(event.target.value)} /></label>}
      {kind==='price-correction'&&<label>Price correction reference<input value={sourceReference} disabled={disabled} onChange={event=>setSourceReference(event.target.value)}/></label>}
      <p className="br-quiet-text">Enter returned selling units. Credit uses the original approved line prices and first reduces this invoice’s unpaid amount.</p>
      {order.lines.map((line, index) => <div className="br-stack" key={index}><label>Line {index + 1}: {line.sku} · {line.name} · credited {line.unit ?? 'selling units'}
        <input type="number" min={0} max={line.quantity} step={1} inputMode="numeric" value={quantities[index + 1] ?? ''} disabled={disabled} onChange={event => setQuantities(current => ({ ...current, [index + 1]: event.target.value }))} />
      </label>{kind==='price-correction'&&<label>Line {index+1} price credit ({currency})<input inputMode="decimal" value={priceCredits[index+1]??''} disabled={disabled} onChange={event=>setPriceCredits(current=>({...current,[index+1]:event.target.value}))}/></label>}</div>)}
      <label>Freight credit ({currency})<input inputMode="decimal" value={freight} disabled={disabled} onChange={event=>setFreight(event.target.value)}/></label><p className="br-quiet-text">Original delivery and handling: {money(order.delivery?.totalCents??0,currency)}. Tax is not recorded; no tax credit is assumed.</p>
    </> : <>
      <label>{currency} amount<input inputMode="decimal" value={amount} disabled={disabled} onChange={event => { setAmount(event.target.value); setConsentKey('') }} /></label>
      <p className="br-quiet-text">Maximum {money(maximum, currency)}{action === 'allocate' ? ' in captured principal; card surcharge is excluded.' : '.'}</p>
    </>}
    <label>Reason<input value={reason} maxLength={1000} disabled={disabled} onChange={event => setReason(event.target.value)} /></label>
    {action === 'refund' && payment && credit && amountCents > 0 && amountCents <= maximum && <CardConsent checked={consentKey === refundKey} disabled={disabled} onChange={checked => setConsentKey(checked ? refundKey : '')}>I approve refunding exactly {money(amountCents, currency)} from credit {credit.id} to {payment.card ? `${payment.card.brand} ending ${payment.card.last4}` : `the original captured card for receipt ${payment.id}`}.</CardConsent>}
    <div className="br-actions"><button type="button" disabled={invalid} onClick={() => void submit()}>{action === 'allocate' ? 'Apply card principal' : action === 'issue' ? kind==='price-correction'?'Issue price credit':kind==='cancellation'?'Issue cancellation credit':'Issue return credit' : action === 'apply' ? 'Apply credit to this invoice' : 'Request exact card refund'}</button></div>
  </div></details>
}
