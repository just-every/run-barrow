import type { Bindings } from '../../auth.server'
import { fail, type Actor } from '../model'
import { pierState, decimal, format } from '../pier'
import { canonicalJson, sha256 } from '../../modules/import-kit/src/d1/index'
import type { CutoverRecord } from './cutover-source'

export type CutoverTarget = { kind:CutoverRecord['kind'];id:string;accountId?:string;orderId?:string;name?:string;sku?:string;currency?:string;amountCents?:number;quantity?:number;releaseNumber?:unknown;revision:string;citation:string }
export const cutoverKinds = ['accounts','variants','prices','locations','orders','releases','receivables'] as const
export function cutoverOwner(actor: Actor) {
 if(actor.agent || actor.role!=='owner' || actor.staff)fail('FORBIDDEN','Only the signed-in owner may scope, review or activate cutover history.',403)
}
/** Snapshot the named accounts only. The source ledger remains the authority;
 * today's Barrow invoice totals are explicitly not verified unpaid balances. */
export async function cutoverTargets(env: Bindings, actor: Actor, scope: string[]) {
 cutoverOwner(actor)
 if(!Array.isArray(scope)||!scope.length||scope.length>200||scope.some(id=>typeof id!=='string'||!/^[-\w.:]{1,100}$/.test(id))||new Set(scope).size!==scope.length)fail('CUTOVER_SCOPE','Select one to 200 distinct existing account IDs.',400)
 const ids=JSON.stringify([...scope].sort()),guards: D1PreparedStatement[]=[],snapshots:Record<string,string>={}
 const queries={
  accounts:'SELECT id,revision,value_json FROM bw_accounts WHERE id IN (SELECT value FROM json_each(?)) ORDER BY id',
  locations:'SELECT id,account_id,kind,revision,value_json,archived FROM bw_locations WHERE account_id IN (SELECT value FROM json_each(?)) ORDER BY id',
  orders:'SELECT id,account_id,revision,value_json FROM bw_orders WHERE account_id IN (SELECT value FROM json_each(?)) ORDER BY id',
 }
 const rows:Record<string,any[]>={}
 for(const [kind,query] of Object.entries(queries)) {
  rows[kind]=(await env.DB.prepare(query).bind(ids).all<any>()).results
  // JSON aggregate preserves the entire ordered snapshot, including insertions.
  const columns=Object.keys(rows[kind][0]??({accounts:{id:0,revision:0,value_json:0},locations:{id:0,account_id:0,kind:0,revision:0,value_json:0,archived:0},orders:{id:0,account_id:0,revision:0,value_json:0}}[kind as keyof typeof queries]))
  const aggregate=`SELECT json_group_array(json_array(${columns.join(',')})) FROM (${query})`
  snapshots[kind]=JSON.stringify(rows[kind].map(row=>columns.map(key=>row[key])))
  guards.push(env.DB.prepare(`INSERT INTO bw_guard(value) SELECT CASE WHEN (${aggregate})=? THEN 1 ELSE 0 END`).bind(ids,snapshots[kind]))
 }
 if(rows.accounts.length!==scope.length)fail('CUTOVER_SCOPE','Every selected account must exist. Import new accounts through the reviewed account CSV first.',400)
 const targets:CutoverTarget[]=[],allowedSkus=new Set<string>()
 for(const row of rows.accounts) {
  const value=JSON.parse(row.value_json),currency=value.currency??'USD'
  targets.push({kind:'accounts',id:row.id,name:value.name,revision:row.revision,citation:`accounts/${row.id}`})
  for(const price of value.prices) {
   allowedSkus.add(price.sku)
   targets.push({kind:'prices',id:`${row.id}/${price.sku}`,accountId:row.id,sku:price.sku,currency,amountCents:price.unitCents,revision:row.revision,citation:`accounts/${row.id}/prices/${price.sku}`})
  }
 }
 for(const row of rows.locations) {
  if(row.archived)continue
  const value=JSON.parse(row.value_json)
  targets.push({kind:'locations',id:row.id,accountId:row.account_id,name:value.name,revision:row.revision,citation:`locations/${row.id}`})
 }
 for(const row of rows.orders) {
  const order=JSON.parse(row.value_json),currency=order.currency??'AUD',base={accountId:row.account_id,currency,amountCents:order.totalCents,quantity:Number(format(order.lines.reduce((n:bigint,line:any)=>n+decimal(String(line.quantity)),0n))),revision:row.revision}
  if(['submitted','reserving','shortfall','approved','releasing'].includes(order.status)) {
   targets.push({...base,kind:'orders',id:row.id,name:order.reference,citation:`orders/${row.id}`})
   // A numbered PO release is an order. Never synthesize an ORD-009 split.
   if(order.poRelease)targets.push({...base,kind:'releases',id:row.id,orderId:row.id,releaseNumber:order.poRelease.number,citation:`orders/${row.id}/poRelease`})
  }
  if(order.status==='approved'&&order.invoice)targets.push({...base,kind:'receivables',id:order.invoice.number,orderId:row.id,citation:`invoices/${row.id}`})
 }
 const state=await pierState(env)
 if(!Array.isArray(state.items))fail('PIER_RESPONSE','Pier did not return its variant catalog.',502)
 for(const item of state.items.filter((item:any)=>!item.archived&&allowedSkus.has(item.sku)))targets.push({kind:'variants',id:item.id,sku:item.sku,name:item.name,revision:sha256(canonicalJson(item)),citation:`pier/items/${item.id}`})
 targets.sort((a,b)=>a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id))
 return {targets,guards,nativeFingerprint:sha256(canonicalJson({snapshots,variants:targets.filter(row=>row.kind==='variants')}))}
}
