import type { Order, RunCommand } from './types'
import { money } from './types'
import { Empty, JsonDetail } from './primitives'

const explanations: Record<Order['status'], string> = {
  draft: 'Prepared for review. No stock has been reserved.',
  submitted: 'Submitted for supplier review. Stock is not reserved yet.',
  reserving: 'Pier is processing the stock reservation. Refresh to check the result.',
  shortfall: 'Stock could not be reserved in full. The supplier must resolve the shortfall in Pier, then refresh this order.',
  approved: 'Stock is reserved in full. The invoice is ready to download.',
}

export function Orders({ orders, supplier, busy, run }: { orders: Order[]; supplier: boolean; busy: boolean; run: RunCommand }) {
  return <div className="br-stack br-orders"><div className="br-heading-row"><h2>{supplier ? 'All orders' : 'Your orders'}</h2><span className="br-small">{orders.length} {orders.length === 1 ? 'order' : 'orders'}</span></div>
    {!orders.length && <Empty title="No orders yet">Choose products from a trade account’s catalogue to prepare your first order.</Empty>}
    {orders.map(order => <article key={order.id} className="br-panel br-stack">
      <div className="br-heading-row"><div><p className="br-eyebrow" title={order.id}>{order.id.slice(0, 8)}</p><h3>{order.customerName}</h3><p>{order.reference ? `Reference: ${order.reference}` : 'No customer reference'}</p></div><span className={`br-badge br-status-${order.status}`}>{order.status}</span></div>
      <p>{order.status === 'reserving' && !order.pierOrderId ? 'Approval is recorded, but the reservation result is not confirmed. Retry the reservation for this same order.' : explanations[order.status]}</p>
      <div className="br-table-wrap"><table><caption className="br-sr-only">Order {order.id} lines</caption><thead><tr><th scope="col">Product</th><th scope="col">Quantity</th><th scope="col">Unit price</th><th scope="col">Total</th></tr></thead><tbody>{order.lines.map(line => <tr key={line.sku}><th scope="row">{line.name}<small>{line.sku}</small></th><td>{line.quantity}</td><td>{money(line.unitCents)}</td><td>{money(line.quantity * line.unitCents)}</td></tr>)}</tbody></table></div>
      <div className="br-heading-row"><p>{order.termsDays === 0 ? 'Due on receipt' : `${order.termsDays}-day payment terms`}</p><strong className="br-order-amount">{money(order.totalCents)}</strong></div>
      <div className="br-order-footer"><div className="br-actions">
        {order.status === 'draft' && <button disabled={busy} onClick={() => void run('order.submit', { orderId: order.id })}>Submit for supplier review</button>}
        {supplier && order.status === 'submitted' && <button disabled={busy} onClick={() => void run('order.approve', { orderId: order.id })}>Approve & reserve stock</button>}
        {supplier && order.status === 'reserving' && !order.pierOrderId && <button disabled={busy} onClick={() => void run('order.approve', { orderId: order.id })}>Retry stock reservation</button>}
        {supplier && (order.status === 'shortfall' || (order.status === 'reserving' && order.pierOrderId)) && <button disabled={busy} onClick={() => void run('order.refresh', { orderId: order.id })}>Refresh stock status</button>}
        {order.status === 'approved' && <a className="br-button" href={`/api/barrow/invoices/${encodeURIComponent(order.id)}.csv`} download>Download invoice CSV</a>}
      </div>
      <details className="br-details"><summary>Order history & Pier details</summary><dl className="br-facts"><div><dt>Prepared by</dt><dd>{order.preparedBy}</dd></div>{order.submittedBy && <div><dt>Submitted by</dt><dd>{order.submittedBy}</dd></div>}{order.approvedBy && <div><dt>Approved by</dt><dd>{order.approvedBy}</dd></div>}{order.approvedAt && <div><dt>Approved at</dt><dd>{order.approvedAt}</dd></div>}{order.pierReference && <div><dt>Pier reference</dt><dd>{order.pierReference}</dd></div>}{order.pierOrderId && <div><dt>Pier order</dt><dd>{order.pierOrderId}</dd></div>}</dl><JsonDetail value={order.reservation} label="Reservation details" /><JsonDetail value={order.invoice} label="Invoice details" /></details></div>
    </article>)}
  </div>
}
