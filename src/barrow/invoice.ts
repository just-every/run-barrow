import type { Order } from './model'
import { fail } from './model'
import type { SellerIdentity } from './seller-identity'
// Nectar's receivable boundary: invoice amounts are integer cents; no collection or tax calculation.
// Orders snapshot their currency (USD since it was recorded); records written before carry AUD.
const cell=(value:unknown)=>'"'+String(value).replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"'
export function requireInvoice(order:Order,financialHistory=false) {
 if((order.status!=='approved'&&!(financialHistory&&order.status==='cancelled'&&order.release?.confirmedAt))||!order.invoice) fail('NOT_RESERVED','Every line must be reserved in Pier before an invoice can be exported.')
 return order.invoice
}
export const invoiceStatus=(order:Order)=>order.status==='cancelled'?'withdrawn; original preserved with linked credit':'issued'
export const invoiceAddress=(value:Order['billTo'])=>value?[value.name,value.line1,value.line2,value.city,value.state,value.zip].filter(Boolean).join(', '):''
export function invoiceCsv(order:Order,financialHistory=false,retainedSeller?:SellerIdentity|null) {
 const invoice=requireInvoice(order,financialHistory)
 const identity=order.buyingProfile?.seller??retainedSeller
 const seller=[order.buyingProfile?.id??'',order.buyingProfile?.brandId??'',identity?.legalName??'',identity?.address??'',identity?.registration??'']
 const columns=['invoice_number','customer','customer_reference','pier_order','issue_date','due_date','currency','sku','description','quantity','unit_cents','line_cents','invoice_total_cents','ordered_unit','price_basis','conversion_to_base','base_quantity','base_unit','pack_contents','pricing_rule','buying_profile_id','brand_id','seller_legal_name','seller_address','seller_registration','invoice_status']
 const rows=order.lines.map(line=>[order.invoice!.number,order.customerName,order.reference,order.pierReference,order.invoice!.issuedAt,order.invoice!.dueAt,order.currency??'AUD',line.sku,line.name,line.quantity,line.unitCents,line.lineCents??line.quantity*line.unitCents,order.totalCents,line.unit??'',line.unit ? `per ${line.unit}` : '',line.conversion??'',line.baseQuantity??String(line.quantity),line.baseUnit??'',line.packContents??'',line.pricing?JSON.stringify(line.pricing):''])
 if(order.delivery)rows.push([invoice.number,order.customerName,order.reference,order.pierReference,invoice.issuedAt,invoice.dueAt,order.currency??'AUD','SHIPPING',`${order.delivery.name} · ${order.delivery.windowStart}–${order.delivery.windowEnd}`,1,order.delivery.totalCents!,order.delivery.totalCents!,order.totalCents,'delivery','per order','','1','','',''])
 columns.push('terms_days','bill_to','ship_to','tax_status','shipping_cents','handling_cents')
 return [columns,...rows.map(row=>[...row,...seller,invoiceStatus(order),order.termsDays,invoiceAddress(order.billTo),invoiceAddress(order.shipTo),'not calculated',order.delivery?.shippingCents??'',order.delivery?.handlingCents??''])].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n'
}
