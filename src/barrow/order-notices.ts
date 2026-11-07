import type { Bindings } from '../auth.server'
import { audit, commit } from './access'
import { account, accounts } from './accounts'
import { now } from './clock'
import { commissionSources } from './commission-source'
import { digest } from './digest'
import { fail, Problem, requirePerson, text, type Actor, type Order } from './model'
import { readOrder } from './orders'
import { pierOrigin, pierState } from './pier'

export const orderNoticeKinds = ['accepted','stock','shipment','return'] as const
export type OrderNoticeKind = typeof orderNoticeKinds[number]
const titles: Record<OrderNoticeKind,string> = {accepted:'Order accepted',stock:'Recorded stock status changed',shipment:'Dispatch recorded',return:'Return decision recorded'}
type Fact = { kind:OrderNoticeKind; sourceId:string; sourceRevision:string; sourceOrigin:string; details:unknown; at:string }
type Row = {id:string;account_id:string;order_id:string;kind:OrderNoticeKind;source_id:string;source_revision:string;source_origin:string;details_json:string;created_at:string;restored:number}

/** Called in the source transaction. The unique source revision survives retries and concurrent readers. */
export function orderNoticeStatements(db:D1Database,order:Order,fact:Fact):D1PreparedStatement[] {
 return [db.prepare('INSERT OR IGNORE INTO bw_order_notice_accounts(account_id) VALUES(?)').bind(order.accountId),
  db.prepare(`INSERT OR IGNORE INTO bw_order_notices(id,account_id,order_id,kind,source_id,source_revision,source_origin,details_json,created_at)
   SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM bw_order_notice_accounts WHERE account_id=? AND active=1)`)
   .bind(crypto.randomUUID(),order.accountId,order.id,fact.kind,fact.sourceId,fact.sourceRevision,fact.sourceOrigin,JSON.stringify(fact.details),fact.at,order.accountId)]
}
const stock = (order:Order) => ({status:order.status,lines:(Array.isArray(order.reservation)?order.reservation:[]).map((line:any)=>({itemId:line.itemId,reserved:line.reserved,backorder:line.backorder})).sort((a:{itemId:string},b:{itemId:string})=>a.itemId.localeCompare(b.itemId))??[]})
export async function nativeOrderNoticeStatements(db:D1Database,order:Order,action:string,previous:Order) {
 const at=(await now()).toISOString()
 if(action==='order.approved')return orderNoticeStatements(db,order,{kind:'accepted',sourceId:order.id,sourceRevision:order.revision,sourceOrigin:'Barrow',details:{acceptedAt:order.approvedAt},at})
 if(['order.reserved','order.shortfall'].includes(action)&&JSON.stringify(stock(previous))!==JSON.stringify(stock(order)))return orderNoticeStatements(db,order,{kind:'stock',sourceId:order.id,sourceRevision:order.revision,sourceOrigin:'Barrow',details:stock(order),at})
 return []
}
function person(actor:Actor){requirePerson(actor);if(actor.staff?.role==='analyst')fail('FORBIDDEN','This role does not read orders.',403)}
async function entitled(env:Bindings,actor:Actor,id:string,kind?:OrderNoticeKind) {
 person(actor)
 const order=await readOrder(env.DB,actor,id)
 if(kind==='return'&&actor.staff)fail('NOT_FOUND','Notice not found.',404)
 return order
}
async function permittedOrders(env:Bindings,actor:Actor) {
 person(actor)
 const rows=(await env.DB.prepare('SELECT id FROM bw_orders ORDER BY id').all<{id:string}>()).results,out:Order[]=[]
 for(const row of rows)try{out.push(await entitled(env,actor,row.id))}catch(error){if(!(error instanceof Problem)||![403,404].includes(error.status))throw error}
 return out
}
/** Read the actual connected Pier source; never turn an unavailable source into a shipment. */
async function dispatchFacts(env:Bindings,order:Order):Promise<Fact[]> {
 if(!order.pierOrderId)return []
 const origin=await pierOrigin(env),state=await pierState(env)
 commissionSources(order,state,origin)
 return state.shipments.filter((row:any)=>row.orderId===order.pierOrderId).map((row:any)=>({kind:'shipment',sourceId:row.id,sourceRevision:row.createdAt,sourceOrigin:origin!,details:{lines:row.lines.map((line:any)=>({itemId:line.itemId,quantity:line.quantity}))},at:row.createdAt}))
}
async function collectDispatches(env:Bindings,actor:Actor,orders:Order[]) {
 const statements:D1PreparedStatement[]=[]
 for(const order of orders) {
  const active=await env.DB.prepare('SELECT active FROM bw_order_notice_accounts WHERE account_id=?').bind(order.accountId).first<{active:number}>()
  if(active?.active!==1)continue
  let facts:Fact[]
  try{facts=await dispatchFacts(env,order)}catch{continue}
  for(const fact of facts)statements.push(...orderNoticeStatements(env.DB,order,fact))
 }
 if(statements.length)await commit(env.DB,actor,statements)
}
function shown(row:Row,readAt:string|null) {
 return {id:row.id,accountId:row.account_id,orderId:row.order_id,kind:row.kind,title:titles[row.kind],sourceId:row.source_id,sourceRevision:row.source_revision,sourceOrigin:row.source_origin,details:JSON.parse(row.details_json),createdAt:row.created_at,readAt,sourcePath:`/api/barrow/order-notices/${row.id}/source`,restored:!!row.restored}
}
/** Current authority and preferences are evaluated on every list, export and individual source read. */
export async function orderNoticeRecords(env:Bindings,actor:Actor) {
 const orders=await permittedOrders(env,actor),allowed=new Set(orders.map(order=>order.id))
 const rows=(await env.DB.prepare(`SELECT n.*,r.read_at FROM bw_order_notices n LEFT JOIN bw_order_notice_reads r ON r.notice_id=n.id AND r.user_id=? ORDER BY n.created_at,n.id`).bind(actor.id).all<Row&{read_at:string|null}>()).results
 const prefs=(await env.DB.prepare('SELECT account_id,kind,enabled FROM bw_order_notice_preferences WHERE user_id=?').bind(actor.id).all<{account_id:string;kind:string;enabled:number}>()).results
 return rows.filter(row=>allowed.has(row.order_id)&&(!actor.staff||row.kind!=='return')).map(row=>({...shown(row,row.read_at),enabled:prefs.find(pref=>pref.account_id===row.account_id&&pref.kind===row.kind)?.enabled!==0}))
}
export async function readOrderNotices(env:Bindings,actor:Actor) {
 const orders=await permittedOrders(env,actor)
 await collectDispatches(env,actor,orders)
 const records=await orderNoticeRecords(env,actor)
 return {notices:records.filter(row=>row.enabled&&!row.restored),note:'In-app recorded facts only. Open the current source for its latest state; dispatch does not establish delivery.'}
}
export async function noticePreferences(env:Bindings,actor:Actor) {
 person(actor)
 const rows=(await env.DB.prepare('SELECT account_id,kind,enabled FROM bw_order_notice_preferences WHERE user_id=?').bind(actor.id).all<{account_id:string;kind:OrderNoticeKind;enabled:number}>()).results
 const inactive=new Set((await env.DB.prepare('SELECT account_id FROM bw_order_notice_accounts WHERE active=0').all<{account_id:string}>()).results.map(row=>row.account_id))
 return {accounts:(await accounts(env.DB,actor)).filter(selected=>!inactive.has(selected.id)).map(selected=>({id:selected.id,name:selected.value.name,kinds:orderNoticeKinds.map(kind=>({kind,title:titles[kind],enabled:rows.find(row=>row.account_id===selected.id&&row.kind===kind)?.enabled!==0}))}))}
}
async function notice(env:Bindings,actor:Actor,id:string) {
 const row=await env.DB.prepare('SELECT * FROM bw_order_notices WHERE id=?').bind(id).first<Row>()
 if(!row||row.restored)fail('NOT_FOUND','Notice not found.',404)
 const order=await entitled(env,actor,row.order_id,row.kind)
 const active=await env.DB.prepare('SELECT active FROM bw_order_notice_accounts WHERE account_id=?').bind(row.account_id).first<{active:number}>()
 if(active?.active!==1)fail('NOT_FOUND','Notice not found.',404)
 return {row,order}
}
export async function orderNoticeSource(env:Bindings,actor:Actor,id:string) {
 const {row,order}=await notice(env,actor,id)
 let current:unknown
 if(row.kind==='shipment') {
  try{const found=(await dispatchFacts(env,order)).find(fact=>fact.sourceId===row.source_id&&fact.sourceRevision===row.source_revision);if(!found)throw Error();current=found.details}
  catch{fail('NOTICE_SOURCE','The connected dispatch source is unavailable; delivery remains unknown.',409)}
 } else if(row.kind==='return') {
  const result=await env.DB.prepare('SELECT value_json,revision FROM bw_return_claims WHERE id=? AND order_id=?').bind(row.source_id,order.id).first<{value_json:string;revision:string}>()
  if(!result)fail('NOTICE_SOURCE','The return source is unavailable.',409)
  const claim=JSON.parse(result.value_json)
  current={revision:result.revision,requested:claim.quantity,approved:claim.decision?.quantity??null,restored:!!claim.restored}
 } else current=row.kind==='stock'?{revision:order.revision,...stock(order)}:{revision:order.revision,status:order.status,acceptedAt:order.approvedAt}
 return {notice:shown(row,null),current,orderId:order.id}
}
export async function orderNoticeCommand(env:Bindings,actor:Actor,type:string,p:any) {
 person(actor)
 if(type==='order-notice.preferences') {
  const selected=await account(env.DB,actor,text(p.accountId,'Account')),kind=p.kind as OrderNoticeKind
  if((await env.DB.prepare('SELECT active FROM bw_order_notice_accounts WHERE account_id=?').bind(selected.id).first<{active:number}>())?.active===0)fail('NOTICE_INACTIVE','Erased or restored notice settings are inactive.',409)
  if(!orderNoticeKinds.includes(kind)||typeof p.enabled!=='boolean')fail('INPUT','Choose a notice category and whether to show it.',400)
  await commit(env.DB,actor,[env.DB.prepare('INSERT INTO bw_order_notice_preferences(user_id,account_id,kind,enabled) VALUES(?,?,?,?) ON CONFLICT(user_id,account_id,kind) DO UPDATE SET enabled=excluded.enabled').bind(actor.id,selected.id,kind,p.enabled?1:0),audit(env.DB,actor,actor.id,'order-notice.preferences',{accountId:selected.id,source:type,revision:await digest(JSON.stringify([kind,p.enabled])),reason:'The signed-in person changed their own in-app notice preference.'})])
  return noticePreferences(env,actor)
 }
 if(type==='order-notice.read') {
  const {row}=await notice(env,actor,text(p.id,'Notice'))
  await commit(env.DB,actor,[env.DB.prepare('INSERT OR IGNORE INTO bw_order_notice_reads(user_id,notice_id,read_at) SELECT ?,id,? FROM bw_order_notices WHERE id=? AND restored=0').bind(actor.id,(await now()).toISOString(),row.id)])
  return {id:row.id,read:true}
 }
 fail('COMMAND','Unknown notice command.',400)
}
