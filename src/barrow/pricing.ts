import { fail, supplierDate } from './model'
import { quantityMicro, formatMicro } from './units'

export type Pricing = {
 effectiveFrom: string; effectiveTo: string
 mode?: 'volume'|'graduated'; breaks?: {fromQuantity:string;unitCents:number}[]
 accountDiscountBps?: number; groupDiscount?: {name:string;bps:number}
 override?: {unitCents:number;reason:string}
}
export type PricingSnapshot = {date:string;reason:string;segments:{quantity:string;unitCents:number}[];discountBps:number;lineCents:number;rule:Pricing}
const cents=(v:unknown)=>typeof v==='number' && Number.isSafeInteger(v) && v>=0 && v<=1_000_000_000 ? v : fail('ACCOUNT_PRICING','Prices must be integer cents from 0 to 1000000000.',400)
const bps=(v:unknown)=>typeof v==='number' && Number.isInteger(v) && v>=0 && v<=10000 ? v : fail('ACCOUNT_PRICING','Discounts use integer basis points from 0 to 10000.',400)
const object=(v:any,keys:string[])=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k))) fail('ACCOUNT_PRICING','Use the documented pricing fields.',400)}
export function validatePricing(input:unknown):Pricing {
 const p=input as Pricing
 object(p,['effectiveFrom','effectiveTo','mode','breaks','accountDiscountBps','groupDiscount','override'])
 for(const d of [p.effectiveFrom,p.effectiveTo]) if(typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(Date.parse(d))||new Date(d).toISOString().slice(0,10)!==d) fail('ACCOUNT_PRICING','Pricing requires valid YYYY-MM-DD effectiveFrom and effectiveTo dates.',400)
 if(p.effectiveFrom>p.effectiveTo) fail('ACCOUNT_PRICING','Pricing end must be on or after its start.',400)
 const result:Pricing={effectiveFrom:p.effectiveFrom,effectiveTo:p.effectiveTo}
 if(p.mode!==undefined || p.breaks!==undefined){
  if(!['volume','graduated'].includes(p.mode!)||!Array.isArray(p.breaks)||!p.breaks.length||p.breaks.length>30) fail('ACCOUNT_PRICING','Choose volume or graduated with one to 30 ascending breaks.',400)
  let previous=0n
  result.mode=p.mode;result.breaks=p.breaks.map(b=>{object(b,['fromQuantity','unitCents']);if(typeof b.fromQuantity!=='string') fail('ACCOUNT_PRICING','Break quantities are exact decimal strings.',400);const q=quantityMicro(b.fromQuantity);if(q<=previous) fail('ACCOUNT_PRICING','Break quantities must be positive and strictly increasing.',400);previous=q;return {fromQuantity:formatMicro(q),unitCents:cents(b.unitCents)}})
 }
 if(p.accountDiscountBps!==undefined) result.accountDiscountBps=bps(p.accountDiscountBps)
 if(p.groupDiscount!==undefined){object(p.groupDiscount,['name','bps']);if(typeof p.groupDiscount.name!=='string'||!p.groupDiscount.name.trim()||p.groupDiscount.name.length>80) fail('ACCOUNT_PRICING','Name the assigned discount group (at most 80 characters).',400);result.groupDiscount={name:p.groupDiscount.name.trim(),bps:bps(p.groupDiscount.bps)}}
 if(p.override!==undefined){object(p.override,['unitCents','reason']);if(typeof p.override.reason!=='string'||!p.override.reason.trim()||p.override.reason.length>240) fail('ACCOUNT_PRICING','An approved override requires a reason (at most 240 characters).',400);result.override={unitCents:cents(p.override.unitCents),reason:p.override.reason.trim()}}
 return result
}
/** One exact line calculation shared by cart, HTTP preparation and reorder. */
export function priceLine(quantity:number|string,unitCents:number,pricing?:Pricing,date=supplierDate(new Date())) {
 const q=quantityMicro(quantity),active=pricing && date>=pricing.effectiveFrom && date<=pricing.effectiveTo ? pricing:undefined
 let price=unitCents,discountBps=0,reason='Agreed unit price',segments:{quantity:string;unitCents:number}[]=[]
 if(active?.override){price=active.override.unitCents;reason=`Approved override: ${active.override.reason} (takes precedence over breaks and discounts)`}
 else {
  const breaks=active?.breaks??[]
  if(active?.mode==='volume'){
   const selected=breaks.filter(b=>q>=quantityMicro(b.fromQuantity)).at(-1)
   if(selected){price=selected.unitCents;reason=`Volume break at ${selected.fromQuantity} selling units`}
  }
  if(active?.mode==='graduated'){
   let start=0n,rate=unitCents
   for(const b of breaks){const end=quantityMicro(b.fromQuantity);if(q>start)segments.push({quantity:formatMicro((q<end?q:end)-start),unitCents:rate});if(q<=end)break;start=end;rate=b.unitCents}
   const last=breaks.at(-1);if(last && q>quantityMicro(last.fromQuantity))segments.push({quantity:formatMicro(q-quantityMicro(last.fromQuantity)),unitCents:last.unitCents})
   reason='Graduated breaks (each rate applies only above its threshold)'
  }
  if(active?.accountDiscountBps!==undefined){discountBps=active.accountDiscountBps;reason+=` · Account discount ${discountBps} bps (takes precedence over group)`}
  else if(active?.groupDiscount){discountBps=active.groupDiscount.bps;reason+=` · Group ${active.groupDiscount.name} discount ${discountBps} bps`}
 }
 if(!segments.length)segments=[{quantity:String(quantity),unitCents:price}]
 const numerator=segments.reduce((n,s)=>n+quantityMicro(s.quantity)*BigInt(s.unitCents),0n)*BigInt(10000-discountBps),denominator=1_000_000n*10000n
 const lineCents=Number((numerator+denominator/2n)/denominator)
 if(!Number.isSafeInteger(lineCents)) fail('MONEY','Line total is outside the supported exact-cent range.',400)
 return {unitCents:price,lineCents,...(pricing?{pricing:{date,reason:active?reason:'Outside effective period · Agreed unit price',segments,discountBps,lineCents,rule:pricing} as PricingSnapshot}:{})}
}
