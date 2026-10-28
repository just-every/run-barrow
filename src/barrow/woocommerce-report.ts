import type { Bindings } from '../auth.server'
import type { Order } from './model'
import { wooOrder } from './woocommerce'
import { calendarDate } from './report-zone'
import type { fulfillmentLines } from './fulfillment-lines'

/** Read native source quantities; Woo core supplies neither warehouse nor carrier dates. */
export async function wooFulfillment(env:Bindings,orders:Order[],today:string,timeZone:string) {
 const lines:ReturnType<typeof fulfillmentLines>=[],exceptions:{orderId:string;reason:string;owner:string}[]=[]
 for(const order of orders){
  if(!order.pierOrigin.includes('#woocommerce:')){exceptions.push({orderId:order.id,reason:'This order belongs to another inventory authority.',owner:'Supplier'});continue}
  try{
   const source=await wooOrder(env,order)
   for(const line of source.lines){
    const original=order.lines.find(row=>row.itemId===line.itemId)!,ordered=BigInt(line.quantity),shipped=BigInt(line.dispatched),cancelled=BigInt(line.cancelled),allocated=BigInt(line.reserved),backordered=BigInt(line.backorder),demand=ordered-cancelled
    lines.push({orderId:order.id,accountId:order.accountId,customer:order.customerName,reference:order.reference,sku:original.sku,unit:original.baseUnit??'each',sourceOrderId:source.id,ordered:String(ordered),shipped:String(shipped),cancelled:String(cancelled),allocated:String(allocated),backordered:String(backordered),outstanding:String(allocated+backordered),fillBasisPoints:demand>0n?Number((shipped*10000n+demand/2n)/demand):null,
     promisedDate:null,agreedDate:order.requestedDate??null,promiseChanged:false,promiseHistory:'Unknown: not reported by WooCommerce',dispatchedByDate:null,dispatchedLate:null,delivery:'unknown',tracking:'Not recorded: no connected carrier source',onTimeDelivery:null,overdue:false,
     ageDays:Math.max(0,Math.floor((Date.parse(today+'T12:00:00Z')-Date.parse(calendarDate(new Date(order.approvedAt!),timeZone)+'T12:00:00Z'))/86400000)),warehouses:[{warehouse:'Unknown warehouse',allocated:String(allocated),shipped:String(shipped)}],unassignedBackorder:String(backordered),owner:'Supplier',action:backordered>0n?'Review the explicit shortfall in WooCommerce; do not invoice unallocated units.':null})
   }
  }catch{exceptions.push({orderId:order.id,reason:'WooCommerce source unavailable, destination differs, or exact quantities do not reconcile. No quantities inferred.',owner:'Supplier'})}
 }
 return {lines,exceptions}
}
