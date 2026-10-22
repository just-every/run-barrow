import { fail } from './model'
export type PriceDisplay='wholesale'|'retail'|'both'
export function displayMode(value:unknown):PriceDisplay {
 if(!['wholesale','retail','both'].includes(value as string))fail('INPUT','Choose wholesale, retail or both.',400)
 return value as PriceDisplay
}
export const exactMoney=(cents:number,currency:string)=>`${currency} ${Math.trunc(cents/100)}.${String(cents%100).padStart(2,'0')}`
/** Gross margin on retail, rounded half up to basis points; absent for missing/zero MSRP. */
export function marginBps(wholesale:number,retail?:number) {
 if(retail===undefined||retail===0)return null
 const n=BigInt(retail-wholesale)*10000n,d=BigInt(retail),negative=n<0n,a=negative?-n:n
 return Number((a+d/2n)/d)*(negative?-1:1)
}
export function priceLabels(line:{unitCents:number;msrpCents?:number},currency:string,mode:PriceDisplay) {
 const labels=[]
 if(mode!=='retail')labels.push(`Wholesale ${exactMoney(line.unitCents,currency)}`)
 if(mode!=='wholesale')labels.push(`MSRP ${line.msrpCents===undefined?'absent':exactMoney(line.msrpCents,currency)}`)
 if(mode==='both'){const margin=marginBps(line.unitCents,line.msrpCents);labels.push(`Margin ${margin===null?'absent':(margin/100).toFixed(2)+'%'}`)}
 return labels.join(' | ')
}
