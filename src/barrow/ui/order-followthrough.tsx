import { useState } from 'react'
import { request, errorMessage } from './api'
import { money, type Order, type RunCommand } from './types'
import { Notice } from './primitives'
import type { orderFollowthrough } from '../order-followthrough'

type Trace = Awaited<ReturnType<typeof orderFollowthrough>>
type Task = Trace['tasks'][number]

function ExceptionReview({ task, people, busy, update }: { task: Task; people: Record<string, string>; busy: boolean; update: (payload: Record<string, unknown>) => Promise<void> }) {
 const [draft, setDraft] = useState(task.nextActionDraft?.body ?? `Review ${task.title}. ${task.reason}`), [reviewed, setReviewed] = useState(false), [resolution, setResolution] = useState('')
 const [date, setDate] = useState(task.nextContactDate)
 return <article className="br-card br-stack" aria-label={task.title}>
  <h4>{task.title}</h4><p>Last recorded reason: {task.reason}</p>
  <p>{task.status} · owner {people[task.ownerId] ?? 'Former staff member'} · next contact {task.nextContactDate}</p>
  <a href={task.sourcePath}>Inspect exception source</a>
  {task.nextActionDraft && <p>Reviewed next action: {task.nextActionDraft.body} · {people[task.nextActionDraft.reviewedBy] ?? 'Former staff member'} · {task.nextActionDraft.reviewedAt}</p>}
  {task.status === 'closed' ? <p>Resolution: {task.resolution}{task.resolvedBy ? ` · ${people[task.resolvedBy] ?? 'Former staff member'} · ${task.resolvedAt}` : ' · source verified'}</p> : <>
   <label>Next contact date<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
   <button className="br-secondary" disabled={busy || !date} onClick={() => void update({ id: task.id, revision: task.revision, nextContactDate: date })}>Save contact date</button>
   <details><summary>Review next action</summary><div className="br-stack">
    <label>Next-action draft<textarea maxLength={2000} value={draft} onChange={event => { setDraft(event.target.value); setReviewed(false) }} /></label>
    <label><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />I reviewed this draft; saving sends nothing.</label>
    <button className="br-secondary" disabled={busy || !reviewed || !draft.trim()} onClick={() => void update({ id: task.id, revision: task.revision, nextActionDraft: { body: draft, reviewed: true } })}>Save reviewed next action</button>
   </div></details>
   {task.kind !== 'card-payment' && <details><summary>Record human exception resolution</summary><div className="br-stack">
    <label>Resolution reason<textarea maxLength={2000} value={resolution} onChange={event => setResolution(event.target.value)} /></label>
    <p>This resolves only this exception. It does not verify delivery, collect money or close the order.</p>
    <button className="br-secondary" disabled={busy || !resolution.trim()} onClick={() => void update({ id: task.id, revision: task.revision, close: true, resolution })}>Record attributed resolution</button>
   </div></details>}
  </>}
 </article>
}

export function OrderFollowthrough({ order, run }: { order: Order; run: RunCommand }) {
 const [trace, setTrace] = useState<Trace | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
 const load = async () => setTrace(await request<Trace>(`/api/barrow/orders/${encodeURIComponent(order.id)}/followthrough`))
 async function act(type: string, payload: Record<string, unknown>) {
  setBusy(true); setError('')
  try { await request('/api/barrow/commands', { type, payload }); await load() } catch (cause) { setError(errorMessage(cause)) } finally { setBusy(false) }
 }
 return <details className="br-details" onToggle={event => { if (event.target === event.currentTarget && event.currentTarget.open) void load().catch(cause => setError(errorMessage(cause))) }}>
  <summary>Order follow-through</summary>
  <section className="br-stack" aria-label={`Order follow-through ${order.id}`}>
   {error && <Notice error>{error}</Notice>}
   {trace && <>
    <h3>Delivery and payment trace</h3><p>Job unresolved · carrier delivery unknown · complete settlement unknown.</p>
    <p>Requested date: {trace.requestedDate ?? 'Unknown'} · inventory acknowledgment: {trace.acknowledgment ?? 'Not recorded'}</p>
    <p>Reservation identity: {trace.reservationIdentity} · stock release acknowledged: {trace.releaseAcknowledgedAt ?? 'Not recorded'}</p>
    <p>{trace.stock.reason}</p>
    {trace.stock.lines.map(line => <div className="br-card" key={line.sku}><p><strong>{line.sku}</strong> · ordered {line.ordered} {line.unit} · dispatched {line.shipped} · allocated {line.allocated} · backordered {line.backordered} · cancelled {line.cancelled}</p><p>Pier promise: {line.promisedDate ?? 'Unknown'} · warehouses: {line.warehouses.map(row => `${row.warehouse}: ${row.allocated} allocated, ${row.shipped} dispatched`).join('; ') || 'Unknown'} · unassigned backorder {line.unassignedBackorder}</p></div>)}
    {trace.linked.length > 0 && <><h4>Linked commitment and releases</h4><ul>{trace.linked.map(item => <li key={item.id}><a href={item.path}>{item.id}</a> · {item.status} · window {item.windowId ?? 'Commitment'} · acknowledgment {item.acknowledgment ?? 'Unknown'} · requested {item.requestedDate ?? 'Unknown'} · invoice {item.invoice?.number ?? 'Not issued'}</li>)}</ul></>}
    <p>Invoice: {trace.invoice ? `${trace.invoice.number} · ${money(trace.invoice.amountCents, trace.invoice.currency)} · issued ${trace.invoice.issuedAt} · due ${trace.invoice.dueAt}` : 'Not issued'}</p>
    <h4>Recorded card events</h4>{!trace.payments.length && <p>No permitted card records. Absence is not settlement evidence.</p>}
    {trace.payments.map(payment => <article className="br-card br-stack" key={payment.id}><a href={payment.path}>Card record {payment.id}</a><p>{payment.state} · principal {money(payment.amountCents, payment.currency as 'USD')} · surcharge {money(payment.surchargeCents, payment.currency as 'USD')}</p><ul>{payment.events.map(event => <li key={event.id}>{event.state} · verified {event.verifiedAt} · source {event.id}</li>)}</ul></article>)}
    <div className="br-actions"><button className="br-secondary" disabled={busy} onClick={() => void act('followup.refresh', {})}>Refresh order exceptions</button>{trace.canRecover && trace.nextActions.map(action => <button key={action.type} disabled={busy} onClick={() => { setBusy(true); void run(action.type, { orderId: trace.orderId }).then(() => load()).catch(cause => setError(errorMessage(cause))).finally(() => setBusy(false)) }}>{action.label}</button>)}</div>
    {trace.tasks.map(task => <ExceptionReview key={`${task.id}:${task.revision}`} task={task} people={trace.people} busy={busy} update={payload => act('followup.update', payload)} />)}
    {!trace.tasks.length && <p>No recorded exceptions for this order. Refresh reconciles available sources; missing sources never prove completion.</p>}
    <p>{trace.note}</p>
   </>}
  </section>
 </details>
}
