import { applyPromotions, promotionSettings } from './promotions'
import { resolveBuyingProfile, orderBuyingProfile, buyingOrderGuards } from './buying-profiles'
import { deltaEntryGuard, deltaMutationGuard } from './imports/delta-entry'
import { linkedReplacementGuard } from './proposal-approval'
import { readStaffGrant,staffAccountAllowed } from './staff-policy'
import { companySubmission } from './company-purchase'
import { companyOrderRead } from './company-access'
import { routeDecision,decidedEntry } from './company-approval'
import { activeBuyerExists, companyRightsGuard, requireCompanyRight, requireCompanyApproval } from './company-policy'
import { commissionSnapshot } from './commission-rules'
import { confirmationStatements, type LineChange } from './confirmations'
import { emailLatestConfirmation } from './confirmation-mail'
import { revisedOrder } from './order-revisions'
import { withVariantAttributes } from './variant-attributes'
import type { Bindings } from '../auth.server'
import { account } from './accounts'
import { audit,changed,commit } from './access'
import { catalogue,reserveOrder,pierState,pierOrigin,fullyReserved,pierOrder,releaseOrder,released,decimal } from './pier'
import { fail,text,Problem,requirePerson,requireSupplier,actorLabel,supplier,supplierDate,type Actor,type Order,type Account } from './model'
import { activeAccountGuard, requireActiveAccount } from './account-profile'
import { now } from './clock'
import { reviewReorder } from './reorders'
import { conversionSnapshot } from './currency'
import { priceLine } from './pricing'
import { sellingUnits } from './units'
import { prepareLines } from './unit-lines'
import { purchaseDetails, buyerSku, purchaseRelease, lineWindow, promiseDate } from './purchase'
import { readDocument, documentStatement, carryDocument } from './documents'
import { locationSnapshot } from './locations'
import { acceptDelivery, deliveryTotal, freightQuote, selectDelivery, shippingGuard } from './shipping'
import { freshnessLimit, staleStock } from './freshness'
import { termsAtSubmission, termsAtCompanyRelease } from './sales-terms'
import { approvalNoticeStatements } from './approval-notices'
export async function readOrder(db:D1Database,actor:Actor,id:string):Promise<Order> {
 const row=await db.prepare('SELECT value_json,revision FROM bw_orders WHERE id=?').bind(id).first<any>()
 if(!row) fail('NOT_FOUND','Order not found.',404)
 const order={...JSON.parse(row.value_json),revision:row.revision}
 await account(db,actor,order.accountId)
 await companyOrderRead(db,actor,order)
 return order
}
// AUTO-002: what a transition does to approval notices and the supplier's approval task, in the same batch.
const noticeClosing:Record<string,string>={'order.company-step-approved':'The step was decided; the request moved to its next step.','order.company-approved':'Company approval released the request to the supplier.','order.company-withdrawn':'The request was withdrawn to a draft; every approval so far is void.','order.company-approval-voided':'A material change voided the approvals; the request is a draft again.'}
async function approvalEffects(env:Bindings,order:Order,action:string) {
 const notices=action.startsWith('order.company-')||order.status==='awaiting-company-approval'?await approvalNoticeStatements(env.DB,order,await now(),noticeClosing[action]??`The request is now ${order.status}.`):[]
 const task=action==='order.approved'?[env.DB.prepare("UPDATE bw_followups SET value_json=json_set(value_json,'$.status','closed','$.resolution',?),revision=? WHERE id=? AND json_extract(value_json,'$.status')='open'").bind('Supplier approved the order; its approval task is resolved.',crypto.randomUUID(),`approval:${order.id}`)]:[]
 return [...notices,...task]
}
async function save(env:Bindings,actor:Actor,order:Order,action:string,guards:D1PreparedStatement[]=[],reason?:string,changes?:LineChange[]) {
 const previous=order.revision,next=crypto.randomUUID(); order={...order,revision:next}
 const confirmations = ['order.submitted','order.submitted-release','order.company-approved','order.approved','order.revised'].includes(action) ? await confirmationStatements(env.DB,actor,order,action==='order.approved'?'accepted':action==='order.revised'?'revised':'submitted',changes) : []
 await commit(env.DB,actor,[await deltaMutationGuard(env.DB,order.accountId),...(['order.submitted','order.submitted-release','order.company-approved'].includes(action)?[await deltaEntryGuard(env.DB,order.accountId)]:[]),...guards,...(['order.submitted','order.submitted-release','order.company-approved','order.company-approval-requested','order.approved','order.revised','shipping.selected'].includes(action)?await buyingOrderGuards(env.DB,actor,order):[]),...confirmations,...await approvalEffects(env,order,action),env.DB.prepare('UPDATE bw_orders SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify(order),next,order.id,previous),changed(env.DB),audit(env.DB,actor,order.id,action,{accountId:order.accountId,orderId:order.id,revision:next,source:'order.command',reason:reason??({
  'order.submitted':'Buyer submitted the prepared commercial snapshot for supplier review.',
  'order.document-attached':'Attached the supporting PO document to the draft.',
  'order.submitted-release':'Submitted as an explicitly authorized numbered release of a PO already on order.',
  'order.approved':'Supplier approved the submitted revision for stock reservation.',
  'order.reserved':'Pier acknowledged reservation of every requested unit.',
  'order.shortfall':'Pier acknowledged a stock shortfall; invoicing remains blocked.',
  'order.release-requested':'Supplier cancelled the order; its Pier stock release is requested and the units stay unpromised until Pier confirms.',
  'order.released':'Pier acknowledged the stock release; the cancelled order holds no stock.',
 } as Record<string,string>)[action]??action})])
 if(confirmations.length)await emailLatestConfirmation(env,order.id)
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
/** A waiting request returns to an unsubmitted draft; nothing it was approved on carries over. */
function backToDraft(order:Order):Order {
 const {companyPreparedBy,companyRequestedAt,approvalRoute,submittedBy,termsAcceptance,poRelease,...rest}=order
 return {...rest,status:'draft'}
}
async function voidApproval(env:Bindings,actor:Actor,order:Order,reason:string) {
 await save(env,actor,{...backToDraft(order),approvalVoided:{at:(await now()).toISOString(),reason}},'order.company-approval-voided',[],`A material change voided the approvals on this request: ${reason}`)
}
/** The ship-to snapshot must still be the company's current location, unedited and unarchived. */
async function assertSameAddress(db:D1Database,order:Order) {
 if(!order.shipTo)return
 const row=await db.prepare('SELECT revision,archived FROM bw_locations WHERE id=?').bind(order.shipTo.id).first<{revision:string;archived:number}>()
 if(!row||row.archived||row.revision!==order.shipTo.revision)fail('ADDRESS_CHANGED','The ship-to address changed after this request was prepared. The purchaser must prepare a new draft.')
}
async function assertCurrentPricing(env:Bindings,actor:Actor,selected:Account,order:Order,submission=false) {
 // PRI-007: read current Pier at every admission. Submission revalidates the whole cart;
 // approval checks current commercial terms, then Pier's reservation is authoritative for stock shortfalls.
 selected=(await orderBuyingProfile(env.DB,actor,selected,order)).selected
 const offers=await catalogue(env,selected),date=supplierDate(await now())
 const repriced=applyPromotions(prepareLines(order.lines,offers.items,date,false),(await promotionSettings(env.DB)).offers,selected.id,date)
 if(!order.quote&&JSON.stringify(repriced.map(l=>[l.lineCents,l.promotion]))!==JSON.stringify(order.lines.map(l=>[l.lineCents,l.promotion])))fail('PRICE_CHANGED','Promotion eligibility or precedence changed. Prepare a new draft for review.')
 for(const line of order.lines){
  const offer=offers.items.find(item=>item.sku===line.sku),unit=offer?sellingUnits(offer).find(unit=>unit.code===(line.unit??offer.unit)):undefined
  if(!unit)fail('PRICE_CHANGED','An item or selling unit changed. Prepare a new draft for review.')
  // ORD-004: a quoted line's negotiated price applies to its PRI-002 basis, which must still be the current rule.
  const current=priceLine(line.quantity,unit.unitCents,unit.pricing,date),basis=line.quote?{unitCents:line.quote.basisUnitCents,lineCents:line.quote.basisLineCents}:{...line,lineCents:line.promotion?priceLine(line.quantity,unit.unitCents,unit.pricing,date).lineCents:line.lineCents}
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
  return prepareOrder(env,actor,{accountId:context.selected.id,profileId:context.selected.buyingProfile?.id,reference:p.reference,deliveryLocation:context.review.deliveryLocation,shipToId:context.review.shipToId,lines:context.review.lines.map(line=>({sku:line.sku,unit:line.unit,quantity:line.quantity}))},context)
 }
 if(type==='order.prepare') return prepareOrder(env,actor,p)
 requirePerson(actor)
 let order=await readOrder(env.DB,actor,text(p.orderId,'Order'))
 if(['order.submit','order.attach','shipping.select','order.revise'].includes(type))await requireCompanyRight(env.DB,actor,order.accountId,'purchaser',order.shipTo?.id)
 if(type==='order.company-approve') {
  if(order.status!=='awaiting-company-approval')fail('COMPANY_APPROVAL','This order is not awaiting company approval.')
  if(p.revision!==order.revision)fail('CHANGED','Refresh the exact order before company approval.')
  if(order.preparedBy===actor.id)fail('SELF_APPROVAL','The preparer cannot approve their own order.',403)
  // ACC-007: the frozen route names this step's approvers, delegates and escalation people, in order and one person per step.
  const decision=order.approvalRoute?await routeDecision(env.DB,actor,order as Order&{approvalRoute:NonNullable<Order['approvalRoute']>}):null
  const approval=await requireCompanyApproval(env.DB,actor,{...order,preparedBy:order.companyPreparedBy??order.preparedBy})
  const selected=(await orderBuyingProfile(env.DB,actor,await account(env.DB,actor,order.accountId),order)).selected;requireActiveAccount(selected)
  try {
   if(selected.revision!==order.accountRevision)fail('PRICE_CHANGED','The account changed. The purchaser must prepare a new draft.')
   await assertCurrentPricing(env,actor,selected,order,true)
   await assertSameAddress(env.DB,order)
  } catch(error) {
   // A material price or address change voids every approval so far: the request returns to a draft for a fresh review.
   if(error instanceof Problem&&['PRICE_CHANGED','ADDRESS_CHANGED'].includes(error.code)) await voidApproval(env,actor,order,error.message)
   throw error
  }
  const stale=staleStock(order,await freshnessLimit(env.DB),await now());if(stale)fail('STOCK_STALE',stale)
  const at=(await now()).toISOString(),entry=decision?decidedEntry(decision,actor,at):null,route=order.approvalRoute&&entry?{...order.approvalRoute,decided:[...order.approvalRoute.decided,entry]}:undefined
  const how=decision?`${decision.via==='delegate'?` as delegate for ${decision.delegatedFrom}`:decision.via==='escalation'?' by escalation':''}`:''
  if(decision&&!decision.last)return save(env,actor,{...order,approvalRoute:{...route!,stepRequestedAt:at}},'order.company-step-approved',[approval.guard,approval.preparerGuard,activeAccountGuard(env.DB,selected),shippingGuard(env.DB,order.delivery)],`Step ${decision.step} (${decision.label}) approved${how}: ${text(p.reason,'Company approval reason',1000)}`)
  const release=await purchaseRelease(env.DB,actor,order,p.release,at),terms=await termsAtCompanyRelease(env,actor,selected,order,p.termsAcceptance,at)
  return save(env,actor,{...order,status:'submitted',...(route?{approvalRoute:route}:{}),...(release.poRelease?{poRelease:release.poRelease}:{}),companyApprovedBy:actor.id,companyApprovedAt:at,...(terms.acceptance?{termsAcceptance:terms.acceptance}:{})},'order.company-approved',[release.guard,approval.guard,approval.preparerGuard,activeAccountGuard(env.DB,selected),shippingGuard(env.DB,order.delivery),terms.guard,...terms.statements],`${decision?`Final step ${decision.step} (${decision.label}) approved${how}: `:''}${text(p.reason,'Company approval reason',1000)}`)
 }
 if(type==='order.withdraw') {
  if(order.status!=='awaiting-company-approval')fail('COMPANY_APPROVAL','Only a request waiting for company approval can be withdrawn.')
  if(p.revision!==order.revision)fail('CHANGED','Refresh the exact order before withdrawing it.')
  const member=await requireCompanyRight(env.DB,actor,order.accountId,'purchasing')
  if(!member||member.userId!==order.companyPreparedBy&&!member.rights.includes('administrator'))fail('FORBIDDEN','Only the person who submitted this request or a company administrator can withdraw it.',403)
  return save(env,actor,backToDraft(order),'order.company-withdrawn',[companyRightsGuard(env.DB,member)],`Withdrew the unapproved request; every approval so far is void and a resubmission needs fresh approval: ${text(p.reason,'Withdrawal reason',1000)}`)
 }
 if(type==='shipping.select' || type==='shipping.quote') {
  if(order.status!=='draft')fail('SHIPPING_LOCKED','Delivery changes require a new reviewed draft.')
  const selected=(await orderBuyingProfile(env.DB,actor,await account(env.DB,actor,order.accountId),order)).selected,context={currency:order.currency??'AUD',account:selected,lines:order.lines,shipTo:order.shipTo,quotes:order.freightQuotes}
  if(type==='shipping.quote') {
   const quoted=await freightQuote(env,actor,context,p)
   return save(env,actor,{...order,delivery:undefined,totalCents:deliveryTotal(order.lines),freightQuotes:[...(order.freightQuotes??[]),quoted]},'shipping.quoted',[],`Merchant freight quote: ${quoted.cents} USD cents; ${quoted.reason}`)
  }
  const delivery=await selectDelivery(env,context,p)
  return save(env,actor,{...order,delivery,totalCents:deliveryTotal(order.lines,delivery)},'shipping.selected',[],'Selected delivery for review; buyer acceptance is still required at submission.')
 }
 if(type==='order.submit') {
  if(order.status!=='draft') return order
  const selected=(await orderBuyingProfile(env.DB,actor,await account(env.DB,actor,order.accountId),order)).selected
  requireActiveAccount(selected)
  if(selected.revision!==order.accountRevision) fail('PRICE_CHANGED','The price list or terms changed. Prepare a new draft for review.')
  await assertCurrentPricing(env,actor,selected,order,true)
  const stale=staleStock(order,await freshnessLimit(env.DB),await now())
  if(stale) fail('STOCK_STALE',stale)
  if(order.delivery && (['owner','admin'].includes(actor.role)||actor.staff))fail('BUYER_REQUIRED','The account buyer must accept the final delivery before ordering.',403)
  // REP-001: a rep prepares for the buyer's approval. Where the account has a signed-in buyer, that buyer submits, so the company's own limits and approvers apply and a rep cannot stand in for them.
  if(actor.staff&&await activeBuyerExists(env.DB,order.accountId))fail('BUYER_REQUIRED','This account has a buyer. Your prepared order waits for the buyer to review and submit it under the company’s own approval policy.',403)
  const delivery=await acceptDelivery(env,actor,{currency:order.currency??'AUD',account:selected,lines:order.lines,shipTo:order.shipTo,quotes:order.freightQuotes},order.delivery,p.deliveryAcknowledged)
  const at=(await now()).toISOString(),release=await purchaseRelease(env.DB,actor,order,p.release,at),terms=await termsAtSubmission(env,actor,selected,order.id,p.termsAcceptance,at)
  const submission=await companySubmission(env,actor,{...order,delivery,totalCents:deliveryTotal(order.lines,delivery),status:'submitted',submittedBy:actor.id,...(release.poRelease?{poRelease:release.poRelease}:{}),...(terms.acceptance?{termsAcceptance:terms.acceptance}:{})})
  return save(env,actor,submission.order,submission.waiting?'order.company-approval-requested':release.poRelease?'order.submitted-release':'order.submitted',[submission.guard,activeAccountGuard(env.DB,selected),shippingGuard(env.DB,delivery),release.guard,terms.guard,...terms.statements],terms.acceptance?`Buyer submitted the prepared commercial snapshot for supplier review, with sales terms "${terms.acceptance.series}" version ${terms.acceptance.version} accepted (${terms.acceptance.how==='buyer'?'buyer acceptance in the portal':'on-device signature captured by supplier staff'}).`:undefined)
 }
 if(type==='order.revise') {
  const revision=await revisedOrder(env,actor,order,p)
  return save(env,actor,revision.order,'order.revised',revision.guards,revision.reason,revision.changes)
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
  await linkedReplacementGuard(env,actor,order)
  if(order.fromSubstitution) {
   const original=await readOrder(env.DB,actor,order.fromSubstitution.orderId),offer=original.substitutions?.find(offer=>offer.number===order.fromSubstitution!.number)
   if(original.status!=='cancelled'||!original.release?.confirmedAt||offer?.status!=='accepted'||offer.replacementId!==order.id)fail('SUBSTITUTION_RELEASE','Confirm the original stock release before reserving the accepted replacement.')
  }
  if(order.status==='approved'||order.status==='shortfall') return order
  if(order.status==='submitted') {
   const selected=(await orderBuyingProfile(env.DB,actor,await account(env.DB,actor,order.accountId),order)).selected
   requireActiveAccount(selected)
   if(selected.revision!==order.accountRevision) fail('PRICE_CHANGED','The account changed. Prepare and submit a new draft before approval.')
   await assertCurrentPricing(env,actor,selected,order)
   const approvedAt=(await now()).toISOString(), commissions=await commissionSnapshot(env.DB,selected,order,approvedAt)
   order=await save(env,actor,{...order,status:'reserving',approvedBy:actor.id,approvedAt},'order.approved',[activeAccountGuard(env.DB,selected),commissions.guard,env.DB.prepare('INSERT INTO bw_order_commissions(order_id,value_json) VALUES(?,?)').bind(order.id,JSON.stringify(commissions.snapshot))])
  }
  if(order.status!=='reserving') fail('APPROVAL','The customer must review and submit this draft first.')
  // Current approver authority must still hold before an external stock effect.
  const approver=await env.DB.prepare("SELECT id,email,role,version FROM oa_operators WHERE id=? AND status='active'").bind(order.approvedBy!).first<any>()
  if(approver&&!['owner','admin'].includes(approver.role)){
   const grant=await readStaffGrant(env.DB,{...approver,agent:false})
   if(!grant||!['sales-manager','operations'].includes(grant.role)||grant.warehouses!=='all'||!staffAccountAllowed(grant,order.accountId))fail('APPROVAL_REVOKED','The recorded approver no longer has authority.')
  }
  if(!approver) fail('APPROVAL_REVOKED','The recorded approver no longer has authority.')
  const result=await reserveOrder(env,order.id,order.pierCustomerId,order.lines,promiseDate(order))
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
  const base=context?.selected ?? await account(env.DB,actor,text(p.accountId,'Account'))
  const profile=await resolveBuyingProfile(env.DB,actor,base,p.profileId??base.buyingProfile?.id),selected=profile.selected
  requireActiveAccount(selected)
  const sheet=p.lineSheetId===undefined?undefined:await (await import('./line-sheets')).sheetForOrder(env,actor,p,selected)
  const entryGuard=await deltaEntryGuard(env.DB,selected.id)
  const member=await requireCompanyRight(env.DB,actor,selected.id,'purchaser')
  if(!Array.isArray(p.lines)||!p.lines.length||p.lines.length>100) fail('LINES','Choose between one and 100 lines.',400)
  if(p.lines.some((line:any)=>line.profileId!==undefined&&line.profileId!==(selected.buyingProfile?.id??'')||line.brandId!==undefined&&line.brandId!==selected.buyingProfile?.brandId))fail('SELLER_MIX','Every cart line must belong to its selected buying profile.')
  const available=context?.available ?? await catalogue(env,selected)
  const today=supplierDate(await now()),unpromoted=await withVariantAttributes(env.DB,prepareLines(p.lines,available.items,today).map((line,index)=>({...line,...buyerSku(p.lines[index]),...lineWindow(p.lines[index],today)}))),details=purchaseDetails(p,today)
  const lines=applyPromotions(unpromoted,(await promotionSettings(env.DB)).offers,selected.id,today)
  const totalCents=lines.reduce((sum,line)=>sum+line.lineCents!,0)
  if(!Number.isSafeInteger(totalCents)) fail('MONEY','Order total is outside the supported exact-cent range.',400)
  if(totalCents<selected.value.minimumCents) fail('MINIMUM','The order is below this customer’s minimum order value.')
  // Preparing from a draft replaces it: the old draft is marked superseded by this one, so it leaves Drafts and is never offered again.
  const replaced=p.replaces===undefined?undefined:await readOrder(env.DB,actor,text(p.replaces,'Replaced draft',100))
  if(replaced) {
   requirePerson(actor)
   if((replaced.buyingProfile?.id??'')!==(selected.buyingProfile?.id??''))fail('SELLER_MIX','A cart cannot mix buying profiles or sellers. Start a separate cart.')
   if(replaced.accountId!==selected.id) fail('REPLACES','A draft can only be replaced by an order for the same trade account.',400)
   if(!['draft','awaiting-company-approval'].includes(replaced.status)) fail('REPLACES','This draft was already submitted or replaced. Refresh your orders.')
  }
  // ACC-003: the chosen (or default) bill-to and ship-to are copied whole; later location edits never reach this order.
  const billTo=await locationSnapshot(env.DB,selected,'bill-to',p.billToId),shipTo=await locationSnapshot(env.DB,selected,'ship-to',p.shipToId)
  await requireCompanyRight(env.DB,actor,selected.id,'purchaser',shipTo?.id)
  if(member&&member.locations!=='all'&&!shipTo)fail('FORBIDDEN','Choose one of your permitted ship-to locations.',403)
  const id=await nextNumber(env.DB),revision=crypto.randomUUID()
  const order:Order={usdConversion:conversionSnapshot(selected,await now()),...(selected.buyingProfile?{buyingProfile:selected.buyingProfile}:{}),id,accountId:selected.id,accountRevision:selected.revision,customerName:selected.value.name,pierCustomerId:selected.value.pierCustomerId,pierOrigin:(await pierOrigin(env))!,reference:p.reference?text(p.reference,'Customer reference',100):'',...details,...(replaced?.document?{document:replaced.document}:{}),...(p.deliveryLocation?{deliveryLocation:text(p.deliveryLocation,'Delivery location',240)}:{}),...(billTo?{billTo}:{}),...(shipTo?{shipTo}:{}),...(context?{reorderedFrom:context.review.orderId,reorderReview:{fingerprint:context.review.fingerprint,acknowledgedBy:actor.id,acknowledgedAt:(await now()).toISOString(),differences:context.review}}:{}),lines,totalCents,...(selected.value.priceDisplay?{priceDisplay:selected.value.priceDisplay}:{}),...(sheet?{lineSheet:{id:sheet.id,revision:sheet.revision},season:sheet.season}:{}),currency:available.currency,termsDays:selected.value.termsDays,status:'draft',...(replaced?{replaces:replaced.id}:{}),preparedBy:actorLabel(actor),...(supplier(actor)&&!actor.agent?{preparedAs:(actor.staff?.role??actor.role) as NonNullable<Order['preparedAs']>}:{}),preparedAt:(await now()).toISOString(),revision}
  const retired=crypto.randomUUID()
  const supersede=replaced?[env.DB.prepare('UPDATE bw_orders SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify({...replaced,status:'superseded',supersededBy:id,revision:retired}),retired,replaced.id,replaced.revision),changed(env.DB),audit(env.DB,actor,replaced.id,'order.superseded',{accountId:selected.id,orderId:replaced.id,revision:retired,source:'order.prepare',reason:`Replaced by newly reviewed draft ${id}.`}),env.DB.prepare('UPDATE bw_approval_notices SET closed_at=?,closed_reason=? WHERE order_id=? AND closed_at IS NULL').bind(new Date().toISOString(),`Superseded by revised request ${id}; it needs fresh approval at every step.`,replaced.id)]:[]
  await commit(env.DB,actor,[profile.guard,entryGuard,companyRightsGuard(env.DB,member),activeAccountGuard(env.DB,selected),...(sheet?[env.DB.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_line_sheets WHERE id=? AND revision=? AND json_extract(value_json,'$.state')='published') THEN 1 ELSE 0 END").bind(sheet.id,sheet.revision)]:[]),env.DB.prepare('INSERT INTO bw_orders VALUES(?,?,?,?)').bind(id,selected.id,JSON.stringify(order),revision),audit(env.DB,actor,id,'order.prepared',{accountId:selected.id,orderId:id,revision,source:context?'order.reorder':'order.prepare',reason:context?`Prepared from acknowledged comparison of ${context.review.orderId}.`:'Prepared a current-price draft; no stock reserved.'}),...(replaced?.document?[carryDocument(env,replaced.id,id)]:[]),...supersede])
  return order
}
