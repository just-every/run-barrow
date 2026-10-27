import { CardConsent } from './card-consent'
import { useCallback, useEffect, useState } from 'react'
import { errorMessage, request } from './api'
import { Notice } from './primitives'
import { SavedCardsPanel } from './saved-cards'
import { money, when } from './types'

export type CardPayment = {
  id: string
  orderId: string
  accountId: string
  currency: 'USD' | 'AUD' | 'CAD' | 'EUR' | 'GBP'
  amountCents: number
  surchargeCents: number
  state: 'prepared' | 'requires_action' | 'authorized' | 'captured' | 'declined' | 'cancelled'
  checkoutUrl?: string
  actionUrl?: string
  savedCardId?: string
  card?: { brand: string; last4: string; funding: string; state: string }
  createdAt: string
  updatedAt: string
  exception?: { reason: string }
}
type PaymentList = { payments: CardPayment[]; configured: boolean }
const stateNames: Record<CardPayment['state'], string> = {
  prepared: 'Card authorization not yet requested',
  requires_action: 'Card authentication required',
  authorized: 'Card authorized; capture pending',
  captured: 'Payment captured',
  declined: 'Card payment declined',
  cancelled: 'Card payment cancelled',
}

export function CardPaymentPanel({ orderId, merchant, canAct=merchant }: { orderId: string; merchant: boolean; canAct?:boolean }) {
  return <PaymentPanel key={orderId} orderId={orderId} merchant={merchant} canAct={canAct} />
}

function PaymentPanel({ orderId, merchant, canAct=merchant }: { orderId: string; merchant: boolean; canAct?:boolean }) {
  const [data, setData] = useState<PaymentList | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [error, setError] = useState(''), [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false), [consentKey, setConsentKey] = useState(''), [reason, setReason] = useState('')
  const clearConsent = useCallback(() => setConsentKey(''), [])
  const path = `/api/barrow/payments?${new URLSearchParams({ orderId })}`

  useEffect(() => {
    let current = true
    void request<PaymentList>(path).then(value => {
      if (!current) return
      setData(value)
      const returnedId = new URLSearchParams(window.location.search).get('cardPayment')
      if (returnedId && value.payments.some(payment => payment.id === returnedId)) setSelectedId(returnedId)
    }).catch(cause => { if (current) setError(errorMessage(cause)) })
    return () => { current = false }
  }, [path])

  const payments = [...(data?.payments ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const payment = payments.find(row => row.id === selectedId) ?? payments[0]
  const reviewKey = payment ? JSON.stringify([payment.id, payment.updatedAt, payment.amountCents, payment.surchargeCents, payment.card, payment.savedCardId]) : ''
  const canPrepare = payments.length === 0

  function preparedSavedCard(result: CardPayment) {
    setSelectedId(result.id)
    setData(current => ({ configured: current?.configured ?? true, payments: [result, ...(current?.payments.filter(row => row.id !== result.id) ?? [])] }))
    setConsentKey(''); setReason(''); setError('')
    setMessage('Review the saved card, amount and surcharge before authorizing this payment.')
  }

  async function reload() {
    setBusy(true); setError(''); setConsentKey('')
    try { setData(await request<PaymentList>(path)) }
    catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }

  async function command(type: string, payload: Record<string, unknown>) {
    if (busy) return
    setBusy(true); setError(''); setMessage(''); setConsentKey('')
    try {
      const { result } = await request<{ result: CardPayment }>('/api/barrow/commands', { type, payload })
      setSelectedId(result.id)
      setData(current => ({ configured: current?.configured ?? true, payments: [result, ...(current?.payments.filter(row => row.id !== result.id) ?? [])] }))
      setReason('')
      setMessage(type === 'card.prepare' ? 'Open Stripe to securely add your card, then return here and refresh.' : `Payment updated: ${stateNames[result.state]}.`)
      try { setData(await request<PaymentList>(path)) }
      catch (cause) { setError(`The payment response was received, but the latest list could not be loaded. ${errorMessage(cause)} Refresh the payment before taking another action.`) }
    } catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }

  return <section className="br-card br-stack" aria-label="Card payment" aria-busy={busy}>
    <h4>Card payment</h4>
    {error && <Notice error>{error}</Notice>}
    {message && <Notice>{message}</Notice>}
    {!data && !error && <p role="status">Loading card payment…</p>}
    {data && <>
      {!data.configured && <p className="br-quiet-text">Stripe card payments are not connected. The owner can review the connection in Settings.</p>}
      {!payment && <p>No card payment has been prepared for this order.</p>}
      {payments.length > 1 && <label>Payment to review<select value={payment?.id ?? ''} disabled={busy} onChange={event => { setSelectedId(event.target.value); setConsentKey(''); setReason(''); setMessage('') }}>
        {payments.map(row => <option key={row.id} value={row.id}>{when(row.createdAt)} · {stateNames[row.state]} · {row.id}</option>)}
      </select></label>}
      {payment && <>
        <p role="status"><strong>{stateNames[payment.state]}</strong></p>
        <p className="br-quiet-text">Payment <code>{payment.id}</code> · updated {when(payment.updatedAt)}</p>
        {payment.exception?.reason && <Notice error>{payment.exception.reason}</Notice>}
        {payment.card && <p>{payment.card.brand} ending {payment.card.last4} · {payment.card.funding} · billing state {payment.card.state}</p>}
        <dl>
          <dt>Order amount</dt><dd>{money(payment.amountCents, payment.currency)}</dd>
          <dt>Card surcharge</dt><dd>{money(payment.surchargeCents, payment.currency)}</dd>
          <dt>Total card payment</dt><dd><strong>{money(payment.amountCents + payment.surchargeCents, payment.currency)}</strong></dd>
        </dl>
        {payment.state === 'prepared' && !merchant && <>
          {!payment.card && <p>Stripe collects and stores your card details. Barrow receives the card’s brand, last four digits, funding type and state. Return here after adding your card to review the final surcharge before authorization.</p>}
          {!payment.card && payment.checkoutUrl && <div className="br-actions"><a className="br-button" href={payment.checkoutUrl}>Add card securely with Stripe</a></div>}
          {payment.card && <>
            <p>Review the amount and surcharge above. Authorization reserves this total on your card; the merchant captures the payment separately.</p>
            <CardConsent checked={consentKey === reviewKey} disabled={busy} onChange={checked => setConsentKey(checked ? reviewKey : '')}>I authorize {money(payment.amountCents + payment.surchargeCents, payment.currency)}, including the {money(payment.surchargeCents, payment.currency)} card surcharge, on this card.</CardConsent>
            <div className="br-actions"><button type="button" disabled={busy || consentKey !== reviewKey} onClick={() => void command('card.authorize', { paymentId: payment.id, consent: true, amountCents: payment.amountCents, surchargeCents: payment.surchargeCents })}>Authorize card payment</button></div>
          </>}
        </>}
        {payment.state === 'requires_action' && <>
          <p>The bank needs authentication before this payment can be authorized. Return here afterward and refresh the result.</p>
          {!merchant && payment.actionUrl && <div className="br-actions"><a className="br-button" href={payment.actionUrl}>Authenticate card with Stripe</a></div>}
        </>}
        {payment.state === 'authorized' && <p>The card is authorized. The merchant has not yet captured this payment.</p>}
        {payment.state === 'captured' && <p>The payment has been captured. Refreshing checks the same payment.</p>}
        {payment.state === 'declined' && <p>This card payment was declined. Ask your supplier to review the payment exception.</p>}
        {payment.state === 'cancelled' && <p>This card payment is cancelled.</p>}
        <div className="br-actions"><button type="button" className="br-secondary" disabled={busy} onClick={() => void command('card.refresh', { paymentId: payment.id })}>Refresh card and payment</button></div>
        {merchant && canAct && ['requires_action', 'authorized', 'declined'].includes(payment.state) && <div className="br-stack">
          <label>Reason for capture or cancellation<input value={reason} maxLength={1000} disabled={busy} onChange={event => setReason(event.target.value)} /></label>
          <div className="br-actions">
            {payment.state === 'authorized' && <button type="button" disabled={busy || !reason.trim()} onClick={() => void command('card.capture', { paymentId: payment.id, reason: reason.trim() })}>Capture authorized payment</button>}
            <button type="button" className="br-danger" disabled={busy || !reason.trim()} onClick={() => void command('card.cancel', { paymentId: payment.id, reason: reason.trim() })}>Cancel card payment</button>
          </div>
        </div>}
      </>}
      {!merchant && data.configured && canPrepare && <div className="br-actions"><button type="button" disabled={busy} onClick={() => void command('card.prepare', { orderId })}>Prepare card payment</button></div>}
      <SavedCardsPanel orderId={orderId} payment={payment} canPrepare={data.configured && canPrepare} canRevoke={merchant && canAct} disabled={busy} onBusyChange={setBusy} onPrepared={preparedSavedCard} onConsentInvalidated={clearConsent} />
    </>}
    <div className="br-actions"><button type="button" className="br-secondary" disabled={busy} onClick={() => void reload()}>Reload payment records</button></div>
  </section>
}
