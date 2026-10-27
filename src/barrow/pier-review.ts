import type { Bindings } from '../auth.server'
import { decimal, format, pierState } from './pier'
import { fail } from './model'
export type ConnectorIssue = {record:string;kind:string;message:string;action:string;owner:string}
/** Read-only reconciliation; source stock is never copied into a local ledger. */
export async function previewPier(env:Bindings, owner:string, previous?:any) {
 const at = new Date().toISOString(), issues:ConnectorIssue[] = []
 const attention = (record:string,kind:string,message:string,action:string) => issues.push({record,kind,message,action,owner})
 let pier:any={state:'unavailable',checkedAt:at,lastSuccessfulAt:previous?.lastSuccessfulAt??null,samples:previous?.samples??[],counts:previous?.counts??null}
 const accountRows = (await env.DB.prepare('SELECT id,revision,value_json FROM bw_accounts ORDER BY id').all<{id:string;revision:string;value_json:string}>()).results
 const accounts = accountRows.map(row=>({id:row.id,value:JSON.parse(row.value_json)}))
 const orderRows = (await env.DB.prepare("SELECT id,revision,value_json FROM bw_orders WHERE json_extract(value_json,'$.pierOrderId') IS NOT NULL ORDER BY id").all<{id:string;revision:string;value_json:string}>()).results
 try {
  const source = await pierState(env)
  if (!['owner','operator'].includes(source.actor?.role)) fail('PIER_PERMISSION','Pier requires an owner or stock operator credential.',503)
  if (!Array.isArray(source.items) || !Array.isArray(source.parties) || !Array.isArray(source.positions)) fail('PIER_RESPONSE','Pier returned an incomplete source preview.',502)
  const items = source.items.filter((item:any)=>!item.archived), customers = source.parties.filter((party:any)=>party.kind==='customer')
  const bins = new Set((source.locations??[]).filter((location:any)=>location.kind==='bin').map((location:any)=>location.id))
  const samples = items.slice(0,20).map((item:any)=>({id:item.id,sku:item.sku,name:item.name,unit:item.unit,available:format(source.positions.filter((position:any)=>position.itemId===item.id&&position.status==='sellable'&&bins.has(position.locationId)).reduce((sum:bigint,position:any)=>sum+decimal(position.available),0n))}))
  const targets = new Map<string,string[]>()
  for (const account of accounts) {
   const ids = targets.get(account.value.pierCustomerId) ?? []; ids.push(account.id); targets.set(account.value.pierCustomerId,ids)
   if (!customers.some((party:any)=>party.id===account.value.pierCustomerId)) attention(account.id,'unmapped-customer','The mapped Pier customer does not exist.','Repair the Pier customer ID in Accounts.')
   for (const price of account.value.prices) if (!items.some((item:any)=>item.sku===price.sku)) attention(`${account.id}:${price.sku}`,'unmapped-item','This priced SKU has no active Pier item.','Repair the assortment in Accounts or restore the item at Pier, then inspect again.')
  }
  for (const [target,ids] of targets) if (ids.length>1) attention(target,'duplicate-customer',`These accounts share one Pier customer: ${ids.join(', ')}. Review the mapping; no account is merged automatically.`,'Review each account mapping in Accounts.')
  const orders = orderRows.map(row=>JSON.parse(row.value_json))
  for (const order of orders) {
   if(order.pierOrigin!==env.PIER_ORIGIN) {attention(order.id,'destination','This order belongs to a different Pier installation.','Reconnect its original Pier installation.');continue}
   const upstream = (source.orders??[]).find((row:any)=>row.id===order.pierOrderId)
   if(!upstream){attention(order.id,'missing-order','The recorded Pier order is absent.','Review the stock handoff in Orders; preserve the original correlation ID.');continue}
   const expected = new Map<string,bigint>(),actual = new Map<string,bigint>()
   for(const line of order.lines)expected.set(line.itemId,(expected.get(line.itemId)??0n)+decimal(line.baseQuantity??String(line.quantity)))
   for(const line of upstream.lines??[])actual.set(line.itemId,(actual.get(line.itemId)??0n)+decimal(line.quantity))
   for(const id of new Set([...expected.keys(),...actual.keys()]))if((expected.get(id)??0n)!==(actual.get(id)??0n))attention(`${order.id}:${id}`,'quantity-difference',`Native ordered ${format(expected.get(id)??0n)}; Pier ordered ${format(actual.get(id)??0n)} base units.`,'Review this order and its original source at Pier; never overwrite either history.')
  }
  pier={state:'answered',checkedAt:at,lastSuccessfulAt:at,samples,counts:{sourceItems:items.length,sourceCustomers:customers.length,mappedAccounts:accounts.length,sourceOrders:(source.orders??[]).length,nativeOrders:orders.length},authority:{stock:'Pier',commerce:'Barrow',customerField:'pierCustomerId → party.id',itemField:'prices.sku → item.sku'}}
 } catch {
  attention('pier','connection','Pier could not be read with the configured credential. No successful synchronization or write permission is inferred.','Reconnect Pier with a current authorized supplier session and inspect again.')
 }
 const guards = [
  env.DB.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN (SELECT json_group_array(json_array(id,revision,value_json)) FROM (SELECT id,revision,value_json FROM bw_accounts ORDER BY id))=? THEN 1 ELSE 0 END').bind(JSON.stringify(accountRows.map(row=>[row.id,row.revision,row.value_json]))),
  env.DB.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN (SELECT json_group_array(json_array(id,revision,value_json)) FROM (SELECT id,revision,value_json FROM bw_orders WHERE json_extract(value_json,'$.pierOrderId') IS NOT NULL ORDER BY id))=? THEN 1 ELSE 0 END").bind(JSON.stringify(orderRows.map(row=>[row.id,row.revision,row.value_json]))),
 ]
 return {pier,issues,guards}
}
export async function reconciledPierGuards(env:Bindings, owner:string) {
 const preview=await previewPier(env,owner)
 if(preview.pier.state!=='answered'||preview.issues.some(issue=>issue.kind!=='duplicate-customer'))fail('CONNECTOR_RECONCILIATION','Inspect and repair Pier connector mappings and quantity differences before enabling synchronization.')
 return preview.guards
}
