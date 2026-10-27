import { promotionRule } from './promotions'
import { requireStaffReport } from './staff-policy'
// RPT-002: quote conversion, carts and reorders by rep, cohort and product, over today's records. Quotes count in the
// period of their request date and orders in the period of their preparation date, both as calendar days in the
// installation reporting time zone. Every rate states its numerator and denominator. Only an accepted quote's one
// converted order is quote revenue, net of Pier returns. Promotions and buyer sheet activity are recorded separately;
// presentations and campaigns inherit their remaining report duties.
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
 return returns.reduce((sum,item)=>{
  const line=order.lines.find(row=>row.itemId===item.itemId)
  if(!line||(sku&&line.sku!==sku))return sum
  return sum+half(BigInt(Math.round(Number(item.quantity)*1_000_000))*BigInt(line.lineCents??0),BigInt(Math.round(base(line)*1_000_000)))
 },0)
}
function promotionReturns(order:Order,returns:{itemId:string;quantity:string}[],sku?:string,offerId?:string) {
 return [...new Set(order.lines.map(l=>l.itemId))].reduce((sum,itemId)=>{
  const all=order.lines.filter(l=>l.itemId===itemId),units=all.reduce((n,l)=>n+base(l),0)
  const value=all.filter(l=>l.promotion&&(!sku||l.sku===sku)&&(!offerId||l.promotion.offers.some(o=>o.id===offerId))).reduce((n,l)=>n+l.lineCents!,0)
  const returned=Math.min(units,returns.filter(r=>r.itemId===itemId).reduce((n,r)=>n+Number(r.quantity),0))
  return sum+half(BigInt(Math.round(returned*1_000_000))*BigInt(value),BigInt(Math.round(units*1_000_000)))
 },0)
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
 const promoted=orders.filter(order=>placedStatuses.includes(order.status)&&order.status!=='cancelled'&&order.lines.some(line=>line.promotion&&(!sku||line.sku===sku)))
 const promotionDiscountCents=promoted.reduce((sum,order)=>sum+lines(order.lines).reduce((n,line)=>n+(line.promotion?.discountCents??0),0),0)
 const promotionGrossCents=promoted.reduce((sum,order)=>sum+lines(order.lines).filter(l=>l.promotion).reduce((n,line)=>n+line.lineCents!,0),0)
 const promotionReturnedCents=promoted.reduce((sum,order)=>sum+promotionReturns(order,returns.get(order.id)??[],sku),0)
 const carts = orders.filter(order => order.status === 'draft' && has(order.lines)), placed = orders.filter(order => placedStatuses.includes(order.status) && has(order.lines))
 const abandoned = carts.filter(order => calendarDate(new Date(order.preparedAt), zone) <= cutoff)
 return {
  promotedOrders:promoted.length,promotionDiscountCents,promotionGrossCents,promotionReturnedCents,netPromotedCents:promotionGrossCents-promotionReturnedCents,
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
 const currency=params.get('currency')??'USD'
 if(!['USD','CAD','EUR','GBP','AUD'].includes(currency))fail('INPUT','Choose a recorded ISO currency.',400)
 const list = await accounts(env.DB, actor), byId = new Map(list.map(row => [row.id, row]))
 const accountId = params.get('accountId') ?? ''
 const quotes = (await env.DB.prepare("SELECT value_json,revision FROM bw_quotes WHERE (?='' OR json_extract(value_json,'$.accountId')=?) ORDER BY rowid").bind(accountId,accountId).all<any>()).results.map(row => ({ ...JSON.parse(row.value_json), revision: row.revision }) as Quote)
 const records = (await env.DB.prepare("SELECT value_json FROM bw_orders WHERE (?='' OR json_extract(value_json,'$.accountId')=?) ORDER BY rowid").bind(accountId,accountId).all<{ value_json: string }>()).results.map(row => JSON.parse(row.value_json) as Order)
 const all = new Map(records.map(order => [order.id, order]))
 const inPeriod = (iso: string) => { const date = calendarDate(new Date(iso), zone); return date >= from && date <= to }
 const periodQuotes = quotes.filter(quote => quote.currency===currency&&inPeriod(quote.requestedAt)), periodOrders = records.filter(order => (order.currency??'AUD')===currency&&order.status !== 'superseded' && inPeriod(order.preparedAt))
 // Returns are Pier's: one read for every converted order. Unreachable Pier reports returns as unavailable, never zero.
 const returns = new Map<string, { itemId: string; quantity: string }[]>()
 let returnsSource: 'read' | 'unavailable' = 'read'
 try {
  const state = await pierState(env), origin = await pierOrigin(env)
  for (const order of records.filter(o=>periodQuotes.some(q=>q.accepted?.orderId===o.id)||periodOrders.some(p=>p.id===o.id&&p.lines.some(l=>l.promotion)))) {
   if(order.pierOrderId&&order.pierOrigin!==origin&&order.lines.some(l=>l.promotion))returnsSource='unavailable'
   if (!order?.pierOrderId || order.pierOrigin !== origin) continue
   const shipped = new Set((state.shipments ?? []).filter((row: any) => row.orderId === order.pierOrderId).map((row: any) => row.id))
   returns.set(order.id, (state.returns ?? []).filter((row: any) => shipped.has(row.shipmentId)))
  }
 } catch { returnsSource = 'unavailable' }
 const sheetEvents=(await env.DB.prepare("SELECT e.sheet_id,e.account_id,e.actor_id,e.kind,e.skus_json,e.created_at,p.display_name AS buyer_name,p.email AS buyer_email,json_extract(s.value_json,'$.name') AS sheet_name FROM bw_sheet_events e LEFT JOIN oa_operators p ON p.id=e.actor_id LEFT JOIN bw_line_sheets s ON s.id=e.sheet_id WHERE e.account_id IN (SELECT value FROM json_each(?)) AND (?='' OR e.account_id=?) ORDER BY e.created_at").bind(JSON.stringify(list.map(a=>a.id)),accountId,accountId).all<{sheet_id:string;account_id:string;actor_id:string;kind:string;skus_json:string;created_at:string;buyer_name:string|null;buyer_email:string|null;sheet_name:string|null}>()).results.filter(row=>inPeriod(row.created_at))
 const lineSheets=[...new Set(sheetEvents.map(e=>JSON.stringify([e.sheet_id,e.account_id,e.actor_id])))].map(key=>{const [sheetId,accountId,buyerId]=JSON.parse(key),events=sheetEvents.filter(e=>e.sheet_id===sheetId&&e.account_id===accountId&&e.actor_id===buyerId),items=events.filter(e=>e.kind==='view').flatMap(e=>JSON.parse(e.skus_json) as string[]);return {sheetId,accountId,buyerId,accountName:byId.get(accountId)?.value.name??accountId,buyerName:events[0].buyer_name,buyerEmail:events[0].buyer_email,sheetName:events[0].sheet_name,opens:events.filter(e=>e.kind==='open').length,views:events.filter(e=>e.kind==='view').length,itemsViewed:items.length,bySku:[...new Set(items)].map(sku=>({sku,views:items.filter(i=>i===sku).length}))}})
 const today = supplierDate(at), cutoff = shift(reportDay, -abandonedAfterDays)
 const run = (quotesIn: Quote[], ordersIn: Order[], sku?: string) => {
  const row = measure(quotesIn, ordersIn, all, returns, today, cutoff, zone, sku)
  return returnsSource === 'read' ? row : { ...row, returnedCents: null, netAcceptedCents: null, promotionReturnedCents:null,netPromotedCents:null }
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
  promotionOffers:[...new Set(periodOrders.flatMap(o=>o.lines.flatMap(l=>l.promotion?.offers.map(p=>p.id)??[])))].map(id=>{
   const orders=periodOrders.filter(o=>placedStatuses.includes(o.status)&&o.status!=='cancelled'&&o.lines.some(l=>l.promotion?.offers.some(p=>p.id===id)))
   const attributed=orders.map(o=>({...o,lines:o.lines.filter(l=>l.promotion?.offers.some(p=>p.id===id))}))
   const grossCents=attributed.reduce((s,o)=>s+o.lines.reduce((n,l)=>n+l.lineCents!,0),0),returned=orders.reduce((s,o)=>s+promotionReturns(o,returns.get(o.id)??[],undefined,id),0)
   return {id,name:orders.flatMap(o=>o.lines.flatMap(l=>l.promotion?.offers??[])).find(p=>p.id===id)?.name??id,orders:orders.length,discountCents:attributed.reduce((sum,o)=>sum+o.lines.reduce((n,l)=>n+(l.promotion?.offers.find(p=>p.id===id)?.discountCents??0),0),0),grossCents,returnedCents:returnsSource==='read'?returned:null,netCents:returnsSource==='read'?grossCents-returned:null}
  }),
  lineSheets, checkedAt, from, to, timeZone: zone, currency, returnsSource,
  totals: run(periodQuotes, periodOrders), byRep: group(rep), byCohort: group(cohort), byProduct: skus.map(sku => ({ name: sku, ...run(periodQuotes, periodOrders, sku) })),
  definitions: {
   promotions: promotionRule,
   lineSheets: 'Authenticated buyer opens count opening a shared sheet; views count visible-item observations; items viewed counts SKU observations per buyer. Supplier previews are excluded; revoked shares admit no further observations.',
   period: `Quotes count by request date and orders by preparation date, in ${currency} only (no conversion), inclusive calendar days ${from} to ${to} in ${zone}.`,
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
   { measure: 'Presentation engagement', note: 'CAT-004 adds presentation opens, views and items viewed per buyer.' },
   { measure: 'Campaign results', note: 'Barrow sends no campaigns yet; CAT-011 adds delivered, opened, viewed, ordered and order value per send, attributing only orders placed from its link or form.' },
  ],
 }
}
