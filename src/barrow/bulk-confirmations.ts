// ORD-014: combine explicitly selected immutable revisions, never the current order lines.
import { fail, integer, requirePerson, requireSupplier, supplier, text, type Actor } from './model'
import { confirmationCsvRows, type Confirmation } from './confirmations'
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
async function authorizedRecords(db:D1Database,actor:Actor,ids:string[]) {
 requirePerson(actor)
 // The same current account-email authority as readOrder/account, in one read for the whole selection.
 // LEFT JOIN keeps authorized historical/draft orders visible even without a confirmation.
 const rows=(await db.prepare(`SELECT o.id AS order_id,c.number,c.stage,c.created_at,c.value_json
  FROM bw_orders o JOIN bw_accounts a ON a.id=json_extract(o.value_json,'$.accountId')
  LEFT JOIN bw_confirmations c ON c.order_id=o.id
  WHERE o.id IN (SELECT value FROM json_each(?)) AND (?=1 OR json_extract(a.value_json,'$.email')=?)
  ORDER BY o.id,c.number`).bind(JSON.stringify(ids),supplier(actor)?1:0,actor.email).all<{order_id:string;number:number|null;stage:Confirmation['stage']|null;created_at:string|null;value_json:string|null}>()).results
 const visible=new Set(rows.map(row=>row.order_id))
 if(ids.some(id=>!visible.has(id)))fail('NOT_FOUND','A selected order was not found.',404)
 const records=new Map<string,Confirmation[]>(ids.map(id=>[id,[]]))
 for(const row of rows)if(row.number!==null)records.get(row.order_id)!.push({number:row.number,stage:row.stage!,at:row.created_at!,snapshot:JSON.parse(row.value_json!)})
 return records
}
export async function confirmationChoices(db:D1Database,actor:Actor,p:any):Promise<{orders:ConfirmationChoice[]}> {
 const ids=orderIds(p?.orderIds)
 const byOrder=await authorizedRecords(db,actor,ids)
 const orders=ids.map(orderId=>{
  const records=byOrder.get(orderId)!
  return {orderId,reference:records.at(-1)?.snapshot.reference??'',confirmations:records.map(record=>({number:record.number,stage:record.stage,at:record.at,orderRevision:record.snapshot.orderRevision}))}
 })
 return {orders}
}
export async function bulkConfirmationResponse(db:D1Database,actor:Actor,p:any) {
 if(!Array.isArray(p?.confirmations))fail('INPUT','Select recorded confirmation revisions.',400)
 const ids=orderIds(p.confirmations.map((choice:any)=>choice?.orderId))
 const numbers=p.confirmations.map((choice:any)=>integer(choice?.number,'Confirmation number',1,Number.MAX_SAFE_INTEGER))
 const byOrder=await authorizedRecords(db,actor,ids)
 if(p.layout!==undefined)requireSupplier(actor)
 const layoutId=p.layout===undefined?undefined:text(p.layout,'Layout ID',100)
 const selected=await selectedConfirmationColumns(db,layoutId)
 // A narrow saved layout must still identify every source order and commercial revision.
 const identities:ConfirmationColumn[]=['order','order_revision','confirmation']
 const columns=[...selected,...identities.filter(column=>!selected.includes(column))]
 const records=ids.map((id,index)=>{
  const record=byOrder.get(id)!.find(record=>record.number===numbers[index])
  if(!record)fail('NOT_FOUND','A selected confirmation revision was not found. Refresh the selection.',404)
  if(!record.snapshot.lines.length)fail('NO_LINES','A selected confirmation has no recorded lines; it cannot be represented in a per-line export.')
  return record
 })
 return new Response(csvText([columns,...records.flatMap(record=>confirmationCsvRows(record,columns))]),{headers:{'content-type':'text/csv; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','content-disposition':'attachment; filename="barrow-confirmations.csv"'}})
}
