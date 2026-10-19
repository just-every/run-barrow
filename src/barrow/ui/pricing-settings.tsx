import { validatePricing } from '../pricing'
import type { AccountValue } from '../imports/validation'

export function applyPricing(prices:AccountValue['prices'],text:string) {
 if(!text.trim())return prices
 const entries=JSON.parse(text)
 if(!Array.isArray(entries)||entries.length>200)throw Error('Pricing rules need an array of SKU entries.')
 const seen=new Set<string>()
 for(const entry of entries){
  if(!entry||typeof entry!=='object'||Object.keys(entry).some(k=>!['sku','pricing'].includes(k))||typeof entry.sku!=='string'||seen.has(entry.sku))throw Error('Each pricing entry needs one unique sku and pricing object.')
  const price=prices.find(p=>p.sku===entry.sku);if(!price)throw Error(`Pricing SKU ${entry.sku} needs an agreed price row.`)
  seen.add(entry.sku);price.pricing=validatePricing(entry.pricing)
 }
 return prices
}
export function PricingSettings({prices}:{prices:AccountValue['prices']}) {
 const entries=prices.filter(p=>p.pricing).map(({sku,pricing})=>({sku,pricing}))
 return <label className="br-full">Pricing rules (optional JSON)<textarea name="pricing" rows={8} defaultValue={entries.length?JSON.stringify(entries,null,2):''} spellCheck={false} placeholder={'[{"sku":"JV-2214-S","pricing":{"effectiveFrom":"2026-01-01","effectiveTo":"2026-12-31","mode":"volume","breaks":[{"fromQuantity":"10","unitCents":4500}],"accountDiscountBps":500}}]'} /><small>Dates include both endpoints in Eastern time. Thresholds count the selected selling unit. Volume reprices the whole line; graduated rates apply only above each threshold. Account discounts replace group discounts; an override with unitCents and reason replaces all breaks and discounts. Discounts use basis points (500 = 5%). Saving approves these rules under your supplier identity. Optional groupDiscount has name and bps; override has unitCents and reason. Configure separate unit pricing inside Selling units. Empty rules use the agreed price.</small></label>
}
