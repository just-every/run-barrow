import { ShipmentTracking } from './shipment-tracking'
import { PrebookCommitment } from './prebooks'
import { CardPaymentPanel } from './card-payment'
import { CreditPanel } from './credit-panel'
import { AgentProposals } from './agent-proposals'
import { OrderConfirmations } from './order-confirmations'
import { OrderRevision } from './order-revision'
import { BulkConfirmations } from './bulk-confirmations'
import { useEffect, useRef, useState } from 'react'
import type { Account, Order, RunCommand } from './types'
import { byAgent, day, money, orderNumber, terms, when } from './types'
import { Empty } from './primitives'
import { orderStyles } from './styles'
import { OrderShipping } from './order-shipping'
import { Reorder } from './reorder'
import { SellThroughPlanner, SellThroughContact } from './sell-through'
import { CancelOrder } from './cancel-order'
import { OrderFollowthrough } from './order-followthrough'
import { OrderTimeline } from './order-timeline'
import { OrderSearch } from './order-search'
import { request, errorMessage } from './api'
import { OrderTerms, type TermsChoice } from './sales-terms'

const explanations: Record<Order['status'], string> = {
  'awaiting-company-approval':'Awaiting a different authorized company approver. No supplier submission or stock reservation yet.',
  draft: 'Prepared for review. No stock has been reserved.',
  submitted: 'Submitted for supplier review. Stock is not reserved yet.',
  reserving: 'Pier is processing the stock reservation. Refresh to check the result.',
  shortfall: 'Stock could not be reserved in full. The supplier must resolve the shortfall in Pier, then refresh this order.',
  approved: 'Stock is reserved in full. The invoice is ready to download.',
  superseded: 'Replaced by a draft prepared at today’s prices.',
  releasing: 'Cancelled. Pier has not confirmed the stock release yet, so these units stay unavailable to other buyers. Retry the release.',
  cancelled: 'Cancelled. Pier confirmed the stock release; this order holds no stock and has no invoice to download.',
}
const filters = [['All','all'], ['Drafts','draft'], ['Company approval','awaiting-company-approval'], ['In review','review'], ['Approved','approved'], ['Cancelled','cancelled']] as const
type HistoryPage = {accountRevisions:Record<string,string>;orders:Order[];people:Record<string,string>;page:number;hasNext:boolean;counts:Record<string,number>;duplicatePOs:string[];completedReplacements:string[]}

// A superseded draft lives on only as the "Replaces" note of the order prepared from it.
export function Orders({ focusOrderId='', onResultFocused, orders: all, accounts, people, viewer, supplier, stockExceptionLimitCents,canOperate=supplier,canExcept=supplier,canQuote=supplier, companyApprover=false, companyManager=false, canPurchase=true, finance=true, busy, run, onOpen }: { focusOrderId?: string; onResultFocused?: () => void; orders: Order[]; accounts: Account[]; people: Record<string, string>; viewer: string; supplier: boolean;stockExceptionLimitCents?:number;canOperate?:boolean;canExcept?:boolean;canQuote?:boolean;companyApprover?:boolean;companyManager?:boolean;canPurchase?:boolean;finance?:boolean; busy: boolean; run: RunCommand; onOpen: (order: Order) => void }) {
  const [openPlans,setOpenPlans]=useState<Record<string,boolean>>({})
  const [deliveryAccepted,setDeliveryAccepted]=useState<Record<string,boolean>>({})
  const [termsFor,setTermsFor]=useState<Record<string,TermsChoice>>({})
  const [filter, setFilter] = useState('all')
  const [page,setPage] = useState(1)
  const [history,setHistory] = useState<HistoryPage|null>(null)
  const [loading,setLoading] = useState(false)
  const [reorder,setReorder] = useState<Order|null>(null)
  const [cancel,setCancel] = useState<Order|null>(null)
  const [query,setQuery] = useState({po:'',from:'',to:'',sku:'',location:''})
  const [searchError,setSearchError] = useState('')
  const historyKey = useRef('')
  const loadedOrders = useRef<Order[] | null>(null)
  useEffect(() => {
    let current=true
    const nextKey = JSON.stringify([query,filter,page])
    if (historyKey.current !== nextKey) setHistory(null)
    historyKey.current = nextKey
    setLoading(true);setSearchError('')
    void request<HistoryPage>(`/api/barrow/orders/history?${new URLSearchParams({...query,status:filter,page:String(page)})}`).then(value => {if(current){loadedOrders.current = all;setHistory(value)}}).catch(error => {if(current)setSearchError(errorMessage(error))}).finally(()=>{if(current)setLoading(false)})
    return () => {current=false}
  },[query,filter,page,all])
  useEffect(() => {
    if (!focusOrderId || loading || busy || !history || loadedOrders.current !== all) return
    const result = document.getElementById(`order-result-${focusOrderId}`)
    if (result) { result.focus(); onResultFocused?.() }
    else if (filter !== 'all') {
      // A successful decision may move the order out of the current status view.
      setFilter('all'); setPage(1)
    }
  }, [focusOrderId, loading, busy, history, all, filter, onResultFocused])
  const orders = history?.orders ?? []
  const duplicate = (order: Order) => history?.duplicatePOs.includes(order.id) ?? false
  const counts=history?.counts ?? {}
  const count=(status:string)=>status==='all'?Object.values(counts).reduce((a,b)=>a+b,0):status==='review'?['submitted','reserving','shortfall','releasing'].reduce((n,s)=>n+(counts[s]??0),0):counts[status]??0
  async function attach(order: Order, file: File) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    let binary = ''
    for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
    await run('order.attach', { orderId: order.id, name: file.name, contentBase64: btoa(binary) })
  }
  const person = (id: string) => id.startsWith('agent:') ? 'Your agent' : id === viewer ? 'You' : history?.people[id] ?? people[id] ?? 'A former user'
  const shown = orders
  return <div className="br-stack br-orders" aria-busy={loading || busy}>
    <div className="br-heading-row"><h2>{supplier ? 'All orders' : 'Your orders'}</h2>
      <div className="br-segments" role="group" aria-label="Show orders">{filters.map(([name, status]) => <button key={name} type="button" aria-pressed={filter === status} disabled={loading} onClick={() => {setPage(1);setFilter(status)}}>{name} <span>{count(status)}</span></button>)}</div>
    </div>
    {!supplier && canPurchase && <SellThroughPlanner accounts={accounts} busy={busy} run={run} />}
    <OrderSearch />
    <div className="br-card br-stack" role="search" aria-label="Order history search">
      <h3>Find a previous order</h3>
      {([['po','Purchase order / reference','text'],['from','From date (Eastern time)','date'],['to','Through date (Eastern time)','date'],['sku','Ordered SKU','text'],['location','Delivery location','text']] as const).map(([key,label,type]) => <label key={key}>{label}<input type={type} value={query[key]} onChange={event => {setPage(1);setQuery(current => ({...current,[key]:event.target.value}))}} /></label>)}
      <button type="button" className="br-secondary" onClick={() => {setPage(1);setQuery({po:'',from:'',to:'',sku:'',location:''})}}>Clear search</button>
      {searchError && <p role="alert">{searchError}</p>}
    </div>
    {supplier&&canPurchase && <BulkConfirmations key={shown.map(order=>order.id).join(',')} orderIds={shown.map(order=>order.id)}/>}
    {loading && <p role="status">Loading order history…</p>}
    {history && <p role="status">History page {history.page} · {shown.length} orders shown</p>}
    {history && count('all')===0 && <Empty title="No orders yet">Choose products from a trade account’s catalog to prepare your first order.</Empty>}
    {history && count('all') > 0 && !shown.length && <p className="br-quiet-text">No orders in this view.</p>}
    {shown.map(order => {
      const moved = order.status==='draft' && history?.accountRevisions[order.accountId] !== order.accountRevision, units = order.lines.reduce((sum, line) => sum + Number(line.baseQuantity??line.quantity), 0)
      return <article key={order.id} className={`br-card br-order${moved ? ' br-order-moved' : ''}`}>
        <div className="br-order-main">
          <div className="br-order-meta"><span className="br-order-id">{orderNumber(order.id)}</span><span className={`br-status br-status-${order.status}`}>{order.status}</span>{byAgent(order) && <span className="br-agent-tag"><span className="br-rivet" aria-hidden="true" />Prepared by your agent</span>}{order.replaces && <span className="br-replaces">Replaces {orderNumber(order.replaces)}</span>}</div>
          <h3>{order.customerName}</h3>{order.buyingProfile&&<p>Seller: {order.buyingProfile.seller.legalName} · {order.buyingProfile.brandName} · Profile {order.buyingProfile.name} · {order.currency} · Account owner: {order.accountId}</p>}
          <p className="br-quiet-text">{when(order.preparedAt)} · {order.reference ? `Reference: ${order.reference}` : 'No customer reference'}{order.season && ` · ${order.season}`}{order.poRelease && ` · release ${order.poRelease.number} of ${orderNumber(order.poRelease.of)}`}{order.deliveryLocation && ` · ${order.deliveryLocation}`}</p>{(order.requestedDate || order.cancelAfter) && <p className="br-quiet-text">{order.requestedDate && `Requested delivery ${day(order.requestedDate)}`}{order.requestedDate && order.cancelAfter && ' · '}{order.cancelAfter && `Cancel after ${day(order.cancelAfter)}`} (Eastern time)</p>}{order.instructions && <p>Instructions: {order.instructions}</p>}{order.document && <p><a href={`/api/barrow/orders/${encodeURIComponent(order.id)}/document`} download>PO document: {order.document.name}</a> ({Math.ceil(order.document.size / 1024)} KB)</p>}
          {order.status === 'draft' && canPurchase && <label className="br-quiet-text">{order.document ? 'Replace the PO document' : 'Attach the PO document'} (PDF, PNG or JPEG, up to 1 MB)<input type="file" accept="application/pdf,image/png,image/jpeg" disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void attach(order, file) }} /></label>}{order.reorderedFrom && <p>Reordered from {orderNumber(order.reorderedFrom)}</p>}{order.quote && <p>From quote {order.quote.id} revision {order.quote.revision} at the quoted prices{order.quote.shipping && ` · Shipping: ${order.quote.shipping}`}</p>}
          {order.sellThrough && <details open={Boolean(openPlans[order.id])} onToggle={event=>{const open=event.currentTarget.open;setOpenPlans(current=>current[order.id]===open?current:{...current,[order.id]:open})}}><summary>Accepted sell-through plan</summary><section className="br-stack" aria-label="Accepted sell-through plan">
            <p>Buyer accepted this calculation for {day(order.sellThrough.requestedDate)}. It prepared one draft; submission and supplier approval remain separate.</p>
            <p>Observed {day(order.sellThrough.review.observedOn)} · {order.sellThrough.review.horizonDays} demand days · buyer seasonality {order.sellThrough.review.seasonalityBps} basis points · merchandise budget {money(order.sellThrough.review.budgetCents,order.currency??'USD')}.</p>
            {order.sellThrough.review.lines.map(line=><div className="br-card" key={line.sku}><p><strong>{line.sku}</strong> · chosen {line.quantity} {line.unit} · suggested {line.suggested??'Unknown'}</p><p>Sold {line.sold??'Unknown'} in {line.observedDays} days · on hand {line.onHand} {line.unit} · open commitments {line.openBaseQuantity} base units.</p><p>{line.explanation}</p></div>)}
            <SellThroughContact key={order.revision} order={order} canReview={supplier && canPurchase} busy={busy} run={run} />
            <p>Carrier delivery is not recorded. Dispatch is not delivery. No automatic contact or purchase is authorized by this plan.</p>
          </section></details>}
          <table className="br-order-lines"><caption className="br-sr-only">Order {orderNumber(order.id)} lines</caption><thead><tr><th scope="col">Style</th><th scope="col">Sizes</th><th scope="col">Units</th><th scope="col">Unit price</th><th scope="col">Total</th></tr></thead>
            <tbody>{orderStyles(order.lines, order.currency ?? 'AUD').map(style => <tr key={style.key}><th scope="row">{style.name}<small>{style.key}</small></th><td>{style.sizes}</td><td>{style.units}</td><td>{style.prices}</td><td>{money(style.cents, order.currency ?? 'AUD')}</td></tr>)}</tbody></table>
          {order.lines.filter(line=>line.buyerSku).map(line=><p key={`alias-${line.sku}-${line.unit ?? ''}`}>{line.sku}: buyer SKU {line.buyerSku}</p>)}
          {order.lines.filter(line=>line.promotion).map(line=><p key={'promotion:'+line.sku+':'+line.unit}>{line.sku}: {line.promotion!.offers.map(o=>o.name).join(', ')} · original promotion discount {money(line.promotion!.discountCents,order.currency??'AUD')} · net {money(line.lineCents!,order.currency??'AUD')}</p>)}
          {order.lines.filter(line=>line.pricing).map(line=><p key={JSON.stringify([line.sku,line.unit])}>{line.sku} · {line.unit}: {line.pricing!.reason} · {money(line.pricing!.lineCents,order.currency??'AUD')}</p>)}
          {moved && <p className="br-change-note"><span className="br-warn" aria-hidden="true">!</span>Prices or terms changed since this draft was written. Open it in the order pad to prepare a new draft at today’s prices.</p>}
          {order.fromSubstitution && <p>Replacement for {order.fromSubstitution.orderId}, buyer-accepted substitution {order.fromSubstitution.number}. Original and replacement lines remain linked in the commercial export.</p>}
          {order.substitutions?.map(offer=><details className="br-details" key={offer.number}><summary>Substitution {offer.number}: {offer.status}{offer.replacementId?` · replacement ${offer.replacementId}`:''}</summary><p>{offer.reason}</p><ul>{offer.lines.map((line,index)=><li key={index}>{line.fromSku}{line.fromUnit?` (${line.fromUnit})`:''} → {line.sku}: {line.quantity} {line.unit}, {money(line.unitCents)} per unit; {money(line.lineCents??line.quantity*line.unitCents)} total</li>)}</ul><p>Replacement total: {money(offer.totalCents)}. Original total: {money(order.totalCents,order.currency??'AUD')}.</p><p>{offer.delivery?`${offer.delivery.name}: ${money(offer.delivery.totalCents??0)}, ${day(offer.delivery.windowStart)}–${day(offer.delivery.windowEnd)}`:'No delivery method or delivery charge recorded.'}</p><p>{offer.taxNote}</p>{offer.declineReason&&<p>Declined: {offer.declineReason}</p>}{offer.number===order.substitutions!.at(-1)!.number && offer.status==='offered' && !supplier && canPurchase && <div className="br-actions"><button disabled={busy} onClick={()=>{if(window.confirm('Accept this exact substitution, including its quantities, units, USD prices, delivery and unverified tax difference?'))void run('substitution.accept',{orderId:order.id,number:offer.number,acknowledged:true})}}>Accept exact substitution</button><button className="br-secondary" disabled={busy} onClick={()=>{const reason=window.prompt('Why decline this substitution?');if(reason?.trim())void run('substitution.decline',{orderId:order.id,number:offer.number,reason:reason.trim()})}}>Decline substitution</button></div>}{offer.carrierDelivery&&<p>Carrier delivery at offer: {offer.carrierDelivery.original.map(p=>`${p.carrier} ${p.code}: ${p.status}; verified ${p.deliveredAt??'unknown'}; estimate ${p.estimatedDate??'unknown'}`).join('; ')||'Unknown'}. {offer.carrierDelivery.replacement}</p>}{canOperate && offer.status==='accepted' && !history?.completedReplacements.includes(offer.replacementId??'') && <button disabled={busy} onClick={()=>void run('substitution.execute',{orderId:order.id,number:offer.number})}>{order.status==='releasing'?'Retry accepted substitution':'Execute accepted substitution'}</button>}</details>)}
          {order.prebook&&<PrebookCommitment order={order} canOperate={canOperate} run={run} busy={busy}/>}
          {order.prebookRelease&&<p>Release of seasonal commitment {order.prebookRelease.orderId} · window {order.prebookRelease.windowId}</p>}
          {order.status==='approved'&&(!order.prebook||order.prebook.depositCents>0)&&finance&&<CardPaymentPanel orderId={order.id} deposit={Boolean(order.prebook)} merchant={supplier} canAct={canOperate}/>}
          {['approved','cancelled'].includes(order.status)&&!!order.invoice&&finance&&<CreditPanel order={order}/>}
          <OrderShipping order={order} supplier={canQuote} canSelect={canPurchase} busy={busy} run={run} />
          <p id={`order-result-${order.id}`} tabIndex={-1} role="status" className="br-order-explain">{order.prebook?'Seasonal commitment recorded; stock allocation is confirmed on each linked release.':order.status === 'reserving' && !order.pierOrderId ? 'Approval is recorded, but the reservation result is not confirmed. Retry the reservation for this same order.' :order.status==='approved'&&!finance?'Stock is reserved in full.':explanations[order.status]}</p>
        </div>
        <div className="br-order-side">
          <p className="br-order-amount">{money(order.totalCents, order.currency ?? 'AUD')}</p>
          <p className="br-quiet-text">{units} {order.lines.some(line=>line.baseQuantity) ? 'base units' : units === 1 ? 'unit' : 'units'} · {order.termsDays === 0 ? 'Due on receipt' : `${terms(order.termsDays)} payment terms`}</p>
          <div className="br-actions br-order-actions">
            {canPurchase&&['submitted','reserving','shortfall','approved'].includes(order.status) && <button className="br-secondary" disabled={busy} onClick={() => setReorder(order)}>Reorder selected lines</button>}
            {order.status === 'draft' && canPurchase && moved && <button disabled={busy} onClick={() => onOpen(order)}>Open in order pad</button>}
            {order.status === 'draft' && order.delivery && canPurchase && <label><input type="checkbox" checked={Boolean(deliveryAccepted[order.id+':'+order.delivery.fingerprint])} onChange={event=>setDeliveryAccepted(current=>({...current,[order.id+':'+order.delivery!.fingerprint]:event.target.checked}))} />I accept {order.delivery.name}, {money(order.delivery.totalCents??0)} delivery and handling, {day(order.delivery.windowStart)}–{day(order.delivery.windowEnd)}.</label>}
            {(order.status === 'draft'&&canPurchase||(order.status==='awaiting-company-approval'&&companyApprover)) && <OrderTerms key={`${order.accountId}:${order.buyingProfile?.id??''}`} profileId={order.buyingProfile?.id} accountId={order.accountId} supplier={supplier} onChange={choice => setTermsFor(current => ({...current,[order.id]:choice}))} />}
            {order.status === 'draft' && ['rep', 'sales-manager'].includes(order.preparedAs ?? '') && <p className="br-quiet-text">Prepared on the buyer’s behalf: the buyer reviews and submits it under the company’s own approval policy. An account with no signed-in buyer accepts the rep’s submission.</p>}
            {order.status === 'draft' && canPurchase && <button className={moved ? 'br-secondary' : undefined} disabled={busy || Boolean(termsFor[order.id]?.required && !termsFor[order.id]?.payload)} onClick={() => void run('order.submit', { orderId: order.id, termsAcceptance:termsFor[order.id]?.payload, deliveryAcknowledged:order.delivery?Boolean(deliveryAccepted[order.id+':'+order.delivery.fingerprint]):undefined })}>Submit for supplier review</button>}
            {order.status === 'draft' && canExcept && !order.stockException && (stockExceptionLimitCents===undefined||stockExceptionLimitCents>0&&order.currency==='USD'&&order.totalCents<=stockExceptionLimitCents) && <button className="br-secondary" disabled={busy} onClick={() => { const reason = window.prompt('Why accept this draft’s stock observation past the freshness limit?'); if (reason?.trim()) void run('order.stock-exception', { orderId: order.id, reason: reason.trim() }) }}>Accept stale stock observation</button>}
            {order.status === 'draft' && order.stockException && <p className="br-quiet-text">Stale stock accepted by the supplier: {order.stockException.reason}</p>}
            {order.status === 'draft' && canPurchase && duplicate(order) && <button className="br-secondary" disabled={busy || Boolean(termsFor[order.id]?.required && !termsFor[order.id]?.payload)} onClick={() => void run('order.submit', { orderId: order.id, release: true, termsAcceptance:termsFor[order.id]?.payload, deliveryAcknowledged:order.delivery?Boolean(deliveryAccepted[order.id+':'+order.delivery.fingerprint]):undefined })}>Submit as a new release of PO {order.reference}</button>}
            {order.status === 'draft' && canPurchase && !moved && <button className="br-secondary" disabled={busy} onClick={() => onOpen(order)}>Open in order pad</button>}
            {order.status==='awaiting-company-approval'&&order.approvalStatus&&<p className="br-quiet-text" data-approval-status>Approval step {order.approvalStatus.step} of {order.approvalStatus.of}: {order.approvalStatus.label} · waiting since {when(order.approvalStatus.waitingSince)} · {order.approvalStatus.approvers.map(id=>people[id]??'An approver').join(' or ')}.{order.approvalStatus.escalated?` Escalated: ${order.approvalStatus.escalateTo.map(id=>people[id]??'An approver').join(', ')} may also decide it now.`:order.approvalStatus.escalatesAt?` Escalates ${when(order.approvalStatus.escalatesAt)}.`:''}{order.approvalStatus.decided.length?` Approved so far: ${order.approvalStatus.decided.map(entry=>`${entry.label} by ${people[entry.by]??'an approver'}${entry.via==='delegate'?' (delegate)':entry.via==='escalation'?' (escalation)':''}`).join('; ')}.`:''}</p>}
            {order.status==='draft'&&order.approvalVoided&&<p className="br-quiet-text">Earlier approvals were voided: {order.approvalVoided.reason}</p>}
            {order.status==='awaiting-company-approval'&&(viewer===order.companyPreparedBy||companyManager)&&<button className="br-secondary" disabled={busy} onClick={()=>{const reason=window.prompt('Why withdraw this request? Every approval so far is void and a resubmission needs fresh approval.');if(reason?.trim())void run('order.withdraw',{orderId:order.id,revision:order.revision,reason:reason.trim()})}}>Withdraw request</button>}
            {order.status==='awaiting-company-approval'&&(order.approvalStatus?order.approvalStatus.canDecide:companyApprover&&viewer!==order.preparedBy&&viewer!==order.companyPreparedBy)&&<button disabled={busy||Boolean(termsFor[order.id]?.required&&!termsFor[order.id]?.payload)} onClick={()=>void run('order.company-approve',{orderId:order.id,revision:order.revision,reason:'Authorized company approver released this exact reviewed purchase.',termsAcceptance:termsFor[order.id]?.payload})}>Approve company purchase</button>}
            {order.companyApprovedBy&&<p>Company approval: {people[order.companyApprovedBy]??order.companyApprovedBy} · {order.companyApprovedAt}</p>}
            {!order.prebook&&!order.prebookRelease&&canPurchase && !supplier && order.status === 'submitted' && !order.delivery && <OrderRevision key={order.revision} order={order} busy={busy} run={run} />}
            {canOperate && order.status === 'submitted' && <button disabled={busy} onClick={() => void run('order.approve', { orderId: order.id })}>{order.prebook?'Accept seasonal commitment':'Approve & reserve stock'}</button>}
            {canOperate && order.status === 'reserving' && !order.pierOrderId && <button disabled={busy} onClick={() => void run('order.approve', { orderId: order.id })}>Retry stock reservation</button>}
            {canOperate && (order.status === 'shortfall' || (order.status === 'reserving' && order.pierOrderId)) && <button disabled={busy} onClick={() => void run('order.refresh', { orderId: order.id })}>Refresh stock status</button>}
            {!order.prebook&&canOperate && (order.status === 'approved' || order.status === 'shortfall') && <button className="br-secondary" disabled={busy} onClick={() => setCancel(order)}>Cancel order & release stock</button>}
            {canOperate && order.status === 'releasing' && <button disabled={busy} onClick={() => void run('order.cancel', { orderId: order.id })}>Retry stock release</button>}
            {canOperate && order.status === 'releasing' && <button className="br-secondary" disabled={busy} onClick={() => void run('order.refresh', { orderId: order.id })}>Refresh release status</button>}
            {finance&&!!order.invoice&&order.status === 'approved' && <a className="br-button" href={`/api/barrow/invoices/${encodeURIComponent(order.id)}.csv`} download>Download invoice CSV</a>}
          </div>
          <details className="br-details"><summary>Order history & Pier details</summary><dl className="br-facts br-facts-wrap"><div><dt>Prepared by</dt><dd>{person(order.preparedBy)}{order.preparedAs&&` · ${order.preparedAs==='rep'?'rep':order.preparedAs==='sales-manager'?'sales manager':'supplier'} acting for the buyer`}</dd></div>{order.submittedBy && <div><dt>Submitted by</dt><dd>{person(order.submittedBy)}</dd></div>}{order.approvedBy && <div><dt>Approved by</dt><dd>{person(order.approvedBy)}</dd></div>}{order.termsAcceptance && <div><dt>Sales terms</dt><dd>{order.termsAcceptance.title} version {order.termsAcceptance.version} · {order.termsAcceptance.how === 'buyer' ? 'accepted in the portal' : <>signature captured · <a href={`/api/barrow/orders/${encodeURIComponent(order.id)}/terms-signature`} download>signature image</a></>}{order.termsAcceptance.printedName && ` · ${order.termsAcceptance.printedName}`} · {when(order.termsAcceptance.acceptedAt)}</dd></div>}{order.approvedAt && <div><dt>Approved at</dt><dd>{when(order.approvedAt)}</dd></div>}{order.pierReference && <div><dt>Pier order</dt><dd>{order.pierReference}</dd></div>}{order.reservation && <div><dt>Reserved</dt><dd>{order.reservation.reduce((sum, line) => sum + Number(line.reserved), 0)} of {units} units</dd></div>}{order.release && <><div><dt>Cancelled by</dt><dd>{person(order.release.requestedBy)}</dd></div><div><dt>Cancelled at</dt><dd>{when(order.release.requestedAt)}</dd></div><div><dt>Reason</dt><dd>{order.release.reason}</dd></div><div><dt>Stock release</dt><dd>{order.release.confirmedAt ? `Confirmed by Pier ${when(order.release.confirmedAt)}` : 'Awaiting Pier confirmation'}</dd></div></>}{order.invoice && finance && <><div><dt>{order.release ? 'Withdrawn invoice' : 'Invoice'}</dt><dd>{order.invoice.number}</dd></div><div><dt>Issued</dt><dd>{day(order.invoice.issuedAt)}</dd></div><div><dt>Due</dt><dd>{day(order.invoice.dueAt)}</dd></div></>}</dl></details>
          {!['draft','superseded'].includes(order.status) && <OrderConfirmations key={order.revision} orderId={order.id} supplier={supplier&&canPurchase} />}
          {order.status !== 'draft' && <><ShipmentTracking order={order}/><OrderTimeline order={order} /></>}
          {supplier && !['draft','superseded'].includes(order.status) && <OrderFollowthrough key={`trace:${order.id}:${order.revision}`} order={order} run={run} />}
          {supplier&&canQuote&&<AgentProposals orderId={order.id} version={order.revision} busy={busy} run={run}/>}
        </div>
      </article>
    })}
    <div className="br-actions" aria-label="Order history pages"><button type="button" className="br-secondary" disabled={loading || page<=1} onClick={()=>setPage(current=>current-1)}>Previous history page</button><button type="button" className="br-secondary" disabled={loading || !history?.hasNext} onClick={()=>setPage(current=>current+1)}>Next history page</button></div>
    {reorder && <Reorder order={reorder} run={run} busy={busy} onClose={() => setReorder(null)} />}
    {cancel && <CancelOrder order={cancel} run={run} busy={busy} onClose={() => setCancel(null)} />}
  </div>
}
