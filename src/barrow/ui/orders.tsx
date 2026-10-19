import { useState } from 'react'
import type { Account, Order, RunCommand } from './types'
import { byAgent, money, stale, terms, when } from './types'
import { Empty, JsonDetail } from './primitives'
import { orderStyles } from './styles'

const explanations: Record<Order['status'], string> = {
  draft: 'Prepared for review. No stock has been reserved.',
  submitted: 'Submitted for supplier review. Stock is not reserved yet.',
  reserving: 'Pier is processing the stock reservation. Refresh to check the result.',
  shortfall: 'Stock could not be reserved in full. The supplier must resolve the shortfall in Pier, then refresh this order.',
  approved: 'Stock is reserved in full. The invoice is ready to download.',
}
const filters: [string, (order: Order) => boolean][] = [['All', () => true], ['Drafts', order => order.status === 'draft'], ['In review', order => ['submitted', 'reserving', 'shortfall'].includes(order.status)], ['Approved', order => order.status === 'approved']]

export function Orders({ orders, accounts, supplier, busy, run, onOpen }: { orders: Order[]; accounts: Account[]; supplier: boolean; busy: boolean; run: RunCommand; onOpen: (order: Order) => void }) {
  const [filter, setFilter] = useState('All')
  const shown = orders.filter((filters.find(([name]) => name === filter) ?? filters[0])[1])
  return <div className="br-stack br-orders">
    <div className="br-heading-row"><h2>{supplier ? 'All orders' : 'Your orders'}</h2>
      <div className="br-segments" role="group" aria-label="Show orders">{filters.map(([name, test]) => <button key={name} type="button" aria-pressed={filter === name} onClick={() => setFilter(name)}>{name} <span>{orders.filter(test).length}</span></button>)}</div>
    </div>
    {!orders.length && <Empty title="No orders yet">Choose products from a trade account’s catalog to prepare your first order.</Empty>}
    {orders.length > 0 && !shown.length && <p className="br-quiet-text">No orders in this view.</p>}
    {shown.map(order => {
      const moved = stale(order, accounts), units = order.lines.reduce((sum, line) => sum + line.quantity, 0)
      return <article key={order.id} className={`br-card br-order${moved ? ' br-order-moved' : ''}`}>
        <div className="br-order-main">
          <div className="br-order-meta"><span className="br-order-id" title={order.id}>{order.id.slice(0, 8)}</span><span className={`br-status br-status-${order.status}`}>{order.status}</span>{byAgent(order) && <span className="br-agent-tag"><span className="br-rivet" aria-hidden="true" />Prepared by your agent</span>}</div>
          <h3>{order.customerName}</h3>
          <p className="br-quiet-text">{when(order.preparedAt)} · {order.reference ? `Reference: ${order.reference}` : 'No customer reference'}</p>
          <table className="br-order-lines"><caption className="br-sr-only">Order {order.id} lines</caption><thead><tr><th scope="col">Style</th><th scope="col">Sizes</th><th scope="col">Units</th><th scope="col">Unit price</th><th scope="col">Total</th></tr></thead>
            <tbody>{orderStyles(order.lines).map(style => <tr key={style.key}><th scope="row">{style.name}<small>{style.key}</small></th><td>{style.sizes}</td><td>{style.units}</td><td>{style.prices}</td><td>{money(style.cents)}</td></tr>)}</tbody></table>
          {moved && <p className="br-change-note"><span className="br-warn" aria-hidden="true">!</span>Prices or terms changed since this draft was written. Open it in the order pad to prepare a new draft at today’s prices.</p>}
          <p className="br-order-explain">{order.status === 'reserving' && !order.pierOrderId ? 'Approval is recorded, but the reservation result is not confirmed. Retry the reservation for this same order.' : explanations[order.status]}</p>
        </div>
        <div className="br-order-side">
          <p className="br-order-amount">{money(order.totalCents)}</p>
          <p className="br-quiet-text">{units} {units === 1 ? 'unit' : 'units'} · {order.termsDays === 0 ? 'Due on receipt' : `${terms(order.termsDays)} payment terms`}</p>
          <div className="br-actions br-order-actions">
            {order.status === 'draft' && moved && <button disabled={busy} onClick={() => onOpen(order)}>Open in order pad</button>}
            {order.status === 'draft' && <button className={moved ? 'br-secondary' : undefined} disabled={busy} onClick={() => void run('order.submit', { orderId: order.id })}>Submit for supplier review</button>}
            {order.status === 'draft' && !moved && <button className="br-secondary" disabled={busy} onClick={() => onOpen(order)}>Open in order pad</button>}
            {supplier && order.status === 'submitted' && <button disabled={busy} onClick={() => void run('order.approve', { orderId: order.id })}>Approve & reserve stock</button>}
            {supplier && order.status === 'reserving' && !order.pierOrderId && <button disabled={busy} onClick={() => void run('order.approve', { orderId: order.id })}>Retry stock reservation</button>}
            {supplier && (order.status === 'shortfall' || (order.status === 'reserving' && order.pierOrderId)) && <button disabled={busy} onClick={() => void run('order.refresh', { orderId: order.id })}>Refresh stock status</button>}
            {order.status === 'approved' && <a className="br-button" href={`/api/barrow/invoices/${encodeURIComponent(order.id)}.csv`} download>Download invoice CSV</a>}
          </div>
          <details className="br-details"><summary>Order history & Pier details</summary><dl className="br-facts"><div><dt>Prepared by</dt><dd>{order.preparedBy}</dd></div>{order.submittedBy && <div><dt>Submitted by</dt><dd>{order.submittedBy}</dd></div>}{order.approvedBy && <div><dt>Approved by</dt><dd>{order.approvedBy}</dd></div>}{order.approvedAt && <div><dt>Approved at</dt><dd>{when(order.approvedAt)}</dd></div>}{order.pierReference && <div><dt>Pier reference</dt><dd>{order.pierReference}</dd></div>}{order.pierOrderId && <div><dt>Pier order</dt><dd>{order.pierOrderId}</dd></div>}</dl><JsonDetail value={order.reservation} label="Reservation details" /><JsonDetail value={order.invoice} label="Invoice details" /></details>
        </div>
      </article>
    })}
  </div>
}
