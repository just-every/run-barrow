import type { Bindings } from '../auth.server'
import { account } from './accounts'
import { audit,changed,commit } from './access'
import { catalogue,reserveOrder,pierState,pierOrigin,fullyReserved,pierOrder,releaseOrder,released,decimal } from './pier'
import { fail,text,requirePerson,requireSupplier,actorLabel,supplierDate,type Actor,type Order,type Account } from './model'
import { activeAccountGuard, requireActiveAccount } from './account-profile'
import { now } from './clock'
import { reviewReorder } from './reorders'
import { priceLine } from './pricing'
import { sellingUnits } from './units'
import { prepareLines } from './unit-lines'
import { purchaseDetails, buyerSku, purchaseRelease } from './purchase'
import { readDocument, documentStatement, carryDocument } from './documents'
import { locationSnapshot } from './locations'
import { acceptDelivery, deliveryTotal, freightQuote, selectDelivery, shippingGuard } from './shipping'
import { freshnessLimit, staleStock } from './freshness'
export async function readOrder(db:D1Database,actor:Actor,id:string):Promise<Order> {
 const row=await db.prepare('SELECT value_json,revision FROM bw_orders WHERE id=?').bind(id).first<any>()
 if(!row) fail('NOT_FOUND','Order not found.',404)
 const order={...JSON.parse(row.value_json),revision:row.revision}
 await account(db,actor,order.accountId)
 return order
}
async function save(env:Bindings,actor:Actor,order:Order,action:string,guards:D1PreparedStatement[]=[],reason?:string) {
 const previous=order.revision,next=crypto.randomUUID(); order={...order,revision:next}
 await commit(env.DB,actor,[...guards,env.DB.prepare('UPDATE bw_orders SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify(order),next,order.id,previous),changed(env.DB),audit(env.DB,actor,order.id,action,{accountId:order.accountId,orderId:order.id,revision:next,source:'order.command',reason:reason??({
  'order.submitted':'Buyer submitted the prepared commercial snapshot for supplier review.',
  'order.document-attached':'Attached the supporting PO document to the draft.',
  'order.submitted-release':'Submitted as an explicitly authorized numbered release of a PO already on order.',
  'order.approved':'Supplier approved the submitted revision for stock reservation.',
  'order.reserved':'Pier acknowledged reservation of every requested unit.',
  'order.shortfall':'Pier acknowledged a stock shortfall; invoicing remains blocked.',
  'order.release-requested':'Supplier cancelled the order; its Pier stock release is requested and the units stay unpromised until Pier confirms.',
  'order.released':'Pier acknowledged the stock release; the cancelled order holds no stock.',
 } as Record<string,string>)[action]??action})])
 return order
}
// Orders read as people say them: the next number after the highest one written (JV-10438 → JV-10439); a new book starts at ORD-10001.
export async function nextNumber(db:D1Database) {
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
async function recordRelease(env:Bindings,actor:Actor,order:Order,result:any) {
 if(!released(result)) fail('RELEASE_PENDING','Pier has not confirmed the release. The units stay out of promiseable stock; retry the release.',502)
 const lines=result.lines.map((l:any)=>({itemId:l.itemId,quantity:l.quantity,dispatched:l.dispatched,cancelled:l.cancelled,reserved:l.reserved}))
 return save(env,actor,{...order,status:'cancelled',release:{...order.release!,confirmedAt:(await now()).toISOString(),lines}},'order.released')
}
async function assertCurrentPricing(env:Bindings,selected:Account,order:Order,submission=false) {
 // PRI-007: read current Pier at every admission. Submission revalidates the whole cart;
 // approval checks current commercial terms, then Pier's reservation is authoritative for stock shortfalls.
 const offers=await catalogue(env,selected),date=supplierDate(await now())
 for(const line of order.lines){
  const offer=offers.items.find(item=>item.sku===line.sku),unit=offer?sellingUnits(offer).find(unit=>unit.code===(line.unit??offer.unit)):undefined
  if(!unit)fail('PRICE_CHANGED','An item or selling unit changed. Prepare a new draft for review.')
  // ORD-004: a quoted line's negotiated price applies to its PRI-002 basis, which must still be the current rule.
  const current=priceLine(line.quantity,unit.unitCents,unit.pricing,date),basis=line.quote?{unitCents:line.quote.basisUnitCents,lineCents:line.quote.basisLineCents}:line
  if(current.unitCents!==basis.unitCents || current.lineCents!==(basis.lineCents??line.quantity*line.unitCents) || current.pricing?.reason!==line.pricing?.reason || JSON.stringify(current.pricing?.segments)!==JSON.stringify(line.pricing?.segments) || current.pricing?.discountBps!==line.pricing?.discountBps) fail('PRICE_CHANGED','The effective pricing rule changed. Prepare a new draft for review.')
 }
 if(submission) {
  const lines=prepareLines(order.lines,offers.items,date)
  if(lines.reduce((sum,line)=>sum+line.lineCents!,0)<selected.value.minimumCents)fail('MINIMUM','The order is below this customer’s minimum order value.')
 }
}
export async function orderCommand(env:Bindings,actor:Actor,type:string,p:any) {
 if(type==='order.reorder-preview' || type==='order.reorder') {
  requirePerson(actor)
  const context=await reviewReorder(env,actor,p)
  if(type==='order.reorder-preview') return context.review
  if(p.acknowledged!==true || p.fingerprint!==context.review.fingerprint) fail('REORDER_CHANGED','Review the current differences and explicitly acknowledge them before preparing a reorder.')
  if(context.review.blockers.length) fail('REORDER_BLOCKED',context.review.blockers.join(' '))
  return prepareOrder(env,actor,{accountId:context.selected.id,reference:p.reference,deliveryLocation:context.review.deliveryLocation,shipToId:context.review.shipToId,lines:context.review.lines.map(line=>({sku:line.sku,unit:line.unit,quantity:line.quantity}))},context)
 }
 if(type==='order.prepare') return prepareOrder(env,actor,p)
 requirePerson(actor)
 let order=await readOrder(env.DB,actor,text(p.orderId,'Order'))
 if(type==='shipping.select' || type==='shipping.quote') {
  if(order.status!=='draft')fail('SHIPPING_LOCKED','Delivery changes require a new reviewed draft.')
  const selected=await account(env.DB,actor,order.accountId),context={account:selected,lines:order.lines,shipTo:order.shipTo,quotes:order.freightQuotes}
  if(type==='shipping.quote') {
   const quoted=await freightQuote(env,actor,context,p)
   return save(env,actor,{...order,delivery:undefined,totalCents:deliveryTotal(order.lines),freightQuotes:[...(order.freightQuotes??[]),quoted]},'shipping.quoted',[],`Merchant freight quote: ${quoted.cents} USD cents; ${quoted.reason}`)
  }
  const delivery=await selectDelivery(env,context,p)
  return save(env,actor,{...order,delivery,totalCents:deliveryTotal(order.lines,delivery)},'shipping.selected',[],'Selected delivery for review; buyer acceptance is still required at submission.')
 }
 if(type==='order.submit') {
  if(order.status!=='draft') return order
  const selected=await account(env.DB,actor,order.accountId)
  requireActiveAccount(selected)
  if(selected.revision!==order.accountRevision) fail('PRICE_CHANGED','The price list or terms changed. Prepare a new draft for review.')
  await assertCurrentPricing(env,selected,order,true)
  const stale=staleStock(order,await freshnessLimit(env.DB),await now())
  if(stale) fail('STOCK_STALE',stale)
  if(order.delivery && actor.email!==selected.value.email)fail('BUYER_REQUIRED','The account buyer must accept the final delivery before ordering.',403)
  const delivery=await acceptDelivery(env,actor,{account:selected,lines:order.lines,shipTo:order.shipTo,quotes:order.freightQuotes},order.delivery,p.deliveryAcknowledged)
  const release=await purchaseRelease(env.DB,actor,order,p.release,(await now()).toISOString())
  return save(env,actor,{...order,delivery,totalCents:deliveryTotal(order.lines,delivery),status:'submitted',submittedBy:actor.id,...(release.poRelease?{poRelease:release.poRelease}:{})},release.poRelease?'order.submitted-release':'order.submitted',[activeAccountGuard(env.DB,selected),shippingGuard(env.DB,delivery),release.guard])
 }
 if(type==='order.attach') {
  if(order.status!=='draft') fail('DOCUMENT_LOCKED','Attach the PO document before the order is submitted.')
  const document=await readDocument(p),{contentBase64,...meta}=document
  return save(env,actor,{...order,document:{...meta,uploadedBy:actor.id,uploadedAt:(await now()).toISOString()}},'order.document-attached',[documentStatement(env,order.id,document)])
 }
 requireSupplier(actor)
 if(type==='order.stock-exception') {
  // STK-002: a supplier's recorded decision to accept this draft's stock observation past the freshness limit.
  if(order.status!=='draft') fail('STOCK_EXCEPTION','Record a stock exception on a draft before it is submitted.')
  const reason=text(p.reason,'Exception reason',240)
  return save(env,actor,{...order,stockException:{by:actor.id,at:(await now()).toISOString(),reason}},'order.stock-exception',[],`Supplier accepted stock observed ${order.preparedAt} past the freshness limit: ${reason}`)
 }
 if(order.pierOrigin!==await pierOrigin(env)) fail('PIER_CHANGED','Reconnect the original Pier installation before reserving or reconciling this order.')
 if(type==='order.approve') {
  if(order.status==='approved'||order.status==='shortfall') return order
  if(order.status==='submitted') {
   const selected=await account(env.DB,actor,order.accountId)
   requireActiveAccount(selected)
   if(selected.revision!==order.accountRevision) fail('PRICE_CHANGED','The account changed. Prepare and submit a new draft before approval.')
   await assertCurrentPricing(env,selected,order)
   order=await save(env,actor,{...order,status:'reserving',approvedBy:actor.id,approvedAt:(await now()).toISOString()},'order.approved',[activeAccountGuard(env.DB,selected)])
  }
  if(order.status!=='reserving') fail('APPROVAL','The customer must review and submit this draft first.')
  // Current approver authority must still hold before an external stock effect.
  const approver=await env.DB.prepare("SELECT id FROM oa_operators WHERE id=? AND status='active' AND role IN ('owner','admin')").bind(order.approvedBy!).first()
  if(!approver) fail('APPROVAL_REVOKED','The recorded approver no longer has authority.')
  const result=await reserveOrder(env,order.id,order.pierCustomerId,order.lines,order.requestedDate)
  return recordReservation(env,actor,order,result)
 }
 if(type==='order.refresh') {
  if(!order.pierOrderId) fail('RESERVATION','Approve this order or retry its pending approval first.')
  if(order.status==='approved'||order.status==='cancelled') return order
  if(order.status==='releasing') {
   const upstream=await pierOrder(env,order)
   return released(upstream) ? recordRelease(env,actor,order,upstream) : order
  }
  const state=await pierState(env),result=state.orders.find((o:any)=>o.id===order.pierOrderId)
  if(!result) fail('PIER_ORDER','The recorded Pier order is missing. Check the stock desk.')
  return recordReservation(env,actor,order,result)
 }
 if(type==='order.cancel') {
  // STK-004: cancelling an allocated, unshipped order asks Pier to release its stock; only Pier's acknowledgment clears it.
  if(order.status==='cancelled') return order
  if(order.status==='approved'||order.status==='shortfall') {
   const reason=text(p.reason,'Cancellation reason',160)
   const upstream=await pierOrder(env,order)
   if(upstream.lines.some((l:any)=>decimal(l.dispatched)>0n)) fail('SHIPPED','Pier has dispatched units on this order. Shipped units cannot be cancelled; return them instead.')
   const held=upstream.lines.filter((l:any)=>decimal(l.reserved)>0n).map((l:any)=>({itemId:l.itemId,quantity:l.reserved}))
   order=await save(env,actor,{...order,status:'releasing',release:{reason,requestedBy:actor.id,requestedAt:(await now()).toISOString(),held}},'order.release-requested')
  }
  if(order.status!=='releasing') fail('CANCEL','Only an approved or short order holding Pier stock can be cancelled here.')
  return recordRelease(env,actor,order,await releaseOrder(env,order))
 }
 fail('NOT_FOUND','Unknown order command.',404)
}

async function prepareOrder(env:Bindings,actor:Actor,p:any,context?:Awaited<ReturnType<typeof reviewReorder>>) {
  const selected=context?.selected ?? await account(env.DB,actor,text(p.accountId,'Account'))
  requireActiveAccount(selected)
  if(!Array.isArray(p.lines)||!p.lines.length||p.lines.length>100) fail('LINES','Choose between one and 100 lines.',400)
  const available=context?.available ?? await catalogue(env,selected)
  const today=supplierDate(await now()),lines=prepareLines(p.lines,available.items,today).map((line,index)=>({...line,...buyerSku(p.lines[index])})),details=purchaseDetails(p,today)
  const totalCents=lines.reduce((sum,line)=>sum+line.lineCents!,0)
  if(!Number.isSafeInteger(totalCents)) fail('MONEY','Order total is outside the supported exact-cent range.',400)
  if(totalCents<selected.value.minimumCents) fail('MINIMUM','The order is below this customer’s minimum order value.')
  // Preparing from a draft replaces it: the old draft is marked superseded by this one, so it leaves Drafts and is never offered again.
  const replaced=p.replaces===undefined?undefined:await readOrder(env.DB,actor,text(p.replaces,'Replaced draft',100))
  if(replaced) {
   requirePerson(actor)
   if(replaced.accountId!==selected.id) fail('REPLACES','A draft can only be replaced by an order for the same trade account.',400)
   if(replaced.status!=='draft') fail('REPLACES','This draft was already submitted or replaced. Refresh your orders.')
  }
  // ACC-003: the chosen (or default) bill-to and ship-to are copied whole; later location edits never reach this order.
  const billTo=await locationSnapshot(env.DB,selected,'bill-to',p.billToId),shipTo=await locationSnapshot(env.DB,selected,'ship-to',p.shipToId)
  const id=await nextNumber(env.DB),revision=crypto.randomUUID()
  const order:Order={id,accountId:selected.id,accountRevision:selected.revision,customerName:selected.value.name,pierCustomerId:selected.value.pierCustomerId,pierOrigin:(await pierOrigin(env))!,reference:p.reference?text(p.reference,'Customer reference',100):'',...details,...(replaced?.document?{document:replaced.document}:{}),...(p.deliveryLocation?{deliveryLocation:text(p.deliveryLocation,'Delivery location',240)}:{}),...(billTo?{billTo}:{}),...(shipTo?{shipTo}:{}),...(context?{reorderedFrom:context.review.orderId,reorderReview:{fingerprint:context.review.fingerprint,acknowledgedBy:actor.id,acknowledgedAt:(await now()).toISOString(),differences:context.review}}:{}),lines,totalCents,currency:available.currency,termsDays:selected.value.termsDays,status:'draft',...(replaced?{replaces:replaced.id}:{}),preparedBy:actorLabel(actor),preparedAt:(await now()).toISOString(),revision}
  const retired=crypto.randomUUID()
  const supersede=replaced?[env.DB.prepare('UPDATE bw_orders SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify({...replaced,status:'superseded',supersededBy:id,revision:retired}),retired,replaced.id,replaced.revision),changed(env.DB),audit(env.DB,actor,replaced.id,'order.superseded',{accountId:selected.id,orderId:replaced.id,revision:retired,source:'order.prepare',reason:`Replaced by newly reviewed draft ${id}.`})]:[]
  await commit(env.DB,actor,[activeAccountGuard(env.DB,selected),env.DB.prepare('INSERT INTO bw_orders VALUES(?,?,?,?)').bind(id,selected.id,JSON.stringify(order),revision),audit(env.DB,actor,id,'order.prepared',{accountId:selected.id,orderId:id,revision,source:context?'order.reorder':'order.prepare',reason:context?`Prepared from acknowledged comparison of ${context.review.orderId}.`:'Prepared a current-price draft; no stock reserved.'}),...(replaced?.document?[carryDocument(env,replaced.id,id)]:[]),...supersede])
  return order
}
