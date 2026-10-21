import type { Bindings } from '../auth.server'
import { fail, supplier, supplierDate, type Actor, type Order } from './model'
import { poKey } from './purchase'

type Stored = { value_json: string; revision: string; position: number }
const parse = (row: Stored): Order => ({ ...JSON.parse(row.value_json), revision: row.revision })
const statuses = ['draft', 'submitted', 'reserving', 'shortfall', 'approved', 'releasing', 'cancelled']
const live = ['submitted', 'reserving', 'shortfall', 'approved', 'releasing']
const scope = (actor: Actor) => supplier(actor) ? { sql: '', values: [] as string[] } : { sql: " AND account_id IN (SELECT id FROM bw_accounts WHERE json_extract(value_json,'$.email')=?)", values: [actor.email] }
export async function orderPeople(db: D1Database, orders: Order[]) {
 const ids = [...new Set(orders.flatMap(order => [order.preparedBy, order.submittedBy, order.approvedBy]).filter((id): id is string => typeof id === 'string' && !id.startsWith('agent:')))]
 return ids.length ? Object.fromEntries((await db.prepare('SELECT id,display_name FROM oa_operators WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(ids)).all<{id:string;display_name:string}>()).results.map(row => [row.id, row.display_name])) : {}
}
/** Original Unicode/Eastern history semantics, with bounded database batches and browser pages. */
export async function workspaceOrders(env: Bindings, actor: Actor, query: URLSearchParams, includeSuperseded = false) {
 const rawPage = query.get('page') ?? '1', status = query.get('status') ?? 'all'
 if (!/^[1-9]\d{0,5}$/.test(rawPage) || status !== 'all' && !statuses.includes(status) && status !== 'review') fail('PAGE', 'Choose a listed status and a positive page up to 999999.', 400)
 const page = Number(rawPage), pageSize = 25, visible = scope(actor)
 const from = query.get('from') || '', to = query.get('to') || ''
 for (const date of [from, to]) if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date+'T12:00:00Z')) || new Date(date+'T12:00:00Z').toISOString().slice(0,10) !== date)) fail('DATE', 'Use a valid YYYY-MM-DD history date.', 400)
 if (from && to && from > to) fail('DATE', 'The start date must precede the end date.', 400)
 const term = (key: string) => {
  const value = (query.get(key) ?? '').trim().toLocaleLowerCase('en-US')
  if (value.length > 160) fail('SEARCH', 'History search fields accept at most 160 characters.', 400)
  return value
 }
 const po = term('po'), sku = term('sku'), location = term('location')
 const where = [includeSuperseded ? '1=1' : "json_extract(value_json,'$.status') <> 'superseded'"]
 const values: string[] = [...visible.values]
 if (query.has('accountId')) { where.push('account_id=?'); values.push(query.get('accountId')!) }
 if (status !== 'all') {
  if (status === 'review') where.push("json_extract(value_json,'$.status') IN ('submitted','reserving','shortfall','releasing')")
  else { where.push("json_extract(value_json,'$.status')=?"); values.push(status) }
 }
 const predicate = where[0] + visible.sql + (where.length > 1 ? ' AND ' + where.slice(1).join(' AND ') : '')
 let position: number|null = null, matched = 0
 const orders: Order[] = []
 // Rowid keyset reads retain the original newest-inserted history order. Never collect all bodies.
 while (orders.length <= pageSize) {
  const rows: D1Result<Stored> = await env.DB.prepare(`SELECT value_json,revision,rowid AS position FROM bw_orders WHERE ${predicate}${position === null ? '' : ' AND rowid<?'} ORDER BY rowid DESC LIMIT 100`).bind(...values, ...(position === null ? [] : [position])).all<Stored>()
  for (const row of rows.results) {
   const order = parse(row), day = from || to ? supplierDate(new Date(order.preparedAt)) : ''
   if (!order.reference.toLocaleLowerCase('en-US').includes(po) || from && day < from || to && day > to || !order.lines.some(line => line.sku.toLocaleLowerCase('en-US').includes(sku)) || ![order.deliveryLocation, order.shipTo?.name, order.shipTo?.line1, order.shipTo?.city, order.shipTo?.state].some(value => (value ?? '').toLocaleLowerCase('en-US').includes(location))) continue
   if (matched++ >= (page - 1) * pageSize) orders.push(order)
   if (orders.length > pageSize) break
  }
  if (rows.results.length < 100) break
  position = rows.results.at(-1)!.position
 }
 const hasNext = orders.length > pageSize
 orders.splice(pageSize)
 const countRows = await env.DB.prepare(`SELECT json_extract(value_json,'$.status') AS status,COUNT(*) AS count FROM bw_orders WHERE json_extract(value_json,'$.status') <> 'superseded'${visible.sql} GROUP BY json_extract(value_json,'$.status')`).bind(...visible.values).all<{status:string;count:number}>()
 const counts = Object.fromEntries(countRows.results.map(row => [row.status, row.count]))
 const duplicatePOs: string[] = [], drafts = orders.filter(order => order.status === 'draft' && poKey(order.reference))
 for (const accountId of new Set(drafts.map(order => order.accountId))) {
  const refs = await env.DB.prepare("SELECT id,json_extract(value_json,'$.reference') AS reference FROM bw_orders WHERE account_id=? AND json_extract(value_json,'$.status') IN (SELECT value FROM json_each(?))").bind(accountId, JSON.stringify(live)).all<{id:string;reference:string}>()
  const keys = new Set(refs.results.map(row => poKey(row.reference)))
  for (const order of drafts.filter(order => order.accountId === accountId)) if (keys.has(poKey(order.reference))) duplicatePOs.push(order.id)
 }
 const replacementIds = orders.flatMap(order => order.substitutions?.flatMap(offer => offer.replacementId ? [offer.replacementId] : []) ?? [])
 const completedReplacements = replacementIds.length ? (await env.DB.prepare("SELECT id FROM bw_orders WHERE id IN (SELECT value FROM json_each(?)) AND json_extract(value_json,'$.status') IN ('approved','shortfall')" + visible.sql).bind(JSON.stringify(replacementIds), ...visible.values).all<{id:string}>()).results.map(row => row.id) : []
 const accountIds = [...new Set(orders.map(order=>order.accountId))]
 const accountRevisions = accountIds.length ? Object.fromEntries((await env.DB.prepare('SELECT id,revision FROM bw_accounts WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(accountIds)).all<{id:string;revision:string}>()).results.map(row=>[row.id,row.revision])) : {}
 return { orders, accountRevisions, completedReplacements, people: await orderPeople(env.DB, orders), page, pageSize, hasNext, counts, duplicatePOs }
}
/** One initial draft, chosen from the complete authorized collection, independent of the first page. */
export async function waitingDraft(db: D1Database, actor: Actor) {
 const visible = scope(actor)
 const row = await db.prepare(`SELECT o.value_json,o.revision FROM bw_orders o JOIN bw_accounts a ON a.id=o.account_id WHERE json_extract(o.value_json,'$.status')='draft'${visible.sql.replaceAll('account_id','o.account_id')} ORDER BY (json_extract(o.value_json,'$.accountRevision')<>a.revision) DESC,json_extract(o.value_json,'$.preparedAt') DESC,o.id DESC LIMIT 1`).bind(...visible.values).first<Stored>()
 return row ? parse(row) : null
}
