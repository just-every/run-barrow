// REP-005: reps plan account visits and appointments, record buyer notes and a sample request, present the account's own
// collection (its priced catalogue with live Pier stock) and turn a show basket into a follow-up quote or draft order
// through the existing quote and order doors. Every visit belongs to an account the person holds today (ACC-006 scope
// through account()), and its next action is one AUTO-005 task linked to the visit, owned and reassigned like any other
// follow-up. A sample request is handed to Pier as one order.create under the durable identity barrow-sample-<visit>:
// Barrow keeps no stock ledger, and Pier's reservation result is the recorded completion acknowledgment. Handing samples
// to inventory takes the stock authority of approving an order (owner, admin, or a sales manager or operations person
// holding every warehouse).
import type { Bindings } from '../auth.server'
import { account } from './accounts'
import { audit, changed, commit } from './access'
import { now } from './clock'
import { catalogue, decimal, format, handOffSamples } from './pier'
import { fail, integer, requirePerson, requireSupplier, text, type Actor } from './model'
import { orderCommand } from './orders'
import { quoteCommand } from './quotes'
import { staffAccountAllowed } from './staff-policy'

export const visitKinds = { showroom: 'Showroom visit', 'on-site': 'On-site visit', 'trade-show': 'Trade-show appointment', call: 'Call' } as const
export type VisitKind = keyof typeof visitKinds
type Line = { sku: string; quantity: number }
type Handoff = { by: string; at: string; pierOrderId: string; pierReference: string; lines: { itemId: string; quantity: string; reserved: string }[]; acknowledged: 'reserved' | 'shortfall' }
export type Visit = {
 id: string; accountId: string; kind: VisitKind; date: string; time: string; location?: string; agenda?: string
 status: 'planned' | 'completed' | 'cancelled'; ownerId: string; createdAt: string; notes: { by: string; at: string; text: string }[]
 samples?: { lines: (Line & { itemId: string; name: string })[]; by: string; at: string; handoff?: Handoff }
 basket?: { lines: Line[]; by: string; at: string; quoteId?: string; orderId?: string }
}
const taskId = (visitId: string) => `visit:${visitId}`
const sourcePath = (visit: Pick<Visit, 'accountId'>) => `/api/barrow/visits?accountId=${encodeURIComponent(visit.accountId)}`
const day = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value ? value : fail('INPUT', 'Use a real YYYY-MM-DD visit date (Eastern time).', 400)
const clock = (value: unknown) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fail('INPUT', 'Use an HH:MM visit time (Eastern time).', 400)
function lines(input: unknown, name: string, max: number): Line[] {
 if (!Array.isArray(input) || !input.length || input.length > max) fail('LINES', `Choose between one and ${max} ${name} lines.`, 400)
 return input.map((line: any) => ({ sku: text(line?.sku, 'SKU', 80), quantity: integer(line?.quantity, 'Quantity', 1, 10000) }))
}
function requireSeller(actor: Actor) {
 requirePerson(actor); requireSupplier(actor)
 if (actor.staff && !['rep', 'sales-manager'].includes(actor.staff.role)) fail('FORBIDDEN', 'Only owner, admin, rep or sales-manager people plan visits.', 403)
}
async function load(db: D1Database, actor: Actor, id: unknown) {
 const row = await db.prepare('SELECT value_json,revision FROM bw_visits WHERE id=?').bind(text(id, 'Visit', 80)).first<{ value_json: string; revision: string }>()
 if (!row) fail('NOT_FOUND', 'Visit not found.', 404)
 const visit = JSON.parse(row.value_json) as Visit
 return { visit, revision: row.revision, selected: await account(db, actor, visit.accountId) }
}
/** The visit write, its audit and the linked task's current reason, in one batch guarded by the visit's revision. */
async function save(db: D1Database, actor: Actor, visit: Visit, revision: string, action: string, reason: string, task: { reason?: string; close?: string }) {
 const next = crypto.randomUUID(), statements = [db.prepare('UPDATE bw_visits SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify(visit), next, visit.id, revision), changed(db),
  audit(db, actor, visit.id, action, { accountId: visit.accountId, revision: next, source: action, reason })]
 if (task.reason) statements.push(db.prepare("UPDATE bw_followups SET value_json=json_set(value_json,'$.reason',?),revision=? WHERE id=? AND json_extract(value_json,'$.status')='open'").bind(task.reason, crypto.randomUUID(), taskId(visit.id)))
 if (task.close) statements.push(db.prepare("UPDATE bw_followups SET value_json=json_set(value_json,'$.status','closed','$.resolution',?),revision=? WHERE id=? AND json_extract(value_json,'$.status')='open'").bind(task.close, crypto.randomUUID(), taskId(visit.id)))
 await commit(db, actor, statements)
 return { ...visit, revision: next }
}

export async function readVisits(env: Bindings, actor: Actor, params: URLSearchParams) {
 requirePerson(actor); requireSupplier(actor)
 const accountId = params.get('accountId')
 if (accountId) await account(env.DB, actor, accountId)
 const rows = (await env.DB.prepare(`SELECT v.value_json,v.revision,f.value_json AS task FROM bw_visits v LEFT JOIN bw_followups f ON f.id='visit:'||v.id${accountId ? ' WHERE v.account_id=?' : ''} ORDER BY v.created_at DESC,v.id`).bind(...(accountId ? [accountId] : [])).all<{ value_json: string; revision: string; task: string | null }>()).results
 const visits = rows.map(row => ({ ...JSON.parse(row.value_json) as Visit, revision: row.revision, task: row.task ? (({ id, ownerId, nextContactDate, status, reason, resolution }) => ({ id, ownerId, nextContactDate, status, reason, resolution }))(JSON.parse(row.task)) : null }))
  .filter(visit => !actor.staff || staffAccountAllowed(actor.staff, visit.accountId))
 const ids = [...new Set(visits.flatMap(visit => [visit.ownerId, visit.task?.ownerId, visit.samples?.by, visit.samples?.handoff?.by, ...visit.notes.map(note => note.by)]).filter((id): id is string => Boolean(id)))]
 const people = ids.length ? Object.fromEntries((await env.DB.prepare('SELECT id,display_name FROM oa_operators WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(ids)).all<{ id: string; display_name: string }>()).results.map(row => [row.id, row.display_name])) : {}
 return { visits, people, kinds: visitKinds, notes: { stock: 'Samples move only through Pier: handing them to inventory places one Pier sales order for this account and records Pier’s reservation as the acknowledgment. Barrow keeps no stock of its own.', followup: 'Each visit has one next action on Follow-ups; assign, date and resolve it there.' } }
}

export async function visitCommand(env: Bindings, actor: Actor, type: string, p: any) {
 const at = (await now()).toISOString()
 if (type === 'visit.schedule') {
  requireSeller(actor)
  const selected = await account(env.DB, actor, text(p.accountId, 'Trade account'))
  if (!Object.keys(visitKinds).includes(p.kind)) fail('INPUT', 'Choose a showroom visit, on-site visit, trade-show appointment or call.', 400)
  const id = crypto.randomUUID(), revision = crypto.randomUUID(), kind = p.kind as VisitKind
  const visit: Visit = { id, accountId: selected.id, kind, date: day(p.date), time: clock(p.time), ...(p.location ? { location: text(p.location, 'Location', 160) } : {}), ...(p.agenda ? { agenda: text(p.agenda, 'Agenda', 1000) } : {}), status: 'planned', ownerId: actor.id, createdAt: at, notes: [] }
  const task = { id: taskId(id), kind: 'visit', accountId: selected.id, sourceId: id, sourcePath: sourcePath(visit), title: `${visitKinds[kind]} with ${selected.value.name} on ${visit.date} at ${visit.time}`, reason: `Planned ${visitKinds[kind].toLowerCase()}${visit.agenda ? `: ${visit.agenda}` : ''}.`, priority: 2, createdAt: at, ownerId: actor.id, nextContactDate: visit.date, status: 'open', contacts: [] }
  await commit(env.DB, actor, [env.DB.prepare('INSERT INTO bw_visits(id,account_id,value_json,revision,created_by,created_at) VALUES(?,?,?,?,?,?)').bind(id, selected.id, JSON.stringify(visit), revision, actor.id, at),
   env.DB.prepare('INSERT INTO bw_followups(id,account_id,value_json,revision) VALUES(?,?,?,?)').bind(task.id, selected.id, JSON.stringify(task), crypto.randomUUID()),
   audit(env.DB, actor, id, 'visit.scheduled', { accountId: selected.id, revision, source: type, reason: `Planned a ${visitKinds[kind].toLowerCase()} on ${visit.date} at ${visit.time} (Eastern time); its next action is follow-up task ${task.id}.` })])
  return { ...visit, revision }
 }
 const { visit, revision, selected } = await load(env.DB, actor, p.id)
 if (p.revision !== revision) fail('CHANGED', 'Refresh this visit before changing it.')
 if (type === 'visit.handoff') {
  requirePerson(actor); requireSupplier(actor)
  if (actor.staff && (!['sales-manager', 'operations'].includes(actor.staff.role) || actor.staff.warehouses !== 'all')) fail('FORBIDDEN', 'Handing samples to inventory needs the stock authority of approving an order.', 403)
  if (!visit.samples) fail('NO_SAMPLES', 'Record a sample request before handing it to inventory.')
  if (visit.samples.handoff) return { ...visit, revision }
  const wanted = visit.samples.lines.reduce((totals, line) => totals.set(line.itemId, (totals.get(line.itemId) ?? 0) + line.quantity), new Map<string, number>())
  const result = await handOffSamples(env, visit.id, selected.value.pierCustomerId, [...wanted].map(([itemId, quantity]) => ({ itemId, quantity: String(quantity) })))
  if (typeof result?.id !== 'string' || typeof result?.reference !== 'string' || !Array.isArray(result.lines)) fail('PIER_RESPONSE', 'Pier returned an incomplete sample order. Retry the same handoff.', 502)
  const acknowledged = [...wanted].every(([itemId, quantity]) => result.lines.some((line: any) => line.itemId === itemId && decimal(line.reserved) >= BigInt(quantity))) ? 'reserved' as const : 'shortfall' as const
  const handoff: Handoff = { by: actor.id, at, pierOrderId: result.id, pierReference: result.reference, lines: result.lines.map((line: any) => ({ itemId: line.itemId, quantity: String(line.quantity), reserved: String(line.reserved) })), acknowledged }
  const units = format(handoff.lines.reduce((sum, line) => sum + decimal(line.reserved), 0n)), asked = [...wanted.values()].reduce((sum, quantity) => sum + quantity, 0)
  const said = `Pier acknowledged sample order ${handoff.pierReference}: ${units} of ${asked} units reserved${acknowledged === 'shortfall' ? '; the rest is backordered at Pier' : ''}.`
  return save(env.DB, actor, { ...visit, samples: { ...visit.samples, handoff } }, revision, 'visit.samples-handed-off', `Handed the sample request to Pier under barrow-sample-${visit.id}. ${said}`, { reason: said })
 }
 requireSeller(actor)
 if (visit.status === 'cancelled') fail('VISIT_STATE', 'This visit was cancelled.')
 if (type === 'visit.record') {
  const note = p.note === undefined || p.note === '' ? undefined : text(p.note, 'Buyer notes', 4000)
  const status = p.status === undefined ? visit.status : ['completed', 'cancelled'].includes(p.status) && visit.status === 'planned' ? p.status as Visit['status'] : fail('VISIT_STATE', 'Only a planned visit is completed or cancelled.')
  if (!note && status === visit.status) fail('INPUT', 'Record buyer notes or the visit outcome.', 400)
  const next = { ...visit, status, notes: note ? [...visit.notes, { by: actor.id, at, text: note }] : visit.notes }
  return save(env.DB, actor, next, revision, status === 'cancelled' ? 'visit.cancelled' : status === 'completed' && visit.status !== 'completed' ? 'visit.completed' : 'visit.noted', note ? `Recorded buyer notes${status !== visit.status ? ` and the outcome ${status}` : ''}.` : `Recorded the outcome ${status}.`,
   status === 'cancelled' ? { close: 'Visit cancelled.' } : status === 'completed' && visit.status !== 'completed' ? { reason: `${visitKinds[visit.kind]} completed on ${visit.date}; set the follow-up owner and date here.` } : {})
 }
 if (type === 'visit.samples') {
  if (visit.samples?.handoff) fail('SAMPLES_HANDED_OFF', 'These samples are already with inventory; plan another visit for more.')
  const items = (await catalogue(env, selected)).items, requested = lines(p.lines, 'sample', 20).map(line => {
   const item = items.find(offer => offer.sku === line.sku)
   return item ? { ...line, itemId: item.itemId, name: item.name } : fail('SKU', `${line.sku} is not in this account’s collection.`, 400)
  })
  return save(env.DB, actor, { ...visit, samples: { lines: requested, by: actor.id, at } }, revision, 'visit.samples-requested', `Recorded a sample request: ${requested.map(line => `${line.quantity} × ${line.sku}`).join(', ')}.`, { reason: `Sample request of ${requested.length} line(s) awaits handoff to inventory.` })
 }
 if (type === 'visit.basket') {
  if (visit.basket) fail('BASKET_PREPARED', `This show basket already became ${visit.basket.quoteId ? `quote ${visit.basket.quoteId}` : `draft order ${visit.basket.orderId}`}.`)
  if (!['quote', 'order'].includes(p.prepare)) fail('INPUT', 'Prepare the show basket as a quote or a draft order.', 400)
  const basket = lines(p.lines, 'basket', 100)
  const made: any = p.prepare === 'quote' ? await quoteCommand(env, actor, 'quote.request', { accountId: visit.accountId, lines: basket }) : await orderCommand(env, actor, 'order.prepare', { accountId: visit.accountId, reference: `Visit ${visit.date}`, lines: basket })
  const link = p.prepare === 'quote' ? { quoteId: made.id as string } : { orderId: made.id as string }
  return save(env.DB, actor, { ...visit, basket: { lines: basket, by: actor.id, at, ...link } }, revision, 'visit.basket-prepared', `Turned the show basket into ${p.prepare === 'quote' ? `quote ${made.id}` : `draft order ${made.id}`}.`, { reason: `Show basket prepared as ${p.prepare === 'quote' ? `quote ${made.id}` : `draft order ${made.id}`}; follow up with the buyer.` })
 }
 fail('COMMAND', 'Unknown visit command.', 404)
}
