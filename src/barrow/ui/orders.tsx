import { useEffect, useState } from 'react'
import type { Account, Order, RunCommand } from './types'
import { byAgent, day, money, orderNumber, stale, terms, when } from './types'
import { Empty } from './primitives'
import { orderStyles } from './styles'
import { Reorder } from './reorder'
import { request, errorMessage } from './api'

const explanations: Record<Order['status'], string> = {
  draft: 'Prepared for review. No stock has been reserved.',
  submitted: 'Submitted for supplier review. Stock is not reserved yet.',
  reserving: 'Pier is processing the stock reservation. Refresh to check the result.',
  shortfall: 'Stock could not be reserved in full. The supplier must resolve the shortfall in Pier, then refresh this order.',
  approved: 'Stock is reserved in full. The invoice is ready to download.',
  superseded: 'Replaced by a draft prepared at today’s prices.',
}
const filters: [string, (order: Order) => boolean][] = [['All', () => true], ['Drafts', order => order.status === 'draft'], ['In review', order => ['submitted', 'reserving', 'shortfall'].includes(order.status)], ['Approved', order => order.status === 'approved']]

// A superseded draft lives on only as the "Replaces" note of the order prepared from it.
export function Orders({ orders: all, accounts, people, viewer, supplier, busy, run, onOpen }: { orders: Order[]; accounts: Account[]; people: Record<string, string>; viewer: string; supplier: boolean; busy: boolean; run: RunCommand; onOpen: (order: Order) => void }) {
  const [filter, setFilter] = useState('All')
  const [reorder,setReorder] = useState<Order|null>(null)
  const [query,setQuery] = useState({po:'',from:'',to:'',sku:'',location:''})
  const [matched,setMatched] = useState<string[]|null>(null)
  const [searchError,setSearchError] = useState('')
  useEffect(() => {
    let current=true
    if (!Object.values(query).some(Boolean)) {setMatched(null);setSearchError('');return}
    setMatched([])
    void request<{orders:Order[]}>(`/api/barrow/orders/history?${new URLSearchParams(query)}`).then(value => {if(current){setMatched(value.orders.map(order => order.id));setSearchError('')}}).catch(error => {if(current)setSearchError(errorMessage(error))})
    return () => {current=false}
  },[query,all])
  const orders = all.filter(order => order.status !== 'superseded')
  const person = (id: string) => id.startsWith('agent:') ? 'Your agent' : id === viewer ? 'You' : people[id] ?? 'A former user'
  const shown = orders.filter((filters.find(([name]) => name === filter) ?? filters[0])[1]).filter(order => matched === null || matched.includes(order.id))
  return <div className="br-stack br-orders">
    <div className="br-heading-row"><h2>{supplier ? 'All orders' : 'Your orders'}</h2>
      <div className="br-segments" role="group" aria-label="Show orders">{filters.map(([name, test]) => <button key={name} type="button" aria-pressed={filter === name} onClick={() => setFilter(name)}>{name} <span>{orders.filter(test).length}</span></button>)}</div>
    </div>
    <div className="br-card br-stack" role="search" aria-label="Order history search">
      <h3>Find a previous order</h3>
      {([['po','Purchase order / reference','text'],['from','From date (Eastern time)','date'],['to','Through date (Eastern time)','date'],['sku','Ordered SKU','text'],['location','Delivery location','text']] as const).map(([key,label,type]) => <label key={key}>{label}<input type={type} value={query[key]} onChange={event => setQuery(current => ({...current,[key]:event.target.value}))} /></label>)}
      <button type="button" className="br-secondary" onClick={() => setQuery({po:'',from:'',to:'',sku:'',location:''})}>Clear search</button>
      {searchError && <p role="alert">{searchError}</p>}
    </div>
    {!orders.length && <Empty title="No orders yet">Choose products from a trade account’s catalog to prepare your first order.</Empty>}
    {orders.length > 0 && !shown.length && <p className="br-quiet-text">No orders in this view.</p>}
    {shown.map(order => {
      const moved = stale(order, accounts), units = order.lines.reduce((sum, line) => sum + line.quantity, 0)
      return <article key={order.id} className={`br-card br-order${moved ? ' br-order-moved' : ''}`}>
        <div className="br-order-main">
          <div className="br-order-meta"><span className="br-order-id">{orderNumber(order.id)}</span><span className={`br-status br-status-${order.status}`}>{order.status}</span>{byAgent(order) && <span className="br-agent-tag"><span className="br-rivet" aria-hidden="true" />Prepared by your agent</span>}{order.replaces && <span className="br-replaces">Replaces {orderNumber(order.replaces)}</span>}</div>
          <h3>{order.customerName}</h3>
          <p className="br-quiet-text">{when(order.preparedAt)} · {order.reference ? `Reference: ${order.reference}` : 'No customer reference'}{order.deliveryLocation && ` · ${order.deliveryLocation}`}</p>{order.reorderedFrom && <p>Reordered from {orderNumber(order.reorderedFrom)}</p>}
          <table className="br-order-lines"><caption className="br-sr-only">Order {orderNumber(order.id)} lines</caption><thead><tr><th scope="col">Style</th><th scope="col">Sizes</th><th scope="col">Units</th><th scope="col">Unit price</th><th scope="col">Total</th></tr></thead>
            <tbody>{orderStyles(order.lines, order.currency ?? 'AUD').map(style => <tr key={style.key}><th scope="row">{style.name}<small>{style.key}</small></th><td>{style.sizes}</td><td>{style.units}</td><td>{style.prices}</td><td>{money(style.cents, order.currency ?? 'AUD')}</td></tr>)}</tbody></table>
          {moved && <p className="br-change-note"><span className="br-warn" aria-hidden="true">!</span>Prices or terms changed since this draft was written. Open it in the order pad to prepare a new draft at today’s prices.</p>}
          <p className="br-order-explain">{order.status === 'reserving' && !order.pierOrderId ? 'Approval is recorded, but the reservation result is not confirmed. Retry the reservation for this same order.' : explanations[order.status]}</p>
        </div>
        <div className="br-order-side">
          <p className="br-order-amount">{money(order.totalCents, order.currency ?? 'AUD')}</p>
          <p className="br-quiet-text">{units} {units === 1 ? 'unit' : 'units'} · {order.termsDays === 0 ? 'Due on receipt' : `${terms(order.termsDays)} payment terms`}</p>
          <div className="br-actions br-order-actions">
            {['submitted','reserving','shortfall','approved'].includes(order.status) && <button className="br-secondary" disabled={busy} onClick={() => setReorder(order)}>Reorder selected lines</button>}
            {order.status === 'draft' && moved && <button disabled={busy} onClick={() => onOpen(order)}>Open in order pad</button>}
            {order.status === 'draft' && <button className={moved ? 'br-secondary' : undefined} disabled={busy} onClick={() => void run('order.submit', { orderId: order.id })}>Submit for supplier review</button>}
            {order.status === 'draft' && !moved && <button className="br-secondary" disabled={busy} onClick={() => onOpen(order)}>Open in order pad</button>}
            {supplier && order.status === 'submitted' && <button disabled={busy} onClick={() => void run('order.approve', { orderId: order.id })}>Approve & reserve stock</button>}
            {supplier && order.status === 'reserving' && !order.pierOrderId && <button disabled={busy} onClick={() => void run('order.approve', { orderId: order.id })}>Retry stock reservation</button>}
            {supplier && (order.status === 'shortfall' || (order.status === 'reserving' && order.pierOrderId)) && <button disabled={busy} onClick={() => void run('order.refresh', { orderId: order.id })}>Refresh stock status</button>}
            {order.status === 'approved' && <a className="br-button" href={`/api/barrow/invoices/${encodeURIComponent(order.id)}.csv`} download>Download invoice CSV</a>}
          </div>
          <details className="br-details"><summary>Order history & Pier details</summary><dl className="br-facts br-facts-wrap"><div><dt>Prepared by</dt><dd>{person(order.preparedBy)}</dd></div>{order.submittedBy && <div><dt>Submitted by</dt><dd>{person(order.submittedBy)}</dd></div>}{order.approvedBy && <div><dt>Approved by</dt><dd>{person(order.approvedBy)}</dd></div>}{order.approvedAt && <div><dt>Approved at</dt><dd>{when(order.approvedAt)}</dd></div>}{order.pierReference && <div><dt>Pier order</dt><dd>{order.pierReference}</dd></div>}{order.reservation && <div><dt>Reserved</dt><dd>{order.reservation.reduce((sum, line) => sum + Number(line.reserved), 0)} of {units} units</dd></div>}{order.invoice && <><div><dt>Invoice</dt><dd>{order.invoice.number}</dd></div><div><dt>Issued</dt><dd>{day(order.invoice.issuedAt)}</dd></div><div><dt>Due</dt><dd>{day(order.invoice.dueAt)}</dd></div></>}</dl></details>
        </div>
      </article>
    })}
    {reorder && <Reorder order={reorder} run={run} busy={busy} onClose={() => setReorder(null)} />}
  </div>
}
