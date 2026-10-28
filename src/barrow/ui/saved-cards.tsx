import { useEffect, useState } from 'react'
import { errorMessage, request } from './api'
import { CardConsent } from './card-consent'
import type { CardPayment } from './card-payment'
import { Notice } from './primitives'
import { when } from './types'

type SavedCard = {
  id: string
  revision: string
  sourcePaymentId: string
  locationId: string
  brand: string
  last4: string
  status: 'active' | 'revoked'
  consentedAt: string
  revokedAt?: string
}
type SavedCards = { methods: SavedCard[]; canConsent: boolean }
type Props = {
  orderId: string
  collection?: {collectionKey:string;amountCents:number}
  payment?: CardPayment
  canPrepare: boolean
  canRevoke: boolean
  disabled: boolean
  onBusyChange: (busy: boolean) => void
  onPrepared: (payment: CardPayment) => void
  onConsentInvalidated: () => void
}

export function SavedCardsPanel({ orderId, collection, payment, canPrepare, canRevoke, disabled, onBusyChange, onPrepared, onConsentInvalidated }: Props) {
  const [data, setData] = useState<SavedCards | null>(null)
  const [error, setError] = useState(''), [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [consentKey, setConsentKey] = useState(''), [reason, setReason] = useState('')
  const [withdrawal, setWithdrawal] = useState({ id: '', reason: '' })
  const path = `/api/barrow/saved-cards?${new URLSearchParams({ orderId })}`
  const reviewKey = payment ? JSON.stringify([payment.id, payment.updatedAt, payment.card]) : ''
  const blocked = disabled || busy
  const canSave = data?.canConsent && payment?.card && !payment.savedCardId && !['declined', 'cancelled'].includes(payment.state)
    && !data.methods.some(method => method.sourcePaymentId === payment.id)

  useEffect(() => {
    let current = true
    void request<SavedCards>(path).then(value => {
      if (!current) return
      setData(value); setConsentKey(''); onConsentInvalidated()
    }).catch(cause => { if (current) setError(errorMessage(cause)) })
    return () => { current = false }
  }, [path, onConsentInvalidated])

  useEffect(() => { setConsentKey(''); setReason('') }, [reviewKey])

  async function reload() {
    if (blocked) return
    setBusy(true); onBusyChange(true); setError(''); setConsentKey(''); onConsentInvalidated()
    try { setData(await request<SavedCards>(path)) }
    catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false); onBusyChange(false) }
  }

  async function command(type: 'saved-card.save' | 'saved-card.revoke' | 'saved-card.prepare', payload: Record<string, unknown>) {
    if (blocked) return
    setBusy(true); onBusyChange(true); setError(''); setMessage(''); setConsentKey(''); onConsentInvalidated()
    try {
      if (type === 'saved-card.prepare') {
        const { result } = await request<{ result: CardPayment }>('/api/barrow/commands', { type, payload })
        onPrepared(result)
      } else {
        const { result } = await request<{ result: SavedCard }>('/api/barrow/commands', { type, payload })
        setData(current => current && ({ ...current, methods: [...current.methods.filter(method => method.id !== result.id), result] }))
        setReason(''); setWithdrawal({ id: '', reason: '' })
        setMessage(type === 'saved-card.save' ? 'Card saved with your consent.' : 'Consent withdrawn. New charges are blocked; existing receipts remain available.')
      }
      try { setData(await request<SavedCards>(path)) }
      catch (cause) { setError(`The change was received, but saved cards could not be refreshed. ${errorMessage(cause)}`) }
    } catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false); onBusyChange(false) }
  }

  return <section className="br-stack" aria-label="Saved cards" aria-busy={busy}>
    <h5 style={{ fontSize: 15, margin: 0 }}>Saved cards</h5>
    {error && <Notice error>{error}</Notice>}
    {message && <Notice>{message}</Notice>}
    {!data && !error && <p role="status">Loading saved cards…</p>}
    {data && <>
      {data.methods.length === 0 && <p className="br-quiet-text">No saved cards for this company and delivery location.</p>}
      {data.methods.map(method => <div className="br-card br-stack" key={method.id}>
        <p><strong>{method.brand} ending {method.last4}</strong> · {method.status === 'active' ? 'Active consent' : 'Consent withdrawn'}</p>
        <p className="br-quiet-text">Saved {when(method.consentedAt)}{method.revokedAt ? ` · withdrawn ${when(method.revokedAt)}` : ''}</p>
        {method.status === 'active' && <>
          {data.canConsent && canPrepare && <div className="br-actions"><button type="button" disabled={blocked} onClick={() => void command('saved-card.prepare', { orderId, ...collection, methodId: method.id, revision: method.revision })}>Review payment with {method.brand} ending {method.last4}</button></div>}
          {(data.canConsent || canRevoke) && <>
            {withdrawal.id !== method.id
              ? <div className="br-actions"><button type="button" className="br-secondary" disabled={blocked} onClick={() => setWithdrawal({ id: method.id, reason: '' })}>Withdraw consent for {method.brand} ending {method.last4}</button></div>
              : <div className="br-stack">
                <label>Reason for withdrawing consent<input value={withdrawal.reason} maxLength={1000} disabled={blocked} onChange={event => setWithdrawal({ id: method.id, reason: event.target.value })} /></label>
                <div className="br-actions">
                  <button type="button" className="br-danger" disabled={blocked || !withdrawal.reason.trim()} onClick={() => void command('saved-card.revoke', { methodId: method.id, revision: method.revision, reason: withdrawal.reason.trim() })}>Withdraw consent</button>
                  <button type="button" className="br-secondary" disabled={blocked} onClick={() => setWithdrawal({ id: '', reason: '' })}>Keep consent</button>
                </div>
              </div>}
          </>}
        </>}
      </div>)}
      {canSave && payment && <div className="br-stack">
        <CardConsent checked={consentKey === reviewKey} disabled={blocked} onChange={checked => setConsentKey(checked ? reviewKey : '')}>Save {payment.card!.brand} ending {payment.card!.last4} for this company and delivery location only. Each later amount needs my authorization. Withdrawing consent blocks new charges and retains receipts.</CardConsent>
        <label>Reason for saving this card<input value={reason} maxLength={1000} disabled={blocked} onChange={event => setReason(event.target.value)} /></label>
        <div className="br-actions"><button type="button" disabled={blocked || consentKey !== reviewKey || !reason.trim()} onClick={() => void command('saved-card.save', { paymentId: payment.id, consent: true, reason: reason.trim() })}>Save card with consent</button></div>
      </div>}
    </>}
    <div className="br-actions"><button type="button" className="br-secondary" disabled={blocked} onClick={() => void reload()}>Reload saved cards</button></div>
  </section>
}
