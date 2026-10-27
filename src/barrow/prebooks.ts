import type { Bindings } from '../auth.server'
import { audit, changed, commit } from './access'
import { now } from './clock'
import { fail, integer, requirePerson, requireSupplier, supplierDate, text, type Actor, type Line, type Order, type Account } from './model'
import { catalogue, decimal, pierOrigin } from './pier'
import { prepareLines } from './unit-lines'
import { purchaseDetails } from './purchase'
import { readOrder } from './orders'
import { activeAccountGuard, requireActiveAccount } from './account-profile'
import { carryDocument } from './documents'
import { buyingOrderGuards, orderBuyingProfile } from './buying-profiles'
import { account } from './accounts'

export type Season = { id:string; name:string; opensAt:string; closesAt:string; closed:boolean; minimumCents:number; depositBps:number; windows:{id:string;requestedDate:string;cancelAfter:string}[]; revision:string }
export type Prebook = { season:Season; depositCents:number; depositAcknowledged?:{by:string;at:string}; incoming:{sku:string;date:string|null;quantity:string;source:string}[]; windows:{id:string;requestedDate:string;cancelAfter:string;releaseId?:string;promiseDate?:string;history:{at:string;by:string;from:string;to:string;reason:string}[]}[] }
const owner=(actor:Actor)=>{requirePerson(actor);if(!['owner','admin'].includes(actor.role))fail('FORBIDDEN','Only an owner or admin can publish or close a season.',403)}
const key=(id:string)=>'prebook-season:'+id
export async function seasons(env:Bindings) {
 return (await env.DB.prepare("SELECT value_json FROM bw_settings WHERE key LIKE 'prebook-season:%' ORDER BY key").all<{value_json:string}>()).results.map(row=>JSON.parse(row.value_json) as Season)
}
const seasonGuard=(env:Bindings,season:Season)=>env.DB.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_settings WHERE key=? AND revision=?) THEN 1 ELSE 0 END').bind(key(season.id),season.revision)
export async function seasonCommand(env:Bindings,actor:Actor,type:string,p:any) {
 owner(actor)
 const id=text(p.id,'Season ID',60);if(!/^[a-z0-9-]+$/.test(id))fail('INPUT','Use lowercase letters, digits and hyphens for a season ID.',400)
 const previous=(await seasons(env)).find(row=>row.id===id)
 let season:Season
 if(type==='prebook.close') {
  if(!previous)fail('NOT_FOUND','Season not found.',404)
  if(p.revision!==previous.revision)fail('CHANGED','Refresh the season before closing it.')
  season={...previous,closed:true,revision:crypto.randomUUID()}
 } else {
  if(previous)fail('SEASON_EXISTS','Published season terms are immutable; close it and publish a new season.')
  const date=(v:unknown)=>{if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(v)||!Number.isFinite(Date.parse(v)))fail('INPUT','Use a complete date with timezone.',400);return new Date(v).toISOString()}
  const opensAt=date(p.opensAt),closesAt=date(p.closesAt)
  if(opensAt>=closesAt)fail('INPUT','Season closing must follow its opening.',400)
  if(!Array.isArray(p.windows)||!p.windows.length||p.windows.length>12)fail('INPUT','Publish one to twelve ship windows.',400)
  const windows:Season['windows']=p.windows.map((w:any)=>{
   const details=purchaseDetails(w,supplierDate(new Date(opensAt)))
   if(!details.requestedDate||!details.cancelAfter||details.requestedDate<supplierDate(new Date(closesAt)))fail('INPUT','Each window needs ship and cancel dates after season closing.',400)
   return {id:text(w.id,'Window ID',60),requestedDate:details.requestedDate,cancelAfter:details.cancelAfter}
  })
  if(new Set(windows.map(w=>w.requestedDate)).size!==windows.length)fail('INPUT','Publish distinct ship dates for each window.',400)
  if(new Set(windows.map(w=>w.id)).size!==windows.length)fail('INPUT','Window IDs must be unique.',400)
  season={id,name:text(p.name,'Season name',100),opensAt,closesAt,closed:false,minimumCents:integer(p.minimumCents??0,'Season minimum cents'),depositBps:integer(p.depositBps??0,'Deposit basis points',0,10000),windows,revision:crypto.randomUUID()}
 }
 const reason=text(p.reason,'Season reason',1000)
 await commit(env.DB,actor,[...(previous?[seasonGuard(env,previous)]:[]),env.DB.prepare(previous?'UPDATE bw_settings SET value_json=?,revision=? WHERE key=?':'INSERT INTO bw_settings(value_json,revision,key) VALUES(?,?,?)').bind(JSON.stringify(season),season.revision,key(id)),changed(env.DB),audit(env.DB,actor,id,type,{revision:season.revision,source:type,reason})])
 return season
}
export async function openSeason(env:Bindings,id:unknown) {
 const season=(await seasons(env)).find(row=>row.id===text(id,'Season',60)),at=(await now()).toISOString()
 if(!season)fail('NOT_FOUND','Season not found.',404)
 if(season.closed||at<season.opensAt||at>=season.closesAt)fail('SEASON_CLOSED','This season is not open for new commitments.')
 return season
}
/** Each delivery window is priced independently using the existing selling-unit and minimum rules. */
export function windowLines(input:any[],offers:Parameters<typeof prepareLines>[1],date:string,stock:boolean) {
 const dates=[...new Set(input.map(line=>line.requestedDate??''))]
 const prepared=new Map<string,Line[]>()
 for(const day of dates)prepared.set(day,prepareLines(input.filter(line=>(line.requestedDate??'')===day),offers,date,stock))
 const offsets=new Map<string,number>()
 return input.map(line=>{const day=line.requestedDate??'',index=offsets.get(day)??0;offsets.set(day,index+1);return prepared.get(day)![index]})
}
export async function preparePrebook(env:Bindings,selected:Account,season:Season,lines:Line[],offers:Awaited<ReturnType<typeof catalogue>>,totalCents:number):Promise<Prebook> {
 if(totalCents<season.minimumCents)fail('MINIMUM','The prebook is below the published season minimum.')
 for(const line of lines)if(!season.windows.some(w=>w.requestedDate===line.requestedDate&&w.cancelAfter===line.cancelAfter))fail('WINDOW','Choose a published ship and cancel window for every line.',400)
 const incoming=offers.items.flatMap(offer=>offer.incoming.map(row=>({sku:offer.sku,...row,source:row.date?'Pier PO promise date':'date unknown'}))).filter(row=>lines.some(line=>line.sku===row.sku))
 const deposit=Number((BigInt(totalCents)*BigInt(season.depositBps)+9999n)/10000n)
 const prebook:Prebook={season,depositCents:deposit,incoming,windows:season.windows.filter(w=>lines.some(l=>l.requestedDate===w.requestedDate)).map(w=>({...w,history:[]}))}
 await capacity(env,selected,{lines,prebook} as Order,offers)
 return prebook
}
async function capacity(env:Bindings,selected:Account,order:Order,offers:Awaited<ReturnType<typeof catalogue>>) {
 // Pier does not attribute incoming POs to a destination warehouse. Never widen a restricted account to that supply.
 if(selected.value.warehouses?.length)fail('INCOMING_WAREHOUSE','Pier incoming supply has no destination warehouse evidence for this restricted account.')
 const records=(await env.DB.prepare('SELECT value_json FROM bw_orders').all<{value_json:string}>()).results.map(r=>JSON.parse(r.value_json) as Order)
 const others=records.filter(o=>o.id!==order.id&&o.prebook&&['prebook','awaiting-company-approval'].includes(o.status))
 for(const sku of new Set(order.lines.map(l=>l.sku))) {
  const offer=offers.items.find(row=>row.sku===sku);if(!offer)fail('PRICE','A prebook item is no longer offered.')
  const deadlines=[...new Set([...order.lines,...others.flatMap(o=>o.lines)].filter(l=>l.sku===sku).map(l=>l.requestedDate!))].sort()
  for(const deadline of deadlines) {
   const demand=order.lines.filter(l=>l.sku===sku&&l.requestedDate!<=deadline).reduce((n,l)=>n+decimal(l.baseQuantity!),0n)
   const held=others.flatMap(o=>o.lines.filter(l=>l.sku===sku&&l.requestedDate!<=deadline&&!records.some(child=>child.id===o.prebook!.windows.find(w=>w.requestedDate===l.requestedDate)?.releaseId&&child.status==='approved'))).reduce((n,l)=>n+decimal(l.baseQuantity!),0n)
   const available=decimal(offer.available)+offer.incoming.filter(r=>r.date!==null&&r.date<=deadline).reduce((n,r)=>n+decimal(r.quantity),0n)
   if(demand+held>available)fail('PREBOOK_CAPACITY',`${sku}: source-dated incoming supply and received stock do not cover these commitments by ${deadline}.`)
  }
 }
 return records.filter(o=>o.prebook&&['prebook','awaiting-company-approval'].includes(o.status)).length
}
export async function prebookSubmission(env:Bindings,selected:Account,order:Order,acknowledged?:unknown) {
 if(!order.prebook)return []
 if(order.pierOrigin!==await pierOrigin(env))fail('PIER_CHANGED','Reconnect the original Pier installation before committing its incoming supply.')
 const season=await openSeason(env,order.prebook.season.id)
 if(season.revision!==order.prebook.season.revision)fail('SEASON_CHANGED','Prepare a new prebook against the current season.')
 if(order.prebook.depositCents&&!order.prebook.depositAcknowledged&&acknowledged!==true)fail('DEPOSIT_REQUIRED','Explicitly acknowledge the recorded deposit requirement. This does not record collection or allocation.')
 const commitmentCount=await capacity(env,selected,order,await catalogue(env,selected))
 return [seasonGuard(env,season),env.DB.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN COUNT(*)=? THEN 1 ELSE 0 END FROM bw_orders WHERE json_extract(value_json,'$.prebook') IS NOT NULL AND json_extract(value_json,'$.status') IN ('prebook','awaiting-company-approval')").bind(commitmentCount)]
}
export async function prebookView(env:Bindings,order:Order) {
 if(!order.prebook)return undefined
 const windows=[]
 for(const window of order.prebook.windows) {
  const child=window.releaseId?await env.DB.prepare('SELECT value_json FROM bw_orders WHERE id=?').bind(window.releaseId).first<{value_json:string}>():null
  const release=child?JSON.parse(child.value_json) as Order:null
  const lines=order.lines.filter(line=>line.requestedDate===window.requestedDate||window.history.some(h=>h.from===line.requestedDate))
  windows.push({...window,releaseStatus:release?.status??null,lines:lines.map(line=>({sku:line.sku,unit:line.unit,committed:line.quantity,released:release?.status==='approved'?line.quantity:0,outstanding:release?.status==='approved'?0:line.quantity})),stock:'Incoming commitment; no immediate stock reservation',depositStatus:'Requirement recorded; collection and allocations belong to PAY-003'})
 }
 return {season:order.prebook.season.name,depositCents:order.prebook.depositCents,windows}
}
export async function prebookOperation(env:Bindings,actor:Actor,type:string,p:any) {
 requireSupplier(actor)
 const order=await readOrder(env.DB,actor,text(p.orderId,'Prebook'))
 if(order.status!=='prebook'||!order.prebook)fail('PREBOOK','Choose a committed seasonal prebook.')
 const window=order.prebook.windows.find(w=>w.id===p.windowId);if(!window)fail('WINDOW','Ship window not found.',404)
 if(type==='prebook.release'&&window.releaseId) return readOrder(env.DB,actor,window.releaseId)
 if(p.revision!==order.revision)fail('CHANGED','Refresh this exact prebook before changing it.')
 const reason=text(p.reason,'Release or delay reason',1000),at=(await now()).toISOString(),revision=crypto.randomUUID()
 let child:Order|undefined
 let releaseGuards:D1PreparedStatement[]=[]
 if(type==='prebook.delay') {
  if(window.releaseId)fail('RELEASED','Use the linked order for a window already released.')
  const details=purchaseDetails({requestedDate:p.requestedDate},supplierDate(await now()))
  if(!details.requestedDate||details.requestedDate<=(window.promiseDate??window.requestedDate))fail('WINDOW','Record a later source promise date.',400)
  if(p.cancelAfter!==undefined&&p.cancelAfter!==window.cancelAfter)fail('TERMS_LOCKED','A source delay cannot extend the buyer’s agreed cancel window.')
  const from=window.promiseDate??window.requestedDate
  window.history.push({at,by:actor.id,from,to:details.requestedDate,reason})
  window.promiseDate=details.requestedDate
 } else {
  const current=(await seasons(env)).find(s=>s.id===order.prebook!.season.id)
  if(!current||!current.closed&&at<current.closesAt)fail('SEASON_OPEN','Close the season before releasing its commitments.')
  if(window.promiseDate&&window.promiseDate>window.cancelAfter)fail('BUYER_REVIEW_REQUIRED','The delayed promise exceeds the agreed cancel window. No release without a newly reviewed buyer agreement.')
  if(supplierDate(await now())<(window.promiseDate??window.requestedDate))fail('WINDOW_EARLY','The published ship window has not opened.')
  if(supplierDate(await now())>window.cancelAfter)fail('WINDOW_EXPIRED','The cancel window has expired; record an agreed promise change before release.')
  if(order.pierOrigin!==await pierOrigin(env))fail('PIER_CHANGED','Reconnect the original Pier installation before releasing its commitment.')
  const selected=(await orderBuyingProfile(env.DB,actor,await account(env.DB,actor,order.accountId),order)).selected;requireActiveAccount(selected)
  if(selected.revision!==order.accountRevision)fail('PRICE_CHANGED','Account terms changed; review the original commitment before release.')
  const lines=order.lines.filter(l=>l.requestedDate===window.requestedDate),offers=await catalogue(env,selected)
  if(lines.reduce((n,l)=>n+l.lineCents!,0)<selected.value.minimumCents)fail('MINIMUM','This release is below the account minimum. Review the commitment before releasing it.')
  // No stock command is sent here. The linked request must pass normal human order approval and Pier acknowledgement.
  prepareLines(lines,offers.items,supplierDate(await now()))
  const id=order.id+'-W'+(order.prebook.windows.indexOf(window)+1)
  const {prebook,invoice,reservation,pierOrderId,pierReference,approvalRoute,...snapshot}=order
  child={...snapshot,id,lines,totalCents:lines.reduce((n,l)=>n+l.lineCents!,0),requestedDate:window.requestedDate,cancelAfter:window.cancelAfter,status:'submitted',fromPrebook:{orderId:order.id,windowId:window.id},preparedAt:at,revision:crypto.randomUUID()}
  window.releaseId=id
  releaseGuards=[activeAccountGuard(env.DB,selected),...await buyingOrderGuards(env.DB,actor,child),seasonGuard(env,current)]
 }
 order.revision=revision
 await commit(env.DB,actor,[env.DB.prepare('UPDATE bw_orders SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify(order),revision,order.id,p.revision),changed(env.DB),...releaseGuards,...(child?[env.DB.prepare('INSERT INTO bw_orders VALUES(?,?,?,?)').bind(child.id,child.accountId,JSON.stringify(child),child.revision)]:[]),...(child?.document?[carryDocument(env,order.id,child.id)]:[]),audit(env.DB,actor,order.id,type,{accountId:order.accountId,orderId:order.id,revision,source:type,reason})])
 return child??order
}
