import { requireStaffReport } from './staff-policy'
// RPT-002: quote conversion, carts and reorders by rep, cohort and product, over today's records. Quotes count in the
// period of their request date and orders in the period of their preparation date, both as calendar days in the
// installation reporting time zone. Every rate states its numerator and denominator. Only an accepted quote's one
// converted order is revenue, net of the returns Pier records against it; promotions, line sheets, presentations and
// campaigns are not recorded until PRI-005, CAT-003, CAT-004 and CAT-011 add them to this report.
import type { Bindings } from '../auth.server'
import { accounts } from './accounts'
import { now } from './clock'
import { fail, requirePerson, requireSupplier, supplierDate, type Actor, type Line, type Order } from './model'
import { pierOrigin, pierState } from './pier'
import { expired, type Quote } from './quotes'
import { calendarDate, reportZone } from './report-zone'
import { currentReps, supplierToday } from './rep-scope'

/** A draft untouched for this many whole days is an abandoned cart. */
export const abandonedAfterDays = 7
const placedStatuses = ['submitted', 'reserving', 'shortfall', 'approved', 'releasing', 'cancelled']
const rate = (numerator: number, denominator: number) => ({ numerator, denominator, bps: denominator ? Math.floor((numerator * 10000 + denominator / 2) / denominator) : null })
const half = (numerator: bigint, denominator: bigint) => Number((numerator + denominator / 2n) / denominator)
const day = (value: string | null, name: string) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value ? value : fail('INPUT', `${name} must be a YYYY-MM-DD date.`, 400)
const shift = (date: string, days: number) => new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10)
const base = (line: Line) => Number(line.baseQuantity ?? line.quantity)

type Returned = Map<string, number>
/** The returned value of an order: each return's base units at its order line's exact average base-unit price, rounded half up once per return. */
function returnedCents(order: Order, returns: { itemId: string; quantity: string }[], sku?: string) {
 return returns.reduce((sum, item) => {
  const line = order.lines.find(row => row.itemId === item.itemId)
  if (!line || (sku && line.sku !== sku)) return sum
  return sum + half(BigInt(Math.round(Number(item.quantity) * 1_000_000)) * BigInt(line.lineCents ?? 0), BigInt(Math.round(base(line) * 1_000_000)))
 }, 0)
}

function measure(quotes: Quote[], orders: Order[], all: Map<string, Order>, returns: Map<string, { itemId: string; quantity: string }[]>, today: string, cutoff: string, zone: string, sku?: string) {
 const has = (lines: Line[]) => !sku || lines.some(line => line.sku === sku)
 const lines = <T extends Line>(rows: T[]) => sku ? rows.filter(line => line.sku === sku) : rows
 const mine = quotes.filter(quote => has(quote.revisions.at(-1)?.lines ?? quote.request))
 const responded = mine.filter(quote => quote.revisions.length), offered = mine.filter(quote => quote.revisions.some(revision => !revision.discounted || revision.approval))
 const accepted = mine.filter(quote => quote.accepted), converted = accepted.map(quote => all.get(quote.accepted!.orderId)).filter((order): order is Order => Boolean(order) && order!.status !== 'cancelled')
 const acceptedRevision = (quote: Quote) => quote.revisions.find(revision => revision.number === quote.accepted!.revision)!
 const acceptedCents = converted.reduce((sum, order) => sum + lines(order.lines).reduce((total, line) => total + (line.lineCents ?? 0), 0), 0)
 const discountCents = accepted.reduce((sum, quote) => sum + lines(acceptedRevision(quote).lines).reduce((total, line) => total + line.basisLineCents - (line.lineCents ?? 0), 0), 0)
 const returned = converted.reduce((sum, order) => sum + returnedCents(order, returns.get(order.id) ?? [], sku), 0)
 const carts = orders.filter(order => order.status === 'draft' && has(order.lines)), placed = orders.filter(order => placedStatuses.includes(order.status) && has(order.lines))
 const abandoned = carts.filter(order => calendarDate(new Date(order.preparedAt), zone) <= cutoff)
 return {
  quotes: { requested: mine.length, responded: responded.length, offered: offered.length, accepted: accepted.length, revised: mine.filter(quote => quote.revisions.length > 1).length, expired: mine.filter(quote => expired(quote, today)).length, open: mine.filter(quote => !quote.accepted && !expired(quote, today)).length },
  responseRate: rate(responded.length, mine.length), acceptanceRate: rate(accepted.length, offered.length),
  acceptedOrders: converted.length, acceptedCents, quoteDiscountCents: discountCents, returnedCents: returned, netAcceptedCents: acceptedCents - returned,
  carts: { drafts: carts.length, abandoned: abandoned.length, placed: placed.length, abandonmentRate: rate(abandoned.length, abandoned.length + placed.length) },
  reorderRate: rate(placed.filter(order => order.reorderedFrom).length, placed.length),
 }
}

export async function quoteReport(env: Bindings, actor: Actor, params: URLSearchParams) {
 requirePerson(actor); requireStaffReport(actor, 'quotes', params); requireSupplier(actor)
 const at = await now(), checkedAt = at.toISOString(), zone = await reportZone(env.DB), reportDay = calendarDate(at, zone)
 const to = day(params.get('to'), 'To') ?? reportDay, from = day(params.get('from'), 'From') ?? shift(to, -89)
 if (from > to) fail('INPUT', 'From must not be after To.', 400)
 const list = await accounts(env.DB, actor), byId = new Map(list.map(row => [row.id, row]))
 const accountId = params.get('accountId') ?? ''
 const quotes = (await env.DB.prepare("SELECT value_json,revision FROM bw_quotes WHERE (?='' OR json_extract(value_json,'$.accountId')=?) ORDER BY rowid").bind(accountId,accountId).all<any>()).results.map(row => ({ ...JSON.parse(row.value_json), revision: row.revision }) as Quote)
 const records = (await env.DB.prepare("SELECT value_json FROM bw_orders WHERE (?='' OR json_extract(value_json,'$.accountId')=?) ORDER BY rowid").bind(accountId,accountId).all<{ value_json: string }>()).results.map(row => JSON.parse(row.value_json) as Order)
 const all = new Map(records.map(order => [order.id, order]))
 const inPeriod = (iso: string) => { const date = calendarDate(new Date(iso), zone); return date >= from && date <= to }
 const periodQuotes = quotes.filter(quote => inPeriod(quote.requestedAt)), periodOrders = records.filter(order => order.status !== 'superseded' && inPeriod(order.preparedAt))
 // Returns are Pier's: one read for every converted order. Unreachable Pier reports returns as unavailable, never zero.
 const returns = new Map<string, { itemId: string; quantity: string }[]>()
 let returnsSource: 'read' | 'unavailable' = 'read'
 try {
  const state = await pierState(env), origin = await pierOrigin(env)
  for (const quote of periodQuotes.filter(row => row.accepted)) {
   const order = all.get(quote.accepted!.orderId)
   if (!order?.pierOrderId || order.pierOrigin !== origin) continue
   const shipped = new Set((state.shipments ?? []).filter((row: any) => row.orderId === order.pierOrderId).map((row: any) => row.id))
   returns.set(order.id, (state.returns ?? []).filter((row: any) => shipped.has(row.shipmentId)))
  }
 } catch { returnsSource = 'unavailable' }
 const today = supplierDate(at), cutoff = shift(reportDay, -abandonedAfterDays)
 const run = (quotesIn: Quote[], ordersIn: Order[], sku?: string) => {
  const row = measure(quotesIn, ordersIn, all, returns, today, cutoff, zone, sku)
  return returnsSource === 'read' ? row : { ...row, returnedCents: null, netAcceptedCents: null }
 }
 const group = (key: (accountId: string) => string) => [...new Set([...periodQuotes.map(row => key(row.accountId)), ...periodOrders.map(row => key(row.accountId))])].sort()
  .map(name => ({ name, ...run(periodQuotes.filter(row => key(row.accountId) === name), periodOrders.filter(row => key(row.accountId) === name)) }))
 // ACC-006 replaces the label with assignments: the account's primary rep today; only an account with no assignment keeps its ACC-004 text.
 const holders = await currentReps(env.DB, [...byId.keys()], await supplierToday())
 const rep = (accountId: string) => holders.get(accountId)?.filter(row => !row.coverage).map(row => row.name).join(', ') || byId.get(accountId)?.value.assignedRep?.trim() || 'Unassigned'
 // A cohort is the reporting-zone month of the account's first placed order, ever.
 const firsts = new Map<string, string>()
 for (const order of records.filter(row => placedStatuses.includes(row.status))) { const month = calendarDate(new Date(order.preparedAt), zone).slice(0, 7); if (!firsts.has(order.accountId) || month < firsts.get(order.accountId)!) firsts.set(order.accountId, month) }
 const cohort = (accountId: string) => firsts.get(accountId) ?? 'No placed order'
 const skus = [...new Set([...periodQuotes.flatMap(quote => (quote.revisions.at(-1)?.lines ?? quote.request).map(line => line.sku)), ...periodOrders.flatMap(order => order.lines.map(line => line.sku))])].sort()
 return {
  checkedAt, from, to, timeZone: zone, currency: 'USD', returnsSource,
  totals: run(periodQuotes, periodOrders), byRep: group(rep), byCohort: group(cohort), byProduct: skus.map(sku => ({ name: sku, ...run(periodQuotes, periodOrders, sku) })),
  definitions: {
   period: `Quotes count by request date and orders by preparation date, inclusive calendar days ${from} to ${to} in ${zone}.`,
   responseRate: 'Quotes with at least one proposed revision ÷ quotes requested.',
   acceptanceRate: 'Accepted quotes ÷ quotes that had a revision the buyer could accept (no discount, or a recorded discount approval). A generated or proposed quote is never revenue.',
   acceptedCents: 'Line cents of the one order each accepted quote converted into, counted once; cancelled orders are excluded.',
   quoteDiscountCents: 'Current price basis minus quoted cents on each accepted revision (PRI-002 basis at proposal).',
   returnedCents: 'Base units Pier recorded as returned against a converted order, at the order line’s average base-unit price, rounded half up once per return.',
   abandonmentRate: `Drafts prepared at least ${abandonedAfterDays} days before ${reportDay} and never submitted ÷ (those drafts + placed orders). Replaced drafts are not carts.`,
   reorderRate: 'Placed orders created by reordering a previous order (ORD-003) ÷ placed orders. Placed means submitted at least once, including later cancellation.',
   cohort: 'The month, in the reporting time zone, of the account’s first placed order.',
   rep: 'The account’s primary assigned rep today (ACC-006 assignment); an account with no assignment keeps its ACC-004 assigned-rep text, else Unassigned. Temporary coverage does not change the row.',
   product: 'A product row counts quotes whose latest lines (or request) and orders whose lines include the SKU, with cents from that SKU’s lines only.',
  },
  notRecorded: [
   { measure: 'Promotion results', note: 'Barrow has no promotions yet; PRI-005 adds promoted orders, their discounts and net of returns to this report.' },
   { measure: 'Line-sheet and presentation engagement', note: 'Barrow has no line sheets or presentations yet; CAT-003 and CAT-004 add opens, views and items viewed per buyer.' },
   { measure: 'Campaign results', note: 'Barrow sends no campaigns yet; CAT-011 adds delivered, opened, viewed, ordered and order value per send, attributing only orders placed from its link or form.' },
  ],
 }
}
