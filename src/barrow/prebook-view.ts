import type { Order } from './model'
/** Release quantities are fulfillment handoffs, distinct from source-confirmed stock and shipment. */
export function prebookRows(order:Order) {
 return order.prebook?.windows.flatMap(window=>window.lineIndexes.map(index=>{
  const line=order.lines[index],terms=order.prebook!.season.windows.find(row=>row.id===window.id)!,committed=line.baseQuantity??String(line.quantity)
  return {orderId:order.id,accountId:order.accountId,season:order.prebook!.season.name,windowId:window.id,window:terms.name,sku:line.sku,unit:line.baseUnit??line.unit,committed,released:window.releaseId?committed:'0',outstanding:window.releaseId?'0':committed,releaseId:window.releaseId??null,shipDate:terms.shipDate,cancelAfter:terms.cancelAfter,estimatedDate:window.estimatedDate??terms.shipDate,backordered:Boolean(window.estimatedDate),history:window.history}
 }))??[]
}
