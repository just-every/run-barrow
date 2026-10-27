import type { CatalogueItem, Order } from './types'
import { money } from './types'

// The order pad reads a catalog of SKUs as styles down and sizes across. A SKU ending in a size
// ("JV-2214-S", "TEE_XL") is that style in that size; any other SKU is a style of its own with one "Qty" cell.
export const sizeOrder = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', '1X', '2X', '3X', '4X']
export const oneSize = 'Qty'
const sizedSku = new RegExp(`^(.+?)[-_ ](${sizeOrder.join('|')})$`, 'i')

export interface StyleRow { currency?:'USD'|'AUD'|'CAD'|'EUR'|'GBP'; key: string; name: string; cells: Record<string, CatalogueItem>; sizes: string[]; cents: number; note: string }

const stripSize = (name: string, size: string) => name.replace(new RegExp(`\\s*[·,/(-]?\\s*${size}\\)?$`, 'i'), '').trim() || name

export function groupStyles(items: CatalogueItem[],currency:'USD'|'AUD'|'CAD'|'EUR'|'GBP'='USD'): { rows: StyleRow[]; columns: string[] } {
  const rows = new Map<string, StyleRow>()
  for (const item of items) {
    const match = sizedSku.exec(item.sku)
    let key = match ? match[1] : item.sku, size = match ? match[2].toUpperCase() : oneSize
    if (rows.get(key)?.cells[size]) { key = item.sku; size = oneSize }
    const row = rows.get(key) ?? { currency,key, name: match ? stripSize(item.name, size) : item.name, cells: {}, sizes: [], cents: 0, note: '' }
    row.cells[size] = item
    rows.set(key, row)
  }
  const used = new Set([...rows.values()].flatMap(row => Object.keys(row.cells)))
  const columns = [...sizeOrder.filter(size => used.has(size)), ...(used.has(oneSize) ? [oneSize] : [])]
  for (const row of rows.values()) {
    row.sizes = columns.filter(size => row.cells[size])
    row.cents = row.cells[row.sizes[0]].unitCents
    row.note = priceNote(row)
  }
  return { rows: [...rows.values()], columns }
}

// "1X–3X $52.00": each run of neighbouring sizes priced away from the style's first size, then any minimum.
function priceNote(row: StyleRow) {
  const runs: { from: string; to: string; cents: number }[] = []
  for (const size of row.sizes) {
    const cents = row.cells[size].unitCents, last = runs.at(-1)
    if (cents === row.cents) continue
    if (last && last.cents === cents && row.sizes.indexOf(last.to) === row.sizes.indexOf(size) - 1) last.to = size
    else runs.push({ from: size, to: size, cents })
  }
  const minimums = new Set(row.sizes.map(size => row.cells[size].minQty))
  const minimum = minimums.size === 1 && !minimums.has(1) ? [`min. ${[...minimums][0]} each`] : []
  return [...runs.map(run => `${run.from === run.to ? run.from : `${run.from}–${run.to}`} ${money(run.cents,row.currency)}`), ...minimum].join(' · ')
}

export const quantityOf = (value: string | undefined) => Number(value) || 0
export const rowUnits = (row: StyleRow, quantities: Record<string, string>) => row.sizes.reduce((sum, size) => sum + quantityOf(quantities[row.cells[size].sku]), 0)
export const rowCents = (row: StyleRow, quantities: Record<string, string>, price = (item: CatalogueItem) => item.unitCents) =>
  row.sizes.reduce((sum, size) => sum + price(row.cells[size]) * quantityOf(quantities[row.cells[size].sku]), 0)

/** An order's lines read back as styles: "S2 M4 L4 XL2", units, the prices paid and the style's total. */
export function orderStyles(lines: Order['lines'], currency: 'USD' | 'AUD' | 'CAD' | 'EUR' | 'GBP') {
  if(lines.some(line=>line.unit && line.unit!==line.baseUnit)) return lines.map(line=>({
    key:JSON.stringify([line.sku,line.unit]),name:`${line.name} · ${line.unit??'units'}`,units:line.quantity,
    cents:line.lineCents??line.quantity*line.unitCents,sizes:`${line.quantity} ${line.unit??'units'} = ${line.baseQuantity??line.quantity} ${line.baseUnit??'base units'}`,
    prices:`${money(line.unitCents,currency)} / ${line.unit??'unit'}`,
  }))
  const quantities = Object.fromEntries(lines.map(line => [line.sku, String(line.quantity)]))
  return groupStyles(lines.map(({pricing,...line}) => ({ ...line, unit: '', available: '' }))).rows.map(row => ({
    key: row.key, name: row.name, units: rowUnits(row, quantities), cents: lines.filter(line=>Object.values(row.cells).some(cell=>cell.sku===line.sku)).reduce((sum,line)=>sum+(line.lineCents??line.quantity*line.unitCents),0),
    sizes: row.sizes.map(size => size === oneSize ? quantities[row.cells[size].sku] : `${size}${quantities[row.cells[size].sku]}`).join(' '),
    prices: [...new Set(row.sizes.map(size => money(row.cells[size].unitCents, currency)))].join(' / '),
  }))
}
