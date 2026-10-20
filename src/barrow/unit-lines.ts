import { priceLine, type Pricing } from './pricing'
import { fail, integer, text, type Line } from './model'
import { decimal } from './pier'
const format=(value:bigint)=>`${value/1000000n}${value%1000000n?'.'+(value%1000000n).toString().padStart(6,'0').replace(/0+$/,''):''}`
import { convertQuantity, quantityMicro, sellingUnits, type UnitDefinition } from './units'
import { quantityProblem, quantityMessage } from './quantity-rules'

type Offer = {sku:string;itemId:string;name:string;unit:string;unitCents:number;minQty:number;casePack?:number;increment?:number;available:string;units?:UnitDefinition[];pricing?:Pricing}
/** stock=false checks prices, units and quantity rules but not promiseable stock: a quote request or proposal promises nothing. */
export function prepareLines(input:any[],offers:Offer[],date?:string,stock=true):Line[] {
 const seen=new Set<string>(),totals=new Map<string,bigint>()
 const lines:Line[]=input.map(line=>{
  const sku=text(line?.sku,'SKU',100),offer=offers.find(offer=>offer.sku===sku)
  if(!offer) fail('PRICE','This item is not on this customer’s active price list.')
  const code=line.unit===undefined ? offer.unit : text(line.unit,'Selling unit',32)
  const unit=sellingUnits(offer).find(unit=>unit.code===code)
  if(!unit) fail('UNIT',`${sku}: ${code} has no defined conversion or price.`,400)
  const key=JSON.stringify([sku,code]);if(seen.has(key)) fail('LINES','Each SKU and selling unit may appear only once.',400);seen.add(key)
  const quantity=unit.quantityKind==='measured' && !['case','pallet'].includes(code.toLowerCase()) ? Number(line.quantity) : integer(line.quantity,'Quantity',1,1000000)
  quantityMicro(line.quantity)
  if(!Number.isFinite(quantity)) fail('INPUT','Use a valid positive quantity.',400)
  const baseQuantity=convertQuantity(line.quantity,unit.baseQuantity)
  const base=decimal(baseQuantity)
  totals.set(sku,(totals.get(sku)??0n)+base)
  const priced=priceLine(line.quantity,unit.unitCents,unit.pricing,date)
  return {sku,name:offer.name,itemId:offer.itemId,quantity,...priced,minQty:offer.minQty,unit:code,baseUnit:offer.unit,conversion:unit.baseQuantity,baseQuantity,packContents:unit.packContents}
 })
 for(const [sku,quantity] of totals) {
  const offer=offers.find(offer=>offer.sku===sku)!
  // PRI-003: the explanation names the nearest valid quantities; the buyer must choose one, nothing is corrected here.
  const problem=quantityProblem(format(quantity),offer,offer.unit)
  if(problem) fail(quantity<BigInt(offer.minQty)*1000000n?'MINIMUM':'QUANTITY',quantityMessage(sku,format(quantity),problem,offer.unit))
  if(stock && quantity>decimal(offer.available)) fail('STOCK',`${sku} no longer has enough promiseable stock across its selected units. Refresh the catalog.`)
 }
 return lines
}
