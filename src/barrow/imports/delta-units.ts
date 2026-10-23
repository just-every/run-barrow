import type { Bindings } from '../../auth.server'
import type { FeedSnapshot } from '../feeds/layout'
import { fail } from '../model'
import { pierState } from '../pier'
import { validateAccountValue, stableId, type AccountValue } from './validation'

// Persist the sixth element with the before/after images: it proves which
// dependencies already existed when the owner approved the unit mapping.
type Dependencies = { orders: string; quotes: string; confirmations: string }
export type DeltaUnitChange = [string, string, AccountValue, string, AccountValue, Dependencies]
type AccountRow = { id: string; revision: string; value_json: string }
const dependencyQueries = {
 orders: 'SELECT id,revision,value_json FROM bw_orders WHERE account_id=? ORDER BY id',
 quotes: 'SELECT id,revision,value_json FROM bw_quotes WHERE account_id=? ORDER BY id',
 confirmations: 'SELECT c.order_id,c.number,c.stage,c.created_at,c.value_json FROM bw_confirmations c JOIN bw_orders o ON o.id=c.order_id WHERE o.account_id=? ORDER BY c.order_id,c.number',
}
async function dependencies(env: Bindings, id: string) {
 const rows = await Promise.all(Object.entries(dependencyQueries).map(async ([kind, query]) => {
  const values = (await env.DB.prepare(query).bind(id).all<Record<string, unknown>>()).results
  const columns = kind === 'confirmations' ? ['order_id','number','stage','created_at','value_json'] : ['id','revision','value_json']
  const snapshot = JSON.stringify(values.map(row => columns.map(column => row[column])))
  const guard = env.DB.prepare(`INSERT INTO bw_guard(value) SELECT CASE WHEN (SELECT json_group_array(json_array(${columns.join(',')})) FROM (${query}))=? THEN 1 ELSE 0 END`).bind(id, snapshot)
  return { kind, snapshot, guard, values }
 }))
 return { snapshot: Object.fromEntries(rows.map(row => [row.kind, row.snapshot])) as Dependencies, guards: rows.map(row => row.guard), orders: rows.find(row => row.kind === 'orders')!.values }
}
const accountFence = (env: Bindings, id: string, revision: string, value: string) => env.DB.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_accounts WHERE id=? AND revision=? AND value_json=?) THEN 1 ELSE 0 END').bind(id, revision, value)
const write = (env: Bindings, id: string, revision: string, value: AccountValue) => env.DB.prepare('UPDATE bw_accounts SET revision=?,value_json=? WHERE id=?').bind(revision, JSON.stringify(value), id)
function scopeIds(scope: string[]) {
 if (!Array.isArray(scope) || !scope.length || scope.length > 200 || new Set(scope).size !== scope.length) fail('DELTA_SCOPE','Select one to 200 distinct native accounts.',400)
 scope.forEach(id => stableId(id))
 return JSON.stringify([...scope].sort())
}
async function liveItems(env: Bindings): Promise<{ sku: string; unit: string; archived?: boolean }[]> {
 if (env.RER_DEMO === '1') fail('DELTA_UNITS_DEMO','Source unit activation requires a real installed Pier connection.',409)
 const state = await pierState(env)
 if (!Array.isArray(state.items)) fail('PIER_RESPONSE','Pier did not return its real item catalog.',502)
 return state.items
}
/** Preparation only. Caller commits guards, statements, custody and owner audit atomically. */
export async function prepareDeltaUnits(env: Bindings, scope: string[], feed: FeedSnapshot) {
 const ids = scopeIds(scope), products = feed?.rehearsal?.productRows
 if (feed?.consent !== true || !Array.isArray(products) || !products.length || feed.rehearsal.unresolvedErrors !== 0) fail('DELTA_UNITS','Review a valid product rehearsal before approving units.')
 if (new Set(products.map(row => row?.sku)).size !== products.length) fail('DELTA_UNITS','Product SKUs must be unique.',400)
 for (const product of products) if (!product || typeof product.sku !== 'string' || typeof product.unit !== 'string' || !['casePack','increment'].every(key => { const value = product[key as 'casePack'|'increment']; return Number.isSafeInteger(value) && value >= 1 && value <= 10000 })) fail('DELTA_UNITS','Each source product needs an exact unit and valid whole case pack and increment.',400)
 const [items, result] = await Promise.all([liveItems(env), env.DB.prepare('SELECT id,revision,value_json FROM bw_accounts WHERE id IN (SELECT value FROM json_each(?)) ORDER BY id').bind(ids).all<AccountRow>()])
 if (result.results.length !== scope.length) fail('DELTA_SCOPE','Every scoped native account must still exist.')
 const changes: DeltaUnitChange[] = [], statements: D1PreparedStatement[] = [], guards: D1PreparedStatement[] = []
 for (const row of result.results) {
  const before = JSON.parse(row.value_json) as AccountValue
  guards.push(accountFence(env,row.id,row.revision,row.value_json))
  const prices = before.prices.map(price => {
   const source = products.find(product => product.sku === price.sku)
   if (!source) return price
   const matches = items.filter(item => item.sku === price.sku && !item.archived)
   if (matches.length !== 1 || source.unit !== matches[0].unit) fail('DELTA_UNIT_MISMATCH',`${price.sku}: source unit must exactly match the unique active Pier item unit.`)
   return { ...price, casePack: source.casePack, increment: source.increment }
  })
  if (JSON.stringify(prices) === JSON.stringify(before.prices)) continue
  const after = validateAccountValue({ ...before, prices }), revision = crypto.randomUUID(), baseline = await dependencies(env,row.id)
  guards.push(...baseline.guards)
  changes.push([row.id,row.revision,before,revision,after,baseline.snapshot])
  statements.push(write(env,row.id,revision,after))
 }
 return { statements, changes, guards }
}
/** Preserve every edit or later dependency; rollback never rewrites an order. */
export async function rollbackDeltaUnits(env: Bindings, scope: string[], changes: DeltaUnitChange[]) {
 scopeIds(scope)
 const statements: D1PreparedStatement[] = [], guards: D1PreparedStatement[] = []
 const dispositions: { kind: string; id: string; disposition: string; reason: string }[] = []
 for (const [id,beforeRevision,before,afterRevision,after,baseline] of changes) {
  if (!scope.includes(id)) fail('DELTA_SCOPE','A unit rollback change is outside the cutover scope.')
  const row = await env.DB.prepare('SELECT id,revision,value_json FROM bw_accounts WHERE id=?').bind(id).first<AccountRow>()
  let reason = ''
  if (!row || row.revision !== afterRevision || JSON.stringify(JSON.parse(row.value_json)) !== JSON.stringify(after)) reason = 'A later native account edit or removal is preserved.'
  if (row) guards.push(accountFence(env,id,row.revision,row.value_json))
  else guards.push(env.DB.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM bw_accounts WHERE id=?) THEN 1 ELSE 0 END').bind(id))
  const current = await dependencies(env,id)
  guards.push(...current.guards)
  if (!baseline || Object.keys(dependencyQueries).some(key => current.snapshot[key as keyof Dependencies] !== baseline[key as keyof Dependencies])) reason = 'Later native order, quote or confirmation history depends on this account; its case pack is preserved.'
  if (current.orders.some(order => JSON.parse(String(order.value_json)).accountRevision === afterRevision)) reason = 'A native order uses the applied account revision; its case pack is preserved.'
  if (!reason) statements.push(write(env,id,beforeRevision,validateAccountValue(before)))
  dispositions.push({kind:'native-unit-mapping',id,disposition:reason?'blocked':'reversed',reason:reason || 'Restored the unchanged account before-image; no later commercial dependency exists.'})
 }
 return { statements, guards, dispositions }
}
