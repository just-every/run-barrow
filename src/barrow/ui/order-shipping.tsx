import { useEffect, useId, useState, type FormEvent } from 'react'
import type { Delivery, DeliveryOption } from '../shipping-rules'
import { request, errorMessage } from './api'
import { Notice } from './primitives'
import { day, money, when, type Order, type RunCommand } from './types'

type Options = { required: boolean; options: DeliveryOption[]; selected?: Delivery }
const optionKey = (option: { methodId: string; warehouse: string }) => JSON.stringify([option.methodId, option.warehouse])
const kindNames = { pickup: 'Pickup', parcel: 'Parcel', freight: 'Freight', 'own-carrier': 'Buyer’s own carrier' }

export function OrderShipping({ order, supplier, canSelect=true, busy, run }: { order: Order & { delivery?: Delivery }; supplier: boolean; canSelect?:boolean; busy: boolean; run: RunCommand }) {
  const [result, setResult] = useState<Options | null>(null)
  const [choice, setChoice] = useState(''), [quoteChoice, setQuoteChoice] = useState('')
  const [error, setError] = useState(''), [reload, setReload] = useState(0)
  const [quote, setQuote] = useState({ cents: '', windowStart: '', windowEnd: '', reason: '' })
  const radioName = useId()
  const [ownCarrierAccount,setOwnCarrierAccount]=useState('')
  useEffect(() => {
    if (order.status !== 'draft'||!canSelect) return
    let current = true
    setResult(null); setError('')
    void request<Options>(`/api/barrow/shipping/options?${new URLSearchParams({ orderId: order.id })}`).then(value => {
      if (!current) return
      setResult(value)
      setChoice(value.selected ? optionKey(value.selected) : '')
      const quoted = value.options.filter(option => option.approvalRequired || option.shippingCents === null)
      const target = quoted.find(option => value.selected && optionKey(option) === optionKey(value.selected)) ?? quoted[0]
      setQuoteChoice(target ? optionKey(target) : '')
      setQuote({ cents: '', windowStart: target?.windowStart ?? '', windowEnd: target?.windowEnd ?? '', reason: '' })
    }).catch(error => { if (current) setError(errorMessage(error)) })
    return () => { current = false }
  }, [order, reload,canSelect])
  const selected = result?.selected ?? order.delivery
  const chosen = result?.options.find(option => optionKey(option) === choice)
  const quotable = result?.options.filter(option => option.approvalRequired || option.shippingCents === null) ?? []
  const quoteTarget = quotable.find(option => optionKey(option) === quoteChoice)

  async function select() {
    if (!chosen) return
    if (await run('shipping.select', { orderId: order.id, methodId: chosen.methodId, warehouse: chosen.warehouse, fingerprint: chosen.fingerprint, ownCarrierAccount })) setReload(value => value + 1)
  }
  async function submitQuote(event: FormEvent) {
    event.preventDefault()
    if (!quoteTarget) return
    if (await run('shipping.quote', { orderId: order.id, methodId: quoteTarget.methodId, warehouse: quoteTarget.warehouse,
      cents: Number(quote.cents), windowStart: quote.windowStart, windowEnd: quote.windowEnd, reason: quote.reason.trim() })) setReload(value => value + 1)
  }
  if (order.status !== 'draft' && !order.delivery) return null
  if (order.status !== 'draft'||!canSelect) return <section className="br-stack" aria-label="Agreed delivery"><h4>Agreed delivery</h4>
    {order.delivery ? <>
      <p><strong>{order.delivery.name}</strong> · {kindNames[order.delivery.kind]}{order.delivery.warehouse && ` · ${order.delivery.warehouse}`}</p>
      <p>{order.delivery.shippingCents === null ? 'Delivery charge not recorded' : `${money(order.delivery.shippingCents)} delivery`} + {money(order.delivery.handlingCents)} handling · total {order.delivery.totalCents === null ? 'not recorded' : money(order.delivery.totalCents)}</p>
      <p>Delivery window: {day(order.delivery.windowStart)}–{day(order.delivery.windowEnd)}</p>
      {order.delivery.acceptedAt && <p className="br-quiet-text">Buyer accepted {when(order.delivery.acceptedAt)}.</p>}
    </> : <p className="br-quiet-text">Delivery was not recorded on this order.</p>}
  </section>

  return <section className="br-stack" aria-label="Order delivery"><h4>Delivery</h4>
    {error && <Notice error>{error}</Notice>}
    {!result && !error && <p role="status">Loading delivery options…</p>}
    {error && <div className="br-actions"><button type="button" className="br-secondary" disabled={busy} onClick={() => setReload(value => value + 1)}>Refresh delivery options</button></div>}
    {result && <>
      {!result.required && !result.options.length && <p className="br-quiet-text">No delivery selection is required for this draft.</p>}
      {result.required && !result.options.length && <Notice error>No delivery option is available. Ask the supplier to review the ship-to address, warehouse and delivery rules.</Notice>}
      {!!result.options.length && <fieldset disabled={busy} className="br-stack"><legend>Merchant-configured delivery options</legend>
        {result.options.map(option => <label key={optionKey(option)}>
          <input type="radio" name={radioName} checked={choice === optionKey(option)} onChange={() => {
            setChoice(optionKey(option))
            if (option.approvalRequired || option.shippingCents === null) {
              setQuoteChoice(optionKey(option)); setQuote({ cents: '', windowStart: option.windowStart, windowEnd: option.windowEnd, reason: '' })
            }
          }} /> <strong>{option.name}</strong> · {kindNames[option.kind]}{option.warehouse && ` · ${option.warehouse}`}
          <span className="br-quiet-text"> · {option.totalCents === null ? 'Delivery quote pending' : `${money(option.totalCents)} total (${option.shippingCents === null ? 'unquoted' : money(option.shippingCents)} delivery + ${money(option.handlingCents)} handling)`}
            {' · '}{day(option.windowStart)}–{day(option.windowEnd)}{option.approvalRequired && ' · supplier approval required'}</span>
        </label>)}
      </fieldset>}
      {chosen?.kind==='own-carrier' && <label>Your carrier account reference<input value={ownCarrierAccount} onChange={event=>setOwnCarrierAccount(event.target.value)} maxLength={100} disabled={busy} /></label>}
      {!!result.options.length && <div className="br-actions"><button type="button" className="br-secondary" disabled={busy || !chosen} onClick={() => void select()}>Use this delivery option</button></div>}
      {selected && <p role="status">Selected: {selected.name}{selected.warehouse && ` · ${selected.warehouse}`} · {selected.totalCents === null ? 'awaiting a supplier quote' : money(selected.totalCents)}. Buyer acceptance is still required at submission.</p>}
      {supplier && quotable.length > 0 && <form className="br-stack" aria-label="Quote delivery" onSubmit={event => void submitQuote(event)}>
        <h4>Supplier delivery quote</h4>
        <label>Quote for<select value={quoteChoice} disabled={busy} onChange={event => {
          const target = quotable.find(option => optionKey(option) === event.target.value)
          setQuoteChoice(event.target.value); setQuote({ cents: '', windowStart: target?.windowStart ?? '', windowEnd: target?.windowEnd ?? '', reason: '' })
        }}>{quotable.map(option => <option key={optionKey(option)} value={optionKey(option)}>{option.name}{option.warehouse && ` · ${option.warehouse}`}</option>)}</select></label>
        <div className="br-form-grid"><label>Delivery quote (USD cents)<input type="number" min="0" step="1" required disabled={busy} value={quote.cents} onChange={event => setQuote(current => ({ ...current, cents: event.target.value }))} /></label>
          <label>Window starts<input type="date" required disabled={busy} value={quote.windowStart} onChange={event => setQuote(current => ({ ...current, windowStart: event.target.value }))} /></label>
          <label>Window ends<input type="date" min={quote.windowStart} required disabled={busy} value={quote.windowEnd} onChange={event => setQuote(current => ({ ...current, windowEnd: event.target.value }))} /></label>
          <label>Quote reason<input required maxLength={240} disabled={busy} value={quote.reason} onChange={event => setQuote(current => ({ ...current, reason: event.target.value }))} /></label></div>
        <p className="br-quiet-text">Enter the delivery charge in whole USD cents, excluding handling. {quoteTarget && `Handling adds ${money(quoteTarget.handlingCents)}.`} The buyer reviews the final charge and window before submission.</p>
        <div className="br-actions"><button disabled={busy || !quoteTarget}>Record delivery quote</button></div>
      </form>}
      {(result.required || result.options.length > 0) && <p className="br-quiet-text">The buyer must accept the final delivery charge and window when submitting. A pending delivery quote prevents submission.</p>}
    </>}
  </section>
}
