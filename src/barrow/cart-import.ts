import { requireCompanyRight } from './company-policy'
// ORD-001: quick add, pasted lines, CSV uploads and filled order forms all pass through this one server preview.
// It never writes a record: the buyer resolves every problem, chooses merge or replace, and the pad prepares the
// resulting cart through order.prepare, which re-checks prices, rules and stock.
import type { Bindings } from '../auth.server'
import { account } from './accounts'
import { catalogue, decimal } from './pier'
import { fail, supplierDate, text, type Account } from './model'
import { now } from './clock'
import { priceLine } from './pricing'
import { convertQuantity, formatMicro, quantityMicro, sellingUnits } from './units'
import { quantityMessage, quantityProblem } from './quantity-rules'
import { prepareLines } from './unit-lines'
import { groupStyles, oneSize } from './ui/styles'
import { cellValue, csvText, parseCsv, parsePaste } from './cart-csv'
import { listCsv, readList } from './lists'

type Offer = Awaited<ReturnType<typeof catalogue>>['items'][number]
type Entry = { ref: string; code?: string; quantity: string; unit?: string; buyerSku?: string; error?: string }
type Line = { key: string; sku: string; unit: string; quantity: bigint; cart: bigint; refs: string[]; parts: string[]; buyerSku?: string }
const maxLines = 100
const hidden = (code: string) => `${code} is not on this account’s price list.`

/** A SKU matches exactly, then ignoring case when that is unambiguous; otherwise a Pier barcode matches exactly. */
export function resolveCode(offers: Offer[], code: string) {
 const exact = offers.find(offer => offer.sku === code)
 if (exact) return exact
 const folded = offers.filter(offer => offer.sku.toUpperCase() === code.toUpperCase())
 return folded.length === 1 ? folded[0] : offers.find(offer => offer.barcode === code)
}

function entries(offers: Offer[], p: any): { layout: 'paste' | 'vertical' | 'matrix'; rows: Entry[] } {
 if (typeof p.paste === 'string') return { layout: 'paste', rows: parsePaste(p.paste).map((cells, index) => ({ ref: String(index + 1), code: cells[0], quantity: cells[1] ?? '', unit: cells[2], ...(cells.length > 3 ? { error: 'Use "code quantity [unit]" on each line.' } : {}) })) }
 if (typeof p.csv !== 'string') fail('INPUT', 'Paste lines or upload a CSV.', 400)
 const [header = [], ...data] = parseCsv(p.csv), names = header.map(name => name.trim().toLowerCase())
 const at = (name: string) => names.indexOf(name), get = (row: string[], name: string) => at(name) < 0 ? '' : cellValue(row[at(name)] ?? '')
 if (at('quantity') >= 0 && (at('sku') >= 0 || at('barcode') >= 0)) return { layout: 'vertical', rows: data.map((row, index) => {
  const sku = get(row, 'sku'), barcode = get(row, 'barcode'), entry: Entry = { ref: String(index + 2), quantity: get(row, 'quantity'), unit: get(row, 'unit') || undefined, buyerSku: get(row, 'buyersku') || undefined }
  if (!sku && !barcode) return { ...entry, error: 'Give a SKU or barcode.' }
  const bySku = sku ? resolveCode(offers, sku) : undefined, byBarcode = barcode ? offers.find(offer => offer.barcode === barcode) : undefined
  if (sku && barcode && bySku && byBarcode && bySku !== byBarcode) return { ...entry, code: sku, error: `SKU ${sku} and barcode ${barcode} name different products.` }
  return { ...entry, code: bySku?.sku ?? byBarcode?.sku ?? (sku || barcode) }
 }) }
 if (at('style') < 0) fail('CART_CSV', 'Use a header row with sku or barcode and quantity, or a style-by-size order form.', 400)
 const { rows: styles } = groupStyles(offers), sizes = header.map(name => name.trim().toUpperCase()).map(name => name === oneSize.toUpperCase() ? oneSize : name)
 return { layout: 'matrix', rows: data.flatMap((row, index) => {
  const key = get(row, 'style'), style = styles.find(value => value.key.toUpperCase() === key.toUpperCase())
  return sizes.flatMap((size, column) => {
   const quantity = cellValue(row[column] ?? ''), ref = `${index + 2}:${size}`
   if (['STYLE', 'NAME', 'UNITPRICEUSD'].includes(size) || !quantity) return []
   if (!style) return [{ ref, code: key, quantity, error: hidden(key || 'This style') }]
   const offer = style.cells[size]
   return [offer ? { ref, code: offer.sku, quantity } : { ref, code: key, quantity, error: `${key} is not offered in ${size}.` }]
  })
 }) }
}

/** Preview an upload or paste against this account's live catalog; with a mode, also build the merged or replaced cart. */
export async function previewCart(selected: Account, offered: Awaited<ReturnType<typeof catalogue>>, p: any) {
 const offers = offered.items, today = supplierDate(await now())
 const skip = new Set<string>(Array.isArray(p.skip) ? p.skip.map(String) : []), set = p.set && typeof p.set === 'object' ? p.set as Record<string, unknown> : {}
 const mode = p.mode === undefined ? undefined : p.mode === 'merge' || p.mode === 'replace' ? p.mode as 'merge' | 'replace' : fail('INPUT', 'Choose merge or replace.', 400)
 const { layout, rows } = entries(offers, p), lines = new Map<string, Line>()
 const add = (offer: Offer, code: string, quantity: bigint, ref?: string, buyerSku?: string) => {
  const key = `${offer.sku}|${code}`, line = lines.get(key) ?? { key, sku: offer.sku, unit: code, quantity: 0n, cart: 0n, refs: [], parts: [] }
  if (ref) { line.quantity += quantity; line.refs.push(ref); line.parts.push(formatMicro(quantity)); line.buyerSku ??= buyerSku } else line.cart += quantity
  lines.set(key, line)
 }
 const report = rows.map(row => {
  if (skip.has(row.ref)) return { ref: row.ref, input: row.code ?? '', quantity: row.quantity, status: 'left out' as const }
  const problem = (message: string) => ({ ref: row.ref, input: row.code ?? '', quantity: row.quantity, status: 'error' as const, message })
  if (row.error) return problem(row.error)
  if (!row.quantity || /^0+(\.0+)?$/.test(row.quantity)) return { ref: row.ref, input: row.code ?? '', quantity: row.quantity, status: 'blank' as const }
  const offer = resolveCode(offers, row.code ?? '')
  if (!offer) return problem(hidden(row.code ?? ''))
  const code = row.unit ?? offer.unit, unit = sellingUnits(offer).find(value => value.code === code)
  if (!unit) return problem(`${offer.sku}: ${code} has no defined conversion or price.`)
  let quantity: bigint
  try { quantity = quantityMicro(row.quantity) } catch (error: any) { return problem(error.message) }
  const whole = unit.quantityKind !== 'measured' || ['case', 'pallet'].includes(code.toLowerCase())
  if (whole && quantity % 1000000n) return problem(`${offer.sku}: order whole ${code} quantities.`)
  add(offer, code, quantity, row.ref, row.buyerSku)
  return { ref: row.ref, input: row.code ?? '', quantity: row.quantity, status: 'ok' as const, sku: offer.sku, unit: code }
 })
 if (mode === 'merge') for (const item of Array.isArray(p.cart) ? p.cart : []) {
  const offer = offers.find(offer => offer.sku === item?.sku), code = item?.unit ?? offer?.unit
  if (offer && sellingUnits(offer).some(unit => unit.code === code)) add(offer, code, quantityMicro(item.quantity))
 }
 // The buyer's explicit decision per line: a chosen quantity, or "skip" to leave it out.
 const kept = [...lines.values()].filter(line => mode === 'merge' || line.refs.length).flatMap(line => {
  const decision = set[line.key]
  if (decision === 'skip') return []
  return [{ ...line, ...(decision !== undefined ? { chosen: quantityMicro(decision as string) } : {}) }]
 })
 const final = (line: (typeof kept)[number]) => 'chosen' in line ? line.chosen! : line.quantity + (mode === 'merge' ? line.cart : 0n)
 const bases = new Map<string, bigint>()
 for (const line of kept) { const offer = offers.find(offer => offer.sku === line.sku)!, unit = sellingUnits(offer).find(unit => unit.code === line.unit)!; bases.set(line.sku, (bases.get(line.sku) ?? 0n) + decimal(convertQuantity(formatMicro(final(line)), unit.baseQuantity))) }
 const preview = kept.map(line => {
  const offer = offers.find(offer => offer.sku === line.sku)!, unit = sellingUnits(offer).find(unit => unit.code === line.unit)!, quantity = formatMicro(final(line)), base = formatMicro(bases.get(line.sku)!)
  const rule = quantityProblem(base, offer, offer.unit), single = kept.filter(other => other.sku === line.sku).length === 1 && line.unit === offer.unit
  const stock = !rule && bases.get(line.sku)! > decimal(offer.available) ? `${offer.sku}: only ${offer.available} ${offer.unit} available.` : ''
  let priced: ReturnType<typeof priceLine> | undefined, pricing = ''
  try { priced = priceLine(quantity, unit.unitCents, unit.pricing, today) } catch (error: any) { pricing = error.message }
  return {
   key: line.key, sku: line.sku, name: offer.name, unit: line.unit, quantity, ...(line.buyerSku ? { buyerSku: line.buyerSku } : {}), rows: line.refs,
   ...(line.refs.length > 1 ? { combined: `Rows ${line.refs.join(', ')} combined: ${line.parts.join(' + ')} = ${formatMicro(line.quantity)}` } : {}),
   ...(mode === 'merge' && line.cart ? { inCart: formatMicro(line.cart) } : {}), ...('chosen' in line ? { chosen: true } : {}),
   ...(priced ? { unitCents: priced.unitCents, lineCents: priced.lineCents } : {}),
   ...(rule ? { problem: quantityMessage(line.sku, base, rule, offer.unit), choices: single ? [rule.below, rule.above].filter((value): value is string => value !== undefined) : [] } : stock ? { problem: stock, choices: [] } : pricing ? { problem: pricing, choices: [] } : {}),
  }
 })
 const errors = report.filter(row => row.status === 'error').length + preview.filter(line => 'problem' in line).length
 const tooMany = preview.length > maxLines ? `A cart holds at most ${maxLines} lines.` : ''
 const ready = errors === 0 && !tooMany && preview.length > 0
 const cart = mode && ready ? preview.map(line => ({ sku: line.sku, unit: line.unit, quantity: Number(line.quantity), ...(line.buyerSku ? { buyerSku: line.buyerSku } : {}) })) : undefined
 // The resulting cart is priced exactly as order.prepare will price it.
 const totalCents = cart ? prepareLines(cart, offers, today).reduce((sum, line) => sum + line.lineCents!, 0) : preview.reduce((sum, line) => sum + (line.lineCents ?? 0), 0)
 return { accountId: selected.id, layout, observedAt: offered.observedAt, rows: report, lines: preview, errors, ...(tooMany ? { blocked: tooMany } : {}), ready, ...(mode ? { mode } : {}), ...(cart ? { cart } : {}), totalCents, currency: offered.currency, minimumCents: selected.value.minimumCents }
}

/** The working cart as a fillable order form: one row per variant, or one row per style with a column per size. */
export function orderForm(selected: Account, offers: Offer[], p: any) {
 const layout = p.layout === 'matrix' ? 'matrix' : p.layout === 'vertical' ? 'vertical' : fail('INPUT', 'Choose the vertical or matrix order form.', 400)
 const cart = new Map<string, string>((Array.isArray(p.cart) ? p.cart : []).filter((line: any) => line && typeof line.sku === 'string').map((line: any) => [`${line.sku}|${line.unit ?? offers.find(offer => offer.sku === line.sku)?.unit}`, String(line.quantity)]))
 const price = (cents: number) => `${Math.trunc(cents/100)}.${String(cents%100).padStart(2,'0')}`
 const currency=selected.value.currency??'USD'
 let rows: unknown[][]
 if (layout === 'vertical') rows = [['sku', 'barcode', 'name', 'unit', ...(currency==='USD'?['unitPriceUsd']:['unitPrice','currency']), 'quantity'], ...offers.flatMap(offer => sellingUnits(offer).filter(unit => unit.code === offer.unit || cart.has(`${offer.sku}|${unit.code}`)).map(unit => [offer.sku, offer.barcode ?? '', offer.name, unit.code, price(unit.unitCents), ...(currency==='USD'?[]:[currency]), cart.get(`${offer.sku}|${unit.code}`) ?? '']))]
 else {
  if ([...cart.keys()].some(key => { const [sku, unit] = key.split('|'); return offers.find(offer => offer.sku === sku)?.unit !== unit })) fail('UNIT', 'The matrix form holds base units only. Download the vertical form for selling-unit lines.', 400)
  const { rows: styles, columns } = groupStyles(offers)
  rows = [['style', 'name', ...columns], ...styles.map(style => [style.key, style.name, ...columns.map(size => style.cells[size] ? cart.get(`${style.cells[size].sku}|${style.cells[size].unit}`) ?? '' : '')])]
 }
 return { filename: `barrow-order-form-${selected.id}-${layout}.csv`, currency, csv: csvText(rows) }
}

export async function cartCommand(env: Bindings, actor: Parameters<typeof account>[1], type: string, p: any) {
 // ORD-002: a saved list previews as the same CSV a buyer could upload, against its own account's current catalog.
 const list = type === 'cart.preview' && p.listId !== undefined ? await readList(env.DB, actor, text(p.listId, 'List')) : undefined
 const selected = await account(env.DB, actor, list ? list.accountId : text(p.accountId, 'Account'))
 await requireCompanyRight(env.DB,actor,selected.id,'purchasing',p.shipToId)
 const offered = await catalogue(env, selected)
 if (type === 'cart.form') return orderForm(selected, offered.items, p)
 return list ? { ...await previewCart(selected, offered, { ...p, paste: undefined, csv: listCsv(list) }), list: { id: list.id, name: list.name, revision: list.revision } } : previewCart(selected, offered, p)
}
