import type { Bindings } from '../auth.server'
import { account } from './accounts'
import { audit, changed, commit } from './access'
import { commercialAuditEvent } from './audit-event'
import { now } from './clock'
import { companyMembership, companyLocationAllowed, companyRightsGuard } from './company-policy'
import { creditRecords, financialGuard, invoiceOutstanding } from './credit-ledger'
import type { FollowupValue } from './followups'
import { fail, integer, requirePerson, requireSupplier, text, type Actor, type Order } from './model'
import { calendarDate, reportZone } from './report-zone'
import { readStaffGrant, staffAccountAllowed, staffGuard } from './staff-policy'

type State = 'open' | 'missed' | 'satisfied' | 'resolved' | 'withdrawn'
type Pause = { until: string; reason: string; by: string; at: string }
type Event = { action: string; by: string; at: string; reason: string; revision: string; amountCents: number; currency: string; dueDate: string; timeZone: string; sourceRevision: string; buyerId: string; baselineAllocationIds: string[]; pause?: Pause; allocationIds?: string[] }
export type PaymentPromise = {
 id: string; accountId: string; orderId: string; invoiceNumber: string; buyerId: string
 amountCents: number; currency: string; dueDate: string; timeZone: string; sourceRevision: string
 baselineAllocationIds: string[]; state: State; createdAt: string; updatedAt: string; revision: string
 pause?: Pause; history: Event[]; restored?: boolean
}
type Stored = { value_json: string; revision: string }
const parse = (row: Stored): PaymentPromise => ({ ...JSON.parse(row.value_json), revision: row.revision })
const active = (p: PaymentPromise) => p.state === 'open' || p.state === 'missed'
export const promiseTaskId = (id: string) => `payment-promise:${id}`
function authority(actor: Actor) {
 requirePerson(actor); requireSupplier(actor)
 if (actor.staff && actor.staff.role !== 'finance') fail('FORBIDDEN', 'Only current account-scoped finance staff, owners and admins manage buyer promises.', 403)
}
function validDay(value: unknown) {
 if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value + 'T00:00:00Z')) || new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) fail('INPUT', 'Use a valid YYYY-MM-DD supplier-calendar date.', 400)
 return value
}
export async function paymentPromiseRows(db: D1Database) {
 return (await db.prepare('SELECT value_json,revision FROM bw_payment_promises ORDER BY id').all<Stored>()).results.map(parse)
}
const sourceGuard = (db: D1Database, table: string, id: string, revision: string) => db.prepare(`INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM ${table} WHERE id=? AND revision=?) THEN 1 ELSE 0 END`).bind(id, revision)
async function buyerPeople(db: D1Database, order: Order) {
 const people = (await db.prepare("SELECT p.id,p.email,p.role,p.version,p.display_name AS name FROM oa_operators p JOIN bw_company_members m ON m.user_id=p.id WHERE m.account_id=? AND m.state='active' AND m.erased_at IS NULL AND p.status='active' AND p.role='member' ORDER BY p.id").bind(order.accountId).all<Actor & { name: string }>()).results
 const allowed = []
 for (const person of people) {
  const member = await companyMembership(db, { ...person, agent: false }, order.accountId)
  if (member && companyLocationAllowed(member, order.shipTo?.id)) allowed.push({ id: person.id, name: person.name, member })
 }
 return allowed
}
async function taskOwner(env: Bindings, accountId: string, preferred?: string) {
 const people = (await env.DB.prepare("SELECT id,email,role,version FROM oa_operators WHERE status='active' AND role IN ('owner','admin','member') ORDER BY role='owner' DESC,email=? DESC,created_at,id").bind(env.OWNER_EMAIL ?? '').all<Actor>()).results
 const candidates = []
 for (const person of people) {
  const actor = { ...person, agent: false }, grant = await readStaffGrant(env.DB, actor)
  if (['owner', 'admin'].includes(person.role) || grant?.role === 'finance' && staffAccountAllowed(grant, accountId)) candidates.push({ ...actor, grant })
 }
 const owner = candidates.find(person => person.id === preferred) ?? candidates[0]
 if (!owner) fail('PROMISE_OWNER', 'An active supplier owner or authorized finance person must own the promise task.', 409)
 const guard = owner.grant ? staffGuard(env.DB, owner.grant) : env.DB.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND status='active' AND role IN ('owner','admin')) THEN 1 ELSE 0 END").bind(owner.id, owner.version)
 return { id: owner.id, guard }
}
async function verifiedAllocations(db: D1Database, promise: Pick<PaymentPromise, 'accountId' | 'orderId' | 'currency'>) {
 const rows = (await db.prepare('SELECT a.value_json,p.value_json AS payment_json FROM bw_card_allocations a JOIN bw_card_payments p ON p.id=a.payment_id WHERE a.account_id=? AND a.order_id=?').bind(promise.accountId, promise.orderId).all<{ value_json: string; payment_json: string }>()).results
 return rows.flatMap(row => {
  const allocation = JSON.parse(row.value_json), payment = JSON.parse(row.payment_json)
  return allocation.accountId === promise.accountId && allocation.orderId === promise.orderId && allocation.currency === promise.currency && payment.id === allocation.paymentId && payment.accountId === promise.accountId && payment.currency === promise.currency && payment.state === 'captured' && payment.capturedAt && payment.providerPaymentId && Number.isSafeInteger(allocation.amountCents) && allocation.amountCents > 0 && allocation.amountCents <= payment.amountCents ? [allocation as { id: string; amountCents: number }] : []
 })
}
async function paymentGuard(db: D1Database) {
 const query = 'SELECT json_group_array(json_array(id,value_json,revision)) AS snapshot FROM (SELECT id,value_json,revision FROM bw_card_payments ORDER BY id)'
 const snapshot = (await db.prepare(query).first<{ snapshot: string }>())!.snapshot
 return db.prepare(`INSERT INTO bw_guard(value) SELECT CASE WHEN (${query.replace(' AS snapshot', '')})=? THEN 1 ELSE 0 END`).bind(snapshot)
}
function event(p: PaymentPromise, action: string, by: string, at: string, reason: string, allocationIds?: string[]): Event {
 return { action, by, at, reason, revision: p.revision, amountCents: p.amountCents, currency: p.currency, dueDate: p.dueDate, timeZone: p.timeZone, sourceRevision: p.sourceRevision, buyerId: p.buyerId, baselineAllocationIds: [...p.baselineAllocationIds], ...(p.pause ? { pause: p.pause } : {}), ...(allocationIds ? { allocationIds } : {}) }
}
async function taskStatements(env: Bindings, p: PaymentPromise, at: string) {
 const db = env.DB, id = promiseTaskId(p.id), row = await db.prepare('SELECT value_json,revision FROM bw_followups WHERE id=?').bind(id).first<Stored>()
 const prior = row ? JSON.parse(row.value_json) as FollowupValue : null
 const owner = await taskOwner(env, p.accountId, prior?.ownerId), closed = !active(p)
 const resolution = closed ? p.history.at(-1)?.reason : undefined
 const value: FollowupValue = { ...prior, id, kind: 'payment-promise', accountId: p.accountId, sourceId: p.id, sourcePath: `/api/barrow/payment-promises?accountId=${encodeURIComponent(p.accountId)}`, title: `${p.state === 'missed' ? 'Missed promise' : 'Buyer promise'} ${p.invoiceNumber}`, reason: `${p.currency} ${p.amountCents} minor units promised by ${p.dueDate} (${p.timeZone}).${p.pause ? ` Approved collection pause through ${p.pause.until}; this is not a provider dispute.` : ''}`, priority: p.state === 'missed' ? 1 : 2, createdAt: prior?.createdAt ?? at, ownerId: owner.id, nextContactDate: prior?.nextContactDate ?? p.dueDate, status: closed ? 'closed' : 'open', contacts: prior?.contacts ?? [], ...(resolution ? { resolution } : { resolution: undefined }) }
 const revision = crypto.randomUUID()
 return [owner.guard, row ? db.prepare('UPDATE bw_followups SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify(value), revision, id, row.revision) : db.prepare('INSERT INTO bw_followups(id,account_id,value_json,revision) VALUES(?,?,?,?)').bind(id, p.accountId, JSON.stringify(value), revision), changed(db)]
}
export async function readPaymentPromises(env: Bindings, actor: Actor, params: URLSearchParams) {
 authority(actor)
 const accountId = text(params.get('accountId'), 'Trade account')
 const selected = await account(env.DB, actor, accountId)
 const rows = (await env.DB.prepare("SELECT value_json,revision FROM bw_orders WHERE account_id=? AND json_extract(value_json,'$.invoice') IS NOT NULL ORDER BY id").bind(accountId).all<Stored>()).results.map(row => ({ ...JSON.parse(row.value_json), revision: row.revision }) as Order)
 const financial = await creditRecords(env.DB)
 const invoices = await Promise.all(rows.filter(order => order.status === 'approved').map(async order => ({ orderId: order.id, invoiceNumber: order.invoice!.number, sourceRevision: order.revision, currency: order.currency ?? 'AUD', outstandingCents: invoiceOutstanding(order.id, order.totalCents, financial), buyers: (await buyerPeople(env.DB, order)).map(({ id, name }) => ({ id, name })) })))
 return { accountId, account: selected.value.name, timeZone: await reportZone(env.DB), promises: (await paymentPromiseRows(env.DB)).filter(p => p.accountId === accountId), invoices }
}
export async function paymentPromiseCommand(env: Bindings, actor: Actor, type: string, input: any) {
 authority(actor)
 const accountId = text(input.accountId, 'Trade account'), selected = await account(env.DB, actor, accountId)
 if (selected.value.lifecycle === 'closed') fail('PROMISE_ACCOUNT', 'Closed accounts cannot create or change collection work.', 409)
 if (type === 'promise.refresh') { await reconcilePaymentPromises(env, actor, accountId); return readPaymentPromises(env, actor, new URLSearchParams({ accountId })) }
 const orderId = text(input.orderId, 'Invoice order'), id = `promise-${orderId}`
 const row = await env.DB.prepare('SELECT value_json,revision FROM bw_payment_promises WHERE id=? AND account_id=?').bind(id, accountId).first<Stored>()
 const before = row ? parse(row) : null
 if (before?.restored) fail('RESTORED', 'Restored promises are retained history and cannot resume collection work.', 409)
 if (input.revision !== (before?.revision ?? null)) fail('REVISION', 'The promise changed. Reload before recording a decision.', 409)
 const source = await env.DB.prepare('SELECT value_json,revision FROM bw_orders WHERE id=? AND account_id=?').bind(orderId, accountId).first<Stored>()
 const order = source ? { ...JSON.parse(source.value_json), revision: source.revision } as Order : null
 if (!order?.invoice) fail('PROMISE_SOURCE', 'The named invoice source is missing; keep the task unresolved.', 409)
 const at = (await now()).toISOString(), revision = crypto.randomUUID(), reason = text(input.reason, 'Decision reason', 1000)
 const guards: D1PreparedStatement[] = [sourceGuard(env.DB, 'bw_accounts', accountId, selected.revision), sourceGuard(env.DB, 'bw_orders', orderId, order.revision)]
 let value: PaymentPromise
 if (type === 'promise.record' || type === 'promise.revise') {
  if (type === 'promise.record' && before || type === 'promise.revise' && !before) fail('PROMISE_STATE', 'Record a new promise or revise the existing invoice promise.', 409)
  if (order.status !== 'approved' || input.sourceRevision !== order.revision) fail('REVISION', 'Review the current approved invoice revision.', 409)
  const timeZone = await reportZone(env.DB), dueDate = validDay(input.dueDate), amountCents = integer(input.amountCents, 'Promised minor units', 1)
  if (input.currency !== (order.currency ?? 'AUD')) fail('PROMISE_CURRENCY', 'Use the exact invoice currency.', 409)
  guards.push(...await financialGuard(env.DB), await paymentGuard(env.DB))
  if (amountCents > invoiceOutstanding(order.id, order.totalCents, await creditRecords(env.DB))) fail('PROMISE_AMOUNT', 'The promise exceeds this invoice’s outstanding principal.', 409)
  const buyer = (await buyerPeople(env.DB, order)).find(person => person.id === input.buyerId)
  if (!buyer) fail('PROMISE_BUYER', 'Name a current buyer of this invoice’s company and location.', 400)
  guards.push(companyRightsGuard(env.DB, buyer.member))
  value = { id, accountId, orderId, invoiceNumber: order.invoice.number, buyerId: buyer.id, amountCents, currency: order.currency ?? 'AUD', dueDate, timeZone, sourceRevision: order.revision, baselineAllocationIds: (await verifiedAllocations(env.DB, { accountId, orderId, currency: order.currency ?? 'AUD' })).map(a => a.id), state: 'open', createdAt: before?.createdAt ?? at, updatedAt: at, revision, history: before?.history ?? [], ...(before?.pause ? { pause: before.pause } : {}) }
 } else {
  if (!before || !active(before)) fail('PROMISE_STATE', 'Only an open or missed promise can be withdrawn, paused or resolved.', 409)
  value = { ...before, revision, updatedAt: at }
  if (type === 'promise.withdraw') value.state = 'withdrawn'
  else if (type === 'promise.resolve') value.state = 'resolved'
  else if (type === 'promise.pause') {
   if (input.pause === null) delete value.pause
   else { const until = validDay(input.pause?.until); if (until < calendarDate(new Date(at), value.timeZone)) fail('PROMISE_DATE', 'The approved pause must end today or later.', 400); value.pause = { until, reason, by: actor.id, at } }
  } else fail('COMMAND', 'Unknown promise decision.', 400)
 }
 value.history = [...value.history, event(value, type, actor.id, at, reason)]
 const statements = [ ...guards, before ? env.DB.prepare('UPDATE bw_payment_promises SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify(value), revision, id, before.revision) : env.DB.prepare('INSERT INTO bw_payment_promises(id,account_id,order_id,value_json,revision) VALUES(?,?,?,?,?)').bind(id, accountId, orderId, JSON.stringify(value), revision), changed(env.DB), ...await taskStatements(env, value, at), audit(env.DB, actor, id, type, { accountId, orderId, revision, source: value.sourceRevision, reason }) ]
 await commit(env.DB, actor, statements)
 return value
}

/** Scheduled reconciliation has no outbound effect. A missing source never closes collection work. */
export async function reconcilePaymentPromises(env: Bindings, actor?: Actor, accountId?: string) {
 if (actor) authority(actor)
 const at = (await now()).toISOString(), result: { id: string; outcome: string }[] = []
 for (const before of (await paymentPromiseRows(env.DB)).filter(p => active(p) && !p.restored && (!accountId || p.accountId === accountId) && (!actor?.staff || staffAccountAllowed(actor.staff, p.accountId)))) {
  try {
   const accountRow = await env.DB.prepare('SELECT value_json,revision FROM bw_accounts WHERE id=?').bind(before.accountId).first<Stored>()
   if (!accountRow || JSON.parse(accountRow.value_json).lifecycle === 'closed') continue
   const source = await env.DB.prepare('SELECT value_json,revision FROM bw_orders WHERE id=? AND account_id=?').bind(before.orderId, before.accountId).first<Stored>()
   const order = source ? JSON.parse(source.value_json) as Order : null
   const guards = [sourceGuard(env.DB, 'bw_accounts', before.accountId, accountRow.revision), ...await financialGuard(env.DB), await paymentGuard(env.DB)]
   if (source) guards.push(sourceGuard(env.DB, 'bw_orders', before.orderId, source.revision))
   const allocations = order?.invoice?.number === before.invoiceNumber && order.currency === before.currency ? (await verifiedAllocations(env.DB, before)).filter(row => !before.baselineAllocationIds.includes(row.id)) : []
   const paid = allocations.reduce((sum, row) => sum + row.amountCents, 0) >= before.amountCents
   const missed = calendarDate(new Date(at), before.timeZone) > before.dueDate
   const state: State = paid ? 'satisfied' : missed ? 'missed' : before.state
   const task = await env.DB.prepare('SELECT value_json FROM bw_followups WHERE id=?').bind(promiseTaskId(before.id)).first<{ value_json: string }>()
   const owner = await taskOwner(env, before.accountId, task ? JSON.parse(task.value_json).ownerId : undefined)
   if (state === before.state && task && JSON.parse(task.value_json).ownerId === owner.id) continue
   const revision = crypto.randomUUID(), value: PaymentPromise = { ...before, revision, state, updatedAt: at }
   const reason = paid ? 'Matching verified allocations satisfy the promised principal.' : missed ? 'Supplier-calendar promise date passed; finance review remains owned.' : 'Reassigned to a current authorized finance owner.'
   value.history = [...value.history, event(value, `promise.${state}`, actor?.id ?? 'system:payment-promises', at, reason, paid ? allocations.map(row => row.id) : undefined)]
   const e = commercialAuditEvent(actor?.id ?? 'system:payment-promises', value.id, `promise.${state}`, { accountId: value.accountId, orderId: value.orderId, revision, source: value.sourceRevision, reason })
   const statements = [...guards, env.DB.prepare('UPDATE bw_payment_promises SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify(value), revision, value.id, before.revision), changed(env.DB), ...await taskStatements(env, value, at), env.DB.prepare(e.sql).bind(...e.params)]
   if (actor) await commit(env.DB, actor, statements)
   else await env.DB.batch([...statements, env.DB.prepare('DELETE FROM bw_guard')])
   result.push({ id: value.id, outcome: state })
  } catch (error) {
   // Another request may win the guarded revision; only that batch owns the task and event.
   if (!/bw_guard|UNIQUE constraint/.test(String(error))) throw error
  }
 }
 return result
}
