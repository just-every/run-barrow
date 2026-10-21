import type { Bindings } from '../auth.server'
import { fail, requirePerson, supplier, type Actor } from './model'

const pageSize = 25
const sorts: Record<string, string> = {
 newest: "json_extract(o.value_json,'$.preparedAt') DESC, o.id DESC",
 oldest: "json_extract(o.value_json,'$.preparedAt') ASC, o.id ASC",
 'ship-asc': "(json_extract(o.value_json,'$.requestedDate') IS NULL OR json_extract(o.value_json,'$.requestedDate')=''), json_extract(o.value_json,'$.requestedDate') ASC, o.id ASC",
 'ship-desc': "(json_extract(o.value_json,'$.requestedDate') IS NULL OR json_extract(o.value_json,'$.requestedDate')=''), json_extract(o.value_json,'$.requestedDate') DESC, o.id ASC",
}

/** RPT-006: filter and page in D1; never transfer the full order collection to search. */
export async function searchOrders(env: Bindings, actor: Actor, query: URLSearchParams) {
 requirePerson(actor)
 const sort = query.get('sort') ?? 'newest', rawPage = query.get('page') ?? '1'
 if (!Object.hasOwn(sorts, sort) || !/^[1-9]\d{0,5}$/.test(rawPage)) fail('SEARCH', 'Choose a listed sort and a positive page number up to 999999.', 400)
 const page = Number(rawPage), clauses = ["json_extract(o.value_json,'$.status') <> 'superseded'"], values: (string|number)[] = []
 if (!supplier(actor)) { clauses.push("json_extract(a.value_json,'$.email') = ?"); values.push(actor.email) }
 const expressions: Record<string, string[]> = {
  company: ["json_extract(o.value_json,'$.customerName')", "json_extract(a.value_json,'$.name')"],
  po: ["json_extract(o.value_json,'$.reference')"],
  externalId: ["json_extract(o.value_json,'$.pierOrderId')", "json_extract(o.value_json,'$.pierReference')", "json_extract(o.value_json,'$.invoice.number')"],
 }
 for (const key of ['company', 'po', 'externalId', 'sku']) {
  const term = (query.get(key) ?? '').trim()
  if (term.length > 160) fail('SEARCH', 'Search fields accept at most 160 characters.', 400)
  if (!term) continue
  // instr treats %, _ and quotes literally. SQLite lower provides ASCII case folding.
  if (key === 'sku') {
   clauses.push("EXISTS (SELECT 1 FROM json_each(o.value_json,'$.lines') line WHERE instr(lower(json_extract(line.value,'$.sku')),lower(?)) > 0)")
   values.push(term)
  } else {
   clauses.push('(' + expressions[key].map(expression => `instr(lower(COALESCE(${expression},'')),lower(?)) > 0`).join(' OR ') + ')')
   values.push(...expressions[key].map(() => term))
  }
 }
 const rows = await env.DB.prepare(`SELECT o.id,o.account_id,o.revision,
  json_extract(o.value_json,'$.customerName') company,json_extract(o.value_json,'$.reference') po,
  json_extract(o.value_json,'$.pierOrderId') external_id,json_extract(o.value_json,'$.pierReference') external_reference,
  json_extract(o.value_json,'$.requestedDate') ship_window,json_extract(o.value_json,'$.preparedAt') prepared_at,
  json_extract(o.value_json,'$.status') status,json_extract(o.value_json,'$.currency') currency,
  json_extract(o.value_json,'$.totalCents') total_cents
  FROM bw_orders o JOIN bw_accounts a ON a.id=o.account_id WHERE ${clauses.join(' AND ')}
  ORDER BY ${sorts[sort]} LIMIT ? OFFSET ?`).bind(...values, pageSize + 1, (page - 1) * pageSize).all<any>()
 return {
  rows: rows.results.slice(0, pageSize).map(row => ({
   id: row.id as string, revision: row.revision as string, accountId: row.account_id as string,
   company: row.company as string, po: row.po as string, externalId: (row.external_id ?? row.external_reference ?? null) as string|null,
   shipWindow: (row.ship_window || null) as string|null, preparedAt: row.prepared_at as string, status: row.status as string,
   currency: (row.currency ?? 'AUD') as 'USD'|'AUD', totalCents: row.total_cents as number,
   orderPath: `/api/barrow/orders/${encodeURIComponent(row.id)}`,
  })),
  page, pageSize, hasNext: rows.results.length > pageSize,
  tracking: 'not recorded: no connected carrier source',
 }
}
