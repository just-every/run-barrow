import type { Bindings } from '../auth.server'
import { audit, changed, commit } from './access'
import { account } from './accounts'
import { requireActiveAccount, activeAccountGuard } from './account-profile'
import { now } from './clock'
import { fail, integer, requirePerson, supplierDate, text, type Account, type Actor, type Line, type Order } from './model'
import { catalogue, decimal, pierOrigin } from './pier'

export type Season = { id:string; name:string; opensAt:string; closesAt:string; minimumCents:number; depositBps:number; state:'published'|'closed'; windows:{id:string;name:string;shipDate:string;cancelAfter:string}[]; revision:string }
export type Prebook = { season:Season; depositCents:number; currency:string; observedAt:string; supply:{sku:string;date:string|null;quantity:string;warehouse:string|null;sourceId:string}[]; windows:{id:string;lineIndexes:number[];releaseId?:string;estimatedDate?:string;reason?:string;history:{at:string;by:string;from:string;to:string;reason:string}[]}[]; restored?:boolean }
export type PrebookRelease = { orderId:string; windowId:string; seasonId:string }
const key='prebook-seasons'
export async function seasons(db:D1Database) {
 const row=await db.prepare('SELECT value_json,revision FROM bw_settings WHERE key=?').bind(key).first<{value_json:string;revision:string}>()
 return {seasons:JSON.parse(row?.value_json??'[]') as Season[],revision:row?.revision??null}
}
const date=(v:unknown)=>{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v+'T12:00:00Z'))||new Date(v+'T12:00:00Z').toISOString().slice(0,10)!==v)fail('INPUT','Use a valid calendar date.',400);return v}
function configuration(actor:Actor) { requirePerson(actor);if(!['owner','admin'].includes(actor.role)||actor.staff)fail('FORBIDDEN','Only the supplier owner or admin configures prebook seasons.',403) }
export async function seasonCommand(env:Bindings,actor:Actor,type:string,p:any) {
 configuration(actor)
 const current=await seasons(env.DB),id=text(p.id,'Season ID',80),previous=current.seasons.find(row=>row.id===id)
 if(p.revision!==current.revision)fail('CHANGED','Refresh seasonal settings before changing them.')
 const reason=text(p.reason,'Season reason',1000)
 let value:Season
 if(type==='prebook.close') {
  if(!previous)fail('NOT_FOUND','Season not found.',404)
  value={...previous,state:'closed',revision:crypto.randomUUID()}
 } else {
  if(previous)fail('SEASON_IMMUTABLE','Published seasons keep their terms and dates. Publish a new season instead.')
  const instant=(v:unknown)=>{if(typeof v!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(v)||!Number.isFinite(Date.parse(v)))fail('INPUT','Use opening and closing instants with a timezone.',400);return new Date(v).toISOString()}
  const opensAt=instant(p.opensAt),closesAt=instant(p.closesAt)
  if(opensAt>=closesAt)fail('INPUT','Season closing must follow opening.',400)
  if(!Array.isArray(p.windows)||p.windows.length<1||p.windows.length>8)fail('INPUT','Publish one to eight ship windows.',400)
  const windows:Season['windows']=p.windows.map((w:any)=>({id:text(w.id,'Window ID',80),name:text(w.name,'Window name',100),shipDate:date(w.shipDate),cancelAfter:date(w.cancelAfter)}))
  if(new Set(windows.map(w=>w.id)).size!==windows.length||windows.some(w=>w.cancelAfter<w.shipDate||w.shipDate<supplierDate(new Date(closesAt))))fail('INPUT','Use distinct windows after season closing with cancel dates on or after shipping.',400)
  value={id,name:text(p.name,'Season name',100),opensAt,closesAt,minimumCents:integer(p.minimumCents,'Season minimum cents'),depositBps:integer(p.depositBps,'Deposit basis points',0,10000),windows,state:'published',revision:crypto.randomUUID()}
 }
 const revision=crypto.randomUUID(),next=[...current.seasons.filter(row=>row.id!==id),value]
 await commit(env.DB,actor,[env.DB.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN COALESCE((SELECT revision FROM bw_settings WHERE key=?),'')=? THEN 1 ELSE 0 END").bind(key,current.revision??''),env.DB.prepare('INSERT INTO bw_settings VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,revision=excluded.revision').bind(key,JSON.stringify(next),revision),audit(env.DB,actor,id,type,{revision,source:type,reason})])
 return {seasons:next,revision}
}
export async function publishedSeason(db:D1Database,id:string) {
 const value=(await seasons(db)).seasons.find(row=>row.id===id),at=(await now()).toISOString()
 if(!value||value.state!=='published'||at<value.opensAt||at>=value.closesAt)fail('SEASON_CLOSED','This season is not open for new commitments.')
 return value
}
/** Serializes native commitments, never allocates or fabricates Pier inventory. */
export async function prebookEpoch(db:D1Database) {
 const row=await db.prepare("SELECT revision FROM bw_settings WHERE key='prebook-epoch'").first<{revision:string}>()
 return [db.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN COALESCE((SELECT revision FROM bw_settings WHERE key='prebook-epoch'),'')=? THEN 1 ELSE 0 END").bind(row?.revision??''),db.prepare("INSERT INTO bw_settings VALUES('prebook-epoch','null',?) ON CONFLICT(key) DO UPDATE SET revision=excluded.revision").bind(crypto.randomUUID())]
}
export async function prebookCapacity(env:Bindings,selected:Account,lines:Line[],omitId='') {
 const available=await catalogue(env,selected)
 const peers=(await env.DB.prepare("SELECT value_json FROM bw_orders WHERE id<>? AND (json_extract(value_json,'$.prebook') IS NOT NULL OR json_extract(value_json,'$.prebookRelease') IS NOT NULL) AND json_extract(value_json,'$.status') NOT IN ('draft','superseded','cancelled')").bind(omitId).all<{value_json:string}>()).results.map(row=>JSON.parse(row.value_json) as Order)
 const supply:Prebook['supply']=[]
 for(const sku of new Set(lines.map(line=>line.sku))) {
  const offer=available.items.find(row=>row.sku===sku)
  if(!offer)fail('PRICE','This item is no longer on the active price list.')
  const incoming=offer.prebookSupply
  supply.push(...incoming.map(row=>({sku,...row})))
  // Check every dated prefix, so a late PO cannot cover an earlier commitment.
  const demands=[...lines.filter(line=>line.sku===sku).map(line=>({date:line.requestedDate!,quantity:decimal(line.baseQuantity??String(line.quantity))})),...peers.filter(peer=>peer.prebook&&peer.pierOrigin===env.PIER_ORIGIN).flatMap(peer=>peer.lines.flatMap((line,index)=>{
   const window=peer.prebook!.windows.find(window=>window.lineIndexes.includes(index))
   const release=window?.releaseId?peers.find(row=>row.id===window.releaseId):undefined
   return line.sku===sku&&(!release?.pierOrderId)?[{date:line.requestedDate!,quantity:decimal(line.baseQuantity??String(line.quantity))}]:[]
  }))]
  // Existing Pier backorders also consume source capacity, including released prebooks.
  const external=decimal(offer.incomingDemand)
  for(const until of new Set(demands.map(row=>row.date))) {
   const need=demands.filter(row=>row.date<=until).reduce((n,row)=>n+row.quantity,external)
   const capacity=incoming.filter(row=>row.date!==null&&row.date<=until&&(!selected.value.warehouses?.length||row.warehouse!==null&&selected.value.warehouses.includes(row.warehouse))).reduce((n,row)=>n+decimal(row.quantity),0n)
   if(need>capacity)fail('PREBOOK_CAPACITY',`${sku}: Pier incoming supply with a known promise date and permitted destination does not cover commitments through ${until}. Incoming is not available-now stock.`)
  }
 }
 return {supply,observedAt:available.observedAt}
}
export async function preparePrebook(env:Bindings,selected:Account,input:any,lines:Line[],totalCents:number):Promise<Prebook|undefined> {
 if(!input)return
 const season=await publishedSeason(env.DB,text(input.seasonId,'Season'))
 if(totalCents<season.minimumCents)fail('MINIMUM','The prebook does not meet the published season minimum.')
 const windows:Prebook['windows']=[]
 for(let index=0;index<lines.length;index++) {
  const window=season.windows.find(w=>w.id===input.windowIds?.[index])
  if(!window)fail('PREBOOK_WINDOW','Choose a published ship window for every line.',400)
  Object.assign(lines[index],{requestedDate:window.shipDate,cancelAfter:window.cancelAfter})
  const held=windows.find(w=>w.id===window.id)
  if(held)held.lineIndexes.push(index);else windows.push({id:window.id,lineIndexes:[index],history:[]})
 }
 const capacity=await prebookCapacity(env,selected,lines)
 return {season,depositCents:Number((BigInt(totalCents)*BigInt(season.depositBps)+9999n)/10000n),currency:selected.buyingProfile?.currency??selected.value.currency??'USD',...capacity,windows}
}
export async function prebookAdmission(env:Bindings,selected:Account,order:Order,opening:boolean) {
 if(!order.prebook)return []
 const current=await seasons(env.DB),epoch=await prebookEpoch(env.DB)
 if(opening){const season=current.seasons.find(row=>row.id===order.prebook!.season.id),at=(await now()).toISOString();if(!season||season.state!=='published'||at<season.opensAt||at>=season.closesAt)fail('SEASON_CLOSED','This season is not open for new commitments.')}
 if(order.prebook.restored)fail('RESTORED','Restored prebook history cannot initiate commitments or releases.')
 await prebookCapacity(env,selected,order.lines,order.id)
 return [...epoch,env.DB.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN revision=? THEN 1 ELSE 0 END FROM bw_settings WHERE key=?').bind(current.revision,key)]
}
export async function prebookWindowCommand(env:Bindings,actor:Actor,type:string,p:any,order:Order) {
 requirePerson(actor)
 if(!['owner','admin'].includes(actor.role)&&!actor.staff||actor.staff&&!['sales-manager','operations'].includes(actor.staff.role))fail('FORBIDDEN','Only authorized supplier fulfillment staff may release or delay commitments.',403)
 if(!order.prebook||order.status!=='approved')fail('PREBOOK_STATE','Accept the seasonal commitment before releasing or delaying it.')
 if(order.prebook.restored)fail('RESTORED','Restored prebook history cannot initiate releases.')
 const window=order.prebook.windows.find(window=>window.id===p.windowId)
 if(!window)fail('NOT_FOUND','Commitment window not found.',404)
 if(type==='prebook.release'&&window.releaseId)return {order,releaseId:window.releaseId}
 if(p.revision!==order.revision)fail('CHANGED','Refresh the commitment before this action.')
 if(window.releaseId)fail('PREBOOK_RELEASED','This window already has a stock release; use its source order.')
 const reason=text(p.reason,'Commitment reason',1000),at=await now(),terms=order.prebook.season.windows.find(row=>row.id===window.id)!
 const selected=await account(env.DB,actor,order.accountId);requireActiveAccount(selected)
 if(order.pierOrigin!==await pierOrigin(env))fail('PIER_CHANGED','Reconnect the original inventory authority.')
 const epoch=await prebookEpoch(env.DB)
 if(type==='prebook.delay') {
  const estimatedDate=date(p.estimatedDate)
  if(estimatedDate<terms.shipDate||estimatedDate>terms.cancelAfter||estimatedDate<supplierDate(at))fail('PREBOOK_DATE','A delay must stay inside the agreed cancel window; changing agreed terms needs buyer review.')
  const prior=window.estimatedDate??terms.shipDate
  if(estimatedDate===prior)fail('UNCHANGED','Choose a changed promise estimate.')
  window.estimatedDate=estimatedDate;window.reason=reason;window.history.push({at:at.toISOString(),by:actor.id,from:prior,to:estimatedDate,reason})
 } else {
  if(supplierDate(at)<(window.estimatedDate??terms.shipDate)||supplierDate(at)>terms.cancelAfter)fail('PREBOOK_DATE','Release this window on its promised date through the agreed cancel date.')
  if(order.prebook.depositCents>0) {
   const payment=await env.DB.prepare("SELECT value_json FROM bw_card_payments WHERE order_id=?").bind(order.id).first<{value_json:string}>(),value=payment?JSON.parse(payment.value_json):null
   if(!value||value.state!=='captured'||value.restored||value.amountCents!==order.prebook.depositCents||value.currency!==order.currency)fail('PREBOOK_DEPOSIT','The recorded deposit requirement needs a verified card capture before release; allocation remains separate.')
  }
  const id=`${order.id}-W${order.prebook.windows.indexOf(window)+1}`,lines=window.lineIndexes.map(index=>structuredClone(order.lines[index]))
  const release:Order={...order,id,prebook:undefined,prebookRelease:{orderId:order.id,windowId:window.id,seasonId:order.prebook.season.id},requestedDate:window.estimatedDate??terms.shipDate,cancelAfter:terms.cancelAfter,lines:lines.map(line=>({...line,requestedDate:window.estimatedDate??terms.shipDate})),totalCents:lines.reduce((n,line)=>n+(line.lineCents??0),0),status:'submitted',revision:crypto.randomUUID(),preparedAt:at.toISOString(),reference:order.reference,approvedAt:undefined,approvedBy:undefined,invoice:undefined}
  window.releaseId=id
  epoch.push(env.DB.prepare('INSERT INTO bw_orders VALUES(?,?,?,?)').bind(id,order.accountId,JSON.stringify(release),release.revision),audit(env.DB,actor,id,'prebook.release-created',{accountId:order.accountId,orderId:id,revision:release.revision,source:type,reason:`Commitment ${order.id}, window ${window.id}: ${reason}`}))
 }
 const previous=order.revision;order.revision=crypto.randomUUID()
 await commit(env.DB,actor,[...epoch,activeAccountGuard(env.DB,selected),env.DB.prepare('UPDATE bw_orders SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify(order),order.revision,order.id,previous),changed(env.DB),audit(env.DB,actor,order.id,type,{accountId:order.accountId,orderId:order.id,revision:order.revision,source:type,reason})])
 return {order,releaseId:window.releaseId}
}
export function prebookRows(order:Order) {
 return order.prebook?.windows.flatMap(window=>window.lineIndexes.map(index=>{
  const line=order.lines[index],terms=order.prebook!.season.windows.find(row=>row.id===window.id)!,committed=line.baseQuantity??String(line.quantity)
  return {orderId:order.id,accountId:order.accountId,season:order.prebook!.season.name,windowId:window.id,window:terms.name,sku:line.sku,unit:line.baseUnit??line.unit,committed,released:window.releaseId?committed:'0',outstanding:window.releaseId?'0':committed,releaseId:window.releaseId??null,shipDate:terms.shipDate,cancelAfter:terms.cancelAfter,estimatedDate:window.estimatedDate??terms.shipDate,backordered:Boolean(window.estimatedDate),history:window.history}
 }))??[]
}
