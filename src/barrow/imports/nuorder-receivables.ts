import { invoiceOutstanding, creditRecords, financialGuard } from '../credit-ledger'
import { fail } from '../model'
import { canonicalJson, sha256 } from '../../modules/import-kit/src/d1/index'

export type SourceReceivable = { id: string; orderId: string; accountId: string; currency: string; balanceCents: number; target: string; disposition: string; row: number; original: Record<string, string> }
export async function planNuorderReceivables(db: D1Database, source: SourceReceivable[], errors: string[]) {
 const scope = JSON.stringify([...new Set(source.map(row => row.accountId))].sort())
 const query = 'SELECT id,account_id,value_json,revision FROM bw_orders WHERE account_id IN (SELECT value FROM json_each(?)) ORDER BY id'
 const [native, financial] = await Promise.all([db.prepare(query).bind(scope).all<{ id: string; account_id: string; value_json: string; revision: string }>(), creditRecords(db)])
 const used = new Set<string>()
 const planned = source.map(row => {
  if (row.target === 'retain-history') return { id: row.id, accountId: row.accountId, currency: row.currency, balanceCents: row.balanceCents, target: row.target, differenceCents: 0, disposition: row.disposition, authority: 'Retained source ledger only; no native invoice or collection authority' }
  const nativeRow = native.results.find(order => order.id === row.target && order.account_id === row.accountId), order = nativeRow ? JSON.parse(nativeRow.value_json) : undefined
  if (!row.target || !order?.invoice || !['approved', 'cancelled'].includes(order.status) || (order.currency ?? 'USD') !== row.currency) errors.push(`Receivable ${row.id}: map an issued native invoice in the same account and currency, or explicitly retain source history`)
  if (used.has(row.target)) errors.push(`Receivable ${row.id}: more than one source invoice maps to the same native invoice`)
  if (row.target) used.add(row.target)
  const balanceCents = order?.invoice ? invoiceOutstanding(row.target, order.totalCents, financial) : 0, differenceCents = row.balanceCents - balanceCents
  if (differenceCents && !row.disposition) errors.push(`Receivable ${row.id}: source balance ${row.balanceCents} differs from recorded native outstanding ${balanceCents} ${row.currency}; correct the mapping or record the owner's disposition`)
  return { id: row.id, accountId: row.accountId, currency: row.currency, balanceCents, target: row.target, differenceCents, disposition: row.disposition, authority: 'Native recorded invoice less allocated captured principal and applied credit; not verified unpaid by the provider' }
 })
 const totals = (rows: Array<{ currency: string; balanceCents: number }>) => [...new Set(rows.map(row => row.currency))].sort().map(currency => ({ currency, count: rows.filter(row => row.currency === currency).length, balanceCents: rows.filter(row => row.currency === currency).reduce((sum, row) => sum + row.balanceCents, 0) }))
 const snapshot = JSON.stringify(native.results.map(row => [row.id, row.account_id, row.value_json, row.revision]))
 const guards = source.length ? [db.prepare(`INSERT INTO bw_guard(value) SELECT CASE WHEN (SELECT json_group_array(json_array(id,account_id,value_json,revision)) FROM (${query}))=? THEN 1 ELSE 0 END`).bind(scope, snapshot), ...await financialGuard(db)] : []
 return { fingerprint: sha256(canonicalJson({ native: native.results, financial })), guards, report: { source: source.map(({ original, ...row }) => row), planned, sourceTotals: totals(source), plannedTotals: totals(planned), hasDifferences: planned.some(row => row.differenceCents !== 0), note: 'The supplied ledger remains source authority. Preview is read-only; activation retains the approved comparison and never issues an invoice, allocates a payment or changes native balances.' } }
}
