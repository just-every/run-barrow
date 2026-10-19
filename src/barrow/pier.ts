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
function format(value: bigint) { return `${value/SCALE}${value%SCALE ? '.'+(value%SCALE).toString().padStart(6,'0').replace(/0+$/,'') : ''}` }
function origin(env: Bindings) {
 if(!env.PIER_ORIGIN || !env.PIER_SESSION) fail('PIER_UNAVAILABLE','Connect a Pier installation before browsing stock or approving orders.',503)
 let url: URL
 try { url=new URL(env.PIER_ORIGIN) } catch { return fail('PIER_UNAVAILABLE','Pier origin is not configured correctly.',503) }
 if(url.origin!==env.PIER_ORIGIN || url.username || url.password || (url.protocol!=='https:' && !(env.AUTH_LOCAL==='true' && url.protocol==='http:' && ['127.0.0.1','localhost','[::1]'].includes(url.hostname)))) fail('PIER_UNAVAILABLE','Pier requires an HTTPS origin (loopback is allowed locally).',503)
 return url.origin
}
async function call(env: Bindings,path: string,body?: unknown) {
 const base=origin(env)
 let response: Response
 try { response=await fetch(base+path,{method:body?'POST':'GET',redirect:'manual',signal:AbortSignal.timeout(12000),headers:{cookie:env.PIER_SESSION!,origin:base,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}) }
 catch { return fail('PIER_UNAVAILABLE','Pier did not answer. An approved request remains recoverable with the same order ID.',503) }
 if(!response.ok) fail('PIER_UNAVAILABLE',response.status===401||response.status===403?'The Pier connection needs a current authorized supplier session.':'Pier refused the request. Check the stock desk before continuing.',503)
 const data=await response.json() as any
 if(data.ok===false) fail('PIER_REJECTED','Pier refused this order. Check its customer, items and session permissions.',409)
 return data
}
export const pierOrigin = (env: Bindings) => demoEffect(() => env.PIER_ORIGIN, demoPierOrigin)
export const pierConfigured = (env: Bindings) => demoEffect(() => Boolean(env.PIER_ORIGIN && env.PIER_SESSION), true)
export const pierState = (env: Bindings) => demoEffect(() => call(env,'/api/pier/state'), demoPierState)
export async function catalogue(env: Bindings,account: Account) {
 const state=await pierState(env)
 if(!Array.isArray(state.items)||!Array.isArray(state.positions)||!Array.isArray(state.locations)||!Array.isArray(state.parties)) fail('PIER_RESPONSE','Pier stock response is incomplete.',502)
 if(!state.parties.some((p:any)=>p.id===account.value.pierCustomerId && p.kind==='customer')) fail('PIER_CUSTOMER','Map this account to an existing Pier customer.',409)
 const bins=new Set(state.locations.filter((l:any)=>l.kind==='bin').map((l:any)=>l.id))
 const unconfirmed=await unconfirmedReleases(env,state)
 const items=account.value.prices.flatMap(price=>{
  const item=state.items.find((i:any)=>i.sku===price.sku && !i.archived)
  if(!item) return []
  const sellable=state.positions.filter((p:any)=>p.itemId===item.id && p.status==='sellable' && bins.has(p.locationId)).reduce((n:bigint,p:any)=>n+decimal(p.available),0n)
  const held=unconfirmed.get(item.id)??0n,available=sellable>held?sellable-held:0n
  const offer={...price,itemId:item.id,name:item.name,unit:item.unit,available:format(available),...(held?{awaitingRelease:format(held)}:{})}
  sellingUnits(offer)
  return [offer]
 })
 return {account,items,currency:'USD' as const,observedAt:(await now()).toISOString()}
}
/** Several selling units of one SKU become one exact base-unit reservation at Pier. */
export function reservationLines(lines:Line[]) {
 const totals=new Map<string,bigint>()
 for(const line of lines) totals.set(line.itemId,(totals.get(line.itemId)??0n)+decimal(line.baseQuantity ?? String(line.quantity)))
 return [...totals].map(([itemId,quantity])=>({itemId,quantity:format(quantity)}))
}
export const reserveOrder = (env: Bindings,orderId: string,customerId: string,lines: Line[]) => demoEffect(() => call(env,'/api/pier/commands',{commandId:`barrow-${orderId}`,type:'order.create',payload:{customerId,lines:reservationLines(lines)}}).then(value=>value.result), () => demoReservation(orderId, reservationLines(lines).map(line=>({...lines.find(original=>original.itemId===line.itemId)!,quantity:Number(line.quantity),baseQuantity:line.quantity}))))
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
/** One durable release identity per order; a retry repeats the identical command so Pier replays its first outcome. */
export const releaseOrder = (env: Bindings,order: Order) => demoEffect(() => call(env,'/api/pier/commands',{commandId:`barrow-release-${order.id}`,type:'order.cancel',payload:{orderId:order.pierOrderId,reason:order.release!.reason}}).then(value=>value.result), () => demoRelease(order))
/** Released means Pier holds no reservation for the order and every unshipped unit is cancelled. */
export function released(result: any) {
 return Array.isArray(result?.lines) && result.lines.length>0 && result.lines.every((l:any)=>decimal(l.reserved)===0n && decimal(l.cancelled)+decimal(l.dispatched)===decimal(l.quantity))
}
