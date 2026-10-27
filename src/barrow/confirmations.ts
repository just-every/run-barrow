import { priceLabels, marginBps } from './price-display'
import { confirmationColumns, matrixKeyColumns, selectedConfirmationLayout, type ConfirmationColumn, type ConfirmationLayout } from './confirmation-layouts'
// ORD-014: immutable commercial snapshots, written with the submission/acceptance/revision transaction.
import type { Actor, Line, Order } from './model'
import { fail } from './model'
import { audit } from './access'
import { csvText } from './cart-csv'
import { imagePdf, textPdf, type PdfEntry } from './pdf'
import { readImages, type StoredImage } from './product-images'
import { now } from './clock'
import { termsText, type TermsAcceptance } from './sales-terms'
import { sellerIdentity, sellerLine, type SellerIdentity } from './seller-identity'
import { sizeMatrix } from './confirmation-matrix'

type Stage = 'submitted' | 'accepted' | 'revised'
/** ORD-011 slice: one changed line of a buyer revision, before and after. */
export type LineChange = { line: number; sku: string; unit?: string; before: { quantity: number; lineCents: number }; after: { quantity: number; lineCents: number } }
export type Confirmation = { number: number; stage: Stage; at: string; snapshot: Snapshot }
type Snapshot = Pick<Order, 'prebook' | 'id' | 'accountId' | 'customerName' | 'reference' | 'poRelease' | 'requestedDate' | 'cancelAfter' | 'instructions' | 'deliveryLocation' | 'billTo' | 'shipTo' | 'lines' | 'totalCents' | 'currency' | 'termsDays' | 'quote' | 'delivery' | 'priceDisplay' | 'season'> & { orderRevision: string; termsAcceptance?: TermsAcceptance & { body: string }; seller?: SellerIdentity | null; revises?: number; changes?: LineChange[] }

export async function confirmationStatements(db: D1Database, actor: Actor, order: Order, stage: Stage, changes?: LineChange[]) {
 const at = (await now()).toISOString()
 const { id, accountId, customerName, reference, poRelease, requestedDate, cancelAfter, instructions, deliveryLocation, billTo, shipTo, lines, totalCents, termsDays, quote, delivery, season } = order
 const termsAcceptance = order.termsAcceptance ? { ...order.termsAcceptance, body: await termsText(db, order.termsAcceptance) } : undefined
 const revises = changes ? (await db.prepare('SELECT MAX(number) AS number FROM bw_confirmations WHERE order_id=?').bind(id).first<{ number: number | null }>())?.number ?? undefined : undefined
 const snapshot: Snapshot = { ...(order.prebook?{prebook:order.prebook}:{}), id, accountId, customerName, reference, poRelease, requestedDate, cancelAfter, instructions, deliveryLocation, billTo, shipTo, lines, totalCents, currency: order.currency ?? 'AUD', termsDays, quote, delivery, ...(season ? { season } : {}), orderRevision: order.revision, seller: order.buyingProfile?.seller ?? (await sellerIdentity(db)).identity, ...(order.priceDisplay?{priceDisplay:order.priceDisplay}:{}), ...(termsAcceptance ? { termsAcceptance } : {}), ...(changes ? { changes, ...(revises ? { revises } : {}) } : {}) }
 return [
  db.prepare('INSERT INTO bw_confirmations(order_id,number,stage,created_at,value_json) SELECT ?,COALESCE(MAX(number),0)+1,?,?,? FROM bw_confirmations WHERE order_id=?').bind(id, stage, at, JSON.stringify(snapshot), id),
  audit(db, actor, id, 'order.confirmation', { accountId, orderId: id, revision: order.revision, source: 'order.confirmation', reason: `Recorded immutable ${stage} order confirmation.` }),
 ]
}
export async function readConfirmations(db: D1Database, orderId: string): Promise<Confirmation[]> {
 const rows = await db.prepare('SELECT number,stage,created_at,value_json FROM bw_confirmations WHERE order_id=? ORDER BY number').bind(orderId).all<{number:number;stage:Stage;created_at:string;value_json:string}>()
 return rows.results.map(row => ({ number: row.number, stage: row.stage, at: row.created_at, snapshot: JSON.parse(row.value_json) }))
}
const address = (value: Order['shipTo']) => value ? [value.name, value.line1, value.line2, value.city, value.state, value.zip].filter(Boolean).join(', ') : 'Not recorded'
const limitations = (s: Snapshot) => `${s.lines.every(line => line.image) ? '' : 'Lines without a recorded variant image show none. '}Sales terms appear only where the assigned terms were accepted. Tax is not calculated.`
const termsLines = (record: Confirmation) => {
 const t = record.snapshot.termsAcceptance
 if (!t) return []
 const how = t.how === 'buyer' ? 'accepted by the buyer in the portal' : `signed on the buyer's device and captured by supplier staff (signature image sha256 ${t.signatureSha256}); the image and printed name are recorded as entered, not identity-verified or a certified electronic signature`
 return ['', `Sales terms: ${t.title} (series ${t.series}) version ${t.version} | content sha256 ${t.contentSha256}${t.pdfSha256 ? ` | PDF sha256 ${t.pdfSha256}` : ''}`, `Terms ${how}; printed name: ${t.printedName ?? 'not recorded'}; recorded by ${t.acceptedBy} at ${t.acceptedAt}.`, ...(t.body ? ['Terms text:', ...t.body.split(/\r?\n/)] : [])]
}
const amount = (cents: number, currency: string) => `${currency} ${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
const wrap = (text: string): string[] => text.split(/\r?\n/).flatMap(part => part.match(/.{1,82}(?:\s|$)|.{1,82}/g)?.map(line => line.trimEnd()) ?? [''])
/** A line's own ship window, or the order's when the line has none. */
const ownWindow = (line: Line) => Boolean(line.requestedDate || line.cancelAfter)
const shipDate = (s: Snapshot, line: Line) => ownWindow(line) ? line.requestedDate : s.requestedDate
const cancelDate = (s: Snapshot, line: Line) => ownWindow(line) ? line.cancelAfter : s.cancelAfter
const variant = (line: Line) => line.style ? ` | Style ${line.style} | Color ${line.color} | Size ${line.size}` : ''
export function confirmationPdf(record: Confirmation, images = new Map<string, StoredImage>()) {
 const s = record.snapshot, currency = s.currency ?? 'AUD'
 const windows = [...new Set(s.lines.map(line => `${shipDate(s, line) ?? 'Not recorded'} to cancel ${cancelDate(s, line) ?? 'not recorded'}`))]
 const revision = s.changes ? [`Revises confirmation C${s.revises ?? '?'}: ${s.changes.map(change => `line ${change.line + 1} ${change.sku} quantity ${change.before.quantity} -> ${change.after.quantity}`).join('; ')}`] : []
 const lines: PdfEntry[] = [`Order confirmation ${s.id}-C${record.number}`, `${record.stage.toUpperCase()} | ${record.at}`, `Order revision: ${s.orderRevision}`, ...revision, `Seller: ${sellerLine(s.seller)}`, `Buyer: ${s.customerName} | Account: ${s.accountId}`, `PO: ${s.reference || 'Not recorded'}`, `Season: ${s.season ?? 'Not recorded'}`, `Bill to: ${address(s.billTo)}`, `Ship to: ${address(s.shipTo)}`, windows.length > 1 ? `Ship windows: ${windows.join('; ')}` : `Requested delivery: ${s.requestedDate ?? 'Not recorded'} | Cancel after: ${s.cancelAfter ?? 'Not recorded'}`, ...(s.prebook?[`Prebook deposit required: ${amount(s.prebook.depositCents,currency)}; collection and allocation are recorded separately.`]:[]), `Payment terms: ${s.termsDays === 0 ? 'Due on receipt' : `Net ${s.termsDays} days`}`, '', ...s.lines.flatMap((line): PdfEntry[] => [...(line.image && images.has(line.image.sha256) ? [{ image: line.image.sha256 }] : []), `${line.sku} | ${line.name}${variant(line)}`, ...(line.image ? [`Image sha256 ${line.image.sha256}`] : []), s.priceDisplay ? `${line.quantity} ${line.unit??'units'} | ${priceLabels(line,currency,s.priceDisplay.confirmation)}${s.priceDisplay.confirmation==='retail'?'':`; wholesale line ${amount(line.lineCents??line.quantity*line.unitCents,currency)}`}` : `${line.quantity} ${line.unit ?? 'units'} at ${amount(line.unitCents,currency)}; line ${amount(line.lineCents ?? line.quantity * line.unitCents,currency)}`, `Base quantity: ${line.baseQuantity ?? line.quantity} ${line.baseUnit ?? 'units'}${line.packContents ? ` | Pack: ${line.packContents}` : ''}`, ...(windows.length > 1 ? [`Ship window: ${shipDate(s, line) ?? 'Not recorded'} | Cancel after: ${cancelDate(s, line) ?? 'Not recorded'}`] : [])]), '', ...(s.delivery ? [`Delivery: ${s.delivery.name} | ${s.delivery.windowStart} to ${s.delivery.windowEnd}`, `Freight and handling: ${amount(s.delivery.totalCents ?? 0,currency)}`] : ['Delivery method and charge: not recorded']), `Order total: ${amount(s.totalCents,currency)}`, ...(s.instructions ? [`Instructions: ${s.instructions}`] : []), ...termsLines(record), '', limitations(s)]
 const flowed = lines.flatMap((entry): PdfEntry[] => typeof entry === 'string' ? wrap(entry) : [entry])
 return flowed.some(entry => typeof entry !== 'string') ? imagePdf(flowed, images) : textPdf(flowed as string[])
}
export function confirmationCsvRows(record: Confirmation, selected: readonly ConfirmationColumn[]) {
 const s = record.snapshot
 const values=s.lines.map(line => [`${s.id}-C${record.number}`,record.stage,record.at,s.id,s.orderRevision,s.accountId,s.customerName,s.reference,address(s.billTo),address(s.shipTo),shipDate(s,line),cancelDate(s,line),s.termsDays,s.currency ?? 'AUD',line.sku,line.name,line.quantity,line.unit,line.baseQuantity ?? line.quantity,line.baseUnit,line.unitCents,line.lineCents ?? line.quantity * line.unitCents,s.delivery?.totalCents ?? 0,s.totalCents,limitations(s),line.msrpCents,marginBps(line.unitCents,line.msrpCents),s.season,sellerLine(s.seller),line.style,line.color,line.size,line.image?.sha256])
 return values.map(row=>selected.map(column=>row[confirmationColumns.indexOf(column)]))
}
export function withConfirmationCurrency(columns:ConfirmationColumn[]):ConfirmationColumn[] {
 const monetary=['unit_cents','line_cents','msrp_cents','shipping_cents','order_total_cents']
 return columns.some(column=>monetary.includes(column))&&!columns.includes('currency')?[...columns,'currency']:columns
}
export function displayedConfirmationColumns(record:Confirmation,selected:readonly ConfirmationColumn[]) {
 const mode=record.snapshot.priceDisplay?.orderCsv??'wholesale'
 const columns=selected.filter(c=>mode!=='retail'||!['unit_cents','line_cents'].includes(c)).filter(c=>mode==='both'||c!=='margin_bps').filter(c=>mode!=='wholesale'||c!=='msrp_cents')
 if(mode!=='wholesale'&&!columns.includes('msrp_cents'))columns.push('msrp_cents')
 if(mode==='both'&&!columns.includes('margin_bps'))columns.push('margin_bps')
 return record.snapshot.priceDisplay?withConfirmationCurrency(columns):columns
}
/** Size-matrix rows: the layout's columns, split by selling unit, with recorded sizes across as quantities. */
export function matrixCsv(records: Confirmation[], columns: readonly ConfirmationColumn[]) {
 const keys:ConfirmationColumn[]=[...columns.filter(column=>matrixKeyColumns.includes(column)),...(columns.includes('unit')?[]:['unit' as const])]
 return csvText(sizeMatrix(keys,records.flatMap(record=>confirmationCsvRows(record,[...keys,'size','quantity']))) as (string|number|undefined)[][])
}
export function confirmationCsv(record: Confirmation, layout: Pick<ConfirmationLayout,'columns'|'shape'> = {columns:[...confirmationColumns],shape:'per-line'}) {
 if(layout.shape==='matrix')return matrixCsv([record],layout.columns)
 const columns=displayedConfirmationColumns(record,layout.columns)
 return csvText([[...columns],...confirmationCsvRows(record,columns)])
}
export async function confirmationResponse(db: D1Database, order: Order, number: number, format: 'csv'|'pdf', layoutId?:string) {
 const record = (await readConfirmations(db,order.id)).find(record => record.number === number)
 if (!record) fail('NOT_FOUND','Confirmation revision not found.',404)
 return new Response(format === 'pdf' ? confirmationPdf(record,await readImages(db,record.snapshot.lines.map(line=>line.image))) : confirmationCsv(record,await selectedConfirmationLayout(db,layoutId)), {headers:{'content-type':format === 'pdf' ? 'application/pdf' : 'text/csv; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','content-disposition':`attachment; filename="${order.id}-C${record.number}.${format}"`}})
}
