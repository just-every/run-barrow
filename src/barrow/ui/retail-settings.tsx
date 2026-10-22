import type { Account, Price } from './types'
export function applyRetail(prices:Price[],text:string) {
 if(!text.trim())return prices
 const entries=JSON.parse(text)
 if(!Array.isArray(entries)||entries.length>200)throw Error('Retail prices need an array of SKU entries.')
 const seen=new Set<string>()
 for(const entry of entries){
  if(!entry||Object.keys(entry).some(k=>!['sku','msrpCents'].includes(k))||typeof entry.sku!=='string'||seen.has(entry.sku)||!Number.isSafeInteger(entry.msrpCents)||entry.msrpCents<0)throw Error('Each retail entry needs a unique sku and non-negative integer msrpCents.')
  const price=prices.find(p=>p.sku===entry.sku);if(!price)throw Error(`Retail SKU ${entry.sku} needs an agreed price row.`)
  seen.add(entry.sku);price.msrpCents=entry.msrpCents
 }
 return prices
}
export function RetailSettings({account}:{account?:Account}) {
 const entries=account?.value.prices.filter(p=>p.msrpCents!==undefined).map(({sku,msrpCents})=>({sku,msrpCents}))??[]
 return <>
  <label>Price book currency<select name="currency" defaultValue={account?.value.currency??'USD'}><option>USD</option><option>CAD</option></select><small>All prices in this account book use this ISO currency. No exchange conversion is applied.</small></label>
  <label>Confirmation PDF prices<select name="confirmationDisplay" defaultValue={account?.value.priceDisplay?.confirmation??'wholesale'}><option value="wholesale">Wholesale only</option><option value="retail">Retail only</option><option value="both">Wholesale and retail with margin</option></select></label>
  <label>Order CSV prices<select name="orderCsvDisplay" defaultValue={account?.value.priceDisplay?.orderCsv??'wholesale'}><option value="wholesale">Wholesale only</option><option value="retail">Retail only</option><option value="both">Wholesale and retail with margin</option></select></label>
  <label className="br-full">Suggested retail prices (optional JSON)<textarea name="retail" rows={5} defaultValue={entries.length?JSON.stringify(entries,null,2):''} placeholder={'[{"sku":"JV-2214-S","msrpCents":9600}]'} spellCheck={false}/><small>Exact integer minor units in the book’s currency. Omitted entries have no MSRP. Margin is (MSRP − wholesale) ÷ MSRP, rounded half up to two decimal percent places; no margin is shown for missing or zero MSRP. MSRP never enters order totals.</small></label>
 </>
}
