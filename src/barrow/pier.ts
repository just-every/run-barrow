import { observePierConfiguration } from './connection-security'
import { demoEffect } from '../modules/demo/index.mjs'
import { demoPierOrigin } from '../demo-data'
import { demoPierState, demoReservation, demoPierOrder, demoRelease } from './demo-pier'
import { now } from './clock'
import { sellingUnits } from './units'
// Decimal representation adapted from Pier model.ts at dcd4c591. Allocation stays in Pier.
import { fail, type Account, type Line, type Order } from './model'
import type { Bindings } from '../auth.server'
const SCALE=1000000n
export function decimal(value: string): bigint {
 if(typeof value!=='string'||!/^\d{1,10}(\.\d{1,6})?$/.test(value)) fail('PIER_RESPONSE','Pier returned an invalid quantity.',502)
 const [whole,fraction='']=value.split('.')
 return BigInt(whole)*SCALE+BigInt(fraction.padEnd(6,'0'))
}
export function format(value: bigint) { return `${value/SCALE}${value%SCALE ? '.'+(value%SCALE).toString().padStart(6,'0').replace(/0+$/,'') : ''}` }
function origin(env: Bindings) {
 if(!env.PIER_ORIGIN || !env.PIER_SESSION) fail('PIER_UNAVAILABLE','Connect a Pier installation before browsing stock or approving orders.',503)
 let url: URL
 try { url=new URL(env.PIER_ORIGIN) } catch { return fail('PIER_UNAVAILABLE','Pier origin is not configured correctly.',503) }
 if(url.origin!==env.PIER_ORIGIN || url.username || url.password || (url.protocol!=='https:' && !(env.AUTH_LOCAL==='true' && url.protocol==='http:' && ['127.0.0.1','localhost','[::1]'].includes(url.hostname)))) fail('PIER_UNAVAILABLE','Pier requires an HTTPS origin (loopback is allowed locally).',503)
 return url.origin
}
async function call(env: Bindings,path: string,body?: unknown,observe=true) {
 if(observe)await observePierConfiguration(env)
 const base=origin(env)
 let response: Response
 try { response=await fetch(base+path,{method:body?'POST':'GET',redirect:'manual',signal:AbortSignal.timeout(12000),headers:{cookie:env.PIER_SESSION!,origin:base,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}) }
 catch { return fail('PIER_UNAVAILABLE','Pier did not answer. An approved request remains recoverable with the same order ID.',503) }
 if(!response.ok) fail('PIER_UNAVAILABLE',response.status===401||response.status===403?'The Pier connection needs a current authorized supplier session.':'Pier refused the request. Check the stock desk before continuing.',503)
 const data=await response.json() as any
 if(data.ok===false) fail('PIER_REJECTED','Pier refused this order. Check its customer, items and session permissions.',409)
 return data
}
export const pierOrigin = (env: Bindings) => demoEffect(() => env.PIER_ORIGIN && env.PIER_SESSION ? origin(env) : undefined, demoPierOrigin)
export const pierConfigured = (env: Bindings) => demoEffect(async () => { await observePierConfiguration(env); return Boolean(env.PIER_ORIGIN && env.PIER_SESSION) }, true)
export const pierState = (env: Bindings) => demoEffect(() => call(env,'/api/pier/state'), demoPierState)
export async function catalogue(env: Bindings,account: Account) {
 const state=await pierState(env)
 if(!Array.isArray(state.items)||!Array.isArray(state.positions)||!Array.isArray(state.locations)||!Array.isArray(state.parties)) fail('PIER_RESPONSE','Pier stock response is incomplete.',502)
 if(!state.parties.some((p:any)=>p.id===account.value.pierCustomerId && p.kind==='customer')) fail('PIER_CUSTOMER','Map this account to an existing Pier customer.',409)
 const bins=new Map<string,string>(state.locations.filter((l:any)=>l.kind==='bin').map((l:any)=>[l.id,typeof l.warehouse==='string'&&l.warehouse?l.warehouse:'Unnamed warehouse']))
 const allowed=account.value.warehouses?.length?new Set(account.value.warehouses):undefined
 const unconfirmed=await unconfirmedReleases(env,state)
 const activeItems=new Map<string,any>(state.items.filter((item:any)=>!item.archived).map((item:any)=>[item.sku,item]))
 const stockByItem=new Map<string,Map<string,bigint>>()
 for(const position of state.positions) if(position.status==='sellable'&&bins.has(position.locationId)) {
  const warehouses=stockByItem.get(position.itemId)??new Map<string,bigint>(),warehouse=bins.get(position.locationId)!
  warehouses.set(warehouse,(warehouses.get(warehouse)??0n)+decimal(position.available));stockByItem.set(position.itemId,warehouses)
 }
 const items=account.value.prices.flatMap(price=>{
  const item=activeItems.get(price.sku)
  if(!item) return []
  const byWarehouse=stockByItem.get(item.id)??new Map<string,bigint>()
  const sellable=[...byWarehouse].filter(([name])=>!allowed||allowed.has(name)).reduce((n,[,quantity])=>n+quantity,0n)
  const held=unconfirmed.get(item.id)??0n,available=sellable>held?sellable-held:0n
  const offer={...price,itemId:item.id,name:item.name,unit:item.unit,...(typeof item.barcode==='string'&&item.barcode?{barcode:item.barcode as string}:{}),available:format(available),...(held?{awaitingRelease:format(held)}:{}),warehouses:[...byWarehouse].sort(([a],[b])=>a.localeCompare(b)).map(([warehouse,quantity])=>({warehouse,available:format(quantity),promised:!allowed||allowed.has(warehouse)})),incoming:incoming(state,item.id)}
  sellingUnits(offer)
  return [offer]
 })
 return {account,items,currency:account.value.currency??'USD',observedAt:(await now()).toISOString()}
}
/** STK-002: unreceived quantity on committed Pier POs for one item, by promise date (null when the PO gives none), earliest first. */
function incoming(state:any,itemId:string) {
 const dates=new Map<string|null,bigint>()
 for(const po of Array.isArray(state.purchaseOrders)?state.purchaseOrders:[]) if(po.status==='committed') for(const line of po.lines??[]) if(line.itemId===itemId) {
  const open=decimal(line.quantity)-decimal(line.received??'0')
  if(open>0n) dates.set(po.promiseDate??null,(dates.get(po.promiseDate??null)??0n)+open)
 }
 return [...dates].sort(([a],[b])=>a===null?1:b===null?-1:a.localeCompare(b)).map(([date,quantity])=>({date,quantity:format(quantity)}))
}
/** Several selling units of one SKU become one exact base-unit reservation at Pier. */
export function reservationLines(lines:Line[]) {
 const totals=new Map<string,bigint>()
 for(const line of lines) totals.set(line.itemId,(totals.get(line.itemId)??0n)+decimal(line.baseQuantity ?? String(line.quantity)))
 return [...totals].map(([itemId,quantity])=>({itemId,quantity:format(quantity)}))
}
/** ORD-007: the requested delivery date travels as Pier's promiseDate, its only order date. */
export const reserveOrder = (env: Bindings,orderId: string,customerId: string,lines: Line[],requestedDate?: string) => demoEffect(() => call(env,'/api/pier/commands',{commandId:`barrow-${orderId}`,type:'order.create',payload:{customerId,lines:reservationLines(lines),...(requestedDate?{promiseDate:requestedDate}:{})}}).then(value=>value.result), () => demoReservation(orderId, reservationLines(lines).map(line=>({...lines.find(original=>original.itemId===line.itemId)!,quantity:Number(line.quantity),baseQuantity:line.quantity}))))
export function fullyReserved(result: any,lines: Line[]) {
 const expected=reservationLines(lines)
 return Array.isArray(result?.lines) && result.lines.length===expected.length && expected.every(line=>{
  const matches=result.lines.filter((l:any)=>l.itemId===line.itemId)
  return matches.length===1 && decimal(matches[0].quantity)===decimal(line.quantity) && decimal(matches[0].reserved)>=decimal(line.quantity) && decimal(matches[0].cancelled)===0n
 })
}
/**
 * STK-004: promiseable stock is Pier's sellable-less-reserved figure minus every unit a requested release has not
 * been confirmed for. A unit counts as unconfirmed when Pier reserved it for the order at the request and Barrow has
 * not recorded Pier's cancellation acknowledgment, even if Pier has already freed it; units Pier still reserves are
 * already excluded by Pier, so nothing is subtracted twice.
 */
async function unconfirmedReleases(env: Bindings,state: any) {
 const held=new Map<string,bigint>()
 const rows=await env.DB.prepare("SELECT value_json FROM bw_orders WHERE json_extract(value_json,'$.status')='releasing'").all<{value_json:string}>(),connected=await pierOrigin(env)
 for(const row of rows.results) {
  const order=JSON.parse(row.value_json) as Order
  if(order.pierOrigin!==connected) continue
  const upstream=Array.isArray(state.orders)?state.orders.find((o:any)=>o.id===order.pierOrderId):undefined
  for(const line of order.release?.held??[]) {
   const still=(upstream?.lines??[]).filter((l:any)=>l.itemId===line.itemId).reduce((n:bigint,l:any)=>n+decimal(l.reserved),0n)
   const gap=decimal(line.quantity)-still
   if(gap>0n) held.set(line.itemId,(held.get(line.itemId)??0n)+gap)
  }
 }
 return held
}
/** Pier's current view of one recorded order: per line quantity, reserved, dispatched and cancelled. */
export async function pierOrder(env: Bindings,order: Order) {
 const state=await demoEffect(() => call(env,'/api/pier/state'), () => ({orders:[demoPierOrder(order)]}))
 const found=Array.isArray(state.orders)?state.orders.find((o:any)=>o.id===order.pierOrderId):undefined
 if(!found || !Array.isArray(found.lines)) fail('PIER_ORDER','The recorded Pier order is missing. Check the stock desk.')
 return found
}
/** REP-005: a visit's sample request travels to Pier as one sales order under its durable visit identity, so a retry
 * replays Pier's first outcome; Pier stays the only stock ledger and its reservation result is the acknowledgment. */
export const handOffSamples = (env: Bindings,visitId: string,customerId: string,lines: { itemId: string; quantity: string }[]) => demoEffect(() => call(env,'/api/pier/commands',{commandId:`barrow-sample-${visitId}`,type:'order.create',payload:{customerId,lines}}).then(value=>value.result), () => ({ id: `pier-sample-${visitId}`, reference: `SO-SAMPLE-${visitId.slice(0, 8)}`, lines: lines.map(line => ({ itemId: line.itemId, quantity: line.quantity, reserved: line.quantity, cancelled: '0' })) }))
/** One durable release identity per order; a retry repeats the identical command so Pier replays its first outcome. */
export const releaseOrder = (env: Bindings,order: Order) => demoEffect(() => call(env,'/api/pier/commands',{commandId:`barrow-release-${order.id}`,type:'order.cancel',payload:{orderId:order.pierOrderId,reason:order.release!.reason}}).then(value=>value.result), () => demoRelease(order))
/** Released means Pier holds no reservation for the order and every unshipped unit is cancelled. */
export function released(result: any) {
 return Array.isArray(result?.lines) && result.lines.length>0 && result.lines.every((l:any)=>decimal(l.reserved)===0n && decimal(l.cancelled)+decimal(l.dispatched)===decimal(l.quantity))
}

export const pierStockPage=(env:Bindings,consumer:string,checkpoint:string|null,limit=100)=>call(env,'/api/pier/stock-changes?'+new URLSearchParams({consumer,limit:String(limit),...(checkpoint?{checkpoint}:{})}))
export const acknowledgePierStock=(env:Bindings,consumer:string,checkpoint:string)=>call(env,'/api/pier/stock-changes/ack',{consumer,checkpoint})

export const pierReadOnlyState=(env:Bindings)=>demoEffect(()=>call(env,'/api/pier/state',undefined,false),demoPierState)
