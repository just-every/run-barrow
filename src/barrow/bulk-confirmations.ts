import { companyOrderScope } from './company-access'
// ORD-014: combine explicitly selected immutable revisions, never the current order lines.
import { fail, integer, requirePerson, requireSupplier, text, type Actor } from './model'
import { confirmationCsvRows, displayedConfirmationColumns, matrixCsv, withConfirmationCurrency, type Confirmation } from './confirmations'
import { selectedConfirmationLayout, type ConfirmationColumn } from './confirmation-layouts'
import { productionTotals } from './confirmation-matrix'
import { csvText } from './cart-csv'

export type ConfirmationChoice = {orderId:string;reference:string;season?:string;confirmations:{number:number;stage:string;at:string;orderRevision:string}[]}
export const maxBulkOrders = 50
function orderIds(value:unknown):string[] {
 if(!Array.isArray(value)||!value.length||value.length>maxBulkOrders)fail('INPUT',`Select between 1 and ${maxBulkOrders} orders.`,400)
 const ids=value.map(id=>text(id,'Order ID',100))
 if(new Set(ids).size!==ids.length)fail('INPUT','Select each order once, with one confirmation revision.',400)
 return ids
}
/** A season filter selects every authorized order of that season with a recorded confirmation, oldest first. */
async function seasonOrderIds(db:D1Database,actor:Actor,value:unknown) {
 requirePerson(actor)
 const season=text(value,'Season',80),scope=companyOrderScope(actor,'a.id','o.value_json')
 const rows=(await db.prepare(`SELECT o.id FROM bw_orders o JOIN bw_accounts a ON a.id=json_extract(o.value_json,'$.accountId')
  WHERE json_extract(o.value_json,'$.season')=? AND EXISTS(SELECT 1 FROM bw_confirmations c WHERE c.order_id=o.id) ${scope.sql}
  ORDER BY o.rowid LIMIT ?`).bind(season,...scope.values,maxBulkOrders+1).all<{id:string}>()).results
 if(!rows.length)fail('NOT_FOUND',`No recorded orders were found for ${season}.`,404)
 if(rows.length>maxBulkOrders)fail('TOO_MANY',`More than ${maxBulkOrders} recorded orders match ${season}. Select them by hand in smaller sets.`)
 return rows.map(row=>row.id)
}
async function authorizedRecords(db:D1Database,actor:Actor,ids:string[]) {
 requirePerson(actor)
 // Apply the same current company and order-view rights in one bounded read.
 const scope=companyOrderScope(actor,'a.id','o.value_json')
 // LEFT JOIN keeps authorized historical/draft orders visible even without a confirmation.
 const rows=(await db.prepare(`SELECT o.id AS order_id,c.number,c.stage,c.created_at,c.value_json
  FROM bw_orders o JOIN bw_accounts a ON a.id=json_extract(o.value_json,'$.accountId')
  LEFT JOIN bw_confirmations c ON c.order_id=o.id
  WHERE o.id IN (SELECT value FROM json_each(?)) ${scope.sql}
  ORDER BY o.id,c.number`).bind(JSON.stringify(ids),...scope.values).all<{order_id:string;number:number|null;stage:Confirmation['stage']|null;created_at:string|null;value_json:string|null}>()).results
 const visible=new Set(rows.map(row=>row.order_id))
 if(ids.some(id=>!visible.has(id)))fail('NOT_FOUND','A selected order was not found.',404)
 const records=new Map<string,Confirmation[]>(ids.map(id=>[id,[]]))
 for(const row of rows)if(row.number!==null)records.get(row.order_id)!.push({number:row.number,stage:row.stage!,at:row.created_at!,snapshot:JSON.parse(row.value_json!)})
 return records
}
export async function confirmationChoices(db:D1Database,actor:Actor,p:any):Promise<{season?:string;orders:ConfirmationChoice[]}> {
 const ids=p?.season!==undefined?await seasonOrderIds(db,actor,p.season):orderIds(p?.orderIds)
 const byOrder=await authorizedRecords(db,actor,ids)
 const orders=ids.map(orderId=>{
  const records=byOrder.get(orderId)!,latest=records.at(-1)?.snapshot
  return {orderId,reference:latest?.reference??'',...(latest?.season?{season:latest.season}:{}),confirmations:records.map(record=>({number:record.number,stage:record.stage,at:record.at,orderRevision:record.snapshot.orderRevision}))}
 })
 return {...(p?.season!==undefined?{season:text(p.season,'Season',80)}:{}),orders}
}
export async function bulkConfirmationResponse(db:D1Database,actor:Actor,p:any) {
 if(!Array.isArray(p?.confirmations))fail('INPUT','Select recorded confirmation revisions.',400)
 const ids=orderIds(p.confirmations.map((choice:any)=>choice?.orderId))
 const numbers=p.confirmations.map((choice:any)=>integer(choice?.number,'Confirmation number',1,Number.MAX_SAFE_INTEGER))
 const shape=p.shape??'layout'
 if(!['layout','totals'].includes(shape))fail('INPUT','Choose the saved layout or style, color and size totals.',400)
 const byOrder=await authorizedRecords(db,actor,ids)
 if(p.layout!==undefined)requireSupplier(actor)
 const layoutId=p.layout===undefined?undefined:text(p.layout,'Layout ID',100)
 const layout=await selectedConfirmationLayout(db,layoutId)
 const records=ids.map((id,index)=>{
  const record=byOrder.get(id)!.find(record=>record.number===numbers[index])
  if(!record)fail('NOT_FOUND','A selected confirmation revision was not found. Refresh the selection.',404)
  if(!record.snapshot.lines.length)fail('NO_LINES','A selected confirmation has no recorded lines; it cannot be represented in a per-line export.')
  return record
 })
 // Production totals add exact base quantities; every row names the confirmations it came from.
 if(shape==='totals')return csv(csvText(productionTotals(records.flatMap(record=>record.snapshot.lines.map(line=>({style:line.style,color:line.color,size:line.size,sku:line.sku,baseUnit:line.baseUnit??line.unit??'units',baseQuantity:String(line.baseQuantity??line.quantity),order:record.snapshot.id,confirmation:`${record.snapshot.id}-C${record.number}`}))))),'barrow-production-totals.csv')
 // A narrow saved layout must still identify every source order and commercial revision.
 const identities:ConfirmationColumn[]=['order','order_revision','confirmation']
 const columns=[...layout.columns,...identities.filter(column=>!layout.columns.includes(column))]
 if(layout.shape==='matrix')return csv(matrixCsv(records,columns),'barrow-confirmations.csv')
 const common=columns.filter(column=>records.every(record=>displayedConfirmationColumns(record,columns).includes(column)))
 const visible=records.some(record=>record.snapshot.priceDisplay)?withConfirmationCurrency(common):common
 return csv(csvText([visible,...records.flatMap(record=>confirmationCsvRows(record,visible))]),'barrow-confirmations.csv')
}
const csv=(body:string,name:string)=>new Response(body,{headers:{'content-type':'text/csv; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','content-disposition':`attachment; filename="${name}"`}})
