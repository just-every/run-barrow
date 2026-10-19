import type { Pricing } from './pricing'
import { fail } from './model'

export type UnitDefinition = { code: string; baseQuantity: string; unitCents: number; packContents: string; quantityKind?: 'whole'|'measured'; pricing?: Pricing }

const scale = 1_000_000n

/** Parse a positive decimal without introducing binary floating point arithmetic. */
export function quantityMicro(input: number | string): bigint {
  if (typeof input !== 'number' && typeof input !== 'string') fail('INPUT', 'Quantity must be a positive decimal.', 400)
  const value = String(input)
  if (!/^\d+(?:\.\d{1,6})?$/.test(value)) fail('INPUT', 'Quantity must be a positive decimal with at most six decimal places and at most 1000000.', 400)
  const [digits, fraction = ''] = value.split('.')
  const whole = digits.replace(/^0+/, '') || '0'
  if (whole.length > 7) fail('INPUT', 'Quantity must be at most 1000000.', 400)
  const quantity = BigInt(whole) * scale + BigInt(fraction.padEnd(6, '0'))
  if (quantity <= 0n || quantity > 1_000_000n * scale) fail('INPUT', 'Quantity must be greater than zero and at most 1000000.', 400)
  return quantity
}

/** Format millionths as a plain decimal, including zero for totals and stock. */
export function formatMicro(value: bigint): string {
  if (typeof value !== 'bigint') fail('INPUT', 'Supply an exact quantity in millionths.', 400)
  const negative = value < 0n, magnitude = negative ? -value : value
  const fraction = (magnitude % scale).toString().padStart(6, '0').replace(/0+$/, '')
  return `${negative ? '-' : ''}${magnitude / scale}${fraction ? '.' + fraction : ''}`
}

/** Convert sell units to the inventory authority's base units without rounding. */
export function convertQuantity(quantity: number | string, conversion: number | string): string {
  const product = quantityMicro(quantity) * quantityMicro(conversion)
  if (product % scale !== 0n) fail('INPUT', 'The converted base quantity needs more than six decimal places.', 400)
  const base=product / scale
  if(base>9_999_999_999_999_999n) fail('INPUT','Converted base quantity exceeds the supported stock range.',400)
  return formatMicro(base)
}

/** Round once per line to the nearest cent, with exact half cents rounded up. */
export function priceQuantity(quantity: number | string, unitCents: number): number {
  if (!Number.isSafeInteger(unitCents) || unitCents < 0 || unitCents > 1_000_000_000) fail('INPUT', 'Unit price must be integer cents between 0 and 1000000000.', 400)
  return Number((quantityMicro(quantity) * BigInt(unitCents) + scale / 2n) / scale)
}

export type UnitOffer = {sku:string;unit:string;unitCents:number;units?:UnitDefinition[];pricing?:Pricing}
/** The legacy price remains the price for one base stock unit. Explicit units add selectable price bases. */
export function sellingUnits(offer:UnitOffer):UnitDefinition[] {
 const configured=offer.units ?? []
 if(configured.some(unit=>unit.code===offer.unit)) fail('UNIT_CONFIG',`${offer.sku}: use a distinct selling-unit code rather than redefining the stock unit ${offer.unit}.`)
 return [{code:offer.unit,baseQuantity:'1',unitCents:offer.unitCents,packContents:`1 ${offer.unit}`,...(offer.pricing?{pricing:offer.pricing}:{})},...configured]
}
