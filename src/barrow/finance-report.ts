import { requireStaffReport } from './staff-policy'
import { creditRecords } from './credit-ledger'
// RPT-004: frozen invoice dates, verified principal allocations and applied credits.
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
 paidCents: number; appliedCreditCents: number; outstandingCents: number; paymentSources: string; creditSources: string
 overdueDays: number; bucket: FinanceBucket; invoicePath: string; orderPath: string; statementPath: string
}
export const financeColumns = ['orderId', 'accountId', 'account', 'assignedRep', 'reference', 'invoiceNumber', 'issuedAt', 'dueAt', 'currency', 'amountCents', 'paidCents', 'appliedCreditCents', 'outstandingCents', 'paymentSources', 'creditSources', 'overdueDays', 'bucket', 'invoicePath', 'orderPath', 'statementPath'] as const
const date = (value: string) => {
 const parsed = Date.parse(value + 'T00:00:00Z')
 if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value) fail('INPUT', 'As of must be a valid YYYY-MM-DD date.', 400)
 return value
}
const bucketFor = (days: number): FinanceBucket => days === 0 ? 'current' : days <= 30 ? '1-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '91+'

export async function financeReport(env: Bindings, actor: Actor, params: URLSearchParams) {
 requirePerson(actor); requireStaffReport(actor, 'finance', params); requireSupplier(actor)
 const at = await now(), timeZone = await reportZone(env.DB)
 const asOf = date(params.get('asOf') ?? calendarDate(at, timeZone))
 const filter = { accountId: params.get('accountId') ?? '', territory: params.get('territory') ?? '', assignedRep: params.get('assignedRep') ?? '' }
 const [accountRows, financial] = await Promise.all([accounts(env.DB, actor), creditRecords(env.DB)])
 const profiles = new Map(accountRows.map(account => [account.id, account.value]))
 const recorded = (instant: string) => calendarDate(new Date(instant), timeZone) <= asOf
 const records = await env.DB.prepare("SELECT value_json FROM bw_orders WHERE json_extract(value_json,'$.status')='approved' AND json_extract(value_json,'$.invoice') IS NOT NULL AND (?='' OR json_extract(value_json,'$.accountId')=?)").bind(filter.accountId,filter.accountId).all<{ value_json: string }>()
 const rows: FinanceRow[] = []
 for (const record of records.results) {
  const order = JSON.parse(record.value_json) as Order, invoice = order.invoice!, profile = profiles.get(order.accountId)
  if (!profile || invoice.issuedAt > asOf || filter.accountId && order.accountId !== filter.accountId || filter.territory && (profile.territory ?? '') !== filter.territory || filter.assignedRep && profile.assignedRep !== filter.assignedRep) continue
  // Invoice dates are frozen calendar-day snapshots; changing the reporting zone never rewrites them.
  const overdueDays = Math.max(0, Math.round((Date.parse(asOf + 'T00:00:00Z') - Date.parse(invoice.dueAt + 'T00:00:00Z')) / 86400000))
  const currency = order.currency ?? 'AUD'
  const allocations = financial.allocations.filter(row => row.accountId === order.accountId && row.orderId === order.id && row.currency === currency && recorded(row.createdAt))
  const applications = financial.applications.filter(row => row.accountId === order.accountId && row.orderId === order.id && row.currency === currency && recorded(row.createdAt))
  const paidCents = allocations.reduce((sum, row) => sum + row.amountCents, 0), appliedCreditCents = applications.reduce((sum, row) => sum + row.amountCents, 0)
  rows.push({ orderId: order.id, accountId: order.accountId, account: order.customerName, assignedRep: profile.assignedRep ?? '', reference: order.reference,
   invoiceNumber: invoice.number, issuedAt: invoice.issuedAt, dueAt: invoice.dueAt, currency, amountCents: order.totalCents, paidCents, appliedCreditCents, outstandingCents: Math.max(0, order.totalCents - paidCents - appliedCreditCents),
   paymentSources: JSON.stringify(allocations.map(row => ({ allocationId: row.id, paymentId: row.paymentId, amountCents: row.amountCents, path: `/api/barrow/payments/${row.paymentId}` }))),
   creditSources: JSON.stringify(applications.map(row => ({ applicationId: row.id, creditId: row.creditId, amountCents: row.amountCents, path: `/api/barrow/credits/${row.creditId}` }))), overdueDays, bucket: bucketFor(overdueDays),
   invoicePath: `/api/barrow/invoices/${order.id}.csv`, orderPath: `/api/barrow/orders/${order.id}`, statementPath: `/api/barrow/statements/${order.accountId}?to=${asOf}` })
 }
 rows.sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.invoiceNumber.localeCompare(b.invoiceNumber) || a.orderId.localeCompare(b.orderId))
 const totals = [...new Set(rows.map(row => row.currency))].sort().map(currency => {
  const mine = rows.filter(row => row.currency === currency)
  const buckets = Object.fromEntries(financeBuckets.map(bucket => [bucket, mine.filter(row => row.bucket === bucket).reduce((sum, row) => sum + row.outstandingCents, 0)])) as Record<FinanceBucket, number>
  return { currency, invoices: mine.length, buckets, invoicedCents: mine.reduce((sum, row) => sum + row.amountCents, 0), paidCents: mine.reduce((sum, row) => sum + row.paidCents, 0), appliedCreditCents: mine.reduce((sum, row) => sum + row.appliedCreditCents, 0), totalCents: mine.reduce((sum, row) => sum + row.outstandingCents, 0) }
 })
 const entitledOrders = new Map(rows.map(row => [row.orderId, row]))
 const refundStatus = financial.refunds.filter(refund => {
  const order = entitledOrders.get(refund.orderId)
  return order && order.accountId === refund.accountId && order.currency === refund.currency && recorded(refund.createdAt) && recorded(refund.updatedAt)
 }).map(refund => ({ id: refund.id, creditId: refund.creditId, accountId: refund.accountId, orderId: refund.orderId, paymentId: refund.paymentId, providerPaymentId: refund.providerPaymentId, providerRefundId: refund.providerRefundId ?? '', currency: refund.currency, amountCents: refund.amountCents, status: refund.status, createdAt: refund.createdAt, updatedAt: refund.updatedAt, completedAt: refund.completedAt ?? '', latestFinancialAt: refund.latestFinancialAt, path: `/api/barrow/refunds/${refund.id}`, creditPath: `/api/barrow/credits/${refund.creditId}` }))
 return { asOf, timeZone, checkedAt: at.toISOString(), filter, rows, totals,
  availableCredit: null, exposure: null, deposits: null, failedPayments: null, disputedBalances: null, refundStatus, ledgerReconciliation: null,
  notes: {
   amounts: `${statementNote} Aging buckets contain invoice principal less explicit card allocations and applied credits, never summed across currencies; original invoice cents remain separate. Amounts include recorded delivery and handling; tax is not calculated. Pending, failed and succeeded refunds do not restore invoice debt.`,
   dates: `Invoices issued on or before ${asOf}, inclusive. Frozen issue and due dates retain their original calendar-day semantics. Default as-of day uses ${timeZone}. Due today is current; overdue days are whole calendar days.`,
   unrecorded: 'Available credit and exposure (PAY-004), deposits and other payment types (PAY-003), failed payments and disputed balances (PAY-011), and ledger reconciliation (INT-002/INT-003) are not recorded. PAY-010 refunds show their latest verified status only when that snapshot is on or before the as-of day; later status snapshots are omitted.',
   access: 'Owner, admins and entitled finance staff. A rep with the finance report right reads only an account they hold today, or a territory they hold completely, through the page and CSV; another rep’s account is refused, never trimmed. Assigned rep is account metadata, not an access restriction or historical attribution.',
  },
 }
}

export async function financeCsv(env: Bindings, actor: Actor, params: URLSearchParams) {
 const report = await financeReport(env, actor, params)
 const refundColumns = ['id', 'creditId', 'accountId', 'orderId', 'paymentId', 'providerPaymentId', 'providerRefundId', 'currency', 'amountCents', 'status', 'createdAt', 'updatedAt', 'completedAt', 'latestFinancialAt', 'path', 'creditPath'] as const
 return new Response(csvText([[...financeColumns], ...report.rows.map(row => financeColumns.map(column => row[column])), [], ['refunds'], [...refundColumns], ...report.refundStatus.map(row => refundColumns.map(column => row[column])), [], ['asOf', report.asOf, 'timeZone', report.timeZone], ...Object.entries(report.notes).map(([name, note]) => [name, note])]), {
  headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="barrow-finance-${report.asOf}.csv"`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
 })
}
