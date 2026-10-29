import { applyPromotions,promotionSettings } from './promotions'
import { orderBuyingProfile } from './buying-profiles'
// ORD-011 slice for ORD-014: the account buyer changes line quantities on a submitted order before the supplier
// accepts it. No stock is reserved yet, so nothing is handed to Pier; the result is one new confirmation revision
// carrying exactly the changed lines. Accepted orders, supplier-started edits, line/date/address changes and
// delivery-priced orders stay with ORD-011.
import type { Bindings } from '../auth.server'
import { account } from './accounts'
import { activeAccountGuard, requireActiveAccount } from './account-profile'
import { catalogue } from './pier'
import { companySubmission } from './company-purchase'
import { now } from './clock'
import { prepareLines } from './unit-lines'
import { termsAtSubmission } from './sales-terms'
import { fail, integer, supplier, supplierDate, type Actor, type Line, type Order } from './model'
import type { LineChange } from './confirmations'

export async function revisedOrder(env: Bindings, actor: Actor, order: Order, p: any) {
 if (supplier(actor)) fail('BUYER_REQUIRED', 'Only the account buyer can revise a submitted order here. Supplier-started edits are not available yet.', 403)
 if (order.status !== 'submitted') fail('REVISION_LOCKED', 'Only a submitted order the supplier has not accepted can be revised. Accepted orders keep their stock reservation unchanged.')
 if (p.revision !== order.revision) fail('CHANGED', 'Refresh the exact order before revising it.')
 if (order.delivery) fail('REVISION_DELIVERY', 'The accepted delivery charge was quoted for the original lines. Prepare a new draft to change quantities.')
 const selected = (await orderBuyingProfile(env.DB,actor,await account(env.DB,actor,order.accountId),order)).selected
 requireActiveAccount(selected)
 if (selected.revision !== order.accountRevision) fail('PRICE_CHANGED', 'The price list or terms changed. Prepare a new draft for review.')
 if (!Array.isArray(p.changes) || !p.changes.length || p.changes.length > order.lines.length) fail('INPUT', 'Choose the line quantities to change.', 400)
 const quantities = new Map<number, unknown>()
 for (const change of p.changes) {
  const index = integer(change?.line, 'Line', 0, order.lines.length - 1)
  if (quantities.has(index)) fail('INPUT', 'Change each line once.', 400)
  if (order.lines[index].quote) fail('QUOTED_LINE', 'A quoted line keeps its accepted quote. Ask the supplier for a revised quote.')
  quantities.set(index, change.quantity)
 }
 const offers = await catalogue(env, selected), today = supplierDate(await now())
 const input = order.lines.map((line, index) => ({ sku: line.sku, unit: line.unit, quantity: quantities.has(index) ? quantities.get(index) : line.quantity }))
 // Promiseable stock is checked only when a revision asks for more; a reduction never needs new stock.
 const increases = order.lines.some((line, index) => quantities.has(index) && Number(quantities.get(index)) > line.quantity)
 const raw = prepareLines(input, offers.items, today, increases)
 const priced=applyPromotions(raw.map((l,i)=>({...l,...(order.lines[i].quote?{quote:order.lines[i].quote}:{})})),(await promotionSettings(env.DB)).offers,selected.id,today)
 const changes: LineChange[] = []
 const lines: Line[] = order.lines.map((line, index) => {
  const next = priced[index], lineCents = line.lineCents ?? line.quantity * line.unitCents
  if (!quantities.has(index)) {
   if (next.unitCents !== line.unitCents || raw[index].lineCents !== (line.pricing?.lineCents??line.promotion?.basisCents??lineCents)) fail('PRICE_CHANGED', 'The effective pricing rule changed. Prepare a new draft for review.')
   if(next.lineCents===lineCents&&JSON.stringify(next.promotion)===JSON.stringify(line.promotion))return line
   changes.push({line:index,sku:line.sku,...(line.unit?{unit:line.unit}:{}),before:{quantity:line.quantity,lineCents},after:{quantity:line.quantity,lineCents:next.lineCents!}})
   const {promotion,...kept}=line;return {...kept,lineCents:next.lineCents,...(next.promotion?{promotion:next.promotion}:{})}
  }
  if (next.quantity === line.quantity) fail('INPUT', `Line ${index + 1} already has quantity ${line.quantity}.`, 400)
  const { pricing, promotion, ...kept } = line
  const revised: Line = { ...kept, quantity: next.quantity, unitCents: next.unitCents, lineCents: next.lineCents, baseQuantity: next.baseQuantity, ...(next.pricing ? { pricing: next.pricing } : {}),...(next.promotion?{promotion:next.promotion}:{}) }
  changes.push({ line: index, sku: line.sku, ...(line.unit ? { unit: line.unit } : {}), before: { quantity: line.quantity, lineCents }, after: { quantity: next.quantity, lineCents: next.lineCents! } })
  return revised
 })
 const totalCents = lines.reduce((sum, line) => sum + (line.lineCents ?? line.quantity * line.unitCents), 0)
 if (totalCents < selected.value.minimumCents) fail('MINIMUM', 'The revised order is below this customer’s minimum order value.')
 const at = (await now()).toISOString(), terms = await termsAtSubmission(env, actor, selected, order.id, p.termsAcceptance, at)
 const submission = await companySubmission(env, actor, { ...order, lines, totalCents })
 if (submission.waiting) fail('COMPANY_APPROVAL', 'This revision needs company approval. Prepare a new draft and submit it for approval.')
 const revised: Order = { ...submission.order, ...(terms.acceptance ? { termsAcceptance: terms.acceptance } : {}), revisedBy: actor.id, revisedAt: at }
 const reason = `Buyer revised ${changes.map(change => `line ${change.line + 1} ${change.sku} from ${change.before.quantity} to ${change.after.quantity}`).join('; ')} before supplier acceptance; no stock was reserved, so nothing was sent to Pier.`
 return { order: revised, changes, reason, guards: [submission.guard, activeAccountGuard(env.DB, selected), terms.guard, ...terms.statements] }
}
