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
import { fail, integer, requirePerson, requireSupplier, supplier, supplierDate, text, type Actor, type Line, type Order } from './model'
import { nextNumber, readOrder } from './orders'
import { catalogue, pierOrigin } from './pier'
import { prepareLines } from './unit-lines'
import { quantityMicro } from './units'

export type QuoteLine = Line & { basisUnitCents: number; basisLineCents: number; discountBps?: number; negotiatedUnitCents?: number }
export type QuoteRevision = { number: number; lines: QuoteLine[]; basisCents: number; totalCents: number; termsDays: number; shipping: string; validUntil: string; note: string; proposedBy: string; proposedAt: string; discounted: boolean; approval?: { by: string; at: string; reason: string } }
export type Quote = { id: string; accountId: string; customerName: string; currency: 'USD'; status: 'requested' | 'awaiting-approval' | 'proposed' | 'accepted'; requestedBy: string; requestedAt: string; note: string; request: Line[]; revisions: QuoteRevision[]; accepted?: { revision: number; by: string; at: string; orderId: string }; revision: string }

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

async function readQuote(db: D1Database, actor: Actor, id: string) {
 const row = await db.prepare('SELECT value_json,revision FROM bw_quotes WHERE id=?').bind(id).first<any>()
 if (!row) missing()
 const quote = parse(row)
 try { await account(db, actor, quote.accountId) } catch { missing() }
 return quote
}

export async function readQuotes(db: D1Database, actor: Actor, accountId: string | null) {
 requirePerson(actor)
 const ids = accountId ? [(await account(db, actor, accountId)).id] : (await accounts(db, actor)).map(row => row.id)
 const rows = ids.length ? (await db.prepare('SELECT value_json,revision FROM bw_quotes WHERE account_id IN (SELECT value FROM json_each(?)) ORDER BY rowid DESC').bind(JSON.stringify(ids)).all<any>()).results : []
 const today = supplierDate(await now())
 return rows.map(row => view(actor, parse(row), today))
}

export async function quoteResponse(db: D1Database, actor: Actor, id: string) {
 requirePerson(actor)
 return view(actor, await readQuote(db, actor, id), supplierDate(await now()))
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
 await commit(db, actor, [
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
  const selected = await account(env.DB, actor, text(p.accountId, 'Account'))
  requireActiveAccount(selected)
  if (!Array.isArray(p.lines) || !p.lines.length || p.lines.length > 100) fail('LINES', 'Choose between one and 100 lines.', 400)
  const offers = await catalogue(env, selected), lines = prepareLines(p.lines, offers.items, today, false)
  const id = await nextQuote(env.DB), revision = crypto.randomUUID()
  const quote: Omit<Quote, 'revision'> = { id, accountId: selected.id, customerName: selected.value.name, currency: 'USD', status: 'requested', requestedBy: actor.id, requestedAt: at, note: note(p.note, 'Quote note', 1000), request: lines, revisions: [] }
  await commit(env.DB, actor, [activeAccountGuard(env.DB, selected), env.DB.prepare('INSERT INTO bw_quotes(id,account_id,value_json,revision) VALUES(?,?,?,?)').bind(id, selected.id, JSON.stringify(quote), revision), audit(env.DB, actor, id, 'quote.requested', { accountId: selected.id, revision: `${id}:r0:${revision}`, source: 'quote.request', reason: `Requested a quote for ${lines.length} cart ${lines.length === 1 ? 'line' : 'lines'} at current prices; no stock reserved.` })])
  return { ...quote, revision }
 }
 const quote = await readQuote(env.DB, actor, text(p.quoteId, 'Quote', 40)), latest = quote.revisions.at(-1)
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
  const selected = await account(env.DB, actor, quote.accountId)
  requireActiveAccount(selected)
  // Acceptance recalculates every line at today's rule (PRI-002), quantity rules (PRI-003) and live Pier stock.
  const offers = await catalogue(env, selected), current = prepareLines(latest.lines.map(line => ({ sku: line.sku, unit: line.unit, quantity: line.quantity })), offers.items, today)
  const basis = (line: Line) => JSON.stringify([line.unitCents, line.lineCents, line.pricing?.reason, line.pricing?.segments, line.pricing?.discountBps])
  if (current.some((line, index) => basis(line) !== basis({ ...latest.lines[index], unitCents: latest.lines[index].basisUnitCents, lineCents: latest.lines[index].basisLineCents }))) fail('QUOTE_STALE', 'The price list or pricing rule behind this quote changed. Ask the supplier for a revised quote.')
  const lines: Line[] = latest.lines.map((line, index) => {
   const { basisUnitCents, basisLineCents, discountBps, negotiatedUnitCents, ...priced } = line
   return { ...priced, itemId: current[index].itemId, quote: { id: quote.id, revision: number, basisUnitCents, basisLineCents, ...(discountBps !== undefined ? { discountBps } : {}), ...(negotiatedUnitCents !== undefined ? { negotiatedUnitCents } : {}) } }
  })
  if (latest.totalCents < selected.value.minimumCents) fail('MINIMUM', 'The quoted total is below this customer’s minimum order value.')
  const id = await nextNumber(env.DB), orderRevision = crypto.randomUUID()
  const order: Order = { id, accountId: selected.id, accountRevision: selected.revision, customerName: selected.value.name, pierCustomerId: selected.value.pierCustomerId, pierOrigin: (await pierOrigin(env))!, reference: '', lines, totalCents: latest.totalCents, currency: 'USD', termsDays: latest.termsDays, status: 'submitted', preparedBy: latest.proposedBy, preparedAt: at, submittedBy: actor.id, quote: { id: quote.id, revision: number, shipping: latest.shipping, validUntil: latest.validUntil }, revision: orderRevision }
  const accepted = { ...quote, status: 'accepted' as const, accepted: { revision: number, by: actor.id, at, orderId: id } }
  try {
   const saved = await save(env.DB, actor, quote, accepted, 'quote.accepted', `Buyer accepted revision ${number} and converted it into order ${id}.`, [activeAccountGuard(env.DB, selected), env.DB.prepare('INSERT INTO bw_orders VALUES(?,?,?,?)').bind(id, selected.id, JSON.stringify(order), orderRevision), audit(env.DB, actor, id, 'order.submitted', { accountId: selected.id, orderId: id, revision: orderRevision, source: 'quote.accept', reason: `Buyer accepted quote ${quote.id} revision ${number}; submitted for supplier review with the quoted prices and terms.` })], id)
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
  const selected = await account(env.DB, actor, quote.accountId)
  if (!Array.isArray(p.lines) || !p.lines.length || p.lines.length > 100) fail('LINES', 'Choose between one and 100 lines.', 400)
  const validUntil = day(p.validUntil)
  if (validUntil < today) fail('INPUT', 'Valid through cannot be before today (Eastern time).', 400)
  const offers = await catalogue(env, selected), lines = prepareLines(p.lines, offers.items, today, false).map((line, index) => quoteLine(line, p.lines[index]))
  const basisCents = lines.reduce((sum, line) => sum + line.basisLineCents, 0), totalCents = lines.reduce((sum, line) => sum + line.lineCents!, 0)
  if (!Number.isSafeInteger(basisCents) || !Number.isSafeInteger(totalCents)) fail('MONEY', 'Quote total is outside the supported exact-cent range.', 400)
  const discounted = lines.some(line => line.lineCents! < line.basisLineCents), number = quote.revisions.length + 1
  const revision: QuoteRevision = { number, lines, basisCents, totalCents, termsDays: p.termsDays === undefined ? selected.value.termsDays : integer(p.termsDays, 'Payment terms (days)', 0, 365), shipping: note(p.shipping, 'Shipping', 160), validUntil, note: note(p.note, 'Quote note', 1000), proposedBy: actor.id, proposedAt: at, discounted }
  return save(env.DB, actor, quote, { ...quote, status: discounted ? 'awaiting-approval' : 'proposed', revisions: [...quote.revisions, revision] }, 'quote.proposed', `Proposed revision ${number}: ${totalCents} USD cents against a current price basis of ${basisCents}, net ${revision.termsDays} days, valid through ${validUntil} (Eastern time)${discounted ? '; discount awaits approval' : ''}.`)
 }
 if (type === 'quote.approve') {
  if (!latest || quote.status !== 'awaiting-approval' || latest.number !== integer(p.number, 'Quote revision', 1, 1000)) fail('QUOTE_APPROVAL', 'Only the latest revision waiting for discount approval can be approved.')
  const reason = text(p.reason, 'Approval reason', 240)
  return save(env.DB, actor, quote, { ...quote, status: 'proposed', revisions: [...quote.revisions.slice(0, -1), { ...latest, approval: { by: actor.id, at, reason } }] }, 'quote.discount-approved', `Approved a ${latest.basisCents - latest.totalCents} USD cent discount below the current price basis on revision ${latest.number}: ${reason}`)
 }
 fail('COMMAND', 'Unknown quote command.', 404)
}
