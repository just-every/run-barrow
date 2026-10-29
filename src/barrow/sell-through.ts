import type { Bindings } from '../auth.server'
import { account } from './accounts'
import { resolveBuyingProfile, type BuyingProfileSnapshot } from './buying-profiles'
import { digest } from './access'
import { parseCsv } from './cart-csv'
import { now } from './clock'
import { companyRightsGuard, requireCompanyRight } from './company-policy'
import { companyOrderScope } from './company-access'
import { fail, integer, requirePerson, supplier, supplierDate, text, type Actor, type Order } from './model'
import { catalogue, decimal, format, pierOrigin, pierState } from './pier'
import { prepareLines } from './unit-lines'
import { sellingUnits } from './units'
import { applyPromotions, promotionSettings } from './promotions'
import { creditRecords } from './credit-ledger'

export type SellThroughAcceptance = {
 key: string; requestHash: string; fingerprint: string; acceptedBy: string; acceptedAt: string
 requestedDate: string; totalCents: number; contact?: {nextContactDate: string; reviewedBy: string; reviewedAt: string}; review: SellThroughReview; guards: D1PreparedStatement[]
}
export type SellThroughReview = {
 accountId: string; accountRevision: string; buyingProfile?: BuyingProfileSnapshot; feedSha256: string; observedOn: string; requestedDate: string
 horizonDays: number; seasonalityBps: number; budgetCents: number; currency: string; totalCents: number
 sourceOrders: {id: string; revision: string}[]; cadenceDays: number|null
 lines: {sku: string; unit: string; sold: number|null; observedDays: number; onHand: number; openBaseQuantity: string; demand: number|null; suggested: number|null; quantity: number; explanation: string}[]
 blockers: string[]; fingerprint: string
 provenance: {runId: string; model: string; tools: string[]; paidCostCents: number; contacts: number; authority: string}
}
export function sellThroughDate(value: unknown, name: string) {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)fail('INPUT',`${name} must be a real YYYY-MM-DD date.`,400)
 return value
}
const orderSnapshot = "SELECT COALESCE(json_group_array(json_array(id,revision)), '[]') AS value FROM (SELECT id,revision FROM bw_orders WHERE account_id=? ORDER BY id)"
export async function sellThroughBuyer(env: Bindings, actor: Actor, accountId: string) {
 requirePerson(actor)
 // Supplier identity is never permission to authorize a buyer's POS data.
 if(supplier(actor))fail('FORBIDDEN','The account buyer must explicitly authorize their own sell-through export.',403)
 const selected=await account(env.DB,actor,accountId)
 const member=await requireCompanyRight(env.DB,actor,selected.id,'purchaser')
 return {selected,member}
}
export async function sellThroughReview(env: Bindings, actor: Actor, p: any) {
 const {selected:base,member}=await sellThroughBuyer(env,actor,text(p.accountId,'Account'))
 const profile=await resolveBuyingProfile(env.DB,actor,base,p.profileId),selected=profile.selected
 if(p.authorized!==true)fail('SELLTHROUGH_CONSENT','Explicitly authorize this account’s POS export for this calculation.',403)
 const today=supplierDate(await now()),observedOn=sellThroughDate(p.observedOn,'Stock observation date'),requestedDate=sellThroughDate(p.requestedDate,'Requested replenishment date')
 const age=(Date.parse(today)-Date.parse(observedOn))/86400000
 if(age<0||age>7)fail('SELLTHROUGH_STALE','Use a stock observation from the last seven calendar days.')
 if(requestedDate<today)fail('INPUT','Choose today or a later replenishment date.',400)
 const horizonDays=integer(p.horizonDays,'Demand horizon days',1,366),seasonalityBps=integer(p.seasonalityBps,'Buyer seasonality basis points',1,50000),budgetCents=integer(p.budgetCents,'Merchandise budget cents',0,1000000000)
 const csv=text(p.csv,'POS export CSV',256*1024),[header,...rows]=parseCsv(csv)
 if(JSON.stringify(header)!==JSON.stringify(['sku','unit','sold','observedDays','onHand','status'])||!rows.length||rows.length>100)fail('SELLTHROUGH_CSV','Use the documented six-column POS export with one to 100 rows.',400)
 const scope=companyOrderScope({...actor,company:member!})
 const scopedSnapshot=orderSnapshot.replace('WHERE account_id=?','WHERE account_id=?'+scope.sql)
 const available=await catalogue(env,selected),snapshot=(await env.DB.prepare(scopedSnapshot).bind(selected.id,...scope.values).first<{value:string}>())!.value
 const orders=(await env.DB.prepare('SELECT value_json FROM bw_orders WHERE account_id=?'+scope.sql+' ORDER BY id').bind(selected.id,...scope.values).all<{value_json:string}>()).results.map(row=>JSON.parse(row.value_json) as Order)
 const open=orders.filter(order=>['submitted','awaiting-company-approval','reserving','shortfall','approved','releasing'].includes(order.status))
 // Pier is the only stock authority, including dispatched and cancelled commitments.
 const state=await pierState(env),origin=await pierOrigin(env)
 const blockers:string[]=[],seen=new Set<string>(),seenSkus=new Set<string>()
 const selections=p.selections===undefined?null:p.selections
 if(selections!==null&&(!Array.isArray(selections)||selections.length>100))fail('LINES','Supply at most 100 edited quantities.',400)
 const edits=new Map<string,number>()
 for(const line of selections??[]) {
  const key=JSON.stringify([text(line.sku,'SKU',100),text(line.unit,'Unit',32)])
  if(edits.has(key))fail('LINES','Edit each SKU and unit only once.',400)
  edits.set(key,integer(line.quantity,'Chosen quantity',0,1000000))
 }
 const lines=rows.map((row,index)=>{
  if(row.length!==6)fail('SELLTHROUGH_CSV',`Row ${index+2}: supply exactly six cells.`,400)
  const [sku,unit,sales,days,stock,status]=row.map(value=>value.trim()),key=JSON.stringify([sku,unit])
  if(seenSkus.has(sku))fail('SELLTHROUGH_CSV','Each SKU appears once with one declared selling unit.',400)
  seen.add(key);seenSkus.add(sku)
  const offer=available.items.find(item=>item.sku===sku),basis=offer&&sellingUnits(offer).find(value=>value.code===unit)
  if(!basis)fail('SELLTHROUGH_SKU',`Row ${index+2}: choose an entitled SKU and defined selling unit.`,400)
  const number=(value:string,name:string,min=0,max=1000000)=>/^\d+$/.test(value)?integer(Number(value),name,min,max):fail('SELLTHROUGH_CSV',`Row ${index+2}: ${name} must be a whole number.`,400)
  const observedDays=number(days,'Observed days',1,366),onHand=number(stock,'Stock on hand')
  if(!['complete','outage'].includes(status)||status==='outage'&&sales!=='')fail('SELLTHROUGH_CSV','An outage has an empty sold cell; complete observations name sold units.',400)
  const sold=status==='outage'?null:number(sales,'Sold units')
  let pending=0n
  for(const order of open)for(const line of order.lines.filter(line=>line.sku===sku)) {
   // Count every open prebook, even one due after the selected date: it is already committed supply.
   if(!order.pierOrderId)pending+=decimal(line.baseQuantity??String(line.quantity))
   else {
    const upstream=order.pierOrigin===origin?state.orders?.find((value:any)=>value.id===order.pierOrderId):undefined
    const source=upstream?.lines?.find((value:any)=>value.itemId===line.itemId)
    if(!source)fail('SELLTHROUGH_SOURCE','An open commitment has no matching live Pier line; its supply is unknown.')
    // Orders can contain two selling units for one stock item; count Pier's aggregate once.
    if(order.lines.find(value=>value.itemId===line.itemId)!==line)continue
    const remaining=decimal(source.quantity)-decimal(source.dispatched)-decimal(source.cancelled)
    if(remaining<0n)fail('SELLTHROUGH_SOURCE','Open source quantities do not reconcile.')
    pending+=remaining
   }
  }
  const conversion=decimal(basis.baseQuantity),denominator=BigInt(observedDays)*10000n
  const demand=sold===null?null:Number((BigInt(sold)*BigInt(horizonDays)*BigInt(seasonalityBps)+denominator-1n)/denominator)
  const needed=demand===null?null:BigInt(Math.max(0,demand-onHand))*conversion-pending
  const suggested=needed===null?null:Number(needed<=0n?0n:(needed+conversion-1n)/conversion)
  const quantity=edits.get(key)??suggested??0
  if(demand===null&&quantity>0&&p.acknowledgedOutage!==true)blockers.push(`${sku}: demand is unknown during the outage; explicitly acknowledge a manual quantity.`)
  return {sku,unit,sold,observedDays,onHand,openBaseQuantity:format(pending),demand,suggested,quantity,explanation:demand===null?'Sell-through unknown: export outage. No sales rate or suggested quantity is invented.':`Ceiling of ${sold} sold ÷ ${observedDays} observed days × ${horizonDays} horizon days × ${seasonalityBps} buyer-supplied seasonality basis points ÷ 10000 = ${demand} ${unit}; subtract ${onHand} on hand and ${format(pending)} committed base units, then round up to a selling unit.`}
 })
 for(const key of edits.keys())if(!seen.has(key))fail('LINES','Edited quantities must name a row of the authorized export.',400)
 const chosen=lines.filter(line=>line.quantity>0)
 let totalCents=0
 if(!chosen.length)blockers.push('Choose at least one positive quantity.')
 else try {
  const priced=applyPromotions(prepareLines(chosen,available.items,today),(await promotionSettings(env.DB)).offers,selected.id,today)
  totalCents=priced.reduce((sum,line)=>sum+line.lineCents!,0)
  if(!Number.isSafeInteger(totalCents))fail('MONEY','The basket exceeds the exact-cent range.',400)
  if(totalCents<selected.value.minimumCents)blockers.push('The basket is below the current account minimum.')
  if(totalCents>budgetCents)blockers.push('The basket exceeds the buyer’s merchandise budget; edit quantities before accepting.')
 }catch(error){if(error instanceof Error)blockers.push(error.message);else throw error}
 const purchaseDates=[...new Set(orders.filter(order=>order.submittedBy).map(order=>supplierDate(new Date(order.preparedAt))))].sort()
 const cadenceDays=purchaseDates.length>1?(Date.parse(purchaseDates.at(-1)!)-Date.parse(purchaseDates[0]))/86400000/(purchaseDates.length-1):null
 const value={accountId:selected.id,accountRevision:selected.revision,...(selected.buyingProfile?{buyingProfile:selected.buyingProfile}:{}),feedSha256:await digest(csv),observedOn,requestedDate,horizonDays,seasonalityBps,budgetCents,currency:available.currency,totalCents,sourceOrders:orders.map(order=>({id:order.id,revision:order.revision})),cadenceDays,lines,blockers,provenance:{model:'barrow-sell-through-arithmetic-v1',tools:['buyer-authorized-export','account-catalogue','native-orders','live-Pier'],paidCostCents:0,contacts:0,authority:'Current company purchaser; no external agent, model call, outreach or purchase execution.'}}
 // Live prices, availability and open source revisions participate in exact human review.
 const fingerprint=await digest(JSON.stringify({value,offers:available.items}))
 return {review:{...value,provenance:{...value.provenance,runId:fingerprint},fingerprint} as SellThroughReview,guards:[profile.guard,companyRightsGuard(env.DB,member),env.DB.prepare(`INSERT INTO bw_guard(value) SELECT CASE WHEN (${scopedSnapshot.replace(' AS value','')})=? THEN 1 ELSE 0 END`).bind(selected.id,...scope.values,snapshot)]}
}
export async function sellThroughOutcomes(env: Bindings, actor: Actor, order: Order) {
 await sellThroughBuyer(env,actor,order.accountId)
 if(!order.sellThrough)fail('NOT_FOUND','This order has no accepted sell-through plan.',404)
 const financial=await creditRecords(env.DB)
 let dispatchedBaseQuantity:string|null=null
 try {
  const state=await pierState(env),origin=await pierOrigin(env)
  if(order.pierOrderId&&order.pierOrigin===origin) {
   const upstream=state.orders?.find((value:any)=>value.id===order.pierOrderId)
   if(upstream)dispatchedBaseQuantity=format(upstream.lines.reduce((sum:bigint,line:any)=>sum+decimal(line.dispatched),0n))
  } else if(order.status==='draft')dispatchedBaseQuantity='0'
 }catch{/* An unavailable authority is unknown, never a fabricated zero. */}
 return {orderId:order.id,acceptedPlans:1,acceptedBy:order.sellThrough.acceptedBy,acceptedAt:order.sellThrough.acceptedAt,acceptedLines:order.sellThrough.review.lines.filter(line=>line.quantity>0).map(line=>({sku:line.sku,unit:line.unit,quantity:line.quantity})),currency:order.currency,paidCents:financial.allocations.filter(row=>row.orderId===order.id&&row.accountId===order.accountId&&row.currency===order.currency).reduce((sum,row)=>sum+row.amountCents,0),dispatchedBaseQuantity,deliveredQuantity:null,deliveryReason:'Carrier delivery is not recorded; Pier dispatch is not delivery.',orderPath:`/api/barrow/orders/${order.id}`}
}
