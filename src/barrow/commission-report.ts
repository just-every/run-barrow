import { distribute } from './invoice-allocation'
import { creditRecords } from './credit-ledger'
import { requireStaffReport } from './staff-policy'
import type { Bindings } from '../auth.server'
import { csvText } from './cart-csv'
import { now } from './clock'
import { commissionPrecedence, type CommissionRule, type CommissionSnapshot } from './commission-rules'
import { commissionSources, type CommissionSource } from './commission-source'
import { fail, requirePerson, requireSupplier, supplierZone, type Actor, type Order } from './model'
import { pierOrigin, pierState } from './pier'

type Amount = number | null
export type CommissionRow = {
 rep: string; assignedRep: string; orderId: string; line: number; accountId: string; account: string; sku: string; currency: string
 ruleId: string | null; ruleRevision: string | null; basis: CommissionRule['basis'] | null; rateBps: number | null; shareBps: number | null
 acceptedAt: string; paymentSources:string;creditIds:string[];refundIds:string[];sourceOrderId: string | null; sourceLineId: string | null; shipmentIds: string[]; returnIds: string[]
 adjustedBasisCents:Amount;basisCents: Amount; cancelledBasisCents: Amount; returnedBasisCents: Amount; grossCents: Amount; reversedCents: Amount; netCents: Amount
 source: 'read' | 'unavailable'; reason: string | null; path: string
}
const lexical = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
const safe = (amount: bigint) => {
 if (amount < 0n || amount > BigInt(Number.MAX_SAFE_INTEGER)) fail('COMMISSION_AMOUNT', 'Commission amount exceeds safe integer cents.', 409)
 return Number(amount)
}
const half = (numerator: bigint, denominator: bigint) => safe((numerator + denominator / 2n) / denominator)
const cents = (value: unknown): number => {
 if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) fail('COMMISSION_AMOUNT', 'The recorded merchandise line needs valid integer cents.', 409)
 return value
}
/** Hamilton allocation: exact total cents, largest remainder first, rep label breaks ties. */
function allocate(total: number, splits: CommissionRule['splits'], denominator = 10000) {
 const rows = splits.map(split => {
  const numerator = BigInt(total) * BigInt(split.shareBps)
  return { rep: split.rep, amount: denominator ? Number(numerator / BigInt(denominator)) : 0, remainder: denominator ? numerator % BigInt(denominator) : 0n }
 })
 const ranked = [...rows].sort((a, b) => a.remainder === b.remainder ? lexical(a.rep, b.rep) : a.remainder > b.remainder ? -1 : 1)
 const extra = total - rows.reduce((sum, row) => sum + row.amount, 0)
 for (let index = 0; index < extra; index++) ranked[index].amount++
 return new Map(rows.map(row => [row.rep, row.amount]))
}
function measured(order: Order, line: number, rule: CommissionRule, source: CommissionSource | undefined,priceCreditCents=0,paidBasisCents=0,creditedBasisCents=0) {
 if (!source) return null
 const merchandise = cents(order.lines[line - 1].lineCents)
 // All selling-unit lines for an item receive the same fraction of confirmed source units.
 // The stored line's own discounted price remains intact; no current pricing enters this ratio.
 const eligible = rule.basis === 'acceptance' ? source.base : source.dispatched
 const basisCents = rule.basis==='payment'?paidBasisCents:half(BigInt(merchandise) * eligible, source.base)
 const cancelledOriginal=half(BigInt(merchandise)*source.cancelled,source.base),returnedOriginal=half(BigInt(merchandise)*source.returned,source.base)
 // Payment earning remains backed by the retained merchandise. Credits first reduce unpaid
 // principal; they reverse earned payment commission only when that backing falls below it.
 const cancelledBasisCents = rule.basis==='payment'?Math.max(0,basisCents-(merchandise-cancelledOriginal)):rule.basis === 'acceptance'?cancelledOriginal:0
 const returnedBasisCents = rule.basis==='payment'?Math.max(0,basisCents-cancelledBasisCents-Math.max(0,merchandise-cancelledOriginal-returnedOriginal)):Math.min(basisCents-cancelledBasisCents,returnedOriginal)
 // Physical quantities and issued credits cap the same retained merchandise. A return
 // credit already uses corrected prices, so subtracting the full price correction from
 // the original physical remainder would count its returned portion twice.
 const retainedMerchandiseCents=Math.max(0,Math.min(merchandise-cancelledOriginal-returnedOriginal,merchandise-creditedBasisCents))
 const adjustedBasisCents=rule.basis==='payment'?Math.max(0,basisCents-cancelledBasisCents-returnedBasisCents-retainedMerchandiseCents):Math.min(basisCents-cancelledBasisCents-returnedBasisCents,priceCreditCents)
 const gross = half(BigInt(basisCents) * BigInt(rule.rateBps), 10000n)
 const remaining = half(BigInt(basisCents - cancelledBasisCents - returnedBasisCents - adjustedBasisCents) * BigInt(rule.rateBps), 10000n)
 const grossShares = allocate(gross, rule.splits)
 // Preserve each rep's original earned cents as the remaining allocation weights.
 // This conserves all remaining cents and prevents rounding from reversing a negative cent.
 const remainingShares = allocate(remaining, rule.splits.map(split => ({ rep: split.rep, shareBps: grossShares.get(split.rep)! })), gross)
 return { adjustedBasisCents,basisCents, cancelledBasisCents, returnedBasisCents, gross: grossShares, remaining: remainingShares }
}
function totals(rows: CommissionRow[]) {
 const groups = new Map<string, CommissionRow[]>()
 for (const row of rows) { const key = JSON.stringify([row.currency, row.rep]); groups.set(key, [...(groups.get(key) ?? []), row]) }
 return [...groups.values()].map(mine => {
  const sum = (key: 'grossCents' | 'reversedCents' | 'netCents') => mine.some(row => row[key] === null) ? null : safe(mine.reduce((total, row) => total + BigInt(row[key]!), 0n))
  return { currency: mine[0].currency, rep: mine[0].rep, grossCents: sum('grossCents'), reversedCents: sum('reversedCents'), netCents: sum('netCents') }
 }).sort((a, b) => lexical(a.currency, b.currency) || lexical(a.rep, b.rep))
}
export async function commissionReport(env: Bindings, actor: Actor, params: URLSearchParams) {
 requirePerson(actor); requireStaffReport(actor, 'commissions', params); requireSupplier(actor)
 const financial=await creditRecords(env.DB)
 const checkedAt = (await now()).toISOString(), filter = { rep: params.get('rep') ?? '', accountId: params.get('accountId') ?? '' }
 const restrictRep = actor.role==='member' && Boolean(filter.rep)
 // ACC-006: a scoped staff statement shows only accounts held today; frozen attribution on those orders is unchanged.
 const permitted = actor.staff && actor.staff.accounts !== 'all' ? new Set(actor.staff.accounts) : null
 // Commissions are private supplier attribution, deliberately separate from buyer-visible orders.
 const records = await env.DB.prepare(`SELECT o.value_json,c.value_json AS commission_json FROM bw_orders o LEFT JOIN bw_order_commissions c ON c.order_id=o.id WHERE (?='' OR json_extract(o.value_json,'$.accountId')=?) ORDER BY o.id`).bind(filter.accountId,filter.accountId).all<{ value_json: string; commission_json: string | null }>()
 const orders = records.results.map(record => ({ order: JSON.parse(record.value_json) as Order, commission: record.commission_json ? JSON.parse(record.commission_json) as CommissionSnapshot : null })).filter(row => !permitted || permitted.has(row.order.accountId)).filter(row => !restrictRep || Boolean(row.commission?.lines.some(entry => entry.rule ? entry.rule.splits.some(split => split.rep === filter.rep) : row.commission!.assignedRep === filter.rep)))
 const historicalUnrecorded = restrictRep ? null : orders.filter(row => row.order.approvedAt && !row.commission).length
 let state: any, origin: string | undefined, source: 'read' | 'unavailable' = 'read'
 try { [state, origin] = await Promise.all([pierState(env), pierOrigin(env)]) } catch { source = 'unavailable' }
 const rows: CommissionRow[] = [], exceptions: { orderId: string; reason: string }[] = []
 let unmatchedLines = 0
 for (const { order, commission } of orders) {
  if (!commission || order.prebook) continue
  let quantities: Map<string, CommissionSource> | undefined
  if (source === 'read') {
   try { quantities = commissionSources(order, state, origin) }
   catch { exceptions.push({ orderId: order.id, reason: 'Recorded Pier origin, customer, order, shipment/return links or quantities are unavailable or do not reconcile.' }) }
  }
  const allocations=financial.allocations.filter(row=>row.orderId===order.id&&row.accountId===order.accountId&&row.currency===(order.currency??'AUD'))
  const paid=distribute(allocations.reduce((sum,row)=>sum+row.amountCents,0),[...order.lines.map(line=>order.invoice?line.lineCents??0:0),order.invoice?order.delivery?.totalCents??0:0])
  const paymentSources=JSON.stringify(allocations.map(row=>({allocationId:row.id,paymentId:row.paymentId,providerPaymentId:row.providerPaymentId??null,sourceOrderId:row.sourceOrderId??null,amountCents:row.amountCents})))
  for (const entry of commission.lines) {
   if (restrictRep && !(entry.rule ? entry.rule.splits.some(split => split.rep === filter.rep) : commission.assignedRep === filter.rep)) continue
   const line = order.lines[entry.line - 1]
   if (!line) fail('COMMISSION_SNAPSHOT', 'Commission snapshot references a missing order line.', 409)
   const rule = entry.rule, confirmed = quantities?.get(line.itemId)
   const linkedCredits=financial.credits.filter(credit=>credit.orderId===order.id&&credit.currency===(order.currency??'AUD')&&credit.lines.some(line=>line.line===entry.line)&&confirmed&&(credit.kind==='price-correction'||credit.kind==='cancellation'&&confirmed.cancelled>0n||confirmed.returnIds.includes(credit.returnId)))
   const creditedLines=linkedCredits.flatMap(credit=>credit.lines.filter(line=>line.line===entry.line).map(line=>({kind:credit.kind,amountCents:line.amountCents})))
   const measuredLine = rule ? measured(order, entry.line, rule, confirmed,creditedLines.filter(line=>line.kind==='price-correction').reduce((sum,line)=>sum+line.amountCents,0),paid[entry.line-1],creditedLines.reduce((sum,line)=>sum+line.amountCents,0)) : null
   if (!rule) unmatchedLines++
   const base = { paymentSources,adjustedBasisCents:measuredLine?.adjustedBasisCents??null,creditIds:linkedCredits.map(credit=>credit.id),refundIds:financial.refunds.filter(refund=>linkedCredits.some(credit=>credit.id===refund.creditId)).map(refund=>refund.id),assignedRep: commission.assignedRep, orderId: order.id, line: entry.line, accountId: order.accountId, account: order.customerName, sku: line.sku, currency: order.currency ?? 'AUD', ruleId: rule?.id ?? null, ruleRevision: commission.policyRevision, basis: rule?.basis ?? null, rateBps: rule?.rateBps ?? null, acceptedAt: commission.at, sourceOrderId: confirmed?.sourceOrderId ?? order.pierOrderId ?? null, sourceLineId: confirmed?.sourceLineId ?? null, shipmentIds: confirmed?.shipmentIds ?? [], returnIds: confirmed?.returnIds ?? [], basisCents: measuredLine?.basisCents ?? null, cancelledBasisCents: measuredLine?.cancelledBasisCents ?? null, returnedBasisCents: measuredLine?.returnedBasisCents ?? null, source: confirmed ? 'read' as const : 'unavailable' as const, reason: !rule ? 'No matching rule at first approval; no commission recorded.' : !confirmed ? 'Pier source unavailable or unreconciled; commission and reversals are unknown.' : null, path: `/api/barrow/orders/${order.id}/timeline` }
   const splits = rule?.splits ?? [{ rep: commission.assignedRep, shareBps: null }]
   for (const split of splits) {
    if (filter.rep && split.rep !== filter.rep) continue
    const grossCents = measuredLine?.gross.get(split.rep) ?? null, netCents = measuredLine?.remaining.get(split.rep) ?? null
    rows.push({ ...base, rep: split.rep, shareBps: split.shareBps, grossCents, reversedCents: grossCents === null || netCents === null ? null : grossCents - netCents, netCents })
   }
  }
 }
 return { checkedAt, timeZone: supplierZone, filter, source, rows, totals: totals(rows), historicalUnrecorded, unmatchedLines, exceptions, notes: {
  attribution: 'Assigned rep and full matched rule are frozen at first supplier approval. Account transfers and later policy edits do not rewrite historical attribution. Orders without a recorded snapshot remain unrecorded.',
  precedence: commissionPrecedence,
  amounts: 'Merchandise only at original discounted line cents; excludes delivery, handling and tax. Acceptance records original merchandise commission and reverses confirmed cancelled units; shipment earns only confirmed dispatched units. Duplicate item selling units share source quantities proportionally to base units. Basis amounts repeat across split rows; sum commission cents only. Currencies remain separate.',
  rounding: 'BigInt ratios round half up once per line. Commission rounds half up before splits; largest remainders allocate earned cents with lexical rep ties. Remaining commission uses original earned split cents as proportional weights, again by largest remainder. Reversals are original earned less remaining split cents, never negative; a full return or cancellation reverses every original cent.',
  returns: 'Only actual Pier return receipts linked to the original shipment reverse merchandise commission, capped by the earned merchandise basis. Missing or unreconciled sources leave amounts unknown, never zero.',
  payments: 'Payment earning uses verified principal allocated to each invoice, distributed over its original merchandise and freight cents. Only merchandise earns under the frozen rule and split. Unapplied receipts earn nothing. Physical returns, cancellation and price credits cap earning at the retained original merchandise basis and reverse the paid excess once; linked provider references remain on each statement. Other payment sources are not recorded.',
  credits: 'Credit notes retain the original physical return, approved line, currency and frozen split. Their linked refunds return cash only. The original physical-return reversal is applied once, capped by earned merchandise; issuing credit or refunding it never reverses the same return again.',
  access: 'Owner, admins and all-account managers read every frozen statement. A rep reads only their fixed label’s statements for accounts they hold today (assignment or temporary coverage); an account transferred away leaves their view while its frozen attribution stays. Rep labels alone grant no access.',
 } }
}
export const commissionColumns = ['rep', 'assignedRep', 'orderId', 'line', 'accountId', 'account', 'sku', 'currency', 'ruleId', 'ruleRevision', 'basis', 'rateBps', 'shareBps', 'acceptedAt', 'paymentSources','sourceOrderId', 'sourceLineId', 'shipmentIds', 'returnIds', 'creditIds', 'refundIds', 'basisCents', 'adjustedBasisCents','cancelledBasisCents', 'returnedBasisCents', 'grossCents', 'reversedCents', 'netCents', 'source', 'reason', 'path'] as const
export async function commissionCsv(env: Bindings, actor: Actor, params: URLSearchParams) {
 const report = await commissionReport(env, actor, params)
 return new Response(csvText([[...commissionColumns], ...report.rows.map(row => commissionColumns.map(column => Array.isArray(row[column]) ? (row[column] as string[]).join(';') : row[column] ?? 'not recorded')), [], ['historicalUnrecorded', report.historicalUnrecorded ?? 'not attributable to this rep'], ...Object.entries(report.notes).map(([key, value]) => [key, value])]), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="barrow-commissions.csv"', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } })
}
