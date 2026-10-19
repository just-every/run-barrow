import type { Bindings } from '../auth.server'
import { account, accounts } from './accounts'
import { readOrder } from './orders'
import { catalogue, decimal } from './pier'
import { digest } from './access'
import { fail, text, supplierDate, type Actor, type Order } from './model'
import { requireActiveAccount } from './account-profile'

export type ReorderSelection = { sku: string; replacementSku?: string }
export type ReorderReview = {
 orderId: string; accountId: string; sourceRevision: string; accountRevision: string
 selections: ReorderSelection[]; deliveryLocation: string; currency: 'USD'; originalCurrency: 'USD'|'AUD'
 termsDays: number; originalTermsDays: number; minimumCents: number; totalCents: number
 lines: { originalSku: string; sku: string; quantity: number; originalUnitCents: number; unitCents: number|null; originalMinQty: number; minQty: number|null; available: string|null; differences: string[] }[]
 blockers: string[]; fingerprint: string
}

/** Search only the caller's visible history; date bounds are inclusive supplier calendar days. */
export async function orderHistory(env: Bindings, actor: Actor, query: URLSearchParams) {
 const visible = await accounts(env.DB, actor)
 const rows = await env.DB.prepare('SELECT value_json,revision FROM bw_orders WHERE account_id IN (SELECT value FROM json_each(?)) ORDER BY rowid DESC').bind(JSON.stringify(visible.map(a => a.id))).all<{value_json:string;revision:string}>()
 const term = (key: string) => (query.get(key) ?? '').trim().toLocaleLowerCase('en-US')
 const from = query.get('from') || '', to = query.get('to') || ''
 for (const date of [from, to]) if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date+'T12:00:00Z')) || new Date(date+'T12:00:00Z').toISOString().slice(0,10) !== date)) fail('DATE','Use a valid YYYY-MM-DD history date.',400)
 if (from && to && from > to) fail('DATE','The start date must precede the end date.',400)
 return rows.results.map(row => ({...JSON.parse(row.value_json),revision:row.revision} as Order)).filter(order => {
  const day = supplierDate(new Date(order.preparedAt))
  return order.status !== 'superseded' && order.reference.toLocaleLowerCase('en-US').includes(term('po')) && (!from || day >= from) && (!to || day <= to) && order.lines.some(line => line.sku.toLocaleLowerCase('en-US').includes(term('sku'))) && (order.deliveryLocation ?? '').toLocaleLowerCase('en-US').includes(term('location'))
 })
}

/** Build the comparison from current authority, never caller-supplied prices or quantities. */
export async function reviewReorder(env: Bindings, actor: Actor, payload: any) {
 const original = await readOrder(env.DB, actor, text(payload.orderId,'Original order'))
 if (!['submitted','reserving','shortfall','approved'].includes(original.status)) fail('REORDER','Choose an order that was submitted, rather than a draft.')
 const selected = await account(env.DB, actor, original.accountId)
 requireActiveAccount(selected)
 const available = await catalogue(env, selected)
 if (!Array.isArray(payload.selections) || !payload.selections.length || payload.selections.length > 100) fail('LINES','Select between one and 100 original lines.',400)
 const seen = new Set<string>(), targets = new Set<string>()
 const selections:ReorderSelection[] = payload.selections.map((line:any) => {
  const sku = text(line.sku,'Original SKU',100), replacementSku = line.replacementSku ? text(line.replacementSku,'Replacement SKU',100) : undefined
  if (seen.has(sku) || !original.lines.some(line => line.sku === sku)) fail('LINES','Select each original SKU at most once.',400)
  seen.add(sku)
  const target = replacementSku ?? sku
  if (targets.has(target)) fail('LINES','Choose distinct target SKUs; quantities are never silently merged.',400)
  targets.add(target)
  return {sku,...(replacementSku && replacementSku !== sku ? {replacementSku} : {})}
 }).sort((a:ReorderSelection,b:ReorderSelection) => a.sku.localeCompare(b.sku))
 const blockers:string[] = []
 const lines = selections.map(selection => {
  const before = original.lines.find(line => line.sku === selection.sku)!, sku = selection.replacementSku ?? selection.sku
  const offer = available.items.find(item => item.sku === sku)
  const differences:string[] = []
  if (sku !== before.sku) differences.push(`Replacement: ${before.sku} → ${sku}`)
  if (!offer) { differences.push('Unavailable on the current account assortment'); blockers.push(`${sku}: choose an available replacement or deselect this line.`) }
  if (offer && (offer.unitCents !== before.unitCents || (original.currency ?? 'AUD') !== available.currency)) differences.push('Unit price or currency changed')
  if (offer && offer.minQty !== before.minQty) differences.push('Minimum quantity changed')
  if (offer && before.quantity < offer.minQty) blockers.push(`${sku}: original quantity ${before.quantity} is below the current minimum ${offer.minQty}. Start a new order to change quantities.`)
  if (offer && BigInt(before.quantity)*1000000n > decimal(offer.available)) blockers.push(`${sku}: insufficient current availability for ${before.quantity} units.`)
  return {originalSku:before.sku,sku,quantity:before.quantity,originalUnitCents:before.unitCents,unitCents:offer?.unitCents ?? null,originalMinQty:before.minQty,minQty:offer?.minQty ?? null,available:offer?.available ?? null,differences}
 })
 const totalCents = lines.reduce((sum,line) => sum + line.quantity*(line.unitCents ?? 0),0)
 if (!Number.isSafeInteger(totalCents)) fail('MONEY','Order total is outside the supported exact-cent range.',400)
 if (totalCents < selected.value.minimumCents) blockers.push(`Selected lines do not meet the current order minimum of ${selected.value.minimumCents} USD cents.`)
 const review = {orderId:original.id,accountId:selected.id,sourceRevision:original.revision,accountRevision:selected.revision,selections,deliveryLocation:original.deliveryLocation ?? '',currency:available.currency,originalCurrency:original.currency ?? 'AUD',termsDays:selected.value.termsDays,originalTermsDays:original.termsDays,minimumCents:selected.value.minimumCents,totalCents,lines,blockers}
 return {review:{...review,fingerprint:await digest(JSON.stringify(review))} as ReorderReview,selected,available}
}
