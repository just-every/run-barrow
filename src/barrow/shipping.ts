import type { Bindings } from '../auth.server'
import { account } from './accounts'
import { audit, changed, commit, digest } from './access'
import { now } from './clock'
import { fail, integer, requirePerson, requireSupplier, supplierDate, text, type Account, type Actor, type Line, type Order } from './model'
import { deliveryDay, dateAfter, eligible, shippingMethods, type Delivery, type DeliveryOption, type FreightQuote, type ShippingMethod } from './shipping-rules'
import { locationSnapshot } from './locations'
export type ShippingSettings={revision:string|null;methods:ShippingMethod[]}
export async function shippingSettings(db:D1Database):Promise<ShippingSettings> {
 const row=await db.prepare("SELECT value_json,revision FROM bw_settings WHERE key='shipping'").first<{value_json:string;revision:string}>()
 return row?{revision:row.revision,methods:JSON.parse(row.value_json)}:{revision:null,methods:[]}
}
export async function saveShipping(env:Bindings,actor:Actor,p:any) {
 requireSupplier(actor)
 const current=await shippingSettings(env.DB);if(p.revision!==current.revision)fail('SHIPPING_CHANGED','Delivery settings changed. Refresh before saving.')
 const methods=shippingMethods(p.methods),revision=crypto.randomUUID()
 for(const id of new Set(methods.flatMap(method=>method.accountIds)))await account(env.DB,actor,id)
 const statement=current.revision?env.DB.prepare("UPDATE bw_settings SET value_json=?,revision=? WHERE key='shipping' AND revision=?").bind(JSON.stringify(methods),revision,current.revision):env.DB.prepare("INSERT INTO bw_settings(key,value_json,revision) VALUES('shipping',?,?)").bind(JSON.stringify(methods),revision)
 await commit(env.DB,actor,[statement,changed(env.DB),audit(env.DB,actor,'settings:shipping','shipping.configured',{revision,source:'shipping.settings',reason:`Configured ${methods.length} merchant delivery methods. Rates are merchant quotes, not live carrier rates.`})])
 return {methods,revision}
}
export type ShippingContext={account:Account;lines:Line[];shipTo?:Order['shipTo'];quotes?:FreightQuote[]}
export async function deliveryOptions(env:Bindings,context:ShippingContext) {
 const settings=await shippingSettings(env.DB),today=supplierDate(await now()),subtotal=context.lines.reduce((sum,line)=>sum+(line.lineCents??line.quantity*line.unitCents),0)
 const basis=await digest(JSON.stringify({accountId:context.account.id,accountRevision:context.account.revision,lines:context.lines,shipTo:context.shipTo??null,settings:settings.revision}))
 const options:DeliveryOption[]=[]
 for(const method of settings.methods) {
  if(!eligible(method,context.account,subtotal,context.shipTo?.state??''))continue
  const allowed=context.account.value.warehouses??[]
  const warehouses=method.warehouses.length?method.warehouses:allowed.length?allowed:['']
  for(const warehouse of warehouses) {
   if(allowed.length&&(!warehouse||!allowed.includes(warehouse)))continue
   const quote=context.quotes?.slice().reverse().find(q=>q.methodId===method.id&&q.warehouse===warehouse&&q.basis===basis&&q.windowStart>=today)
   const shippingCents=method.quoteRequired?(quote?.cents??null):method.freeOverCents!==null&&subtotal>=method.freeOverCents?0:method.baseCents
   const item={settingsRevision:settings.revision,methodId:method.id,name:method.name,kind:method.kind,warehouse,shippingCents,handlingCents:method.handlingCents,totalCents:shippingCents===null?null:shippingCents+method.handlingCents,windowStart:quote?.windowStart??dateAfter(today,method.transitMinDays),windowEnd:quote?.windowEnd??dateAfter(today,method.transitMaxDays),approvalRequired:shippingCents===null,...(quote?{quote}:{})}
   options.push({...item,fingerprint:await digest(JSON.stringify({basis,...item}))})
  }
 }
 return {required:settings.methods.length>0,options,basis}
}
export async function selectDelivery(env:Bindings,context:ShippingContext,p:any):Promise<Delivery|undefined> {
 const offered=await deliveryOptions(env,context)
 if(!offered.required&&!p)return undefined
 if(!p)fail('SHIPPING_REQUIRED','Choose a delivery method and review its cost and window before submitting.')
 const option=offered.options.find(o=>o.methodId===p.methodId&&o.warehouse===(p.warehouse??''))
 if(!option||option.fingerprint!==p.fingerprint)fail('SHIPPING_CHANGED','Delivery eligibility, quote, address or window changed. Review the current delivery options.')
 if(option.approvalRequired)fail('SHIPPING_APPROVAL','The supplier must record the freight quote before the buyer accepts it.')
 const ownCarrierAccount=option.kind==='own-carrier'?text(p.ownCarrierAccount,'Your carrier account reference',100):undefined
 return {...option,...(ownCarrierAccount?{ownCarrierAccount}:{})}
}
export function deliveryTotal(lines:Line[],delivery?:Delivery) {const total=lines.reduce((sum,line)=>sum+(line.lineCents??line.quantity*line.unitCents),0)+(delivery?.totalCents??0);if(!Number.isSafeInteger(total))fail('MONEY','The delivered total exceeds the exact-cent range.',400);return total}
export async function acceptDelivery(env:Bindings,actor:Actor,context:ShippingContext,selection:any,acknowledged:any) {
 const delivery=await selectDelivery(env,context,selection)
 if(delivery&&acknowledged!==true)fail('SHIPPING_ACCEPTANCE','Explicitly accept the final delivery method, cost and window before ordering.')
 return delivery?{...delivery,acceptedBy:actor.id,acceptedAt:(await now()).toISOString()}:undefined
}
export async function freightQuote(env:Bindings,actor:Actor,context:ShippingContext,p:any):Promise<FreightQuote> {
 requireSupplier(actor)
 const offered=await deliveryOptions(env,context),option=offered.options.find(o=>o.methodId===p.methodId&&o.warehouse===(p.warehouse??''))
 if(!option)fail('SHIPPING_CHANGED','This delivery method is not eligible for the order.')
 const settings=await shippingSettings(env.DB);if(!settings.methods.find(m=>m.id===option.methodId)?.quoteRequired)fail('SHIPPING_INPUT','This method already has a configured binding rate.',400)
 const windowStart=deliveryDay(p.windowStart,'Window start'),windowEnd=deliveryDay(p.windowEnd,'Window end')
 if(windowStart<supplierDate(await now())||windowEnd<windowStart)fail('SHIPPING_INPUT','Use a future or current delivery window with end on or after start.',400)
 return {methodId:option.methodId,warehouse:option.warehouse,cents:integer(p.cents,'Quoted freight cents'),windowStart,windowEnd,reason:text(p.reason,'Freight quote reason',240),by:actor.id,at:(await now()).toISOString(),basis:offered.basis}
}
export async function orderShippingContext(env:Bindings,actor:Actor,id:string) {
 // Import lazily: the order command also calls these pure delivery functions.
 const {readOrder}=await import('./orders'),order=await readOrder(env.DB,actor,id),selected=await account(env.DB,actor,order.accountId)
 return {order,context:{account:selected,lines:order.lines,shipTo:order.shipTo,quotes:order.freightQuotes}}
}
export async function shippingResponse(env:Bindings,actor:Actor,id:string) {
 requirePerson(actor)
 const {order,context}=await orderShippingContext(env,actor,id)
 if(order.status!=='draft')return {required:Boolean(order.delivery),options:[],selected:order.delivery}
 return {...await deliveryOptions(env,context),selected:order.delivery}
}
export async function quoteShippingContext(env:Bindings,actor:Actor,id:string) {
 const row=await env.DB.prepare('SELECT value_json FROM bw_quotes WHERE id=?').bind(id).first<{value_json:string}>();if(!row)fail('NOT_FOUND','Quote not found.',404)
 const quote=JSON.parse(row.value_json),selected=await account(env.DB,actor,quote.accountId),latest=quote.revisions.at(-1)
 return {account:selected,lines:latest?.lines??quote.request,shipTo:await locationSnapshot(env.DB,selected,'ship-to',undefined),quotes:latest?.freightQuotes} as ShippingContext
}

/** The rate book is rechecked in the same SQL transaction that accepts the order. */
export function shippingGuard(db:D1Database,delivery?:Delivery) {
 return delivery?db.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN (SELECT revision FROM bw_settings WHERE key='shipping')=? THEN 1 ELSE 0 END").bind(delivery.settingsRevision):db.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM bw_settings WHERE key='shipping' AND json_array_length(value_json)>0) THEN 1 ELSE 0 END")
}
