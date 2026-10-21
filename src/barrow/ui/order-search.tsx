import { useState } from 'react'
import { errorMessage, request } from './api'
import { day, money, when, type Order } from './types'

type SearchFilters = { company: string; po: string; externalId: string; sku: string; sort: string }
type SearchRow = {
  id: string; revision: string; accountId: string; company: string; po: string
  externalId: string | null; shipWindow: string | null; preparedAt: string
  status: Order['status']; currency: 'USD' | 'AUD'; totalCents: number; orderPath: string
}
type SearchPage = {
  rows: SearchRow[]; page: number; pageSize: 25; hasNext: boolean
  tracking: 'not recorded: no connected carrier source'
}

function SearchOrderDetail({ row }: { row: SearchRow }) {
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(false), [error, setError] = useState('')
  async function load() {
    setLoading(true); setError('')
    try { setOrder(await request<Order>(row.orderPath)) }
    catch (cause) { setError(errorMessage(cause)) }
    finally { setLoading(false) }
  }
  return <details className="br-details" onToggle={event => {
    if (event.currentTarget.open && !order && !loading && !error) void load()
  }}>
    <summary>Load order detail</summary>
    {loading && <p role="status">Loading order detail…</p>}
    {error && <><p role="alert">{error}</p><button type="button" className="br-secondary" disabled={loading} onClick={() => void load()}>Retry order detail</button></>}
    {order && <div className="br-stack">
      <p>Source order ID: {order.id} · revision: {order.revision}</p>
      <p>Total: {money(order.totalCents, order.currency ?? 'AUD')}</p>
      <ul className="br-stack">{order.lines.map((line, index) => <li key={index}>
        <strong>{line.name}</strong> · SKU: {line.sku}{line.buyerSku && ` · Buyer SKU: ${line.buyerSku}`}<br />
        Quantity: {line.quantity} {line.unit ?? 'units'} · Unit price: {money(line.unitCents, order.currency ?? 'AUD')} · Line total: {money(line.lineCents ?? line.quantity * line.unitCents, order.currency ?? 'AUD')}
        {line.baseQuantity && <><br />Base quantity: {line.baseQuantity} {line.baseUnit ?? 'base units'}</>}
        {line.packContents && <><br />Pack contents: {line.packContents}</>}
      </li>)}</ul>
      <div className="br-actions"><a href={`${row.orderPath}/timeline`}>Recorded timeline (JSON)</a><a href={`${row.orderPath}/confirmations`}>Recorded confirmations (JSON)</a></div>
    </div>}
  </details>
}

export function OrderSearch() {
  const [filters, setFilters] = useState<SearchFilters>({ company: '', po: '', externalId: '', sku: '', sort: 'newest' })
  const [applied, setApplied] = useState<SearchFilters | null>(null)
  const [result, setResult] = useState<SearchPage | null>(null)
  const [loading, setLoading] = useState(false), [error, setError] = useState('')
  async function search(values: SearchFilters, page: number) {
    setLoading(true); setError(''); setResult(null)
    const query = new URLSearchParams({ ...values, page: String(page) })
    try { setResult(await request<SearchPage>(`/api/barrow/orders/search?${query}`)); setApplied(values) }
    catch (cause) { setError(errorMessage(cause)) }
    finally { setLoading(false) }
  }
  return <section className="br-card br-stack" aria-label="Operational order search">
    <h3>Operational order search</h3>
    <form className="br-stack" role="search" aria-label="Search operational orders" onSubmit={event => {
      event.preventDefault()
      if (!loading) void search({ ...filters }, 1)
    }}>
      <div className="br-form-grid">
        {([['company', 'Company'], ['po', 'PO reference'], ['externalId', 'External order ID'], ['sku', 'SKU']] as const).map(([key, label]) => <label key={key}>{label}<input disabled={loading} value={filters[key]} onChange={event => setFilters(current => ({ ...current, [key]: event.target.value }))} /></label>)}
        <label>Sort orders<select disabled={loading} value={filters.sort} onChange={event => setFilters(current => ({ ...current, sort: event.target.value }))}>
          <option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="ship-asc">Ship window: earliest first</option><option value="ship-desc">Ship window: latest first</option>
        </select></label>
      </div>
      <div className="br-actions"><button type="submit" disabled={loading}>Search</button></div>
    </form>
    <p className="br-quiet-text">Tracking is not recorded: no connected carrier source.</p>
    {loading && <p role="status">Searching orders…</p>}
    {error && <p role="alert">{error}</p>}
    {result && <div className="br-stack">
      <p role="status">Page {result.page} · {result.rows.length} orders shown</p>
      {!result.rows.length && <p>No orders match these filters.</p>}
      {result.rows.map(row => <article className="br-card br-stack" key={`${row.id}:${row.revision}`}>
        <h4>{row.company}</h4>
        <dl className="br-facts br-facts-wrap">
          <div><dt>Order ID</dt><dd>{row.id}</dd></div><div><dt>Revision</dt><dd>{row.revision}</dd></div>
          <div><dt>PO reference</dt><dd>{row.po || 'Not recorded'}</dd></div>
          <div><dt>External order ID</dt><dd>{row.externalId ?? 'Not recorded'}</dd></div>
          <div><dt>Status</dt><dd>{row.status}</dd></div><div><dt>Total</dt><dd>{money(row.totalCents, row.currency)}</dd></div>
          <div><dt>Ship window</dt><dd>{row.shipWindow ? day(row.shipWindow) : 'Unknown — not recorded'}</dd></div>
          <div><dt>Prepared</dt><dd>{when(row.preparedAt)}</dd></div>
        </dl>
        <SearchOrderDetail row={row} />
      </article>)}
      <div className="br-actions" aria-label="Operational search pages">
        <button type="button" className="br-secondary" disabled={loading || result.page <= 1} onClick={() => { if (applied) void search(applied, result.page - 1) }}>Previous page</button>
        <button type="button" className="br-secondary" disabled={loading || !result.hasNext} onClick={() => { if (applied) void search(applied, result.page + 1) }}>Next page</button>
      </div>
    </div>}
  </section>
}
