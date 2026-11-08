import { PDFDocument } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import fontData from './invoice-font'
import { invoiceAddress, invoiceStatus, requireInvoice } from './invoice'
import type { Order } from './model'
import type { SellerIdentity } from './seller-identity'

const recorded=(value:unknown)=>value===undefined||value===null||value===''?'Not recorded':String(value)
const money=(minor:number,currency:string)=>`${currency} ${Math.trunc(minor/100)}.${String(Math.abs(minor%100)).padStart(2,'0')} (${minor} minor units)`

/** A read-only rendering of the retained invoice handoff, never a legal issue or send. */
export async function invoicePdf(order:Order,financialHistory=false,retainedSeller?:SellerIdentity|null):Promise<Uint8Array<ArrayBuffer>> {
 const invoice=requireInvoice(order,financialHistory),currency=order.currency??'AUD',seller=order.buyingProfile?.seller??retainedSeller
 const entries=[
  `Invoice ${invoice.number}`,
  `Status: ${invoiceStatus(order)}`,
  `Seller: ${recorded(seller?.legalName)}`,
  `Seller address: ${recorded(seller?.address)}`,
  `Seller registration: ${recorded(seller?.registration)}`,
  `Buyer: ${order.customerName}`,
  `Bill to: ${recorded(invoiceAddress(order.billTo))}`,
  `Ship to: ${recorded(invoiceAddress(order.shipTo))}`,
  `PO: ${recorded(order.reference)}`,
  `Pier order: ${recorded(order.pierReference)}`,
  `Issue date: ${invoice.issuedAt}`,
  `Due date: ${invoice.dueAt}`,
  `Terms: ${order.termsDays===0?'Due on receipt':`Net ${order.termsDays} days`}`,
  `Currency: ${currency}`,
  '',
  ...order.lines.flatMap((line,index)=>[
   `Line ${index+1}: ${line.sku} - ${line.name}`,
   `Quantity: ${line.quantity} ${recorded(line.unit)}; unit price: ${money(line.unitCents,currency)}`,
   `Line total: ${money(line.lineCents??line.quantity*line.unitCents,currency)}`,
   `Base quantity: ${line.baseQuantity??line.quantity} ${recorded(line.baseUnit)}; conversion: ${recorded(line.conversion)}`,
   ...(line.packContents?[`Pack contents: ${line.packContents}`]:[]),
   '',
  ]),
  ...(order.delivery?[
   `Delivery: ${order.delivery.name}`,
   `Delivery window: ${order.delivery.windowStart} to ${order.delivery.windowEnd}`,
   `Freight: ${order.delivery.shippingCents===null?'Not recorded':money(order.delivery.shippingCents,currency)}`,
   `Handling: ${money(order.delivery.handlingCents,currency)}`,
   `Recorded delivery charge: ${order.delivery.totalCents===null?'Not recorded':money(order.delivery.totalCents,currency)}`,
  ]:['Delivery method and charge: Not recorded']),
  'Tax: Not calculated; no verified tax is included.',
  `Invoice total: ${money(order.totalCents,currency)}`,
  'Accounting issue and void status: Not recorded.',
 ]
 // Embed the licensed Unicode font; no current brand asset or remote font request.
 const document=await PDFDocument.create({updateMetadata:false})
 document.registerFontkit(fontkit)
 const binary=atob(fontData),bytes=new Uint8Array(binary.length)
 for(let index=0;index<binary.length;index++)bytes[index]=binary.charCodeAt(index)
 const decoded=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
 const font=await document.embedFont(await new Response(decoded).arrayBuffer(),{subset:true})
 const size=11,width=504,leading=16
 let page=document.addPage([612,792]),y=738
 const draw=(line:string)=>{
  if(y<54){page=document.addPage([612,792]);y=738}
  page.drawText(line,{x:54,y,size,font});y-=leading
 }
 for(const entry of entries)for(const paragraph of entry.split(/\r?\n/)) {
  let line=''
  // Measure glyph advances, wrapping at word boundaries where possible.
  for(const word of paragraph.split(/(\s+)/)) {
   if(line&&font.widthOfTextAtSize(line+word,size)>width){draw(line.trimEnd());line=''}
   if(!line&&!word.trim())continue
   for(const character of word){
    if(line&&font.widthOfTextAtSize(line+character,size)>width){draw(line);line=''}
    line+=character
   }
  }
  draw(line)
 }
 document.getPages().forEach((sheet,index)=>sheet.drawText(`Page ${index+1} of ${document.getPageCount()}`,{x:54,y:28,size:9,font}))
 return new Uint8Array(await document.save({useObjectStreams:false}))
}
