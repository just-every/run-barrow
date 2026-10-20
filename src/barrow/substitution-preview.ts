import type { Bindings } from '../auth.server'
import { account } from './accounts'
import { requireActiveAccount } from './account-profile'
import { catalogue, decimal, pierOrder, pierOrigin } from './pier'
import { fail, supplierDate, type Actor, type Line, type Order } from './model'
import { now } from './clock'
import { prepareLines } from './unit-lines'
import { deliveryOptions, deliveryTotal, freightQuote, selectDelivery } from './shipping'
import type { Delivery, FreightQuote } from './shipping-rules'
export type SubstitutionLine = Line & { fromSku: string; fromUnit?: string; fromLine: number }
export type Substitution = { number:number; status:'offered'|'declined'|'accepted'; reason:string; proposedBy:string; proposedAt:string; accountRevision:string; lines:SubstitutionLine[]; totalCents:number; delivery?:Delivery; freightQuotes?:FreightQuote[]; taxNote:string; decidedBy?:string; decidedAt?:string; declineReason?:string; replacementId?:string }
export const taxNote='Tax is not recorded or calculated by this installation. No tax difference has been verified.'
const format=(n:bigint)=>`${n/1000000n}${n%1000000n?'.'+(n%1000000n).toString().padStart(6,'0').replace(/0+$/,''):''}`
export async function substitutionContext(env:Bindings,actor:Actor,order:Order,input:any[],quotes?:FreightQuote[]) {
 if(!['approved','shortfall'].includes(order.status))fail('SUBSTITUTION_STATE','Propose a substitution for an accepted, unshipped order.')
 if(order.currency!=='USD')fail('SUBSTITUTION_CURRENCY','This historical order keeps its original currency; USD substitution prices cannot relabel it.')
 if(order.pierOrigin!==await pierOrigin(env))fail('PIER_CHANGED','Reconnect the original inventory authority.')
 const upstream=await pierOrder(env,order)
 if(upstream.lines.some((line:any)=>decimal(line.dispatched)>0n))fail('SHIPPED','Dispatched units cannot be substituted; arrange a return instead.')
 if(upstream.lines.some((line:any)=>decimal(line.cancelled)>0n))fail('SUBSTITUTION_STATE','The source order already has cancelled units. Reconcile it before proposing a substitution.')
 const selected=await account(env.DB,actor,order.accountId);requireActiveAccount(selected)
 if(!Array.isArray(input)||!input.length||input.length>100)fail('LINES','Supply the complete replacement basket, between one and 100 lines.',400)
 const available=await catalogue(env,selected)
 // This order's own reservation will be released before the replacement can reserve.
 const offers=available.items.map(item=>({...item,available:format(decimal(item.available)+upstream.lines.filter((line:any)=>line.itemId===item.itemId).reduce((sum:bigint,line:any)=>sum+decimal(line.reserved),0n))}))
 const priced=prepareLines(input,offers,supplierDate(await now()))
 const lines:SubstitutionLine[]=priced.map((line,index)=>{
  const matches=order.lines.map((original,i)=>({original,i})).filter(({original})=>original.sku===input[index].fromSku&&(input[index].fromUnit===undefined||original.unit===input[index].fromUnit))
  if(matches.length!==1)fail('SUBSTITUTION_LINK','Each replacement line must name one original SKU and, when needed, its selling unit.',400)
  return {...line,fromSku:matches[0].original.sku,fromUnit:matches[0].original.unit,fromLine:matches[0].i+1}
 })
 if(order.lines.some((_,i)=>!lines.some(line=>line.fromLine===i+1)))fail('SUBSTITUTION_LINK','Include every original line, unchanged or replaced. No line may disappear silently.',400)
 const subtotal=deliveryTotal(lines)
 if(subtotal<selected.value.minimumCents)fail('MINIMUM','The replacement is below the account minimum.')
 const context={currency:'USD' as const,account:selected,lines,shipTo:order.shipTo,quotes}
 return {selected,lines,context}
}
export async function previewSubstitution(env:Bindings,actor:Actor,order:Order,p:any) {
 const result=await substitutionContext(env,actor,order,p.lines)
 const quotes=p.freightQuote?[await freightQuote(env,actor,result.context,p.freightQuote)]:undefined
 const context={...result.context,quotes},options=await deliveryOptions(env,context)
 const selection=p.delivery??(p.methodId?{methodId:p.methodId,warehouse:p.warehouse??'',ownCarrierAccount:p.ownCarrierAccount}:undefined)
 const option=selection?options.options.find(option=>option.methodId===selection.methodId&&option.warehouse===(selection.warehouse??'')):undefined
 const delivery=selection?await selectDelivery(env,context,{...selection,fingerprint:option?.fingerprint}):undefined
 return {...result,context,freightQuotes:quotes,delivery,deliveryOptions:options,totalCents:deliveryTotal(result.lines,delivery),taxNote}
}
export async function revalidateSubstitution(env:Bindings,actor:Actor,order:Order,offer:Substitution, accepted=false) {
 const current=await substitutionContext(env,actor,order,offer.lines,offer.freightQuotes)
 if(current.selected.revision!==offer.accountRevision||JSON.stringify(current.lines)!==JSON.stringify(offer.lines))fail('SUBSTITUTION_CHANGED','The account, price, unit or stock changed. Ask for a revised offer.')
 if(!accepted)await selectDelivery(env,current.context,offer.delivery)
 return current
}
