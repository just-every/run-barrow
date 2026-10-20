import type { Order } from './model'
import { fail } from './model'
// Nectar's receivable boundary: invoice amounts are integer cents; no collection or tax calculation.
// Orders snapshot their currency (USD since it was recorded); records written before carry AUD.
const cell=(value:unknown)=>'"'+String(value).replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"'
export function invoiceCsv(order:Order) {
 if(order.status!=='approved'||!order.invoice) fail('NOT_RESERVED','Every line must be reserved in Pier before an invoice can be exported.')
 const columns=['invoice_number','customer','customer_reference','pier_order','issue_date','due_date','currency','sku','description','quantity','unit_cents','line_cents','invoice_total_cents','ordered_unit','price_basis','conversion_to_base','base_quantity','base_unit','pack_contents','pricing_rule']
 const rows=order.lines.map(line=>[order.invoice!.number,order.customerName,order.reference,order.pierReference,order.invoice!.issuedAt,order.invoice!.dueAt,order.currency??'AUD',line.sku,line.name,line.quantity,line.unitCents,line.lineCents??line.quantity*line.unitCents,order.totalCents,line.unit??'',line.unit ? `per ${line.unit}` : '',line.conversion??'',line.baseQuantity??String(line.quantity),line.baseUnit??'',line.packContents??'',line.pricing?JSON.stringify(line.pricing):''])
 if(order.delivery)rows.push([order.invoice.number,order.customerName,order.reference,order.pierReference,order.invoice.issuedAt,order.invoice.dueAt,order.currency??'AUD','SHIPPING',`${order.delivery.name} · ${order.delivery.windowStart}–${order.delivery.windowEnd}`,1,order.delivery.totalCents!,order.delivery.totalCents!,order.totalCents,'delivery','per order','','1','','',''])
 return [columns,...rows].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n'
}
