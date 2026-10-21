import { audit, commit } from './access'
import { attributedRep } from './rep-scope'
import { fail, integer, requirePerson, requireSupplier, supplierDate, text, type Account, type Actor, type Order } from './model'

export type CommissionRule = {
 id: string; rep: string; accountId?: string; sku?: string; from: string; to?: string
 rateBps: number; basis: 'acceptance' | 'shipment' | 'payment'; splits: { rep: string; shareBps: number }[]
}
export type CommissionSnapshot = {
 assignedRep: string; at: string; policyRevision: string | null
 lines: { line: number; rule: CommissionRule | null }[]
}
export const commissionPrecedence = 'Match the assigned rep, inclusive America/New_York effective dates and any exact account/SKU filters. Prefer more account/SKU filters, then latest start date, then the lexically smallest rule ID.'
const lexical = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
function object(value: unknown, keys: string[], name: string): Record<string, any> {
 if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) fail('COMMISSION_INPUT', `${name} must use only the declared fields.`, 400)
 return value as Record<string, any>
}
function date(value: unknown, name: string): string {
 if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value + 'T00:00:00Z')) || new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) fail('COMMISSION_INPUT', `${name} must be a real YYYY-MM-DD date.`, 400)
 return value
}
function rules(input: unknown): CommissionRule[] {
 if (!Array.isArray(input) || input.length > 100) fail('COMMISSION_INPUT', 'Supply at most 100 commission rules.', 400)
 const ids = new Set<string>()
 return input.map(value => {
  const p = object(value, ['id', 'rep', 'accountId', 'sku', 'from', 'to', 'rateBps', 'basis', 'splits'], 'Commission rule')
  const id = text(p.id, 'Rule ID', 100)
  if (ids.has(id)) fail('COMMISSION_INPUT', 'Commission rule IDs must be unique.', 400)
  ids.add(id)
  const from = date(p.from, 'Effective from'), to = p.to === undefined ? undefined : date(p.to, 'Effective through')
  if (to && to < from) fail('COMMISSION_INPUT', 'Effective through must be on or after Effective from.', 400)
  if (!['acceptance', 'shipment', 'payment'].includes(p.basis)) fail('COMMISSION_INPUT', 'Choose acceptance, shipment or payment basis.', 400)
  if (!Array.isArray(p.splits) || !p.splits.length || p.splits.length > 100) fail('COMMISSION_INPUT', 'Supply between 1 and 100 commission splits.', 400)
  const labels = new Set<string>()
  const splits = p.splits.map((value: unknown) => {
   const split = object(value, ['rep', 'shareBps'], 'Commission split'), rep = text(split.rep, 'Split rep', 160)
   if (labels.has(rep)) fail('COMMISSION_INPUT', 'Split rep labels must be unique within a rule.', 400)
   labels.add(rep)
   return { rep, shareBps: integer(split.shareBps, 'Split share basis points', 0, 10000) }
  })
  if (splits.reduce((sum: number, split: { shareBps: number }) => sum + split.shareBps, 0) !== 10000) fail('COMMISSION_INPUT', 'Split shares must total 10000 basis points.', 400)
  return { id, rep: text(p.rep, 'Assigned rep', 160), ...(p.accountId === undefined ? {} : { accountId: text(p.accountId, 'Account ID', 160) }), ...(p.sku === undefined ? {} : { sku: text(p.sku, 'SKU', 100) }), from, ...(to ? { to } : {}), rateBps: integer(p.rateBps, 'Commission rate basis points', 0, 10000), basis: p.basis, splits }
 })
}
async function settings(db: D1Database): Promise<{ revision: string | null; rules: CommissionRule[] }> {
 const row = await db.prepare("SELECT value_json,revision FROM bw_settings WHERE key='commissions'").first<{ value_json: string; revision: string }>()
 return row ? { revision: row.revision, rules: rules(JSON.parse(row.value_json)) } : { revision: null, rules: [] }
}
function policyGuard(db: D1Database, revision: string | null) {
 return db.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN COALESCE((SELECT revision FROM bw_settings WHERE key='commissions'),'')=? THEN 1 ELSE 0 END").bind(revision ?? '')
}
export async function readCommissionRules(db: D1Database, actor: Actor) {
 requirePerson(actor); requireSupplier(actor)
 return settings(db)
}
export async function saveCommissionRules(db: D1Database, actor: Actor, input: unknown) {
 requirePerson(actor); requireSupplier(actor)
 const p = object(input, ['revision', 'rules', 'reason'], 'Commission settings')
 if (p.revision !== null && (typeof p.revision !== 'string' || !p.revision.length || p.revision.length > 160)) fail('COMMISSION_INPUT', 'Supply the current revision, or null for the first policy.', 400)
 const nextRules = rules(p.rules), reason = text(p.reason, 'Commission policy reason', 1000), prior = await settings(db)
 if (p.revision !== prior.revision) fail('CHANGED', 'Commission settings changed. Refresh before saving.')
 const revision = crypto.randomUUID()
 await commit(db, actor, [policyGuard(db, prior.revision), db.prepare("INSERT INTO bw_settings(key,value_json,revision) VALUES('commissions',?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,revision=excluded.revision").bind(JSON.stringify(nextRules), revision), audit(db, actor, 'settings:commissions', 'commission.settings', { revision, source: 'commission.settings', reason })])
 return { revision, rules: nextRules }
}
/** Called only for the first approval; persist this snapshot and its policy guard atomically. */
export async function commissionSnapshot(db: D1Database, selected: Account, order: Order, approvedAt: string) {
 const at = new Date(approvedAt)
 if (!Number.isFinite(at.getTime())) fail('COMMISSION_INPUT', 'Approval needs a valid timestamp.', 400)
 const policy = await settings(db), day = supplierDate(at), assignedRep = await attributedRep(db, selected.id, day) ?? selected.value.assignedRep ?? ''
 const snapshot: CommissionSnapshot = { assignedRep, at: approvedAt, policyRevision: policy.revision, lines: order.lines.map((line, index) => {
  const matched = policy.rules.filter(rule => rule.rep === assignedRep && rule.from <= day && (!rule.to || day <= rule.to) && (!rule.accountId || rule.accountId === selected.id) && (!rule.sku || rule.sku === line.sku))
  matched.sort((a, b) => (Number(Boolean(b.accountId)) + Number(Boolean(b.sku))) - (Number(Boolean(a.accountId)) + Number(Boolean(a.sku))) || lexical(b.from, a.from) || lexical(a.id, b.id))
  return { line: index + 1, rule: matched[0] ? structuredClone(matched[0]) : null }
 }) }
 return { snapshot, guard: policyGuard(db, policy.revision) }
}
