// ORD-014: a matrix layout puts recorded sizes across one row per chosen column values (always split by selling
// unit), and production totals add exact base quantities by style, color and size. Both read the same immutable
// per-line rows as the per-line CSV, so a total always equals the sum of the selected lines.
import { fail } from './model'
import { decimal, format } from './pier'
import { sizeOrder } from './ui/styles'

export const notRecorded = 'Not recorded'
const sizeRank = (size: string) => { const at = sizeOrder.indexOf(size.toUpperCase()); return at < 0 ? sizeOrder.length : at }
const bySize = (a: string, b: string) => sizeRank(a) - sizeRank(b) || a.localeCompare(b, 'en-US', { numeric: true })
const exact = (value: unknown) => {
 const text = String(value ?? '')
 if (!/^\d{1,10}(\.\d{1,6})?$/.test(text)) fail('QUANTITY', 'A recorded quantity cannot be totaled exactly.', 409)
 return decimal(text)
}
/** rows carry `keys` then size then quantity, in that order. */
export function sizeMatrix(keys: string[], rows: unknown[][]): unknown[][] {
 const sizes = [...new Set(rows.map(row => String(row[keys.length] || notRecorded)))].sort(bySize)
 const groups = new Map<string, { key: unknown[]; cells: Map<string, bigint> }>()
 for (const row of rows) {
  const key = row.slice(0, keys.length), id = JSON.stringify(key), size = String(row[keys.length] || notRecorded)
  const group = groups.get(id) ?? { key, cells: new Map() }
  group.cells.set(size, (group.cells.get(size) ?? 0n) + exact(row[keys.length + 1]))
  groups.set(id, group)
 }
 return [[...keys, ...sizes], ...[...groups.values()].map(group => [...group.key, ...sizes.map(size => group.cells.has(size) ? format(group.cells.get(size)!) : '')])]
}
export const totalColumns = ['style', 'color', 'size', 'sku', 'base_unit', 'base_quantity', 'line_count', 'order_count', 'sources'] as const
/** Each input row is one recorded line: style, color, size, sku, base unit, base quantity, order and confirmation. */
export function productionTotals(lines: { style?: string; color?: string; size?: string; sku: string; baseUnit: string; baseQuantity: string; order: string; confirmation: string }[]) {
 const groups = new Map<string, { style: string; color: string; size: string; baseUnit: string; skus: Set<string>; quantity: bigint; lines: number; orders: Set<string>; sources: Set<string> }>()
 for (const line of lines) {
  const style = line.style || `${notRecorded}: ${line.sku}`, color = line.color || notRecorded, size = line.size || notRecorded
  const id = JSON.stringify([style, color, size, line.baseUnit])
  const group = groups.get(id) ?? { style, color, size, baseUnit: line.baseUnit, skus: new Set<string>(), quantity: 0n, lines: 0, orders: new Set<string>(), sources: new Set<string>() }
  group.skus.add(line.sku); group.quantity += exact(line.baseQuantity); group.lines++; group.orders.add(line.order); group.sources.add(line.confirmation)
  groups.set(id, group)
 }
 const rows = [...groups.values()].sort((a, b) => a.style.localeCompare(b.style) || a.color.localeCompare(b.color) || bySize(a.size, b.size) || a.baseUnit.localeCompare(b.baseUnit))
 return [[...totalColumns], ...rows.map(row => [row.style, row.color, row.size, [...row.skus].join(' '), row.baseUnit, format(row.quantity), row.lines, row.orders.size, [...row.sources].join(' ')])]
}
