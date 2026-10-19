import { useEffect, useRef, useState, type FormEvent } from 'react'
import { request, errorMessage } from './api'
import { Empty, Notice } from './primitives'
import type { Account, Catalogue, RunCommand } from './types'
import { money, observedTime } from './types'

export function CatalogueView({ account, run, busy, onPrepared }: { account: Account; run: RunCommand; busy: boolean; onPrepared: () => void }) {
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [reference, setReference] = useState('')
  const live = useRef(true)
  useEffect(() => {
    live.current = true
    let current = true
    setLoading(true); setError(''); setCatalogue(null)
    void request<Catalogue>(`/api/barrow/catalogue?accountId=${encodeURIComponent(account.id)}`)
      .then(data => { if (current) setCatalogue(data) })
      .catch(error => { if (current) setError(errorMessage(error)) })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false; live.current = false }
  }, [account.id, refresh])
  const items = catalogue?.items ?? []
  const currentAccount = catalogue?.account ?? account
  const chosen = items.filter(item => Number(quantities[item.sku]) > 0)
  const total = chosen.reduce((sum, item) => sum + item.unitCents * Number(quantities[item.sku]), 0)
  const invalid = chosen.some(item => !Number.isSafeInteger(Number(quantities[item.sku])) || Number(quantities[item.sku]) < item.minQty)
  const belowMinimum = chosen.length > 0 && total < currentAccount.value.minimumCents
  async function prepare(event: FormEvent) {
    event.preventDefault()
    if (!catalogue || !chosen.length || invalid || belowMinimum) return
    const prepared = await run('order.prepare', { accountId: account.id, reference, lines: chosen.map(item => ({ sku: item.sku, quantity: Number(quantities[item.sku]) })) })
    if (prepared) {
      if (live.current) { setQuantities({}); setReference('') }
      onPrepared()
    }
  }
  return <div className="br-panel br-catalogue br-stack">
    <div className="br-heading-row"><div><h2>{currentAccount.value.name} catalog</h2><p>{money(currentAccount.value.minimumCents)} minimum · {currentAccount.value.termsDays === 0 ? 'Due on receipt' : `${currentAccount.value.termsDays}-day terms`}</p></div>
      <button className="br-secondary" disabled={loading || busy} onClick={() => setRefresh(value => value + 1)}>Refresh stock</button></div>
    {loading && <p role="status">Fetching live stock and agreed prices from Pier…</p>}
    {error && <Notice error><strong>Catalog unavailable</strong><p>{error}</p><p>No order can be prepared until live stock is available.</p></Notice>}
    {catalogue && items.length === 0 && <Empty title="No agreed products yet">Your supplier needs to add agreed SKU prices to this trade account before you can order.</Empty>}
    {catalogue && items.length > 0 && <form className="br-stack" onSubmit={event => void prepare(event)}>
      <p className="br-small">Stock observed: {observedTime(catalogue.observedAt)}. Stock is reserved only after supplier approval.</p>
      <div className="br-table-wrap"><table><caption className="br-sr-only">Products and agreed prices</caption><thead><tr><th scope="col">Product</th><th scope="col">Available</th><th scope="col">Price</th><th scope="col">Quantity</th><th scope="col">Line total</th></tr></thead>
        <tbody>{items.map(item => <tr key={item.sku}><th scope="row"><span>{item.name}</span><small>{item.sku} · {item.unit} · min. {item.minQty}</small></th><td>{item.available}</td><td>{money(item.unitCents)}</td><td><input className="br-quantity" aria-label={`Quantity for ${item.name}`} type="number" min="0" step="1" value={quantities[item.sku] ?? ''} placeholder="0" disabled={busy} onChange={event => setQuantities(current => ({ ...current, [item.sku]: event.target.value }))} /></td><td>{money(item.unitCents * (Number(quantities[item.sku]) || 0))}</td></tr>)}</tbody></table></div>
      {invalid && <Notice error>Each selected quantity must be a whole number at or above its product minimum.</Notice>}
      {belowMinimum && <Notice>Add {money(currentAccount.value.minimumCents - total)} to meet your minimum order.</Notice>}
      <div className="br-order-summary"><label>Your purchase order / reference<input value={reference} maxLength={100} onChange={event => setReference(event.target.value)} disabled={busy} /></label><div className="br-total"><span>Order total</span><strong>{money(total)}</strong></div><button disabled={busy || !chosen.length || invalid || belowMinimum}>Prepare draft</button></div>
      <p className="br-small">Preparing creates a draft for review. Submit it from Orders when you are ready.</p>
    </form>}
  </div>
}
