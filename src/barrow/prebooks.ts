import type { Bindings } from '../auth.server'
import { audit, changed, commit } from './access'
import { now } from './clock'
import { decimal, format, reserveOrder, catalogue, pierOrigin, pierState } from './pier'
import { fail, integer, requirePerson, supplierDate, text, type Account, type Actor, type Line, type Order } from './model'

export type Season = { id:string; name:string; opensAt:string; closesAt:string; depositBps:number; closedAt?:string }
export type PrebookWindow = { id:string; requestedDate:string; cancelAfter:string; lines:number[]; state:'committed'|'releasing'|'released'|'backordered'; promiseDate:string; history:{from:string;to:string;reason:string;by:string;at:string}[]; warehouse?:string; pierOrderId?:string; pierReference?:string; reservation?:any[] }
export type Prebook = { seasonId:string; seasonName:string; depositCents:number; incoming:{sku:string;date:string|null;quantity:string}[]; windows:PrebookWindow[] }
export async function seasons(db:D1Database) {
 const row=await db.prepare("SELECT value_json,revision FROM bw_settings WHERE key='prebook-seasons'").first<{value_json:string;revision:string}>()
 return {seasons:(row?JSON.parse(row.value_json):[]) as Season[],revision:row?.revision??''}
}
const admin=(actor:Actor)=>{requirePerson(actor);if(!['owner','admin'].includes(actor.role)||actor.staff)fail('FORBIDDEN','Only the supplier owner or admin manages seasons.',403)}
const instant=(value:unknown)=>{if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))fail('INPUT','Use a complete instant with timezone.',400);return new Date(value).toISOString()}
export async function seasonCommand(env:Bindings,actor:Actor,type:string,p:any) {
 admin(actor)
 const previous=await seasons(env.DB),reason=text(p.reason,'Season reason',1000)
 if(p.revision!==previous.revision)fail('CHANGED','Refresh seasons before changing them.')
 const at=(await now()).toISOString()
 let next:Season[]
 if(type==='prebook.season-close') {
  const current=previous.seasons.find(s=>s.id===p.id);if(!current)fail('NOT_FOUND','Season not found.',404)
  next=previous.seasons.map(s=>s.id===current.id?{...s,closedAt:s.closedAt??at}:s)
 } else {
  const opensAt=instant(p.opensAt),closesAt=instant(p.closesAt)
  if(opensAt>=closesAt)fail('INPUT','Closing must follow opening.',400)
  next=[...previous.seasons,{id:crypto.randomUUID(),name:text(p.name,'Season name',100),opensAt,closesAt,depositBps:integer(p.depositBps,'Deposit basis points',0,10000)}]
 }
 const revision=crypto.randomUUID()
 await commit(env.DB,actor,[env.DB.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN COALESCE((SELECT revision FROM bw_settings WHERE key='prebook-seasons'),'')=? THEN 1 ELSE 0 END").bind(previous.revision),env.DB.prepare("INSERT INTO bw_settings VALUES('prebook-seasons',?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,revision=excluded.revision").bind(JSON.stringify(next),revision),audit(env.DB,actor,'prebook-seasons',type,{revision,source:type,reason})])
 return {seasons:next,revision}
}
export async function openSeason(db:D1Database,id:string) {
 const season=(await seasons(db)).seasons.find(s=>s.id===id),at=(await now()).toISOString()
 if(!season||season.closedAt||at<season.opensAt||at>=season.closesAt)fail('SEASON_CLOSED','This season is not open for new prebooks.')
 return season
}
export function seasonGuard(db:D1Database,id:string) {
 const at=new Date().toISOString()
 return db.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_settings settings,json_each(settings.value_json) s WHERE settings.key='prebook-seasons' AND json_extract(s.value,'$.id')=? AND json_extract(s.value,'$.closedAt') IS NULL AND json_extract(s.value,'$.opensAt')<=? AND json_extract(s.value,'$.closesAt')>?) THEN 1 ELSE 0 END").bind(id,at,at)
}
/** Incoming is a source observation, never a reservation or available-now quantity. */
export async function prebookCapacity(env:Bindings,order:Pick<Order,'id'|'lines'|'prebook'>,offers:Awaited<ReturnType<typeof catalogue>>['items']) {
 const rows=await env.DB.prepare("SELECT id,revision,value_json FROM bw_orders WHERE id<>? AND json_extract(value_json,'$.prebook') IS NOT NULL AND json_extract(value_json,'$.status') IN ('submitted','awaiting-company-approval','approved')").bind(order.id).all<{id:string;revision:string;value_json:string}>()
 const others=rows.results.map(row=>JSON.parse(row.value_json) as Order)
 for(const sku of new Set(order.lines.map(l=>l.sku))) {
  const item=offers.find(o=>o.sku===sku)
  if(!item)fail('PRICE','The prebook item is no longer on the price book.')
  const requested=order.lines.filter(l=>l.sku===sku).reduce((n,l)=>n+decimal(l.baseQuantity??String(l.quantity)),0n)
  const held=others.reduce((sum,o)=>sum+o.lines.filter((l,i)=>l.sku===sku&&!o.prebook!.windows.find(w=>w.lines.includes(i))?.pierOrderId).reduce((n,l)=>n+decimal(l.baseQuantity??String(l.quantity)),0n),0n)
  const incoming=item.prebookIncoming.reduce((n,row)=>n+decimal(row.quantity),0n)
  // Dated source supply cannot justify an earlier window. Undated supply stays explicitly unknown.
  for(const deadline of new Set(order.lines.filter(l=>l.sku===sku).map(l=>l.requestedDate!))) {
   const due=order.lines.filter(l=>l.sku===sku&&l.requestedDate!<=deadline).reduce((n,l)=>n+decimal(l.baseQuantity??String(l.quantity)),0n)
   const eligible=item.prebookIncoming.filter(row=>row.date===null||row.date<=deadline).reduce((n,row)=>n+decimal(row.quantity),0n)
   if(due+held>eligible)fail('PREBOOK_CAPACITY',sku+': source incoming dates do not cover the requested window.')
  }
  if(requested+held>incoming)fail('PREBOOK_CAPACITY',sku+': committed incoming supply cannot cover this future commitment. Available-now stock is separate.')
 }
 const frontier=rows.results.map(row=>row.id+':'+row.revision).sort().join(',')
 return env.DB.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN COALESCE((SELECT group_concat(identity,',') FROM (SELECT id||':'||revision AS identity FROM bw_orders WHERE id<>? AND json_extract(value_json,'$.prebook') IS NOT NULL AND json_extract(value_json,'$.status') IN ('submitted','awaiting-company-approval','approved') ORDER BY id)),'')=? THEN 1 ELSE 0 END").bind(order.id,frontier)
}
export async function preparePrebook(env:Bindings,id:string,seasonId:string,lines:Line[],totalCents:number,offers:Awaited<ReturnType<typeof catalogue>>['items']):Promise<Prebook> {
 const season=await openSeason(env.DB,seasonId),today=supplierDate(await now()),groups=new Map<string,PrebookWindow>()
 lines.forEach((line,index)=>{
  if(!line.requestedDate||!line.cancelAfter||line.requestedDate<=today)fail('PREBOOK_WINDOW','Every prebook line needs a future ship date and a cancel-after date.',400)
  const key=line.requestedDate+':'+line.cancelAfter,w=groups.get(key)??{id:String(groups.size+1),requestedDate:line.requestedDate,cancelAfter:line.cancelAfter,promiseDate:line.requestedDate,lines:[],state:'committed' as const,history:[]}
  w.lines.push(index);groups.set(key,w)
 })
 const depositCents=Number((BigInt(totalCents)*BigInt(season.depositBps)+5000n)/10000n)
 const prebook:Prebook={seasonId,seasonName:season.name,depositCents,windows:[...groups.values()],incoming:offers.filter(o=>lines.some(l=>l.sku===o.sku)).flatMap(o=>o.prebookIncoming.map(row=>({sku:o.sku,...row})))}
 await prebookCapacity(env,{id,lines,prebook},offers)
 return prebook
}
async function save(env:Bindings,actor:Actor,order:Order,prebook:Prebook,action:string,reason:string) {
 const revision=crypto.randomUUID()
 const next={...order,prebook,revision}
 await commit(env.DB,actor,[env.DB.prepare('UPDATE bw_orders SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify(next),revision,order.id,order.revision),changed(env.DB),audit(env.DB,actor,order.id,action,{accountId:order.accountId,orderId:order.id,revision,source:action,reason})])
 return next
}
export async function prebookOrderCommand(env:Bindings,actor:Actor,type:string,p:any,order:Order,selected:Account) {
 requirePerson(actor)
 if(!['owner','admin'].includes(actor.role)&&actor.staff?.role!=='operations'&&actor.staff?.role!=='sales-manager')fail('FORBIDDEN','Supplier operations must release or delay prebooks.',403)
 if(actor.staff&&actor.staff.warehouses!=='all')fail('FORBIDDEN','Releasing needs all-warehouse authority.',403)
 if(!order.prebook||order.status!=='approved')fail('PREBOOK_STATE','Only an accepted prebook can release or delay a window.')
 if(order.pierOrigin!==await pierOrigin(env))fail('PIER_CHANGED','Reconnect the original inventory installation.')
 const prebook=structuredClone(order.prebook),window=prebook.windows.find(w=>w.id===p.windowId)
 if(!window)fail('NOT_FOUND','Ship window not found.',404)
 if(type==='prebook.delay') {
  if(window.pierOrderId||window.state==='releasing')fail('PREBOOK_RELEASED','An inventory handoff has begun; its promise cannot be edited here.')
  if(p.revision!==order.revision)fail('CHANGED','Refresh this exact prebook before changing its promise.')
  const to=text(p.promiseDate,'New promise date'),reason=text(p.reason,'Delay reason',1000)
  if(!/^\d{4}-\d{2}-\d{2}$/.test(to)||!Number.isFinite(Date.parse(to+'T00:00:00Z'))||new Date(to+'T00:00:00Z').toISOString().slice(0,10)!==to||to<window.promiseDate||to>window.cancelAfter)fail('PREBOOK_DATE','Use a later date inside the agreed cancel window.',400)
  if(to===window.promiseDate)fail('UNCHANGED','Choose a changed promise date.')
  window.history.push({from:window.promiseDate,to,reason,by:actor.id,at:(await now()).toISOString()});window.promiseDate=to;window.state='backordered'
  return save(env,actor,order,prebook,type,reason)
 }
 if(window.pierOrderId)return order
 const reason=text(p.reason,'Release reason',1000)
 const lines=window.lines.map(i=>order.lines[i])
 if(window.state!=='releasing') {
  const offers=await catalogue(env,selected)
  // Each release uses one permitted warehouse. Cross-warehouse splits belong to ORD-009.
  const candidates=offers.items.find(o=>o.sku===lines[0].sku)?.warehouses.filter(w=>w.promised).map(w=>w.warehouse)??[]
  const warehouse=candidates.find(name=>[...new Set(lines.map(l=>l.sku))].every(sku=>{
   const offer=offers.items.find(o=>o.sku===sku),quantity=lines.filter(l=>l.sku===sku).reduce((n,l)=>n+decimal(l.baseQuantity??String(l.quantity)),0n)
   return quantity<=decimal(offer?.warehouses.find(w=>w.warehouse===name&&w.promised)?.available??'0')
  }))
  if(!warehouse)fail('PREBOOK_STOCK','Receive enough stock in one of this account’s permitted warehouses before release.')
  window.warehouse=warehouse
 }
 if(!window.warehouse||selected.value.warehouses?.length&&!selected.value.warehouses.includes(window.warehouse))fail('PREBOOK_STOCK','The release warehouse must still be permitted for this account.')
 const source=await pierState(env)
 const rule=(source.routingRules??[]).filter((rule:any)=>rule.source==='manual'&&rule.activeAt).sort((a:any,b:any)=>b.revision-a.revision)[0]
 const destinations=rule?[...(rule.eligible??[]),...(rule.defaultEligible??[]),...(rule.zones??[]).flatMap((zone:any)=>zone.eligible??[]),...Object.values(rule.locations??{}).flat()]:[window.warehouse]
 if(selected.value.warehouses?.length&&destinations.some((name:any)=>!selected.value.warehouses!.includes(name)))fail('PREBOOK_ROUTE','Pier manual routing includes a warehouse outside this account’s permitted set. The supplier must correct its routing before release.')
 if(supplierDate(await now())>window.cancelAfter)fail('PREBOOK_EXPIRED','The agreed cancel-after date has passed; no release was made.')
 if(window.state!=='releasing') {
  if(p.revision!==order.revision)fail('CHANGED','Refresh this exact prebook before releasing it.')
  window.state='releasing';order=await save(env,actor,order,prebook,'prebook.release-requested',reason)
 }
 const result=await reserveOrder(env,order.id+'-W'+window.id,order.pierCustomerId,lines,window.promiseDate,{warehouse:window.warehouse!})
 if(typeof result?.id!=='string'||typeof result?.reference!=='string'||!Array.isArray(result.lines))fail('PIER_RESPONSE','The release acknowledgment is incomplete; retry this same window.',502)
 const expected=new Map<string,bigint>()
 for(const line of lines)expected.set(line.itemId,(expected.get(line.itemId)??0n)+decimal(line.baseQuantity??String(line.quantity)))
 if(result.lines.length!==expected.size||[...expected].some(([id,qty])=>result.lines.filter((l:any)=>l.itemId===id).length!==1||decimal(result.lines.find((l:any)=>l.itemId===id).quantity)!==qty))fail('PIER_RESPONSE','Release quantities do not match the commitment; retry this window.',502)
 if(result.customerId!==order.pierCustomerId||result.lines.some((line:any)=>decimal(line.quantity)!==decimal(line.reserved)+decimal(line.backorder)+decimal(line.dispatched)+decimal(line.cancelled)))fail('PIER_RESPONSE','The acknowledged source quantities do not reconcile; retry the same window.',502)
 window.pierOrderId=result.id;window.pierReference=result.reference;window.reservation=result.lines
 window.state=result.lines.some((l:any)=>decimal(l.backorder??'0')>0n)?'backordered':'released'
 return save(env,actor,order,prebook,'prebook.released',reason)
}
export function prebookRows(order:Order,state:any,connected?:string) {
 return (order.prebook?.windows??[]).flatMap(window=>[...new Set(window.lines.map(index=>order.lines[index].itemId))].map(itemId=>{
  const originals=window.lines.map(index=>order.lines[index]).filter(line=>line.itemId===itemId),line=originals[0]
  const committed=originals.reduce((n,l)=>n+decimal(l.baseQuantity??String(l.quantity)),0n),upstream=state&&order.pierOrigin===connected?(state.orders??[]).find((o:any)=>o.id===window.pierOrderId&&o.customerId===order.pierCustomerId):undefined
  const source=upstream?.lines?.find((l:any)=>l.itemId===line.itemId)
  const valid=source&&decimal(source.quantity)===committed&&decimal(source.quantity)===decimal(source.dispatched)+decimal(source.cancelled)+decimal(source.reserved)+decimal(source.backorder)
  return {orderId:order.id,accountId:order.accountId,season:order.season!,windowId:window.id,sku:line.sku,unit:line.baseUnit??line.unit??'base units',committed:format(committed),released:window.pierOrderId?format(committed):'0',outstanding:!window.pierOrderId?format(committed):valid?format(committed-decimal(source.dispatched)-decimal(source.cancelled)):null,allocated:valid?source.reserved:null,backordered:valid?source.backorder:null,warehouse:window.warehouse??null,promiseDate:window.promiseDate,cancelAfter:window.cancelAfter,state:window.state,sourceOrderId:window.pierOrderId??null,promiseHistory:window.history}
 }))
}
