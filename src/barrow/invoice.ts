import type { Order } from './model'
import { fail } from './model'
// Nectar's receivable boundary: invoice amounts are integer cents; no collection or tax calculation.
const cell=(value:unknown)=>'"'+String(value).replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"'
export function invoiceCsv(order:Order) {
 if(order.status!=='approved'||!order.invoice) fail('NOT_RESERVED','Every line must be reserved in Pier before an invoice can be exported.')
 const columns=['invoice_number','customer','customer_reference','pier_order','issue_date','due_date','currency','sku','description','quantity','unit_cents','line_cents','invoice_total_cents']
 const rows=order.lines.map(line=>[order.invoice!.number,order.customerName,order.reference,order.pierReference,order.invoice!.issuedAt,order.invoice!.dueAt,'AUD',line.sku,line.name,line.quantity,line.unitCents,line.quantity*line.unitCents,order.totalCents])
 return [columns,...rows].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n'
}
