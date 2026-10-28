import type { Bindings } from '../auth.server'
import { now } from './clock'
import { requirePerson, requireSupplier, type Actor, type Order } from './model'
import { readOrder } from './orders'
import { pierOrigin, pierState } from './pier'
import { fulfillmentLines } from './fulfillment-lines'
import { calendarDate, reportZone } from './report-zone'
import { staffTaskAllowed } from './staff-access'
import type { FollowupSource } from './followup-sources'
import type { FollowupTask } from './followups'
import type { CardPayment } from './card-model'

export const orderTaskPath = (id: string) => `/api/barrow/orders/${id}/followthrough`
const stockAuthority = (actor: Actor) => !actor.staff || actor.staff.warehouses === 'all'
const paymentAuthority = (actor: Actor) => !actor.staff || ['sales-manager', 'rep', 'finance'].includes(actor.staff.role)

/** Current Pier facts, never a second stock ledger. A missing or mismatched source remains unknown. */
export async function orderStock(env: Bindings, order: Order, at: Date, state?: any) {
 const empty = { status: 'unknown' as const, lines: [] as ReturnType<typeof fulfillmentLines>, reason: 'The original inventory source is unavailable; no resolution is established.' }
 if (order.prebook) return { ...empty, reason: 'Seasonal commitment: inventory acknowledgment belongs to each linked release.' }
 if (!order.pierOrderId) return { ...empty, reason: 'Inventory acknowledgment is not recorded. Retry the original durable command; do not prepare a replacement order.' }
 try {
  if (order.pierOrigin !== await pierOrigin(env)) return empty
  const source = state ?? await pierState(env), upstream = source.orders?.find((row: any) => row.id === order.pierOrderId)
  if (!upstream) return empty
  const zone = await reportZone(env.DB)
  return { status: 'confirmed' as const, lines: fulfillmentLines(order, upstream, source, calendarDate(at, zone), zone), reason: 'Current quantities confirmed by Pier. Dispatch is not carrier delivery.' }
 } catch { return empty }
}

/** Reconciled with AUTO-005 only on a person's explicit refresh. */
export async function orderExceptionSources(env: Bindings, at: Date) {
 const rows = await env.DB.prepare('SELECT value_json,revision FROM bw_orders').all<{ value_json: string; revision: string }>()
 const orders = rows.results.map(row => ({ ...JSON.parse(row.value_json), revision: row.revision }) as Order).filter(order => order.approvedAt && !order.prebook)
 const candidates: FollowupSource[] = [], resolved = new Map<string, string>()
 let state: any
 try { if (orders.some(order => order.pierOrderId)) state = await pierState(env) } catch { /* Missing authority never proves resolution. */ }
 for (const order of orders) {
  const ack = `order-ack:${order.id}`, release = `order-release:${order.id}`, short = `order-shortfall:${order.id}`
  const source = (id: string, title: string, reason: string): FollowupSource => ({ id, kind: 'fulfillment', accountId: order.accountId, sourceId: order.id, sourcePath: orderTaskPath(order.id), title: `${title} ${order.reference || order.id}`, reason, priority: 1 })
  if (order.status === 'reserving' && !order.pierOrderId) candidates.push(source(ack, 'Missing inventory acknowledgment', `Original command barrow-${order.id} awaits acknowledgment. Stock and invoice eligibility remain unresolved.`))
  if (order.pierOrderId) resolved.set(ack, `Inventory acknowledgment recorded as ${order.pierOrderId}; original order ${order.id} retained.`)
  if (order.status === 'releasing' && !order.release?.confirmedAt) candidates.push(source(release, 'Missing stock release acknowledgment', `Original command barrow-release-${order.id} awaits acknowledgment. A cancellation request does not prove released stock.`))
  if (order.release?.confirmedAt) resolved.set(release, `Pier stock release acknowledged at ${order.release.confirmedAt}.`)
  if (!state) continue
  const stock = await orderStock(env, order, at, state)
  if (stock.status !== 'confirmed') continue
  const shortfalls = stock.lines.filter(line => line.backordered !== '0')
  if (shortfalls.length) candidates.push(source(short, 'Inventory shortfall', shortfalls.map(line => `${line.sku}: ${line.backordered} ${line.unit} unassigned backorder; promise ${line.promisedDate ?? 'unknown'}.`).join(' ')))
  else resolved.set(short, 'Current Pier quantities reconcile with no remaining backorder. Carrier delivery remains unknown.')
 }
 return { candidates, resolved }
}

/** Supplier trace is independent of quotes. Every financial and warehouse slice retains its existing authority. */
export async function orderFollowthrough(env: Bindings, actor: Actor, id: string) {
 requirePerson(actor); requireSupplier(actor)
 const order = await readOrder(env.DB, actor, id), checkedAt = await now()
 const stock = stockAuthority(actor) ? await orderStock(env, order, checkedAt) : { status: 'unknown' as const, lines: [], reason: 'Whole-warehouse authority is required to inspect these inventory facts.' }
 const paymentRows = paymentAuthority(actor) ? await env.DB.prepare('SELECT value_json FROM bw_card_payments WHERE order_id=? AND account_id=? ORDER BY id').bind(order.id, order.accountId).all<{ value_json: string }>() : { results: [] }
 const payments = await Promise.all(paymentRows.results.map(async row => {
  const payment = JSON.parse(row.value_json) as CardPayment
  const events = await env.DB.prepare('SELECT value_json FROM bw_card_events WHERE payment_id=? ORDER BY created_at,id').bind(payment.id).all<{ value_json: string }>()
  return { id: payment.id, path: `/api/barrow/payments/${payment.id}`, state: payment.state, currency: payment.currency, amountCents: payment.amountCents, surchargeCents: payment.surchargeCents, exception: payment.exception ?? null, events: events.results.map(row => JSON.parse(row.value_json)) }
 }))
 const taskRows = await env.DB.prepare('SELECT value_json,revision FROM bw_followups WHERE account_id=?').bind(order.accountId).all<{ value_json: string; revision: string }>()
 const tasks = taskRows.results.map(row => ({ ...JSON.parse(row.value_json), revision: row.revision }) as FollowupTask).filter(task => staffTaskAllowed(actor, task) && (task.kind === 'fulfillment' && task.sourceId === order.id || task.kind === 'card-payment' && payments.some(payment => payment.id === task.sourceId)))
 const linkedRows = await env.DB.prepare("SELECT value_json,revision FROM bw_orders WHERE account_id=? AND (id=? OR json_extract(value_json,'$.prebookRelease.orderId')=? OR id=? OR json_extract(value_json,'$.poRelease.of')=?) ORDER BY id").bind(order.accountId, order.prebookRelease?.orderId ?? '', order.prebook ? order.id : '', order.poRelease?.of ?? order.id, order.poRelease?.of ?? order.id).all<{ value_json: string; revision: string }>()
 const linked = linkedRows.results.map(row => ({ ...JSON.parse(row.value_json), revision: row.revision }) as Order).filter(item => item.id !== order.id && (!actor.staff || actor.staff.role !== 'finance' || item.invoice)).map(item => ({ label: item.prebook ? 'Seasonal commitment' : item.prebookRelease ? `Ship window ${item.prebookRelease.windowId}` : item.poRelease ? `PO release ${item.poRelease.number}` : 'Original order', releaseNumber: item.poRelease?.number ?? null, id: item.id, status: item.status, path: orderTaskPath(item.id), windowId: item.prebookRelease?.windowId ?? null, acknowledgment: item.pierOrderId ?? null, requestedDate: item.requestedDate ?? null, invoice: item.invoice ?? null }))
 const personIds = [...new Set(tasks.flatMap(task => [task.ownerId, task.resolvedBy, task.nextActionDraft?.reviewedBy].filter((id): id is string => Boolean(id))))]
 const people = Object.fromEntries((await env.DB.prepare('SELECT id,display_name FROM oa_operators WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(personIds)).all<{ id: string; display_name: string }>()).results.map(row => [row.id, row.display_name]))
 return {
  people, orderId: order.id, accountId: order.accountId, revision: order.revision, checkedAt: checkedAt.toISOString(), status: order.status,
  sourcePath: `/api/barrow/orders/${order.id}`, requestedDate: order.requestedDate ?? null,
  acknowledgment: order.pierOrderId ?? null, reservationIdentity: `barrow-${order.id}`, releaseIdentity: `barrow-release-${order.id}`, releaseAcknowledgedAt: order.release?.confirmedAt ?? null,
  stock, linked, windows: order.prebook?.windows.map(window => ({ id: window.id, name: order.prebook!.season.windows.find(item => item.id === window.id)?.name ?? window.id, promisedDate: window.estimatedDate ?? order.prebook!.season.windows.find(item => item.id === window.id)?.shipDate ?? null, releaseId: window.releaseId ?? null })) ?? [], invoice: order.invoice ? { ...order.invoice, currency: order.currency ?? 'AUD', amountCents: order.totalCents, path: `/api/barrow/invoices/${order.id}.csv` } : null,
  payments, tasks, delivery: 'unknown', settlement: 'unknown', job: 'unresolved',
  nextActions: order.status === 'reserving' && !order.pierOrderId ? [{ type: 'order.approve', label: 'Retry stock reservation' }] : order.status === 'releasing' ? [{ type: 'order.cancel', label: 'Retry stock release' }, { type: 'order.refresh', label: 'Refresh release status' }] : order.status === 'shortfall' ? [{ type: 'order.refresh', label: 'Refresh stock status' }] : [],
  canRecover: !actor.staff || ['sales-manager', 'operations'].includes(actor.staff.role) && stockAuthority(actor),
  note: 'Review drafts before acting. Revised promises, cancellations, refunds and collection messages retain their separate human approvals. A resolved payment task, dispatch, label or contact cannot establish delivery or close this job. No message is sent here.',
 }
}
