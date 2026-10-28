import type { Bindings } from '../auth.server'
import { audit, changed, commit } from './access'
import { effectiveBook } from './currency'
import { now } from './clock'
import { commercialAuditEvent } from './audit-event'
import { fail, text, type Account, type Actor, type Order } from './model'

export const wooSelected = (env: Bindings) => env.INVENTORY_PROVIDER === 'woocommerce'
async function observeConfiguration(env:Bindings) {
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign'])
 const fingerprint=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(JSON.stringify([env.WOO_ORIGIN??null,env.WOO_KEY??null,env.WOO_SECRET??null,env.WOO_WEBHOOK_SECRET??null])))),n=>n.toString(16).padStart(2,'0')).join('')
 const prior=await env.DB.prepare("SELECT fingerprint FROM bw_connector_config WHERE id='woocommerce'").first<{fingerprint:string}>()
 if(prior?.fingerprint===fingerprint)return
 const revision=crypto.randomUUID(),event=commercialAuditEvent('system:connectors','connector:woocommerce','woocommerce.credential-observed',{revision,source:'woocommerce.configuration',reason:'Observed deployed credential configuration change; no credential or fingerprint in audit. Owner connection consent remains separate.'})
 await env.DB.batch([env.DB.prepare("INSERT INTO bw_connector_config(id,fingerprint,revision) VALUES('woocommerce',?,?) ON CONFLICT(id) DO UPDATE SET fingerprint=excluded.fingerprint,revision=excluded.revision WHERE bw_connector_config.fingerprint<>excluded.fingerprint").bind(fingerprint,revision),env.DB.prepare(event.sql.replace('VALUES(?,?,?,?,?,?)','SELECT ?,?,?,?,?,? WHERE changes()=1')).bind(...event.params)])
}
type Connection = { origin: string; destination: string; enabled: boolean }
export type WooReceipt = {
 destination: string; id: string; reference: string; identity: string; customerId: string; currency: string; total: string; state: string
 lines: {id:string;itemId:string;quantity:string;reserved:string;dispatched:string;cancelled:string;backorder:string}[]
 fulfillments: {reference:string;warehouse:null;lines:{lineId:string;quantity:number}[]}[]
 refunds: {id:string;amount:string;lines:{lineId:string;quantity:number}[]}[]
}
function origin(env: Bindings) {
 let url: URL
 try { url = new URL(env.WOO_ORIGIN!) } catch { return fail('WOO_UNAVAILABLE','Configure the WooCommerce origin and a current REST credential.',503) }
 if(url.origin!==env.WOO_ORIGIN||url.username||url.password||(url.protocol!=='https:'&&!(env.AUTH_LOCAL==='true'&&url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname))))fail('WOO_UNAVAILABLE','WooCommerce requires an HTTPS origin; local loopback is allowed for development.',503)
 if(!env.WOO_KEY||!env.WOO_SECRET)fail('WOO_UNAVAILABLE','The WooCommerce REST credential is unavailable. Reconnect; pending orders retain their identity.',503)
 return url.origin
}
async function call(env:Bindings,path:string,body?:unknown) {
 const base=origin(env)
 let response:Response
 try { response=await fetch(base+'/wp-json/barrow/v1'+path,{method:body===undefined?'GET':'POST',redirect:'manual',signal:AbortSignal.timeout(12000),headers:{authorization:'Basic '+btoa(env.WOO_KEY+':'+env.WOO_SECRET),'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}) }
 catch { return fail('WOO_UNAVAILABLE','WooCommerce did not acknowledge the request. Reconcile or retry this same order; never create a replacement.',503) }
 if(!response.ok)fail('WOO_UNAVAILABLE',response.status===401||response.status===403?'WooCommerce revoked or refused the REST credential.':'WooCommerce refused the request; reconcile the source before continuing.',503)
 const bytes=await response.text()
 if(bytes.length>1000000)fail('WOO_RESPONSE','WooCommerce returned an oversized response.',502)
 try{return JSON.parse(bytes)}catch{return fail('WOO_RESPONSE','WooCommerce returned an invalid response.',502)}
}
async function connection(env:Bindings):Promise<Connection> {
 await observeConfiguration(env)
 const row=await env.DB.prepare("SELECT value_json FROM bw_settings WHERE key='woocommerce'").first<{value_json:string}>()
 if(!row)fail('WOO_UNAVAILABLE','The owner must explicitly connect the controlled WooCommerce store.',503)
 const value=JSON.parse(row.value_json) as Connection
 if(!value.enabled||value.origin!==origin(env))fail('WOO_UNAVAILABLE','Reconnect the selected WooCommerce destination with owner approval.',503)
 return value
}
export async function wooDestination(env:Bindings) {
 const configured=await connection(env),current=await call(env,'/identity')
 if(current.destination!==configured.destination)fail('WOO_CHANGED','The controlled store identity changed. Old orders cannot be sent there.')
 return `${configured.origin}#woocommerce:${configured.destination}`
}
export async function wooConfigured(env:Bindings) {
 try{await connection(env);return true}catch{return false}
}
export async function wooCommand(env:Bindings,actor:Actor,type:string,p:any) {
 if(actor.agent||actor.role!=='owner')fail('FORBIDDEN','Only the signed-in owner may connect or revoke WooCommerce.',403)
 const reason=text(p.reason,'Connection reason',1000),revision=crypto.randomUUID()
 if(!wooSelected(env))fail('WOO_UNAVAILABLE','Select WooCommerce explicitly in private installation settings.',503)
 await observeConfiguration(env)
 let value:Connection
 if(type==='woocommerce.revoke') {
  const row=await env.DB.prepare("SELECT value_json FROM bw_settings WHERE key='woocommerce'").first<{value_json:string}>()
  if(!row)fail('WOO_UNAVAILABLE','No WooCommerce connection exists.',503)
  value={...JSON.parse(row.value_json),enabled:false}
 }else{
  const destination=await call(env,'/identity')
  if(typeof destination.destination!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(destination.destination))fail('WOO_RESPONSE','The WooCommerce bridge did not return a stable store identity.',502)
  value={origin:origin(env),destination:destination.destination,enabled:true}
 }
 await commit(env.DB,actor,[env.DB.prepare("INSERT INTO bw_settings(key,value_json,revision) VALUES('woocommerce',?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,revision=excluded.revision").bind(JSON.stringify(value),revision),audit(env.DB,actor,'connector:woocommerce',value.enabled?'woocommerce.connected':'woocommerce.revoked',{revision,source:'woocommerce.configuration',reason})])
 return {enabled:value.enabled,revision}
}
export async function wooCatalogue(env:Bindings,selected:Account) {
 const account=effectiveBook(selected,await now()),customer=account.value.providerReferences?.woocommerce
 if(!customer||!/^\d+$/.test(customer))fail('WOO_CUSTOMER','Map this account explicitly to its WooCommerce customer ID.')
 // Woo core does not expose warehouses. A restricted account may never promise unlocated stock.
 if(account.value.warehouses?.length)fail('WOO_WAREHOUSE','WooCommerce core does not confirm a warehouse; restricted accounts cannot promise its stock.')
 const configured=await connection(env),response=await call(env,'/catalog?'+new URLSearchParams({customerId:customer,skus:account.value.prices.map(price=>price.sku).join(',')}))
 if(response.destination!==configured.destination||response.customerId!==customer)fail('WOO_CHANGED','The source destination or customer mapping differs.')
 if(response.currency!==(account.value.currency??'USD'))fail('WOO_CURRENCY','The account and WooCommerce store currencies must agree.')
 if(!Array.isArray(response.products)||!Number.isFinite(Date.parse(response.observedAt)))fail('WOO_RESPONSE','WooCommerce stock response is incomplete.',502)
 const items=account.value.prices.flatMap(price=>{
  const matches=response.products.filter((product:any)=>product.sku===price.sku)
  if(matches.length!==1)return []
  const item=matches[0]
  if(typeof item.id!=='string'||!/^\d+$/.test(item.id)||!Number.isSafeInteger(item.available)||item.available<0)return []
  return [{...price,itemId:item.id,name:text(item.name,'Source product',240),unit:'each',barcode:undefined as string|undefined,available:String(item.available),source:'WooCommerce',warehouses:[{warehouse:'Unknown warehouse',available:String(item.available),promised:true}],incoming:[],prebookSupply:[],incomingDemand:'0'}]
 })
 return {account,items,currency:account.value.currency??'USD',source:'WooCommerce',observedAt:response.observedAt,incomingNote:'Incoming quantity and promise date unknown: not reported by WooCommerce core.'}
}
export function wooMoney(value:unknown) {
 if(typeof value!=='string'||!/^\d{1,12}(\.\d{1,2})?$/.test(value))fail('WOO_RESPONSE','WooCommerce returned an invalid exact amount.',502)
 const [whole,fraction='']=value.split('.'),cents=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'))
 if(cents>BigInt(Number.MAX_SAFE_INTEGER))fail('WOO_RESPONSE','WooCommerce amount exceeds exact arithmetic.',502)
 return Number(cents)
}
function receipt(order:Order,value:any):WooReceipt {
 if(typeof value?.id!=='string'||typeof value.reference!=='string'||value.identity!==`barrow:${order.id}`||value.customerId!==order.pierCustomerId||value.currency!==order.currency||wooMoney(value.total)!==order.totalCents||!Array.isArray(value.lines)||value.lines.length!==new Set(order.lines.map(line=>line.itemId)).size||!Array.isArray(value.fulfillments)||!Array.isArray(value.refunds))fail('WOO_RESPONSE','The source order does not match the approved commercial snapshot.',502)
 for(const line of value.lines) {
  const originals=order.lines.filter(item=>item.itemId===line.itemId),quantity=originals.reduce((sum,item)=>sum+Number(item.baseQuantity??item.quantity),0)
  if(!originals.length||value.lines.filter((row:any)=>row.itemId===line.itemId).length!==1||!['quantity','reserved','dispatched','cancelled','backorder'].every(key=>typeof line[key]==='string'&&/^\d{1,10}$/.test(line[key]))||Number(line.quantity)!==quantity||quantity!==Number(line.reserved)+Number(line.dispatched)+Number(line.cancelled)+Number(line.backorder))fail('WOO_RESPONSE','Source quantities do not reconcile with the approved order.',502)
 }
 for(const refund of value.refunds)wooMoney(refund.amount)
 return value
}
export async function wooReserve(env:Bindings,order:Order) {
 if(order.pierOrigin!==await wooDestination(env))fail('WOO_CHANGED','Reconnect the original WooCommerce destination before retrying.')
 if(order.prebook||order.delivery)fail('WOO_UNSUPPORTED','This bridge supports immediate product orders; seasonal and freight handoffs need a separate source capability.')
 const grouped=new Map<string,{itemId:string;sku:string;quantity:number;totalCents:number}>()
 for(const line of order.lines){const prior=grouped.get(line.itemId)??{itemId:line.itemId,sku:line.sku,quantity:0,totalCents:0};prior.quantity+=Number(line.baseQuantity??line.quantity);prior.totalCents+=line.lineCents??line.quantity*line.unitCents;grouped.set(line.itemId,prior)}
 if([...grouped.values()].some(line=>!Number.isSafeInteger(line.quantity)||!Number.isSafeInteger(line.totalCents)))fail('WOO_UNSUPPORTED','WooCommerce requires whole source units and exact minor units.')
 const value=await call(env,'/handoffs',{destination:(await connection(env)).destination,identity:`barrow:${order.id}`,customerId:order.pierCustomerId,currency:order.currency,termsDays:order.termsDays,approval:{preparedBy:order.preparedBy,submittedBy:order.submittedBy,approvedBy:order.approvedBy,approvedAt:order.approvedAt},lines:[...grouped.values()]})
 return receipt(order,value)
}
export async function wooOrder(env:Bindings,order:Order) {
 if(order.pierOrigin!==await wooDestination(env))fail('WOO_CHANGED','Reconnect the original WooCommerce destination before reconciling.')
 if(!order.pierOrderId)fail('WOO_PENDING','Retry the pending handoff with its durable identity.')
 const value=await call(env,`/orders/${encodeURIComponent(order.pierOrderId)}`)
 if(order.pierOrigin!==`${origin(env)}#woocommerce:${value.destination}`||value.id!==order.pierOrderId)fail('WOO_CHANGED','Source acknowledgment belongs to another destination or order.')
 return receipt(order,value)
}
export async function reconcileWoo(env:Bindings,actor:Actor,order:Order) {
 const value=await wooOrder(env,order),revision=crypto.randomUUID(),updated={...order,woocommerce:value,revision}
 await commit(env.DB,actor,[env.DB.prepare('UPDATE bw_orders SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify(updated),revision,order.id,order.revision),changed(env.DB),audit(env.DB,actor,order.id,'woocommerce.reconciled',{accountId:order.accountId,orderId:order.id,revision,source:'woocommerce.rest',reason:'Reconciled the exact source order, fulfillment references and native refund references; retail prices unchanged.'})])
 return updated
}
export async function wooWebhook(request:Request,env:Bindings) {
 if(request.method!=='POST')return new Response(null,{status:405})
 if(!wooSelected(env)||!env.WOO_WEBHOOK_SECRET)fail('WOO_SIGNATURE','WooCommerce webhook is not connected.',401)
 await connection(env)
 const body=await request.text();if(body.length>100000)fail('INPUT','Webhook too large.',413)
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.WOO_WEBHOOK_SECRET),{name:'HMAC',hash:'SHA-256'},false,['verify'])
 let valid=false
 try{valid=await crypto.subtle.verify('HMAC',key,Uint8Array.from(atob(request.headers.get('x-wc-webhook-signature')??''),c=>c.charCodeAt(0)),new TextEncoder().encode(body))}catch{}
 if(!valid)fail('WOO_SIGNATURE','Invalid WooCommerce webhook signature.',401)
 let event:any;try{event=JSON.parse(body)}catch{fail('INPUT','Invalid webhook.',400)}
 if(!Number.isSafeInteger(event.id)||event.id<1)fail('INPUT','A source order ID is required.',400)
 const row=await env.DB.prepare("SELECT value_json FROM bw_orders WHERE json_extract(value_json,'$.pierOrderId')=? AND json_extract(value_json,'$.pierOrigin')=?").bind(String(event.id),await wooDestination(env)).first<{value_json:string}>()
 if(!row)return Response.json({accepted:true,linked:false})
 const order=JSON.parse(row.value_json) as Order,value=await wooOrder(env,order)
 // A notification is only a prompt to read the current authenticated source, never an event-state overwrite.
 if(JSON.stringify(value)!==JSON.stringify(order.woocommerce)) {
  const revision=crypto.randomUUID(),updated={...order,woocommerce:value,revision}
  const eventActor:Actor={id:'system:woocommerce',role:'system',email:'',version:0,agent:false}
  await env.DB.batch([env.DB.prepare('UPDATE bw_orders SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify(updated),revision,order.id,order.revision),changed(env.DB),audit(env.DB,eventActor,order.id,'woocommerce.reconciled',{accountId:order.accountId,orderId:order.id,revision,source:'woocommerce.webhook',reason:'Signed notification reconciled against the current authenticated source; notification state is not trusted.'}),env.DB.prepare('DELETE FROM bw_guard')])
 }
 return Response.json({accepted:true,linked:true})
}
