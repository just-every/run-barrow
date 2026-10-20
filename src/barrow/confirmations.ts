import { confirmationColumns, selectedConfirmationColumns, type ConfirmationColumn } from './confirmation-layouts'
// ORD-014: immutable commercial snapshots, written with the submission/acceptance transaction.
import type { Actor, Order } from './model'
import { fail } from './model'
import { audit } from './access'
import { csvText } from './cart-csv'
import { textPdf } from './pdf'
import { now } from './clock'

type Stage = 'submitted' | 'accepted'
export type Confirmation = { number: number; stage: Stage; at: string; snapshot: Snapshot }
type Snapshot = Pick<Order, 'id' | 'accountId' | 'customerName' | 'reference' | 'poRelease' | 'requestedDate' | 'cancelAfter' | 'instructions' | 'deliveryLocation' | 'billTo' | 'shipTo' | 'lines' | 'totalCents' | 'currency' | 'termsDays' | 'quote' | 'delivery'> & { orderRevision: string }

export async function confirmationStatements(db: D1Database, actor: Actor, order: Order, stage: Stage) {
 const at = (await now()).toISOString()
 const { id, accountId, customerName, reference, poRelease, requestedDate, cancelAfter, instructions, deliveryLocation, billTo, shipTo, lines, totalCents, termsDays, quote, delivery } = order
 const snapshot: Snapshot = { id, accountId, customerName, reference, poRelease, requestedDate, cancelAfter, instructions, deliveryLocation, billTo, shipTo, lines, totalCents, currency: order.currency ?? 'AUD', termsDays, quote, delivery, orderRevision: order.revision }
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
const absent = 'Seller legal identity, product images, MSRP and signed sales terms are not recorded in this confirmation. No confirmation email delivery is recorded. Tax is not calculated.'
const amount = (cents: number, currency: string) => `${currency} ${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
const wrap = (text: string): string[] => text.split(/\r?\n/).flatMap(part => part.match(/.{1,82}(?:\s|$)|.{1,82}/g)?.map(line => line.trimEnd()) ?? [''])
export function confirmationPdf(record: Confirmation) {
 const s = record.snapshot, currency = s.currency ?? 'AUD'
 const lines = [`Order confirmation ${s.id}-C${record.number}`, `${record.stage.toUpperCase()} | ${record.at}`, `Order revision: ${s.orderRevision}`, `Buyer: ${s.customerName} | Account: ${s.accountId}`, `PO: ${s.reference || 'Not recorded'}`, `Bill to: ${address(s.billTo)}`, `Ship to: ${address(s.shipTo)}`, `Requested delivery: ${s.requestedDate ?? 'Not recorded'} | Cancel after: ${s.cancelAfter ?? 'Not recorded'}`, `Payment terms: ${s.termsDays === 0 ? 'Due on receipt' : `Net ${s.termsDays} days`}`, '', ...s.lines.flatMap(line => [`${line.sku} | ${line.name}`, `${line.quantity} ${line.unit ?? 'units'} at ${amount(line.unitCents,currency)}; line ${amount(line.lineCents ?? line.quantity * line.unitCents,currency)}`, `Base quantity: ${line.baseQuantity ?? line.quantity} ${line.baseUnit ?? 'units'}${line.packContents ? ` | Pack: ${line.packContents}` : ''}`]), '', ...(s.delivery ? [`Delivery: ${s.delivery.name} | ${s.delivery.windowStart} to ${s.delivery.windowEnd}`, `Freight and handling: ${amount(s.delivery.totalCents ?? 0,currency)}`] : ['Delivery method and charge: not recorded']), `Order total: ${amount(s.totalCents,currency)}`, ...(s.instructions ? [`Instructions: ${s.instructions}`] : []), '', absent]
 return textPdf(lines.flatMap(wrap))
}
export function confirmationCsv(record: Confirmation, selected: readonly ConfirmationColumn[] = confirmationColumns) {
 const s = record.snapshot
 const values=s.lines.map(line => [`${s.id}-C${record.number}`,record.stage,record.at,s.id,s.orderRevision,s.accountId,s.customerName,s.reference,address(s.billTo),address(s.shipTo),s.requestedDate,s.cancelAfter,s.termsDays,s.currency ?? 'AUD',line.sku,line.name,line.quantity,line.unit,line.baseQuantity ?? line.quantity,line.baseUnit,line.unitCents,line.lineCents ?? line.quantity * line.unitCents,s.delivery?.totalCents ?? 0,s.totalCents,absent])
 return csvText([[...selected],...values.map(row=>selected.map(column=>row[confirmationColumns.indexOf(column)]))])
}
export async function confirmationResponse(db: D1Database, order: Order, number: number, format: 'csv'|'pdf', layoutId?:string) {
 const record = (await readConfirmations(db,order.id)).find(record => record.number === number)
 if (!record) fail('NOT_FOUND','Confirmation revision not found.',404)
 return new Response(format === 'pdf' ? confirmationPdf(record) : confirmationCsv(record,await selectedConfirmationColumns(db,layoutId)), {headers:{'content-type':format === 'pdf' ? 'application/pdf' : 'text/csv; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','content-disposition':`attachment; filename="${order.id}-C${record.number}.${format}"`}})
}
