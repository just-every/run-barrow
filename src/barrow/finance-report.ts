// RPT-004: calendar-day aging of recorded invoices, not a claim about verified unpaid receivables.
import type { Bindings } from '../auth.server'
import { accounts } from './accounts'
import { csvText } from './cart-csv'
import { now } from './clock'
import { fail, requirePerson, requireSupplier, type Actor, type Order } from './model'
import { calendarDate, reportZone } from './report-zone'
import { statementNote } from './statements'

export const financeBuckets = ['current', '1-30', '31-60', '61-90', '91+'] as const
export type FinanceBucket = typeof financeBuckets[number]
export type FinanceRow = {
 orderId: string; accountId: string; account: string; assignedRep: string; reference: string
 invoiceNumber: string; issuedAt: string; dueAt: string; currency: string; amountCents: number
 overdueDays: number; bucket: FinanceBucket; invoicePath: string; orderPath: string; statementPath: string
}
export const financeColumns = ['orderId', 'accountId', 'account', 'assignedRep', 'reference', 'invoiceNumber', 'issuedAt', 'dueAt', 'currency', 'amountCents', 'overdueDays', 'bucket', 'invoicePath', 'orderPath', 'statementPath'] as const
const date = (value: string) => {
 const parsed = Date.parse(value + 'T00:00:00Z')
 if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value) fail('INPUT', 'As of must be a valid YYYY-MM-DD date.', 400)
 return value
}
const bucketFor = (days: number): FinanceBucket => days === 0 ? 'current' : days <= 30 ? '1-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '91+'

export async function financeReport(env: Bindings, actor: Actor, params: URLSearchParams) {
 requirePerson(actor); requireSupplier(actor)
 const at = await now(), timeZone = await reportZone(env.DB)
 const asOf = date(params.get('asOf') ?? calendarDate(at, timeZone))
 const filter = { accountId: params.get('accountId') ?? '', assignedRep: params.get('assignedRep') ?? '' }
 const profiles = new Map((await accounts(env.DB, actor)).map(account => [account.id, account.value]))
 const records = await env.DB.prepare("SELECT value_json FROM bw_orders WHERE json_extract(value_json,'$.status')='approved' AND json_extract(value_json,'$.invoice') IS NOT NULL").all<{ value_json: string }>()
 const rows: FinanceRow[] = []
 for (const record of records.results) {
  const order = JSON.parse(record.value_json) as Order, invoice = order.invoice!, profile = profiles.get(order.accountId)
  if (!profile || invoice.issuedAt > asOf || filter.accountId && order.accountId !== filter.accountId || filter.assignedRep && profile.assignedRep !== filter.assignedRep) continue
  // Invoice dates are frozen calendar-day snapshots; changing the reporting zone never rewrites them.
  const overdueDays = Math.max(0, Math.round((Date.parse(asOf + 'T00:00:00Z') - Date.parse(invoice.dueAt + 'T00:00:00Z')) / 86400000))
  rows.push({ orderId: order.id, accountId: order.accountId, account: order.customerName, assignedRep: profile.assignedRep ?? '', reference: order.reference,
   invoiceNumber: invoice.number, issuedAt: invoice.issuedAt, dueAt: invoice.dueAt, currency: order.currency ?? 'AUD', amountCents: order.totalCents, overdueDays, bucket: bucketFor(overdueDays),
   invoicePath: `/api/barrow/invoices/${order.id}.csv`, orderPath: `/api/barrow/orders/${order.id}`, statementPath: `/api/barrow/statements/${order.accountId}?to=${asOf}` })
 }
 rows.sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.invoiceNumber.localeCompare(b.invoiceNumber) || a.orderId.localeCompare(b.orderId))
 const totals = [...new Set(rows.map(row => row.currency))].sort().map(currency => {
  const mine = rows.filter(row => row.currency === currency)
  const buckets = Object.fromEntries(financeBuckets.map(bucket => [bucket, mine.filter(row => row.bucket === bucket).reduce((sum, row) => sum + row.amountCents, 0)])) as Record<FinanceBucket, number>
  return { currency, invoices: mine.length, buckets, totalCents: mine.reduce((sum, row) => sum + row.amountCents, 0) }
 })
 return { asOf, timeZone, checkedAt: at.toISOString(), filter, rows, totals,
  availableCredit: null, exposure: null, deposits: null, failedPayments: null, disputedBalances: null, refundStatus: null, ledgerReconciliation: null,
  notes: {
   amounts: `${statementNote} Aging buckets contain integer invoiced cents, never summed across currencies; amounts include recorded delivery and handling; tax is not calculated.`,
   dates: `Invoices issued on or before ${asOf}, inclusive. Frozen issue and due dates retain their original calendar-day semantics. Default as-of day uses ${timeZone}. Due today is current; overdue days are whole calendar days.`,
   unrecorded: 'Available credit and exposure (PAY-004), deposits and verified payments (PAY-003), refunds and credits (PAY-010), failed payments and disputed balances (PAY-011), and ledger reconciliation (INT-002/INT-003) are not recorded.',
   access: 'Owner and admins only. Assigned rep is current account metadata, not an access restriction or historical attribution; ACC-005/ACC-006 introduce scoped staff access.',
  },
 }
}

export async function financeCsv(env: Bindings, actor: Actor, params: URLSearchParams) {
 const report = await financeReport(env, actor, params)
 return new Response(csvText([[...financeColumns], ...report.rows.map(row => financeColumns.map(column => row[column])), [], ['asOf', report.asOf, 'timeZone', report.timeZone], ...Object.entries(report.notes).map(([name, note]) => [name, note])]), {
  headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="barrow-finance-${report.asOf}.csv"`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
 })
}
