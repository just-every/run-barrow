import { wooSelected } from './woocommerce'
import { admitCredit, creditPolicy, creditSignature } from './credit-policy'
import { resolveBuyingProfile, orderBuyingProfile } from './buying-profiles'
import {deltaEntryGuard} from './imports/delta-entry'
import { companySubmission } from './company-purchase'
import { requireCompanyRight } from './company-policy'
import { termsAtSubmission } from './sales-terms'
import { confirmationStatements } from './confirmations'
import { emailLatestConfirmation } from './confirmation-mail'
// ORD-004: negotiated wholesale quotes. A buyer requests a quote from a cart; the supplier proposes numbered revisions
// with line prices or discounts, quantities, payment terms, a shipping note and an inclusive valid-through date in
// Eastern time. Until ACC-005 supplies reps and sales managers, the owner or admin proposes, and any price below the
// current PRI-002 basis waits for a recorded owner/admin discount approval with a reason. The buyer accepts the latest
// approved revision once: acceptance rechecks the account, the PRI-002 basis, quantity rules and live Pier stock, then
// converts the quote into exactly one submitted order that still needs supplier approval before stock is reserved.
import type { Bindings } from '../auth.server'
import { account, accounts } from './accounts'
import { audit, changed, commit } from './access'
import { activeAccountGuard, requireActiveAccount } from './account-profile'
import { now } from './clock'
import { conversionSnapshot } from './currency'
import { fail, integer, requirePerson, requireSupplier, supplier, supplierDate, text, type Actor, type Line, type Order } from './model'
import { nextNumber, readOrder } from './orders'
import { catalogue, pierOrigin } from './pier'
import { prepareLines } from './unit-lines'
import { quantityMicro } from './units'
import { acceptDelivery, deliveryOptions, deliveryTotal, freightQuote, selectDelivery, shippingGuard } from './shipping'
import type { Delivery, FreightQuote } from './shipping-rules'
import { locationSnapshot } from './locations'
import { attachmentResponse, notice, threadCommand, threadEntries, unreadNotices } from './quote-thread'
import { supplierRoute } from './quote-routing'
import { approvalNoticeStatements } from './approval-notices'

export type QuoteLine = Line & { basisUnitCents: number; basisLineCents: number; discountBps?: number; negotiatedUnitCents?: number }
export type QuoteRevision = { delivery?:Delivery; freightQuotes?:FreightQuote[]; number: number; lines: QuoteLine[]; basisCents: number; totalCents: number; termsDays: number; shipping: string; validUntil: string; note: string; proposedBy: string; proposedByEmail?: string; proposedAt: string; changes?: string[]; discounted: boolean; approval?: { by: string; at: string; reason: string } }
export type Quote = { buyingProfile?: import('./buying-profiles').BuyingProfileSnapshot; id: string; accountId: string; customerName: string; currency: 'USD'|'CAD'|'EUR'|'GBP'; status: 'requested' | 'awaiting-approval' | 'proposed' | 'accepted'; requestedBy: string; requestedAt: string; note: string; request: Line[]; revisions: QuoteRevision[]; accepted?: { revision: number; by: string; at: string; orderId: string }; revision: string }

function missing(): never { return fail('NOT_FOUND', 'Quote not found.', 404) }
const parse = (row: any): Quote => ({ ...JSON.parse(row.value_json), revision: row.revision })
const half = (numerator: bigint, denominator: bigint) => Number((numerator + denominator / 2n) / denominator)
const day = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value ? value : fail('INPUT', 'Valid through must be a YYYY-MM-DD date (Eastern time).', 400)
const note = (value: unknown, name: string, limit: number) => value === undefined || value === '' ? '' : text(value, name, limit)
/** Expired means the Eastern calendar date is after the inclusive valid-through date. */
export const expired = (quote: Quote, today: string) => !quote.accepted && Boolean(quote.revisions.length) && today > quote.revisions.at(-1)!.validUntil

// Buyers see their quotes without the supplier's internal approval decision; agents never read quotes.
function view(actor: Actor, quote: Quote, today: string) {
 const shown = supplier(actor) ? quote : { ...quote, revisions: quote.revisions.map(({ approval, ...revision }) => ({ ...revision, approved: Boolean(approval) })) }
 return { ...shown, expired: expired(quote, today) }
}
// ORD-005: each quote read carries its conversation as the actor may see it and the actor's side's unread notices.
async function threaded(db: D1Database, actor: Actor, quotes: Quote[], today: string) {
 const ids = quotes.map(quote => quote.id), [entries, notices] = await Promise.all([threadEntries(db, actor, ids), unreadNotices(db, actor, ids)])
 return quotes.map(quote => ({ ...view(actor, quote, today), thread: entries.filter(row => row.quoteId === quote.id), notices: notices.filter(row => row.quoteId === quote.id) }))
}

async function readQuote(db: D1Database, actor: Actor, id: string) {
 const row = await db.prepare('SELECT value_json,revision FROM bw_quotes WHERE id=?').bind(id).first<any>()
 if (!row) missing()
 const quote = parse(row)
 try { await resolveBuyingProfile(db,actor,await account(db,actor,quote.accountId),quote.buyingProfile?.id);await requireCompanyRight(db,actor,quote.accountId,'purchasing') } catch { missing() }
 return quote
}

export async function readQuotes(db: D1Database, actor: Actor, accountId: string | null) {
 requirePerson(actor)
 const ids = accountId ? [(await account(db, actor, accountId)).id] : (await accounts(db, actor)).map(row => row.id)
 for(const id of ids)await requireCompanyRight(db,actor,id,'purchasing')
 const rows = ids.length ? (await db.prepare('SELECT value_json,revision FROM bw_quotes WHERE account_id IN (SELECT value FROM json_each(?)) ORDER BY rowid DESC').bind(JSON.stringify(ids)).all<any>()).results : []
 const visible:Quote[]=[];for(const row of rows){const quote=parse(row);try{await resolveBuyingProfile(db,actor,await account(db,actor,quote.accountId),quote.buyingProfile?.id);visible.push(quote)}catch(error){if(!(error instanceof Error&&'status' in error&&error.status===404))throw error}}
 return threaded(db, actor, visible, supplierDate(await now()))
}

export async function quoteResponse(db: D1Database, actor: Actor, id: string) {
 requirePerson(actor)
 return (await threaded(db, actor, [await readQuote(db, actor, id)], supplierDate(await now())))[0]
}

export async function quoteAttachment(env: Bindings, actor: Actor, id: string, entryId: string) {
 requirePerson(actor)
 await readQuote(env.DB, actor, id)
 return attachmentResponse(env, actor, id, entryId)
}

const usd = (cents: number,currency:'USD'|'CAD'|'EUR'|'GBP'='USD') => `${currency==='USD'?'$':currency+' '}${Math.floor(cents / 100).toLocaleString('en-US')}.${String(cents % 100).padStart(2, '0')}`
const lineKey = (line: Line) => `${line.sku}${line.unit ? ` (${line.unit})` : ''}`
/** ORD-005: what a revision changed against the one before it (the request, for revision 1), in the buyer's terms. */
function changesFrom(previous: { lines: Line[]; termsDays?: number; shipping?: string; validUntil?: string } | undefined, next: QuoteRevision,currency:'USD'|'CAD'|'EUR'|'GBP'='USD') {
 const usd=(cents:number)=>`${currency==='USD'?'$':currency+' '}${Math.floor(cents/100).toLocaleString('en-US')}.${String(cents%100).padStart(2,'0')}`
 const before = new Map((previous?.lines ?? []).map(line => [lineKey(line), line])), after = new Set(next.lines.map(lineKey)), changes: string[] = []
 for (const line of next.lines) {
  const old = before.get(lineKey(line))
  if (!old) { changes.push(`${lineKey(line)} added: ${line.quantity} for ${usd(line.lineCents!)}`); continue }
  if (String(old.quantity) !== String(line.quantity)) changes.push(`${lineKey(line)} quantity ${old.quantity} → ${line.quantity}`)
  if (old.lineCents !== line.lineCents) changes.push(`${lineKey(line)} ${usd(old.lineCents!)} → ${usd(line.lineCents!)}${line.negotiatedUnitCents !== undefined ? ` (${usd(line.negotiatedUnitCents)} each)` : line.discountBps !== undefined ? ` (${line.discountBps} bps off)` : ''}`)
 }
 for (const key of before.keys()) if (!after.has(key)) changes.push(`${key} removed`)
 if (previous?.termsDays !== undefined && previous.termsDays !== next.termsDays) changes.push(`Payment terms net ${previous.termsDays} → net ${next.termsDays} days`)
 if (previous?.shipping !== undefined && previous.shipping !== next.shipping) changes.push(`Shipping note “${previous.shipping}” → “${next.shipping}”`)
 if (previous?.validUntil !== undefined && previous.validUntil !== next.validUntil) changes.push(`Valid through ${previous.validUntil} → ${next.validUntil}`)
 return changes
}

// Quotes read as people say them, like orders: Q-10001, then the next number.
async function nextQuote(db: D1Database) {
 const rows = await db.prepare('SELECT id FROM bw_quotes').all<{ id: string }>()
 return `Q-${rows.results.reduce((top, { id }) => Math.max(top, Number(/^Q-(\d{1,9})$/.exec(id)?.[1] ?? 0)), 10000) + 1}`
}

/** A proposed line: unitCents negotiates the selling-unit price; discountBps takes a percentage off the basis line. */
function quoteLine(line: Line, input: any): QuoteLine {
 const basis = { basisUnitCents: line.unitCents, basisLineCents: line.lineCents! }
 if (input?.unitCents !== undefined && input?.discountBps !== undefined) fail('INPUT', `${line.sku}: give a quoted unit price or a discount, not both.`, 400)
 if (input?.unitCents !== undefined) {
  const unitCents = integer(input.unitCents, `${line.sku} quoted unit price (cents)`, 0, 1_000_000_000)
  return { ...line, ...basis, negotiatedUnitCents: unitCents, unitCents, lineCents: half(quantityMicro(line.quantity) * BigInt(unitCents), 1_000_000n) }
 }
 if (input?.discountBps !== undefined) {
  const discountBps = integer(input.discountBps, `${line.sku} discount (basis points)`, 0, 10000)
  return { ...line, ...basis, discountBps, lineCents: half(BigInt(line.lineCents!) * BigInt(10000 - discountBps), 10000n) }
 }
 return { ...line, ...basis }
}

const sources: Record<string, string> = { 'quote.proposed': 'quote.propose', 'quote.discount-approved': 'quote.approve', 'quote.accepted': 'quote.accept' }
async function save(db: D1Database, actor: Actor, before: Quote, after: Omit<Quote, 'revision'>, action: string, reason: string, extra: D1PreparedStatement[] = [], orderId?: string) {
 const revision = crypto.randomUUID()
 const profile=await orderBuyingProfile(db,actor,await account(db,actor,before.accountId),before)
 await commit(db, actor, [profile.guard,
  db.prepare('UPDATE bw_quotes SET value_json=?,revision=?,order_id=? WHERE id=? AND revision=? AND order_id IS NULL').bind(JSON.stringify(after), revision, orderId ?? null, before.id, before.revision), changed(db),
  ...extra,
  audit(db, actor, before.id, action, { accountId: before.accountId, ...(orderId ? { orderId } : {}), revision: `${before.id}:r${after.revisions.length}:${revision}`, source: sources[action], reason }),
 ])
 return { ...after, revision }
}

export async function quoteCommand(env: Bindings, actor: Actor, type: string, p: any) {
 requirePerson(actor)
 const at = (await now()).toISOString(), today = supplierDate(new Date(at))
 if (type === 'quote.request') {
  const profile = await resolveBuyingProfile(env.DB,actor,await account(env.DB,actor,text(p.accountId,'Account')),p.profileId),selected=profile.selected
  requireActiveAccount(selected)
  await requireCompanyRight(env.DB,actor,selected.id,'purchaser')
  if (!Array.isArray(p.lines) || !p.lines.length || p.lines.length > 100) fail('LINES', 'Choose between one and 100 lines.', 400)
  const offers = await catalogue(env, selected), lines = prepareLines(p.lines, offers.items, today, false)
  const id = await nextQuote(env.DB), revision = crypto.randomUUID()
  const quote: Omit<Quote, 'revision'> = { ...(selected.buyingProfile?{buyingProfile:selected.buyingProfile}:{}),id, accountId: selected.id, customerName: selected.value.name, currency: selected.value.currency??'USD', status: 'requested', requestedBy: actor.id, requestedAt: at, note: note(p.note, 'Quote note', 1000), request: lines, revisions: [] }
  await commit(env.DB, actor, [profile.guard,activeAccountGuard(env.DB, selected), env.DB.prepare('INSERT INTO bw_quotes(id,account_id,value_json,revision) VALUES(?,?,?,?)').bind(id, selected.id, JSON.stringify(quote), revision), audit(env.DB, actor, id, 'quote.requested', { accountId: selected.id, revision: `${id}:r0:${revision}`, source: 'quote.request', reason: `Requested a quote for ${lines.length} cart ${lines.length === 1 ? 'line' : 'lines'} at current prices; no stock reserved.` }), notice(env.DB, actor, { id, accountId: selected.id }, 'supplier', 'requested', `${selected.value.name} requested quote ${id} for ${lines.length} ${lines.length === 1 ? 'line' : 'lines'}.`, at, await supplierRoute(env.DB, selected.id, actor.id))])
  return { ...quote, revision }
 }
 const quote = await readQuote(env.DB, actor, text(p.quoteId, 'Quote', 40)), latest = quote.revisions.at(-1)
 if (type === 'quote.message' || type === 'quote.read') return threadCommand(env, actor, type, quote, p, at)
 if (type === 'quote.accept') {
  if (supplier(actor)) fail('BUYER_REQUIRED', 'The trade account’s buyer accepts a quote.', 403)
  const number = integer(p.number, 'Quote revision', 1, 1000)
  if (quote.accepted) {
   if (quote.accepted.revision === number) return { quote: view(actor, quote, today), order: await readOrder(env.DB, actor, quote.accepted.orderId) }
   fail('QUOTE_ACCEPTED', `This quote was already accepted at revision ${quote.accepted.revision}.`)
  }
  if (!latest || !quote.revisions.some(revision => revision.number === number)) missing()
  if (latest.number !== number) fail('QUOTE_REVISED', `Revision ${number} was replaced by revision ${latest.number}. Review the current revision before accepting.`)
  if (quote.status !== 'proposed') fail('QUOTE_APPROVAL', 'This revision is waiting for the supplier’s discount approval.')
  if (today > latest.validUntil) fail('QUOTE_EXPIRED', `This quote expired after ${latest.validUntil} (Eastern time). Ask the supplier for a revised quote.`)
  const selected = (await orderBuyingProfile(env.DB,actor,await account(env.DB,actor,quote.accountId),quote)).selected
  requireActiveAccount(selected)
  if(quote.currency!==(selected.value.currency??'USD'))fail('QUOTE_STALE','The quote currency changed. Request a new quote.')
  // Acceptance recalculates every line at today's rule (PRI-002), quantity rules (PRI-003) and live Pier stock.
  const offers = await catalogue(env, selected), current = prepareLines(latest.lines.map(line => ({ sku: line.sku, unit: line.unit, quantity: line.quantity })), offers.items, today)
  const basis = (line: Line) => JSON.stringify([line.unitCents, line.lineCents, line.pricing?.reason, line.pricing?.segments, line.pricing?.discountBps])
  if (current.some((line, index) => basis(line) !== basis({ ...latest.lines[index], unitCents: latest.lines[index].basisUnitCents, lineCents: latest.lines[index].basisLineCents }))) fail('QUOTE_STALE', 'The price list or pricing rule behind this quote changed. Ask the supplier for a revised quote.')
  const lines: Line[] = latest.lines.map((line, index) => {
   const { basisUnitCents, basisLineCents, discountBps, negotiatedUnitCents, ...priced } = line
   return { ...priced, itemId: current[index].itemId, quote: { id: quote.id, revision: number, basisUnitCents, basisLineCents, ...(discountBps !== undefined ? { discountBps } : {}), ...(negotiatedUnitCents !== undefined ? { negotiatedUnitCents } : {}) } }
  })
  if (latest.totalCents < selected.value.minimumCents) fail('MINIMUM', 'The quoted total is below this customer’s minimum order value.')
  // ACC-003: a converted order snapshots the account's default bill-to and ship-to.
  const billTo = await locationSnapshot(env.DB, selected, 'bill-to', undefined), shipTo = await locationSnapshot(env.DB, selected, 'ship-to', undefined)
  const delivery=await acceptDelivery(env,actor,{account:selected,lines,shipTo,quotes:latest.freightQuotes},latest.delivery,p.deliveryAcknowledged)
  const id = await nextNumber(env.DB), orderRevision = crypto.randomUUID()
  let order: Order = { creditPolicySnapshot:creditSignature(await creditPolicy(env.DB,selected.id)), usdConversion:conversionSnapshot(selected,new Date(at)), ...(selected.buyingProfile?{buyingProfile:selected.buyingProfile}:{}),id, accountId: selected.id, accountRevision: selected.revision, customerName: selected.value.name, pierCustomerId: wooSelected(env)?selected.value.providerReferences!.woocommerce:selected.value.pierCustomerId, pierOrigin: (await pierOrigin(env))!, reference: '', lines, delivery, totalCents: deliveryTotal(lines,delivery), ...(selected.value.priceDisplay?{priceDisplay:selected.value.priceDisplay}:{}),currency: selected.value.currency??'USD', termsDays: latest.termsDays, status: 'submitted', preparedBy: latest.proposedBy, preparedAt: at, submittedBy: actor.id, quote: { id: quote.id, revision: number, shipping: latest.shipping, validUntil: latest.validUntil }, ...(billTo ? { billTo } : {}), ...(shipTo ? { shipTo } : {}), revision: orderRevision }
  const terms=await termsAtSubmission(env,actor,selected,order.id,p.termsAcceptance,at)
  if(terms.acceptance)order.termsAcceptance=terms.acceptance
  const submission=await companySubmission(env,actor,order);order=submission.order
  const accepted = { ...quote, status: 'accepted' as const, accepted: { revision: number, by: actor.id, at, orderId: id } }
  try {
   const saved = await save(env.DB, actor, quote, accepted, 'quote.accepted', `Buyer accepted revision ${number} and converted it into order ${id}.`, [...await admitCredit(env,order),await deltaEntryGuard(env.DB,selected.id),submission.guard,terms.guard,...terms.statements,activeAccountGuard(env.DB, selected), shippingGuard(env.DB,delivery), env.DB.prepare('INSERT INTO bw_orders VALUES(?,?,?,?)').bind(id, selected.id, JSON.stringify(order), orderRevision),...(submission.waiting?await approvalNoticeStatements(env.DB,order,new Date(at),''):await confirmationStatements(env.DB,actor,order,'submitted')), audit(env.DB, actor, id, submission.waiting?'order.company-approval-requested':'order.submitted', { accountId: selected.id, orderId: id, revision: orderRevision, source: 'quote.accept', reason: `Buyer accepted quote ${quote.id} revision ${number}; submitted for supplier review with the quoted prices and terms.` }), notice(env.DB, actor, quote, 'supplier', 'accepted', `${quote.customerName} accepted ${quote.id} revision ${number}; order ${id} awaits supplier review.`, at, await supplierRoute(env.DB, quote.accountId, actor.id))], id)
   if (!submission.waiting) await emailLatestConfirmation(env, id)
   return { quote: view(actor, saved, today), order }
  } catch (error) {
   // A concurrent acceptance of the same revision already converted it: return that one order.
   const again = await readQuote(env.DB, actor, quote.id)
   if (again.accepted?.revision === number) return { quote: view(actor, again, today), order: await readOrder(env.DB, actor, again.accepted.orderId) }
   throw error
  }
 }
 requireSupplier(actor)
 if (quote.accepted) fail('QUOTE_ACCEPTED', `This quote was converted into order ${quote.accepted.orderId}; it can no longer change.`)
 if (p.revision !== quote.revision) fail('CHANGED', 'This quote changed. Refresh it before continuing.')
 if (type === 'quote.propose') {
  const selected = (await orderBuyingProfile(env.DB,actor,await account(env.DB,actor,quote.accountId),quote)).selected
  if(quote.currency!==(selected.value.currency??'USD'))fail('QUOTE_STALE','The quote currency changed. Request a new quote.')
  if (!Array.isArray(p.lines) || !p.lines.length || p.lines.length > 100) fail('LINES', 'Choose between one and 100 lines.', 400)
  const validUntil = day(p.validUntil)
  if (validUntil < today) fail('INPUT', 'Valid through cannot be before today (Eastern time).', 400)
  const offers = await catalogue(env, selected), lines = prepareLines(p.lines, offers.items, today, false).map((line, index) => quoteLine(line, p.lines[index]))
  const basisCents = lines.reduce((sum, line) => sum + line.basisLineCents, 0), totalCents = lines.reduce((sum, line) => sum + line.lineCents!, 0)
  if (!Number.isSafeInteger(basisCents) || !Number.isSafeInteger(totalCents)) fail('MONEY', 'Quote total is outside the supported exact-cent range.', 400)
  const discounted = lines.some(line => line.lineCents! < line.basisLineCents), authorizedDiscount=discounted&&quote.currency==='USD'&&!!actor.staff&&lines.reduce((sum,line)=>sum+Math.max(0,line.basisLineCents-line.lineCents!),0)<=actor.staff.discountLimitCents, number = quote.revisions.length + 1
  const revision: QuoteRevision = { number, lines, basisCents, totalCents, termsDays: p.termsDays === undefined ? selected.value.termsDays : integer(p.termsDays, 'Payment terms (days)', 0, 365), shipping: note(p.shipping, 'Shipping', 160), validUntil, note: note(p.note, 'Quote note', 1000), proposedBy: actor.id, proposedByEmail: actor.email, proposedAt: at, discounted,...(authorizedDiscount?{approval:{by:actor.id,at,reason:text(p.reason,'Discount reason',240)}}:{}) }
  const shipTo=await locationSnapshot(env.DB,selected,'ship-to',undefined),context={account:selected,lines,shipTo,currency:quote.currency}
  if(p.freightQuote)revision.freightQuotes=[await freightQuote(env,actor,context,p.freightQuote)]
  const offered=await deliveryOptions(env,{...context,quotes:revision.freightQuotes})
  if(offered.required){
   const selectedOption=offered.options.find(o=>o.methodId===p.shippingMethodId&&o.warehouse===(p.shippingWarehouse??''))
   if(!selectedOption)fail('SHIPPING_REQUIRED','Choose an eligible quoted delivery method for this revision.')
   revision.delivery=await selectDelivery(env,{...context,quotes:revision.freightQuotes},{...selectedOption,ownCarrierAccount:p.ownCarrierAccount})
  }
  revision.changes = changesFrom(latest ?? { lines: quote.request }, revision,quote.currency)
  if(JSON.stringify(latest?.delivery)!==JSON.stringify(revision.delivery))revision.changes.push(`Delivery: ${revision.delivery?`${revision.delivery.name}, ${revision.delivery.totalCents} ${quote.currency} cents, ${revision.delivery.windowStart}–${revision.delivery.windowEnd}`:'no configured delivery'}`)
  // The buyer hears of a revision once it can be accepted; a discount first notifies the staff who approve it.
  const waits=discounted&&!authorizedDiscount
  const told = waits ? notice(env.DB, actor, quote, 'supplier', 'revision', `Revision ${number} of ${quote.id} by ${actor.email} waits for discount approval.`, at) : notice(env.DB, actor, quote, 'buyer', 'revision', `Revision ${number} of ${quote.id} from ${actor.email} is ready: ${usd(totalCents,quote.currency)}, net ${revision.termsDays} days, valid through ${validUntil} (Eastern time).`, at)
  return save(env.DB, actor, quote, { ...quote, status: waits ? 'awaiting-approval' : 'proposed', revisions: [...quote.revisions, revision] }, 'quote.proposed', `Proposed revision ${number}: ${totalCents} ${quote.currency} cents against a current price basis of ${basisCents}, net ${revision.termsDays} days, valid through ${validUntil} (Eastern time)${waits ? '; discount awaits approval' : authorizedDiscount?'; approved within the owner-granted amount allowance: '+revision.approval!.reason:''}.`, [told])
 }
 if (type === 'quote.approve') {
  if(actor.staff&&quote.currency!=='USD')fail('FORBIDDEN','Functional discount allowances are USD-denominated; a supplier owner or admin must review this currency.',403)
  if (!latest || quote.status !== 'awaiting-approval' || latest.number !== integer(p.number, 'Quote revision', 1, 1000)) fail('QUOTE_APPROVAL', 'Only the latest revision waiting for discount approval can be approved.')
  const reason = text(p.reason, 'Approval reason', 240)
  if(actor.staff&&(actor.staff.role!=='sales-manager'||latest.lines.reduce((sum,line)=>sum+Math.max(0,line.basisLineCents-line.lineCents!),0)>actor.staff.discountLimitCents))fail('FORBIDDEN','This discount exceeds your manager approval allowance.',403)
  return save(env.DB, actor, quote, { ...quote, status: 'proposed', revisions: [...quote.revisions.slice(0, -1), { ...latest, approval: { by: actor.id, at, reason } }] }, 'quote.discount-approved', `Approved a ${latest.basisCents - latest.totalCents} ${quote.currency} cent discount below the current price basis on revision ${latest.number}: ${reason}`, [notice(env.DB, actor, quote, 'buyer', 'revision', `Revision ${latest.number} of ${quote.id} from ${latest.proposedByEmail ?? 'your supplier'} is ready: ${usd(latest.totalCents,quote.currency)}, net ${latest.termsDays} days, valid through ${latest.validUntil} (Eastern time).`, at)])
 }
 fail('COMMAND', 'Unknown quote command.', 404)
}
