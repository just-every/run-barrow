import type { Bindings } from '../auth.server'
import { account } from './accounts'
import { audit,changed,commit } from './access'
import { catalogue,decimal,reserveOrder,pierState,pierOrigin,fullyReserved } from './pier'
import { fail,text,integer,requirePerson,requireSupplier,actorLabel,supplierDate,type Actor,type Order,type Line } from './model'
import { now } from './clock'
export async function readOrder(db:D1Database,actor:Actor,id:string):Promise<Order> {
 const row=await db.prepare('SELECT value_json,revision FROM bw_orders WHERE id=?').bind(id).first<any>()
 if(!row) fail('NOT_FOUND','Order not found.',404)
 const order={...JSON.parse(row.value_json),revision:row.revision}
 await account(db,actor,order.accountId)
 return order
}
async function save(env:Bindings,actor:Actor,order:Order,action:string,guards:D1PreparedStatement[]=[]) {
 const previous=order.revision,next=crypto.randomUUID(); order={...order,revision:next}
 await commit(env.DB,actor,[...guards,env.DB.prepare('UPDATE bw_orders SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify(order),next,order.id,previous),changed(env.DB),audit(env.DB,actor,order.id,action)])
 return order
}
// Orders read as people say them: the next number after the highest one written (JV-10438 → JV-10439); a new book starts at ORD-10001.
async function nextNumber(db:D1Database) {
 const rows=await db.prepare('SELECT id FROM bw_orders').all<{id:string}>()
 let prefix='ORD',top=10000
 for(const {id} of rows.results) {
  const match=/^([A-Z]{1,8})-(\d{1,9})$/.exec(id)
  if(match && Number(match[2])>=top) { prefix=match[1]; top=Number(match[2]) }
 }
 return `${prefix}-${top+1}`
}
async function recordReservation(env:Bindings,actor:Actor,order:Order,result:any) {
 if(typeof result?.id!=='string' || typeof result?.reference!=='string') fail('PIER_RESPONSE','Pier returned an incomplete reservation. Retry the same order.',502)
 const full=fullyReserved(result,order.lines)
 order={...order,pierOrderId:result.id,pierReference:result.reference,reservation:result.lines,status:full?'approved':'shortfall'}
 if(full && !order.invoice) {
  const issuedAt=supplierDate(await now()),due=new Date(issuedAt+'T00:00:00Z');due.setUTCDate(due.getUTCDate()+order.termsDays)
  order.invoice={number:`BAR-${order.id}`,issuedAt,dueAt:due.toISOString().slice(0,10)}
 }
 return save(env,actor,order,full?'order.reserved':'order.shortfall')
}
export async function orderCommand(env:Bindings,actor:Actor,type:string,p:any) {
 if(type==='order.prepare') {
  const selected=await account(env.DB,actor,text(p.accountId,'Account'))
  if(!Array.isArray(p.lines)||!p.lines.length||p.lines.length>100) fail('LINES','Choose between one and 100 lines.',400)
  const available=await catalogue(env,selected),seen=new Set<string>()
  const lines:Line[]=p.lines.map((line:any)=>{
   const sku=text(line.sku,'SKU',100),quantity=integer(line.quantity,'Quantity',1,1000000)
   if(seen.has(sku)) fail('LINES','Each SKU may appear only once.',400)
   seen.add(sku)
   const offer=available.items.find((i:any)=>i.sku===sku)
   if(!offer) fail('PRICE','This item is not on this customer’s active price list.')
   if(quantity<offer.minQty) fail('MINIMUM',`${sku} has a minimum quantity of ${offer.minQty}.`)
   if(BigInt(quantity)*1000000n>decimal(offer.available)) fail('STOCK',`${sku} no longer has enough promiseable stock. Refresh the catalog.`)
   return {sku,name:offer.name,itemId:offer.itemId,quantity,unitCents:offer.unitCents,minQty:offer.minQty}
  })
  const totalCents=lines.reduce((sum,line)=>sum+line.quantity*line.unitCents,0)
  if(!Number.isSafeInteger(totalCents)) fail('MONEY','Order total is outside the supported exact-cent range.',400)
  if(totalCents<selected.value.minimumCents) fail('MINIMUM','The order is below this customer’s minimum order value.')
  // Preparing from a draft replaces it: the old draft is marked superseded by this one, so it leaves Drafts and is never offered again.
  const replaced=p.replaces===undefined?undefined:await readOrder(env.DB,actor,text(p.replaces,'Replaced draft',100))
  if(replaced) {
   requirePerson(actor)
   if(replaced.accountId!==selected.id) fail('REPLACES','A draft can only be replaced by an order for the same trade account.',400)
   if(replaced.status!=='draft') fail('REPLACES','This draft was already submitted or replaced. Refresh your orders.')
  }
  const id=await nextNumber(env.DB),revision=crypto.randomUUID()
  const order:Order={id,accountId:selected.id,accountRevision:selected.revision,customerName:selected.value.name,pierCustomerId:selected.value.pierCustomerId,pierOrigin:(await pierOrigin(env))!,reference:p.reference?text(p.reference,'Customer reference',100):'',lines,totalCents,currency:'USD',termsDays:selected.value.termsDays,status:'draft',...(replaced?{replaces:replaced.id}:{}),preparedBy:actorLabel(actor),preparedAt:(await now()).toISOString(),revision}
  const retired=crypto.randomUUID()
  const supersede=replaced?[env.DB.prepare('UPDATE bw_orders SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify({...replaced,status:'superseded',supersededBy:id,revision:retired}),retired,replaced.id,replaced.revision),changed(env.DB),audit(env.DB,actor,replaced.id,'order.superseded')]:[]
  await commit(env.DB,actor,[env.DB.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_accounts WHERE id=? AND revision=?) THEN 1 ELSE 0 END').bind(selected.id,selected.revision),env.DB.prepare('INSERT INTO bw_orders VALUES(?,?,?,?)').bind(id,selected.id,JSON.stringify(order),revision),audit(env.DB,actor,id,'order.prepared'),...supersede])
  return order
 }
 requirePerson(actor)
 let order=await readOrder(env.DB,actor,text(p.orderId,'Order'))
 if(type==='order.submit') {
  if(order.status!=='draft') return order
  const selected=await account(env.DB,actor,order.accountId)
  if(selected.revision!==order.accountRevision) fail('PRICE_CHANGED','The price list or terms changed. Prepare a new draft for review.')
  return save(env,actor,{...order,status:'submitted',submittedBy:actor.id},'order.submitted',[env.DB.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_accounts WHERE id=? AND revision=?) THEN 1 ELSE 0 END').bind(selected.id,selected.revision)])
 }
 requireSupplier(actor)
 if(order.pierOrigin!==await pierOrigin(env)) fail('PIER_CHANGED','Reconnect the original Pier installation before reserving or reconciling this order.')
 if(type==='order.approve') {
  if(order.status==='approved'||order.status==='shortfall') return order
  if(order.status==='submitted') order=await save(env,actor,{...order,status:'reserving',approvedBy:actor.id,approvedAt:(await now()).toISOString()},'order.approved')
  if(order.status!=='reserving') fail('APPROVAL','The customer must review and submit this draft first.')
  // Current approver authority must still hold before an external stock effect.
  const approver=await env.DB.prepare("SELECT id FROM oa_operators WHERE id=? AND status='active' AND role IN ('owner','admin')").bind(order.approvedBy!).first()
  if(!approver) fail('APPROVAL_REVOKED','The recorded approver no longer has authority.')
  const result=await reserveOrder(env,order.id,order.pierCustomerId,order.lines)
  return recordReservation(env,actor,order,result)
 }
 if(type==='order.refresh') {
  if(!order.pierOrderId) fail('RESERVATION','Approve this order or retry its pending approval first.')
  if(order.status==='approved') return order
  const state=await pierState(env),result=state.orders.find((o:any)=>o.id===order.pierOrderId)
  if(!result) fail('PIER_ORDER','The recorded Pier order is missing. Check the stock desk.')
  return recordReservation(env,actor,order,result)
 }
 fail('NOT_FOUND','Unknown order command.',404)
}
