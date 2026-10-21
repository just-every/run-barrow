import { OrderConfirmations } from './order-confirmations'
import { BulkConfirmations } from './bulk-confirmations'
import { useEffect, useState } from 'react'
import type { Account, Order, RunCommand } from './types'
import { byAgent, day, money, orderNumber, stale, terms, when } from './types'
import { Empty } from './primitives'
import { orderStyles } from './styles'
import { OrderShipping } from './order-shipping'
import { Reorder } from './reorder'
import { CancelOrder } from './cancel-order'
import { OrderTimeline } from './order-timeline'
import { OrderSearch } from './order-search'
import { request, errorMessage } from './api'

const explanations: Record<Order['status'], string> = {
  draft: 'Prepared for review. No stock has been reserved.',
  submitted: 'Submitted for supplier review. Stock is not reserved yet.',
  reserving: 'Pier is processing the stock reservation. Refresh to check the result.',
  shortfall: 'Stock could not be reserved in full. The supplier must resolve the shortfall in Pier, then refresh this order.',
  approved: 'Stock is reserved in full. The invoice is ready to download.',
  superseded: 'Replaced by a draft prepared at today’s prices.',
  releasing: 'Cancelled. Pier has not confirmed the stock release yet, so these units stay unavailable to other buyers. Retry the release.',
  cancelled: 'Cancelled. Pier confirmed the stock release; this order holds no stock and has no invoice to download.',
}
const filters: [string, (order: Order) => boolean][] = [['All', () => true], ['Drafts', order => order.status === 'draft'], ['In review', order => ['submitted', 'reserving', 'shortfall', 'releasing'].includes(order.status)], ['Approved', order => order.status === 'approved'], ['Cancelled', order => order.status === 'cancelled']]

// A superseded draft lives on only as the "Replaces" note of the order prepared from it.
export function Orders({ orders: all, accounts, people, viewer, supplier, busy, run, onOpen }: { orders: Order[]; accounts: Account[]; people: Record<string, string>; viewer: string; supplier: boolean; busy: boolean; run: RunCommand; onOpen: (order: Order) => void }) {
  const [deliveryAccepted,setDeliveryAccepted]=useState<Record<string,boolean>>({})
  const [filter, setFilter] = useState('All')
  const [reorder,setReorder] = useState<Order|null>(null)
  const [cancel,setCancel] = useState<Order|null>(null)
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
  // ORD-007: the same PO on a live order of this account needs an explicit numbered release.
  const duplicate = (order: Order) => Boolean(order.reference.trim()) && all.some(other => other.id !== order.id && other.accountId === order.accountId && ['submitted', 'reserving', 'shortfall', 'approved', 'releasing'].includes(other.status) && other.reference.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US') === order.reference.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US'))
  async function attach(order: Order, file: File) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    let binary = ''
    for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
    await run('order.attach', { orderId: order.id, name: file.name, contentBase64: btoa(binary) })
  }
  const person = (id: string) => id.startsWith('agent:') ? 'Your agent' : id === viewer ? 'You' : people[id] ?? 'A former user'
  const shown = orders.filter((filters.find(([name]) => name === filter) ?? filters[0])[1]).filter(order => matched === null || matched.includes(order.id))
  return <div className="br-stack br-orders">
    <div className="br-heading-row"><h2>{supplier ? 'All orders' : 'Your orders'}</h2>
      <div className="br-segments" role="group" aria-label="Show orders">{filters.map(([name, test]) => <button key={name} type="button" aria-pressed={filter === name} onClick={() => setFilter(name)}>{name} <span>{orders.filter(test).length}</span></button>)}</div>
    </div>
    <OrderSearch />
    <div className="br-card br-stack" role="search" aria-label="Order history search">
      <h3>Find a previous order</h3>
      {([['po','Purchase order / reference','text'],['from','From date (Eastern time)','date'],['to','Through date (Eastern time)','date'],['sku','Ordered SKU','text'],['location','Delivery location','text']] as const).map(([key,label,type]) => <label key={key}>{label}<input type={type} value={query[key]} onChange={event => setQuery(current => ({...current,[key]:event.target.value}))} /></label>)}
      <button type="button" className="br-secondary" onClick={() => setQuery({po:'',from:'',to:'',sku:'',location:''})}>Clear search</button>
      {searchError && <p role="alert">{searchError}</p>}
    </div>
    {supplier && <BulkConfirmations key={shown.map(order=>order.id).join(',')} orderIds={shown.map(order=>order.id)}/>}
    {!orders.length && <Empty title="No orders yet">Choose products from a trade account’s catalog to prepare your first order.</Empty>}
    {orders.length > 0 && !shown.length && <p className="br-quiet-text">No orders in this view.</p>}
    {shown.map(order => {
      const moved = stale(order, accounts), units = order.lines.reduce((sum, line) => sum + Number(line.baseQuantity??line.quantity), 0)
      return <article key={order.id} className={`br-card br-order${moved ? ' br-order-moved' : ''}`}>
        <div className="br-order-main">
          <div className="br-order-meta"><span className="br-order-id">{orderNumber(order.id)}</span><span className={`br-status br-status-${order.status}`}>{order.status}</span>{byAgent(order) && <span className="br-agent-tag"><span className="br-rivet" aria-hidden="true" />Prepared by your agent</span>}{order.replaces && <span className="br-replaces">Replaces {orderNumber(order.replaces)}</span>}</div>
          <h3>{order.customerName}</h3>
          <p className="br-quiet-text">{when(order.preparedAt)} · {order.reference ? `Reference: ${order.reference}` : 'No customer reference'}{order.poRelease && ` · release ${order.poRelease.number} of ${orderNumber(order.poRelease.of)}`}{order.deliveryLocation && ` · ${order.deliveryLocation}`}</p>{(order.requestedDate || order.cancelAfter) && <p className="br-quiet-text">{order.requestedDate && `Requested delivery ${day(order.requestedDate)}`}{order.requestedDate && order.cancelAfter && ' · '}{order.cancelAfter && `Cancel after ${day(order.cancelAfter)}`} (Eastern time)</p>}{order.instructions && <p>Instructions: {order.instructions}</p>}{order.document && <p><a href={`/api/barrow/orders/${encodeURIComponent(order.id)}/document`} download>PO document: {order.document.name}</a> ({Math.ceil(order.document.size / 1024)} KB)</p>}
          {order.status === 'draft' && <label className="br-quiet-text">{order.document ? 'Replace the PO document' : 'Attach the PO document'} (PDF, PNG or JPEG, up to 1 MB)<input type="file" accept="application/pdf,image/png,image/jpeg" disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void attach(order, file) }} /></label>}{order.reorderedFrom && <p>Reordered from {orderNumber(order.reorderedFrom)}</p>}{order.quote && <p>From quote {order.quote.id} revision {order.quote.revision} at the quoted prices{order.quote.shipping && ` · Shipping: ${order.quote.shipping}`}</p>}
          <table className="br-order-lines"><caption className="br-sr-only">Order {orderNumber(order.id)} lines</caption><thead><tr><th scope="col">Style</th><th scope="col">Sizes</th><th scope="col">Units</th><th scope="col">Unit price</th><th scope="col">Total</th></tr></thead>
            <tbody>{orderStyles(order.lines, order.currency ?? 'AUD').map(style => <tr key={style.key}><th scope="row">{style.name}<small>{style.key}</small></th><td>{style.sizes}</td><td>{style.units}</td><td>{style.prices}</td><td>{money(style.cents, order.currency ?? 'AUD')}</td></tr>)}</tbody></table>
          {order.lines.filter(line=>line.buyerSku).map(line=><p key={`alias-${line.sku}-${line.unit ?? ''}`}>{line.sku}: buyer SKU {line.buyerSku}</p>)}
          {order.lines.filter(line=>line.pricing).map(line=><p key={JSON.stringify([line.sku,line.unit])}>{line.sku} · {line.unit}: {line.pricing!.reason} · {money(line.pricing!.lineCents,order.currency??'AUD')}</p>)}
          {moved && <p className="br-change-note"><span className="br-warn" aria-hidden="true">!</span>Prices or terms changed since this draft was written. Open it in the order pad to prepare a new draft at today’s prices.</p>}
          {order.fromSubstitution && <p>Replacement for {order.fromSubstitution.orderId}, buyer-accepted substitution {order.fromSubstitution.number}. Original and replacement lines remain linked in the commercial export.</p>}
          {order.substitutions?.map(offer=><details className="br-details" key={offer.number}><summary>Substitution {offer.number}: {offer.status}{offer.replacementId?` · replacement ${offer.replacementId}`:''}</summary><p>{offer.reason}</p><ul>{offer.lines.map((line,index)=><li key={index}>{line.fromSku}{line.fromUnit?` (${line.fromUnit})`:''} → {line.sku}: {line.quantity} {line.unit}, {money(line.unitCents)} per unit; {money(line.lineCents??line.quantity*line.unitCents)} total</li>)}</ul><p>Replacement total: {money(offer.totalCents)}. Original total: {money(order.totalCents,order.currency??'AUD')}.</p><p>{offer.delivery?`${offer.delivery.name}: ${money(offer.delivery.totalCents??0)}, ${day(offer.delivery.windowStart)}–${day(offer.delivery.windowEnd)}`:'No delivery method or delivery charge recorded.'}</p><p>{offer.taxNote}</p>{offer.declineReason&&<p>Declined: {offer.declineReason}</p>}{offer.number===order.substitutions!.at(-1)!.number && offer.status==='offered' && !supplier && <div className="br-actions"><button disabled={busy} onClick={()=>{if(window.confirm('Accept this exact substitution, including its quantities, units, USD prices, delivery and unverified tax difference?'))void run('substitution.accept',{orderId:order.id,number:offer.number,acknowledged:true})}}>Accept exact substitution</button><button className="br-secondary" disabled={busy} onClick={()=>{const reason=window.prompt('Why decline this substitution?');if(reason?.trim())void run('substitution.decline',{orderId:order.id,number:offer.number,reason:reason.trim()})}}>Decline substitution</button></div>}{supplier && offer.status==='accepted' && !all.some(replacement=>replacement.id===offer.replacementId&&['approved','shortfall'].includes(replacement.status)) && <button disabled={busy} onClick={()=>void run('substitution.execute',{orderId:order.id,number:offer.number})}>{order.status==='releasing'?'Retry accepted substitution':'Execute accepted substitution'}</button>}</details>)}
          <OrderShipping order={order} supplier={supplier} busy={busy} run={run} />
          <p className="br-order-explain">{order.status === 'reserving' && !order.pierOrderId ? 'Approval is recorded, but the reservation result is not confirmed. Retry the reservation for this same order.' : explanations[order.status]}</p>
        </div>
        <div className="br-order-side">
          <p className="br-order-amount">{money(order.totalCents, order.currency ?? 'AUD')}</p>
          <p className="br-quiet-text">{units} {order.lines.some(line=>line.baseQuantity) ? 'base units' : units === 1 ? 'unit' : 'units'} · {order.termsDays === 0 ? 'Due on receipt' : `${terms(order.termsDays)} payment terms`}</p>
          <div className="br-actions br-order-actions">
            {['submitted','reserving','shortfall','approved'].includes(order.status) && <button className="br-secondary" disabled={busy} onClick={() => setReorder(order)}>Reorder selected lines</button>}
            {order.status === 'draft' && moved && <button disabled={busy} onClick={() => onOpen(order)}>Open in order pad</button>}
            {order.status === 'draft' && order.delivery && !supplier && <label><input type="checkbox" checked={Boolean(deliveryAccepted[order.id+':'+order.delivery.fingerprint])} onChange={event=>setDeliveryAccepted(current=>({...current,[order.id+':'+order.delivery!.fingerprint]:event.target.checked}))} />I accept {order.delivery.name}, {money(order.delivery.totalCents??0)} delivery and handling, {day(order.delivery.windowStart)}–{day(order.delivery.windowEnd)}.</label>}
            {order.status === 'draft' && <button className={moved ? 'br-secondary' : undefined} disabled={busy} onClick={() => void run('order.submit', { orderId: order.id, deliveryAcknowledged:order.delivery?Boolean(deliveryAccepted[order.id+':'+order.delivery.fingerprint]):undefined })}>Submit for supplier review</button>}
            {order.status === 'draft' && supplier && !order.stockException && <button className="br-secondary" disabled={busy} onClick={() => { const reason = window.prompt('Why accept this draft’s stock observation past the freshness limit?'); if (reason?.trim()) void run('order.stock-exception', { orderId: order.id, reason: reason.trim() }) }}>Accept stale stock observation</button>}
            {order.status === 'draft' && order.stockException && <p className="br-quiet-text">Stale stock accepted by the supplier: {order.stockException.reason}</p>}
            {order.status === 'draft' && duplicate(order) && <button className="br-secondary" disabled={busy} onClick={() => void run('order.submit', { orderId: order.id, release: true, deliveryAcknowledged:order.delivery?Boolean(deliveryAccepted[order.id+':'+order.delivery.fingerprint]):undefined })}>Submit as a new release of PO {order.reference}</button>}
            {order.status === 'draft' && !moved && <button className="br-secondary" disabled={busy} onClick={() => onOpen(order)}>Open in order pad</button>}
            {supplier && order.status === 'submitted' && <button disabled={busy} onClick={() => void run('order.approve', { orderId: order.id })}>Approve & reserve stock</button>}
            {supplier && order.status === 'reserving' && !order.pierOrderId && <button disabled={busy} onClick={() => void run('order.approve', { orderId: order.id })}>Retry stock reservation</button>}
            {supplier && (order.status === 'shortfall' || (order.status === 'reserving' && order.pierOrderId)) && <button disabled={busy} onClick={() => void run('order.refresh', { orderId: order.id })}>Refresh stock status</button>}
            {supplier && (order.status === 'approved' || order.status === 'shortfall') && <button className="br-secondary" disabled={busy} onClick={() => setCancel(order)}>Cancel order & release stock</button>}
            {supplier && order.status === 'releasing' && <button disabled={busy} onClick={() => void run('order.cancel', { orderId: order.id })}>Retry stock release</button>}
            {supplier && order.status === 'releasing' && <button className="br-secondary" disabled={busy} onClick={() => void run('order.refresh', { orderId: order.id })}>Refresh release status</button>}
            {order.status === 'approved' && <a className="br-button" href={`/api/barrow/invoices/${encodeURIComponent(order.id)}.csv`} download>Download invoice CSV</a>}
          </div>
          <details className="br-details"><summary>Order history & Pier details</summary><dl className="br-facts br-facts-wrap"><div><dt>Prepared by</dt><dd>{person(order.preparedBy)}</dd></div>{order.submittedBy && <div><dt>Submitted by</dt><dd>{person(order.submittedBy)}</dd></div>}{order.approvedBy && <div><dt>Approved by</dt><dd>{person(order.approvedBy)}</dd></div>}{order.approvedAt && <div><dt>Approved at</dt><dd>{when(order.approvedAt)}</dd></div>}{order.pierReference && <div><dt>Pier order</dt><dd>{order.pierReference}</dd></div>}{order.reservation && <div><dt>Reserved</dt><dd>{order.reservation.reduce((sum, line) => sum + Number(line.reserved), 0)} of {units} units</dd></div>}{order.release && <><div><dt>Cancelled by</dt><dd>{person(order.release.requestedBy)}</dd></div><div><dt>Cancelled at</dt><dd>{when(order.release.requestedAt)}</dd></div><div><dt>Reason</dt><dd>{order.release.reason}</dd></div><div><dt>Stock release</dt><dd>{order.release.confirmedAt ? `Confirmed by Pier ${when(order.release.confirmedAt)}` : 'Awaiting Pier confirmation'}</dd></div></>}{order.invoice && <><div><dt>{order.release ? 'Withdrawn invoice' : 'Invoice'}</dt><dd>{order.invoice.number}</dd></div><div><dt>Issued</dt><dd>{day(order.invoice.issuedAt)}</dd></div><div><dt>Due</dt><dd>{day(order.invoice.dueAt)}</dd></div></>}</dl></details>
          {!['draft','superseded'].includes(order.status) && <OrderConfirmations key={order.revision} orderId={order.id} supplier={supplier} />}
          {order.status !== 'draft' && <OrderTimeline order={order} />}
        </div>
      </article>
    })}
    {reorder && <Reorder order={reorder} run={run} busy={busy} onClose={() => setReorder(null)} />}
    {cancel && <CancelOrder order={cancel} run={run} busy={busy} onClose={() => setCancel(null)} />}
  </div>
}
