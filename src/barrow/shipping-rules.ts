import { fail, integer, text, type Account } from './model'
export type ShippingMethod = { id:string; name:string; kind:'pickup'|'parcel'|'freight'|'own-carrier'; accountIds:string[]; states:string[]; warehouses:string[]; minCents:number; maxCents:number|null; baseCents:number; handlingCents:number; freeOverCents:number|null; transitMinDays:number; transitMaxDays:number; quoteRequired:boolean }
export type FreightQuote = { methodId:string; warehouse:string; cents:number; windowStart:string; windowEnd:string; reason:string; by:string; at:string; basis:string }
export type DeliveryOption = { settingsRevision:string|null; methodId:string; name:string; kind:ShippingMethod['kind']; warehouse:string; shippingCents:number|null; handlingCents:number; totalCents:number|null; windowStart:string; windowEnd:string; approvalRequired:boolean; fingerprint:string; quote?:FreightQuote }
export type Delivery = DeliveryOption & { acceptedBy?:string; acceptedAt?:string; ownCarrierAccount?:string }
const list=(value:any,name:string,max=100)=>{
 if(!Array.isArray(value)||value.length>max||value.some(v=>typeof v!=='string'||!v.trim()||v.length>160)) fail('SHIPPING_INPUT',`${name} must be a list of at most ${max} nonempty values.`,400)
 return [...new Set(value.map(v=>v.trim()))] as string[]
}
export function shippingMethods(input:any):ShippingMethod[] {
 if(!Array.isArray(input)||input.length>30) fail('SHIPPING_INPUT','Configure at most 30 delivery methods.',400)
 const seen=new Set<string>()
 return input.map((p:any)=>{
  const id=text(p.id,'Method ID',60);if(!/^[a-zA-Z0-9_-]+$/.test(id)||seen.has(id))fail('SHIPPING_INPUT','Delivery method IDs must be distinct letters, numbers, hyphens or underscores.',400);seen.add(id)
  if(!['pickup','parcel','freight','own-carrier'].includes(p.kind))fail('SHIPPING_INPUT','Choose pickup, parcel, freight or own-carrier.',400)
  const minCents=integer(p.minCents,'Minimum merchandise cents'),maxCents=p.maxCents===null?null:integer(p.maxCents,'Maximum merchandise cents'),transitMinDays=integer(p.transitMinDays,'Minimum transit calendar days',0,365),transitMaxDays=integer(p.transitMaxDays,'Maximum transit calendar days',0,365)
  if(maxCents!==null&&maxCents<minCents||transitMaxDays<transitMinDays)fail('SHIPPING_INPUT','Maximum order size and transit days must be at least their minimum.',400)
  const states=list(p.states,'States',60).map(v=>v.toUpperCase());if(states.some(v=>!/^([A-Z]{2})$/.test(v)))fail('SHIPPING_INPUT','Use two-letter state codes.',400)
  if(typeof p.quoteRequired!=='boolean')fail('SHIPPING_INPUT','State whether a delivery quote needs approval.',400)
  return {id,name:text(p.name,'Delivery method name',100),kind:p.kind,accountIds:list(p.accountIds,'Accounts'),states,warehouses:list(p.warehouses,'Warehouses'),minCents,maxCents,baseCents:integer(p.baseCents,'Base shipping cents'),handlingCents:integer(p.handlingCents,'Handling cents'),freeOverCents:p.freeOverCents===null?null:integer(p.freeOverCents,'Free shipping threshold cents'),transitMinDays,transitMaxDays,quoteRequired:p.quoteRequired}
 })
}
export function eligible(method:ShippingMethod,account:Account,subtotal:number,state:string) {
 return (!method.accountIds.length||method.accountIds.includes(account.id))&&(!method.states.length||method.states.includes(state))&&subtotal>=method.minCents&&(method.maxCents===null||subtotal<=method.maxCents)
}
export function dateAfter(day:string,days:number) {const at=new Date(day+'T00:00:00Z');at.setUTCDate(at.getUTCDate()+days);return at.toISOString().slice(0,10)}
export function deliveryDay(value:any,name:string) {if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)fail('SHIPPING_INPUT',`${name} must be a valid YYYY-MM-DD date.`,400);return value as string}
