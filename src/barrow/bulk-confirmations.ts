// ORD-014: combine explicitly selected immutable revisions, never the current order lines.
import { fail, integer, requirePerson, requireSupplier, text, type Actor } from './model'
import { readOrder } from './orders'
import { confirmationCsvRows, readConfirmations } from './confirmations'
import { selectedConfirmationColumns, type ConfirmationColumn } from './confirmation-layouts'
import { csvText } from './cart-csv'

export type ConfirmationChoice = {orderId:string;reference:string;confirmations:{number:number;stage:string;at:string;orderRevision:string}[]}
export const maxBulkOrders = 50
function orderIds(value:unknown):string[] {
 if(!Array.isArray(value)||!value.length||value.length>maxBulkOrders)fail('INPUT',`Select between 1 and ${maxBulkOrders} orders.`,400)
 const ids=value.map(id=>text(id,'Order ID',100))
 if(new Set(ids).size!==ids.length)fail('INPUT','Select each order once, with one confirmation revision.',400)
 return ids
}
async function authorized(db:D1Database,actor:Actor,ids:string[]) {
 requirePerson(actor)
 // Reuse the individual confirmation door's current account authority for every order.
 await Promise.all(ids.map(id=>readOrder(db,actor,id)))
}
export async function confirmationChoices(db:D1Database,actor:Actor,p:any):Promise<{orders:ConfirmationChoice[]}> {
 const ids=orderIds(p?.orderIds)
 await authorized(db,actor,ids)
 const orders=await Promise.all(ids.map(async orderId=>{
  const records=await readConfirmations(db,orderId)
  return {orderId,reference:records.at(-1)?.snapshot.reference??'',confirmations:records.map(record=>({number:record.number,stage:record.stage,at:record.at,orderRevision:record.snapshot.orderRevision}))}
 }))
 return {orders}
}
export async function bulkConfirmationResponse(db:D1Database,actor:Actor,p:any) {
 if(!Array.isArray(p?.confirmations))fail('INPUT','Select recorded confirmation revisions.',400)
 const ids=orderIds(p.confirmations.map((choice:any)=>choice?.orderId))
 const numbers=p.confirmations.map((choice:any)=>integer(choice?.number,'Confirmation number',1,Number.MAX_SAFE_INTEGER))
 await authorized(db,actor,ids)
 if(p.layout!==undefined)requireSupplier(actor)
 const layoutId=p.layout===undefined?undefined:text(p.layout,'Layout ID',100)
 const selected=await selectedConfirmationColumns(db,layoutId)
 // A narrow saved layout must still identify every source order and commercial revision.
 const identities:ConfirmationColumn[]=['order','order_revision','confirmation']
 const columns=[...selected,...identities.filter(column=>!selected.includes(column))]
 const records=await Promise.all(ids.map(async(id,index)=>{
  const record=(await readConfirmations(db,id)).find(record=>record.number===numbers[index])
  if(!record)fail('NOT_FOUND','A selected confirmation revision was not found. Refresh the selection.',404)
  if(!record.snapshot.lines.length)fail('NO_LINES','A selected confirmation has no recorded lines; it cannot be represented in a per-line export.')
  return record
 }))
 return new Response(csvText([columns,...records.flatMap(record=>confirmationCsvRows(record,columns))]),{headers:{'content-type':'text/csv; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','content-disposition':'attachment; filename="barrow-confirmations.csv"'}})
}
