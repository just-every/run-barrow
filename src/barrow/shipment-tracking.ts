import type { Bindings } from '../auth.server'
import { audit, changed, commit } from './access'
import { readOrder } from './orders'
import { decimal, pierOrigin, pierState } from './pier'
import { formatMicro } from './units'
import { fail, requirePerson, requireSupplier, text, supplier, type Actor, type Order } from './model'
import { now } from './clock'
import { reportZone, calendarDate } from './report-zone'
import { readTracker, type CarrierObservation } from './tracker-edge'
import type { FollowupSource } from './followup-sources'
import type { FollowupTask } from './followups'
export type TrackingPackage = { id: string; orderId: string; accountId: string; shipmentId: string; sourceOrigin: string; trackerId: string; carrier: string; code: string; link: string | null; estimatedDate: string | null; lines: { itemId: string; sku: string; quantity: string }[]; warehouses: string[]; events: CarrierObservation[]; checkedAt: string | null; restored?: boolean; revision: string }
const parse = (row: { value_json: string; revision: string }): TrackingPackage => ({ ...JSON.parse(row.value_json), revision: row.revision })
export async function trackingPackages(db: D1Database, orderId: string) {
 return (await db.prepare('SELECT value_json,revision FROM bw_tracking_packages WHERE order_id=? ORDER BY id').bind(orderId).all<{value_json:string;revision:string}>()).results.map(parse)
}
export function deliveryEvent(p: TrackingPackage) { return p.events.filter(event => event.status === 'delivered').sort((a,b) => a.at.localeCompare(b.at))[0] }
export function packageStatus(p: TrackingPackage) { return deliveryEvent(p) ? 'delivered' : [...p.events].sort((a,b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)).at(-1)?.status ?? 'unknown' }
function warehouseAuthority(actor: Actor, warehouses: string[]) {
 if (actor.staff && actor.staff.warehouses !== 'all' && (!warehouses.length || warehouses.some(w => !actor.staff!.warehouses.includes(w)))) fail('FORBIDDEN','Every source warehouse must be within your current grant.',403)
}
async function sourceShipment(env: Bindings, order: Order, shipmentId: string) {
 if (!order.pierOrderId || order.pierOrigin !== await pierOrigin(env)) fail('TRACKING_SOURCE','The original acknowledged inventory destination is unavailable.',409)
 let state: any
 try { state = await pierState(env) } catch { fail('TRACKING_SOURCE','Pier is unavailable. No package quantity or delivery confirmation is inferred.',503) }
 const upstream = state.orders?.find((o: any) => o.id === order.pierOrderId && o.customerId === order.pierCustomerId)
 const shipment = state.shipments?.find((s: any) => s.id === shipmentId && s.orderId === upstream?.id)
 if (!upstream || !shipment) fail('TRACKING_SOURCE','Choose a shipment acknowledged by this order’s original Pier source.',409)
 return { state, upstream, shipment }
}
async function guard(env: Bindings) {
 const epoch = await env.DB.prepare('SELECT value FROM bw_tracking_epoch WHERE singleton=1').first<{value:number}>()
 return [env.DB.prepare('UPDATE bw_tracking_epoch SET value=value+1 WHERE singleton=1 AND value=?').bind(epoch!.value), changed(env.DB)]
}
const orderGuard = (env: Bindings, order: Order) => env.DB.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_orders WHERE id=? AND revision=?) THEN 1 ELSE 0 END').bind(order.id,order.revision)
function save(env: Bindings, p: TrackingPackage, before?: string) {
 const {revision,...value}=p
 return before ? env.DB.prepare('UPDATE bw_tracking_packages SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify(value),revision,p.id,before) : env.DB.prepare('INSERT INTO bw_tracking_packages VALUES(?,?,?,?,?,?)').bind(p.id,p.orderId,p.accountId,p.trackerId,JSON.stringify(value),revision)
}
function task(env: Bindings, p: TrackingPackage, id: string, kind: 'carrier'|'dispute', reason: string, ownerId: string, at: string, date: string) {
 const value = { id, kind:'tracking', accountId:p.accountId, sourceId:p.orderId, sourcePath:`/api/barrow/orders/${p.orderId}/tracking`, title:`${kind==='dispute'?'Buyer delivery dispute':'Carrier exception'} ${p.carrier} ${p.code}`, reason, priority:1, createdAt:at, ownerId, nextContactDate:date, status:'open', contacts:[] }
 return env.DB.prepare('INSERT OR IGNORE INTO bw_followups VALUES(?,?,?,?)').bind(id,p.accountId,JSON.stringify(value),crypto.randomUUID())
}
async function reconcileTasks(env: Bindings, p: TrackingPackage, actor: Actor, at: string) {
 const date=calendarDate(new Date(at),await reportZone(env.DB)), delivered=deliveryEvent(p), status=packageStatus(p), statements:D1PreparedStatement[]=[]
 const tasks=(await env.DB.prepare("SELECT value_json,revision FROM bw_followups WHERE id IN (?,?)").bind(`carrier:${p.id}`,`dispute:${p.id}`).all<{value_json:string;revision:string}>()).results.map(row=>({...JSON.parse(row.value_json),revision:row.revision}) as FollowupTask)
 for(const before of tasks) {
  // An old delivered observation cannot settle a later buyer dispute.
  if(before.status==='closed'||!delivered||before.id.startsWith('dispute:')&&delivered.at<=before.createdAt)continue
  const {revision,...value}=before
  statements.push(env.DB.prepare('UPDATE bw_followups SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify({...value,status:'closed',resolution:`Authenticated EasyPost delivery ${delivered.id} at ${delivered.at}.`,resolvedAt:at}),crypto.randomUUID(),before.id,revision),changed(env.DB))
 }
 if(!delivered&&['unknown','pre_transit','failure','error','return_to_sender','cancelled'].includes(status)) statements.push(task(env,p,`carrier:${p.id}`,'carrier',`Carrier reports ${status}; delivery is unverified.`,actor.id,at,date))
 return statements
}
export async function trackingView(env: Bindings, actor: Actor, id: string) {
 requirePerson(actor)
 const order=await readOrder(env.DB,actor,id), packages=await trackingPackages(env.DB,id)
 for(const p of packages)warehouseAuthority(actor,p.warehouses)
 let available=true, shipments:{id:string;reference:string}[]=[]
 try {
  if(order.pierOrigin!==await pierOrigin(env))throw new Error()
  const state=await pierState(env)
  shipments=(state.shipments??[]).filter((s:any)=>s.orderId===order.pierOrderId).map((s:any)=>({id:s.id,reference:s.reference}))
 }catch{available=false}
 const tasks=(await env.DB.prepare("SELECT value_json,revision FROM bw_followups WHERE account_id=? AND json_extract(value_json,'$.kind')='tracking' AND json_extract(value_json,'$.sourceId')=?").bind(order.accountId,id).all<{value_json:string;revision:string}>()).results.map(row=>({...JSON.parse(row.value_json),revision:row.revision}) as FollowupTask)
 return {orderId:id,sourceAvailable:available,shipments,canManage:supplier(actor)&&(!actor.staff||['sales-manager','operations'].includes(actor.staff.role)), packages:packages.map(p=>({...p,status:packageStatus(p),deliveredAt:deliveryEvent(p)?.at??null})),tasks:supplier(actor)?tasks:tasks.map(t=>({id:t.id,status:t.status,title:t.title,resolution:t.resolution,owner:'Supplier',reason:t.reason})),note:'Pier confirms dispatch quantities. EasyPost observations confirm carrier status; labels and estimated dates do not confirm delivery. Retained observations are historical when either source is unavailable. Live provider qualification remains behind the carrier connection.'}
}
export async function trackingCommand(env: Bindings, actor: Actor, type: string, input: any) {
 requirePerson(actor)
 const order=await readOrder(env.DB,actor,text(input.orderId,'Order',160)), at=(await now()).toISOString()
 if(type!=='tracking.dispute')requireSupplier(actor)
 const admission=await guard(env), packages=await trackingPackages(env.DB,order.id)
 let p:TrackingPackage, before:string|undefined
 if(type==='tracking.bind') {
  const shipmentId=text(input.shipmentId,'Pier shipment',160), trackerId=text(input.trackerId,'Tracker identity',160)
  if(!/^trk_[a-zA-Z0-9]+$/.test(trackerId))fail('INPUT','Use an existing EasyPost tracker identity.',400)
  const {state,upstream,shipment}=await sourceShipment(env,order,shipmentId)
  const carrier=text(input.carrier,'Carrier',80), code=text(input.code,'Tracking code',160)
  if(!Array.isArray(input.lines)||!input.lines.length||input.lines.length>100)fail('INPUT','Name the exact package quantities.',400)
  const seen=new Set<string>(), warehouses=new Set<string>()
  const lines=input.lines.map((line:any)=>{
   const itemId=text(line.itemId,'Item',160)
   if(seen.has(itemId))fail('INPUT','An item may occur once per package.',400);seen.add(itemId)
   const quantity=String(line.quantity)
   if(!/^\d+(\.\d{1,6})?$/.test(quantity)||decimal(quantity)<=0n)fail('INPUT','Use positive exact base quantities.',400)
   const sourceLine=upstream.lines.find((r:any)=>r.itemId===itemId),sent=shipment.lines.find((r:any)=>r.orderLineId===sourceLine?.id)
   if(!sent||!order.lines.some(l=>l.itemId===itemId))fail('TRACKING_QUANTITY','This item is not in the acknowledged shipment.',409)
   const used=packages.filter(p=>p.shipmentId===shipmentId).flatMap(p=>p.lines).filter(l=>l.itemId===itemId).reduce((n,l)=>n+decimal(l.quantity),0n)
   if(used+decimal(quantity)>decimal(sent.quantity))fail('TRACKING_QUANTITY','Packages cannot exceed the source-dispatched quantity.',409)
   for(const r of sent.reservations??[]) {const location=state.locations.find((l:any)=>l.id===r.locationId);if(!location?.warehouse)fail('TRACKING_SOURCE','Shipment warehouse is unknown.',409);warehouses.add(location.warehouse)}
   return {itemId,sku:order.lines.find(l=>l.itemId===itemId)!.sku,quantity:formatMicro(decimal(quantity))}
  })
  warehouseAuthority(actor,[...warehouses])
  p={id:crypto.randomUUID(),orderId:order.id,accountId:order.accountId,shipmentId,sourceOrigin:order.pierOrigin!,trackerId,carrier,code,link:null,estimatedDate:null,lines,warehouses:[...warehouses],events:[],checkedAt:null,revision:crypto.randomUUID()}
  // A successful authenticated read proves identity before package custody is accepted.
 } else {
  p=packages.find(p=>p.id===input.packageId)??fail('NOT_FOUND','Package not found.',404)
  warehouseAuthority(actor,p.warehouses)
  if(p.revision!==input.revision)fail('STALE','Package changed; review its current revision.',409)
  if(p.restored)fail('TRACKING_RESTORED','Restored tracking is inert history. Reconcile it with the owner before any new effect.',409)
  before=p.revision
 }
 if(type==='tracking.dispute') {
  const reason=text(input.reason,'Missing-package report',1000), owner=await env.DB.prepare("SELECT id FROM oa_operators WHERE role='owner' AND status='active' ORDER BY created_at LIMIT 1").first<{id:string}>()
  if(!owner)fail('TRACKING_OWNER','An active supplier owner must receive this dispute.',409)
  const id=`dispute:${p.id}`,existing=await env.DB.prepare('SELECT value_json,revision FROM bw_followups WHERE id=?').bind(id).first<{value_json:string;revision:string}>()
  const statements=[...admission,orderGuard(env,order)]
  if(!existing)statements.push(task(env,p,id,'dispute',reason,owner.id,at,calendarDate(new Date(at),await reportZone(env.DB))))
  else {const value=JSON.parse(existing.value_json);if(value.status==='closed')statements.push(env.DB.prepare('UPDATE bw_followups SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify({...value,status:'open',createdAt:at,reason,ownerId:owner.id,resolution:undefined,resolvedBy:undefined,resolvedAt:undefined}),crypto.randomUUID(),id,existing.revision),changed(env.DB))}
  statements.push(audit(env.DB,actor,order.id,'tracking.disputed',{accountId:order.accountId,orderId:order.id,revision:p.revision,source:type,reason:'Buyer reported a missing package; supplier ownership retained.'}))
  await commit(env.DB,actor,statements);return trackingView(env,actor,order.id)
 }
 if(!['tracking.bind','tracking.refresh'].includes(type))fail('COMMAND','Unknown tracking command.',400)
 if(before)await sourceShipment(env,order,p.shipmentId)
 const observation=await readTracker(env,p.trackerId)
 if(observation.carrier!==p.carrier||observation.code!==p.code)fail('TRACKER_SOURCE','Authenticated tracker identity differs from the package.',409)
 const events=new Map(p.events.map(e=>[e.id,e]));for(const e of observation.events)events.set(e.id,e)
 p={...p,events:[...events.values()].sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id)),link:observation.link,estimatedDate:observation.estimatedDate,checkedAt:at,revision:crypto.randomUUID()}
 await commit(env.DB,actor,[...admission,orderGuard(env,order),save(env,p,before),changed(env.DB),...await reconcileTasks(env,p,actor,at),audit(env.DB,actor,order.id,'tracking.observed',{accountId:order.accountId,orderId:order.id,revision:p.revision,source:'EasyPost authenticated tracker read',reason:`Package ${p.id}: ${packageStatus(p)}; ${p.events.length} distinct observations retained.`})])
 return trackingView(env,actor,order.id)
}
export async function trackingExceptionSources(env: Bindings) {
 const rows=await env.DB.prepare('SELECT value_json,revision FROM bw_tracking_packages').all<{value_json:string;revision:string}>(),candidates:FollowupSource[]=[]
 // Only dispatched source shipments lacking package coverage create missing-tracking exceptions.
 let state:any;try{state=await pierState(env)}catch{return {candidates}}
 const orders=(await env.DB.prepare('SELECT value_json FROM bw_orders').all<{value_json:string}>()).results.map(r=>JSON.parse(r.value_json) as Order)
 const origin=await pierOrigin(env)
 for(const order of orders.filter(o=>o.pierOrigin===origin&&o.pierOrderId))for(const shipment of (state.shipments??[]).filter((s:any)=>s.orderId===order.pierOrderId)){
  const bound=rows.results.map(parse).filter(p=>p.orderId===order.id&&p.shipmentId===shipment.id)
  const missing=shipment.lines.some((l:any)=>bound.flatMap(p=>p.lines).filter(p=>p.itemId===l.itemId).reduce((n,l)=>n+decimal(l.quantity),0n)<decimal(l.quantity))
  if(missing)candidates.push({id:`tracking-missing:${shipment.id}`,kind:'tracking',accountId:order.accountId,sourceId:order.id,sourcePath:`/api/barrow/orders/${order.id}/tracking`,title:`Missing tracking ${order.reference||order.id}`,reason:'Pier confirms dispatched quantities without complete package tracking. Delivery remains unknown.',priority:1})
 }
 return {candidates}
}
