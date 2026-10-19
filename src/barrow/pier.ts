import { demoEffect } from '../modules/demo/index.mjs'
import { demoPierOrigin } from '../demo-data'
import { demoPierState, demoReservation } from './demo-pier'
import { now } from './clock'
// Decimal representation adapted from Pier model.ts at dcd4c591. Allocation stays in Pier.
import { fail, type Account, type Line } from './model'
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
 const items=account.value.prices.flatMap(price=>{
  const item=state.items.find((i:any)=>i.sku===price.sku && !i.archived)
  if(!item) return []
  const available=state.positions.filter((p:any)=>p.itemId===item.id && p.status==='sellable' && bins.has(p.locationId)).reduce((n:bigint,p:any)=>n+decimal(p.available),0n)
  return [{...price,itemId:item.id,name:item.name,unit:item.unit,available:format(available)}]
 })
 return {account,items,observedAt:(await now()).toISOString()}
}
export const reserveOrder = (env: Bindings,orderId: string,customerId: string,lines: Line[]) => demoEffect(() => call(env,'/api/pier/commands',{commandId:`barrow-${orderId}`,type:'order.create',payload:{customerId,lines:lines.map(l=>({itemId:l.itemId,quantity:String(l.quantity)}))}}).then(value=>value.result), () => demoReservation(orderId, lines))
export function fullyReserved(result: any,lines: Line[]) {
 return Array.isArray(result?.lines) && result.lines.length===lines.length && lines.every(line=>{
  const matches=result.lines.filter((l:any)=>l.itemId===line.itemId)
  return matches.length===1 && decimal(matches[0].quantity)===BigInt(line.quantity)*SCALE && decimal(matches[0].reserved)>=BigInt(line.quantity)*SCALE && decimal(matches[0].cancelled)===0n
 })
}
