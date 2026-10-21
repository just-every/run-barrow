import { requireStaffReport } from './staff-policy'
// RPT-001: account and product sales over today's records, one row per order line so every figure drills to its
// document. Amounts are integer cents in each order's recorded currency and are never summed across currencies.
// Booked is the line of a submitted order (cancelled orders excluded); shipped is Pier's dispatched base units valued
// at the line's average base-unit price; invoiced is the line of an invoiced order. Barrow records no payments or credit
// notes yet, so paid and credited read "not recorded" and outstanding is the invoiced amount, labelled as such
// (PAY-003 and PAY-010 add them). Merchandise amounts exclude tax; delivery plus handling is shown once on the first product line in separate freight columns.
import type { Bindings } from '../auth.server'
import { accounts } from './accounts'
import { csvText } from './cart-csv'
import { now } from './clock'
import { fail, requirePerson, requireSupplier, type Actor, type Line, type Order } from './model'
import { pierOrigin, pierState } from './pier'
import { calendarDate, reportZone } from './report-zone'
import { statementNote } from './statements'

const booked = ['submitted', 'reserving', 'shortfall', 'approved', 'releasing']
const half = (numerator: bigint, denominator: bigint) => Number((numerator + denominator / 2n) / denominator)
const micro = (value: string | number) => BigInt(Math.round(Number(value) * 1_000_000))
const day = (value: string | null, name: string) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value ? value : fail('INPUT', `${name} must be a YYYY-MM-DD date.`, 400)
const shift = (date: string, days: number) => new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10)
export const salesColumns = ['orderId', 'line', 'accountId', 'account', 'channel', 'territory', 'rep', 'sku', 'name', 'currency', 'bookedDate', 'status', 'quantity', 'unit', 'bookedCents', 'shippedBaseQuantity', 'shippedCents', 'invoiceNumber', 'invoicedCents', 'paidCents', 'creditedCents', 'outstandingCents', 'freightCents', 'invoicedFreightCents', 'orderPath', 'invoicePath'] as const
type Row = Record<(typeof salesColumns)[number], string | number | null>

export async function salesReport(env: Bindings, actor: Actor, params: URLSearchParams) {
 requirePerson(actor); requireStaffReport(actor, 'sales', params); requireSupplier(actor)
 const at = await now(), zone = await reportZone(env.DB), today = calendarDate(at, zone)
 const to = day(params.get('to'), 'To') ?? today, from = day(params.get('from'), 'From') ?? shift(to, -89)
 if (from > to) fail('INPUT', 'From must not be after To.', 400)
 const filter = { accountId: params.get('accountId') ?? '', channel: params.get('channel') ?? '', territory: params.get('territory') ?? '', sku: (params.get('sku') ?? '').toUpperCase() }
 const list = await accounts(env.DB, actor), byId = new Map(list.map(row => [row.id, row.value]))
 const orders = (await env.DB.prepare("SELECT value_json FROM bw_orders WHERE (?='' OR json_extract(value_json,'$.accountId')=?) ORDER BY rowid").bind(filter.accountId,filter.accountId).all<{ value_json: string }>()).results.map(row => JSON.parse(row.value_json) as Order)
  .filter(order => booked.includes(order.status)).filter(order => { const date = calendarDate(new Date(order.preparedAt), zone); return date >= from && date <= to })
 // Shipped quantities are Pier's; when Pier does not answer they are unknown, never zero.
 let state: any, shipments: 'read' | 'unavailable' = 'read'
 try { state = await pierState(env) } catch { shipments = 'unavailable' }
 const origin = shipments === 'read' ? await pierOrigin(env) : undefined
 const rows: Row[] = []
 for (const order of orders) {
  const profile = byId.get(order.accountId)
  if (!profile) continue
  if ((filter.accountId && order.accountId !== filter.accountId) || (filter.channel && (profile.channel ?? '') !== filter.channel) || (filter.territory && (profile.territory ?? '') !== filter.territory)) continue
  const dispatched = shipments === 'read' && order.pierOrderId && order.pierOrigin === origin ? (state.shipments ?? []).filter((row: any) => row.orderId === order.pierOrderId).flatMap((row: any) => row.lines ?? []) : undefined
  order.lines.forEach((line: Line, index) => {
   if (filter.sku && line.sku.toUpperCase() !== filter.sku) return
   const first = order.lines.findIndex(other => other.itemId === line.itemId) === index, cents = line.lineCents ?? 0
   const units = dispatched && first ? dispatched.filter((row: any) => row.itemId === line.itemId).reduce((sum: bigint, row: any) => sum + micro(row.quantity), 0n) : dispatched ? 0n : null
   const invoiced = order.invoice ? cents : 0
   rows.push({ orderId: order.id, line: index + 1, accountId: order.accountId, account: order.customerName, channel: profile.channel ?? '', territory: profile.territory ?? '', rep: profile.assignedRep ?? '', sku: line.sku, name: line.name, currency: order.currency ?? 'AUD', bookedDate: calendarDate(new Date(order.preparedAt), zone), status: order.status, quantity: String(line.quantity), unit: line.unit ?? '',
    bookedCents: cents, shippedBaseQuantity: units === null ? null : String(Number(units) / 1_000_000), shippedCents: units === null ? null : half(units * BigInt(cents), micro(line.baseQuantity ?? line.quantity)),
    invoiceNumber: order.invoice?.number ?? '', invoicedCents: invoiced, paidCents: null, creditedCents: null, outstandingCents: invoiced, freightCents:index===0?(order.delivery?.totalCents??0):0, invoicedFreightCents:index===0&&order.invoice?(order.delivery?.totalCents??0):0, orderPath: `/api/barrow/orders/${order.id}`, invoicePath: order.invoice ? `/api/barrow/invoices/${order.id}.csv` : '' })
  })
 }
 const sum = (list: Row[], key: 'bookedCents' | 'shippedCents' | 'invoicedCents' | 'outstandingCents' | 'freightCents' | 'invoicedFreightCents') => list.some(row => row[key] === null) ? null : list.reduce((total, row) => total + Number(row[key]), 0)
 const totals = (list: Row[]) => [...new Set(list.map(row => String(row.currency)))].sort().map(currency => { const mine = list.filter(row => row.currency === currency); return { currency, lines: mine.length, orders: new Set(mine.map(row => row.orderId)).size, bookedCents: sum(mine, 'bookedCents'), shippedCents: sum(mine, 'shippedCents'), invoicedCents: sum(mine, 'invoicedCents'), paidCents: null, creditedCents: null, outstandingCents: sum(mine, 'outstandingCents'), freightCents:sum(mine,'freightCents'), invoicedFreightCents:sum(mine,'invoicedFreightCents') } })
 const group = (key: (row: Row) => string) => [...new Set(rows.map(key))].sort().map(name => ({ name, totals: totals(rows.filter(row => key(row) === name)) }))
 return {
  checkedAt: at.toISOString(), from, to, timeZone: zone, filter, shipments, rows, totals: totals(rows),
  byAccount: group(row => String(row.account)), bySku: group(row => String(row.sku)), byChannel: group(row => String(row.channel) || 'No channel'), byTerritory: group(row => String(row.territory) || 'No territory'), byMonth: group(row => String(row.bookedDate).slice(0, 7)),
  notes: {
   period: `Orders count by preparation date, inclusive calendar days ${from} to ${to} in ${zone}. Draft, replaced and cancelled orders are not booked.`,
   amounts: 'Integer cents in each order’s recorded currency, never added across currencies. Merchandise amounts exclude delivery and tax. Freight includes delivery and handling once per order, shown on its first product line. A product filter includes freight only when it includes that line. Add invoiced freight to merchandise invoiced or outstanding to reconcile the invoice. Tax is not calculated.',
   shipped: shipments === 'read' ? 'Pier’s dispatched base units, valued at the line’s average base-unit price, rounded half up once per line.' : 'Pier did not answer: shipped amounts are unknown.',
   payments: `${statementNote} Paid and credited are not recorded until PAY-003 and PAY-010; outstanding is the invoiced amount.`,
   season: 'Barrow has no seasons or prebooks yet; CAT-008 and ORD-008 add season and prebook rows to this report.',
   access: 'Owner, admins and all-account managers read every account. A rep reads only one account they hold today (assignment or temporary coverage) or a territory they hold completely; any other account or territory is refused, never trimmed.',
  },
 }
}

export async function salesCsv(env: Bindings, actor: Actor, params: URLSearchParams) {
 const report = await salesReport(env, actor, params)
 return new Response(csvText([[...salesColumns], ...report.rows.map(row => salesColumns.map(column => row[column] ?? 'not recorded'))]), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="barrow-sales.csv"', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } })
}
