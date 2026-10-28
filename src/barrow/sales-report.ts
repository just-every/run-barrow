import { usdReporting } from './currency'
import { requireStaffReport } from './staff-policy'
import { creditRecords } from './credit-ledger'
// RPT-001: account and product sales over today's records, one row per order line so every figure drills to its
// document. Amounts are integer cents in each order's recorded currency and are never summed across currencies.
// Merchandise and delivery allocations retain exact invoice cents and original commercial weights.
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
export const salesColumns = ['orderId', 'prebookOrderId', 'bookingType', 'season', 'windowId', 'line', 'accountId', 'account', 'channel', 'territory', 'rep', 'sku', 'name', 'currency', 'bookedDate', 'status', 'quantity', 'unit', 'bookedCents', 'shippedBaseQuantity', 'shippedCents', 'invoiceNumber', 'invoicedCents', 'paidCents', 'creditedCents', 'appliedCreditCents', 'outstandingCents', 'freightCents', 'invoicedFreightCents','creditedFreightCents', 'paidFreightCents', 'appliedFreightCreditCents', 'outstandingFreightCents', 'paymentSources', 'creditSources', 'creditedSources', 'orderPath', 'invoicePath', 'usdCents', 'usdConversionDate', 'usdConversionSource', 'usdRateNumerator', 'usdRateDenominator'] as const
type Row = Record<(typeof salesColumns)[number], string | number | null>
/** Exact invoice allocation; original line order breaks equal-remainder ties, with freight last. */
function distribute(amountCents: number, weights: number[]): number[] {
 if (!Number.isSafeInteger(amountCents) || amountCents < 0 || weights.some(weight => !Number.isSafeInteger(weight) || weight < 0)) fail('REPORT_ALLOCATION', 'Invoice allocations require nonnegative integer cents.', 409)
 const total = weights.reduce((sum, weight) => sum + BigInt(weight), 0n)
 if (BigInt(amountCents) > total) fail('REPORT_ALLOCATION', 'Recorded allocations exceed the original invoice basis.', 409)
 if (!amountCents) return weights.map(() => 0)
 const shares = weights.map((weight, index) => ({ index, cents: Number(BigInt(amountCents) * BigInt(weight) / total), remainder: BigInt(amountCents) * BigInt(weight) % total }))
 const ranked = [...shares].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1)
 const extra = amountCents - shares.reduce((sum, share) => sum + share.cents, 0)
 for (let index = 0; index < extra; index++) ranked[index].cents++
 return shares.map(share => share.cents)
}

export async function salesReport(env: Bindings, actor: Actor, params: URLSearchParams) {
 requirePerson(actor); requireStaffReport(actor, 'sales', params); requireSupplier(actor)
 const at = await now(), zone = await reportZone(env.DB), today = calendarDate(at, zone)
 const to = day(params.get('to'), 'To') ?? today, from = day(params.get('from'), 'From') ?? shift(to, -89)
 if (from > to) fail('INPUT', 'From must not be after To.', 400)
 const filter = { accountId: params.get('accountId') ?? '', channel: params.get('channel') ?? '', territory: params.get('territory') ?? '', sku: (params.get('sku') ?? '').toUpperCase() }
 const [list, financial] = await Promise.all([accounts(env.DB, actor), creditRecords(env.DB)])
 const byId = new Map(list.map(row => [row.id, row.value]))
 const recorded = (instant: string) => calendarDate(new Date(instant), zone) <= to
 const orders = (await env.DB.prepare("SELECT value_json FROM bw_orders WHERE (?='' OR json_extract(value_json,'$.accountId')=?) ORDER BY rowid").bind(filter.accountId,filter.accountId).all<{ value_json: string }>()).results.map(row => JSON.parse(row.value_json) as Order)
  .filter(order => booked.includes(order.status)||order.status==='cancelled'&&financial.credits.some(credit=>credit.orderId===order.id)).filter(order => { const date = calendarDate(new Date(order.preparedAt), zone); return date >= from && date <= to })
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
  const currency = order.currency ?? 'AUD'
  const allocations = financial.allocations.filter(row => row.accountId === order.accountId && row.orderId === order.id && row.currency === currency && recorded(row.createdAt))
  const applications = financial.applications.filter(row => row.accountId === order.accountId && row.orderId === order.id && row.currency === currency && recorded(row.createdAt))
  const credits = financial.credits.filter(row => row.accountId === order.accountId && row.orderId === order.id && row.currency === currency && recorded(row.createdAt))
  const weights = [...order.lines.map(line => order.invoice ? line.lineCents ?? 0 : 0), order.invoice ? order.delivery?.totalCents ?? 0 : 0]
  const paid = distribute(allocations.reduce((sum, row) => sum + row.amountCents, 0), weights)
  const applied = distribute(applications.reduce((sum, row) => sum + row.amountCents, 0), weights.map((weight, index) => weight - paid[index]))
  const paymentSources = JSON.stringify(allocations.map(row => ({ allocationId: row.id, paymentId: row.paymentId, amountCents: row.amountCents, path: `/api/barrow/payments/${row.paymentId}` })))
  const creditSources = JSON.stringify(applications.map(row => ({ applicationId: row.id, creditId: row.creditId, amountCents: row.amountCents, path: `/api/barrow/credits/${row.creditId}` })))
  order.lines.forEach((line: Line, index) => {
   if (filter.sku && line.sku.toUpperCase() !== filter.sku) return
   const first = order.lines.findIndex(other => other.itemId === line.itemId) === index, cents = line.lineCents ?? 0
   const units = dispatched && first ? dispatched.filter((row: any) => row.itemId === line.itemId).reduce((sum: bigint, row: any) => sum + micro(row.quantity), 0n) : dispatched ? 0n : null
   const invoiced = order.invoice ? cents : 0
   const credited = credits.flatMap(credit => credit.lines.filter(entry => entry.line === index + 1).map(entry => ({ creditId: credit.id, amountCents: entry.amountCents, path: `/api/barrow/credits/${credit.id}` })))
   const freightIndex = order.lines.length
   rows.push({ ...usdReporting(order,cents), orderId: order.id, prebookOrderId:order.prebookRelease?.orderId??(order.prebook?order.id:''),bookingType:order.prebook?'prebook':order.prebookRelease?'prebook-release':'immediate',season:order.season??'',windowId:order.prebookRelease?.windowId??order.prebook?.windows.find(window=>window.lineIndexes.includes(index))?.id??'', line: index + 1, accountId: order.accountId, account: order.customerName, channel: profile.channel ?? '', territory: profile.territory ?? '', rep: profile.assignedRep ?? '', sku: line.sku, name: line.name, currency: order.currency ?? 'AUD', bookedDate: calendarDate(new Date(order.preparedAt), zone), status: order.status, quantity: String(line.quantity), unit: line.unit ?? '',
    bookedCents: order.prebookRelease?0:cents, shippedBaseQuantity: units === null ? null : String(Number(units) / 1_000_000), shippedCents: units === null ? null : half(units * BigInt(cents), micro(line.baseQuantity ?? line.quantity)),
    invoiceNumber: order.invoice?.number ?? '', invoicedCents: invoiced, paidCents: paid[index], creditedCents: credited.reduce((sum, row) => sum + row.amountCents, 0), appliedCreditCents: applied[index], outstandingCents: Math.max(0, invoiced - paid[index] - applied[index]), freightCents:index===0?(order.delivery?.totalCents??0):0, invoicedFreightCents:index===0&&order.invoice?(order.delivery?.totalCents??0):0, creditedFreightCents:index===0?credits.reduce((sum,credit)=>sum+(credit.freightCents??0),0):0,paidFreightCents:index===0?paid[freightIndex]:0, appliedFreightCreditCents:index===0?applied[freightIndex]:0, outstandingFreightCents:index===0?Math.max(0, weights[freightIndex] - paid[freightIndex] - applied[freightIndex]):0, paymentSources, creditSources, creditedSources:JSON.stringify(credited), orderPath: `/api/barrow/orders/${order.id}`, invoicePath: order.invoice ? `/api/barrow/invoices/${order.id}.csv` : '' })
  })
 }
 const sum = (list: Row[], key: 'bookedCents' | 'shippedCents' | 'invoicedCents' | 'paidCents' | 'creditedCents' | 'appliedCreditCents' | 'outstandingCents' | 'freightCents' | 'invoicedFreightCents' | 'creditedFreightCents' | 'paidFreightCents' | 'appliedFreightCreditCents' | 'outstandingFreightCents') => list.some(row => row[key] === null) ? null : list.reduce((total, row) => total + Number(row[key]), 0)
 const totals = (list: Row[]) => [...new Set(list.map(row => String(row.currency)))].sort().map(currency => { const mine = list.filter(row => row.currency === currency); return { currency, lines: mine.length, orders: new Set(mine.map(row => row.orderId)).size, bookedCents: sum(mine, 'bookedCents'), shippedCents: sum(mine, 'shippedCents'), invoicedCents: sum(mine, 'invoicedCents'), paidCents: sum(mine, 'paidCents'), creditedCents: sum(mine, 'creditedCents'), appliedCreditCents: sum(mine, 'appliedCreditCents'), outstandingCents: sum(mine, 'outstandingCents'), freightCents:sum(mine,'freightCents'), invoicedFreightCents:sum(mine,'invoicedFreightCents'), creditedFreightCents:sum(mine,'creditedFreightCents'),paidFreightCents:sum(mine,'paidFreightCents'), appliedFreightCreditCents:sum(mine,'appliedFreightCreditCents'), outstandingFreightCents:sum(mine,'outstandingFreightCents') } })
 const group = (key: (row: Row) => string) => [...new Set(rows.map(key))].sort().map(name => ({ name, totals: totals(rows.filter(row => key(row) === name)) }))
 return {
  checkedAt: at.toISOString(), from, to, timeZone: zone, filter, shipments, rows, totals: totals(rows),
  byAccount: group(row => String(row.account)), bySku: group(row => String(row.sku)), byChannel: group(row => String(row.channel) || 'No channel'), byTerritory: group(row => String(row.territory) || 'No territory'), byMonth: group(row => String(row.bookedDate).slice(0, 7)),
  notes: {
   period: `Orders count by preparation date, inclusive calendar days ${from} to ${to} in ${zone}. Draft, replaced and cancelled orders are not booked.`,
   conversion: 'USD conversion uses the frozen, supplier-recorded dated ratio of USD cents to original currency cents, rounded half up once per displayed amount. It is not a live exchange quote; missing historical basis is not recorded. Original amounts remain unchanged.',
   amounts: 'Integer cents in each order’s recorded currency, never added across currencies. Merchandise amounts exclude delivery and tax. Freight includes delivery and handling once per order, shown on its first product line. A product filter includes freight only when it includes that line. Add invoiced freight to merchandise invoiced, and outstanding freight to merchandise outstanding, to reconcile the full invoice. Paid principal uses largest remainders over original merchandise and delivery cents; applied credits use the remaining basis with the same rule, so every cent is conserved. Original line order breaks ties; freight is last. Tax is not calculated.',
   shipped: shipments === 'read' ? 'Pier’s dispatched base units, valued at the line’s average base-unit price, rounded half up once per line.' : 'Pier did not answer: shipped amounts are unknown.',
   payments: `${statementNote} Paid is explicit verified card allocation, not captured unapplied cash. Credited is the source line credit; only explicit credit applications reduce target invoice outstanding. A credit and a refund of that credit do not reverse the invoice twice. Events count through the report end day. PAY-003 and PAY-010 supply their recorded allocation and credit effects; deposits and other payment types remain unrecorded.`,
   season: 'Prebook rows book the original commitment once. Linked release rows report fulfillment and invoicing with zero new booked cents. Season and ship window retain their original identities; CAT-008 owns broader catalog publication.',
   access: 'Owner, admins and all-account managers read every account. ACC-006: a rep reads only one account they hold today (assignment or temporary coverage) or a territory they hold completely; any other account or territory is refused, never trimmed.',
  },
 }
}

export async function salesCsv(env: Bindings, actor: Actor, params: URLSearchParams) {
 const report = await salesReport(env, actor, params)
 return new Response(csvText([[...salesColumns], ...report.rows.map(row => salesColumns.map(column => row[column] ?? 'not recorded'))]), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="barrow-sales.csv"', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } })
}
