import { type Order } from './model'
import { decimal } from './pier'

export type CommissionSource = {
 base: bigint; dispatched: bigint; cancelled: bigint; returned: bigint
 sourceOrderId: string; sourceLineId: string; shipmentIds: string[]; returnIds: string[]
}
const ensure = (condition: unknown) => { if (!condition) throw new Error('Commission source quantities or identities do not reconcile.') }
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0
const unique = (rows: any[]) => { const ids = new Set<string>(); for (const row of rows) { ensure(id(row?.id) && !ids.has(row.id)); ids.add(row.id) } }
/** Every quantity comes from the connected Pier order and its shipment/return links. */
export function commissionSources(order: Order, state: any, origin: string | undefined): Map<string, CommissionSource> {
 ensure(origin && order.pierOrigin === origin && order.pierOrderId)
 ensure(Array.isArray(state?.orders) && Array.isArray(state.shipments) && Array.isArray(state.returns))
 const matches = state.orders.filter((row: any) => row.id === order.pierOrderId)
 ensure(matches.length === 1)
 const source = matches[0]
 ensure(source.customerId === order.pierCustomerId && Array.isArray(source.lines))
 unique(source.lines)
 const shipments = state.shipments.filter((row: any) => row.orderId === source.id)
 unique(shipments)
 const sent = new Map<string, { shipment: any; line: any }>()
 for (const shipment of shipments) {
  ensure(Array.isArray(shipment.lines))
  for (const line of shipment.lines) {
   ensure(id(line.id) && !sent.has(line.id) && source.lines.some((original: any) => original.id === line.orderLineId && original.itemId === line.itemId))
   sent.set(line.id, { shipment, line })
  }
 }
 const shipmentIds = new Set(shipments.map((row: any) => row.id))
 const returns = state.returns.filter((row: any) => shipmentIds.has(row.shipmentId))
 unique(returns)
 const returnedByLine = new Map<string, bigint>()
 for (const received of returns) {
  const original = sent.get(received.shipmentLineId)
  ensure(original && original.shipment.id === received.shipmentId && original.line.itemId === received.itemId)
  const quantity = decimal(received.quantity), total = (returnedByLine.get(received.shipmentLineId) ?? 0n) + quantity
  ensure(quantity > 0n && total <= decimal(original!.line.quantity))
  returnedByLine.set(received.shipmentLineId, total)
 }
 const items = [...new Set(order.lines.map(line => line.itemId))]
 ensure(source.lines.length === items.length)
 const result = new Map<string, CommissionSource>()
 for (const itemId of items) {
  const originals = order.lines.filter(line => line.itemId === itemId)
  const matched = source.lines.filter((line: any) => line.itemId === itemId)
  ensure(matched.length === 1)
  const line = matched[0], base = originals.reduce((sum, original) => sum + decimal(original.baseQuantity ?? String(original.quantity)), 0n)
  const dispatched = decimal(line.dispatched), cancelled = decimal(line.cancelled), reserved = decimal(line.reserved), backorder = decimal(line.backorder)
  ensure(base > 0n && base === decimal(line.quantity) && base === dispatched + cancelled + reserved + backorder)
  const shipped = [...sent.values()].filter(row => row.line.orderLineId === line.id)
  ensure(shipped.reduce((sum, row) => sum + decimal(row.line.quantity), 0n) === dispatched)
  const received = returns.filter((row: any) => sent.get(row.shipmentLineId)?.line.orderLineId === line.id)
  const returned = received.reduce((sum: bigint, row: any) => sum + decimal(row.quantity), 0n)
  ensure(returned <= dispatched)
  result.set(itemId, { base, dispatched, cancelled, returned, sourceOrderId: source.id, sourceLineId: line.id, shipmentIds: [...new Set(shipped.map(row => row.shipment.id as string))].sort(), returnIds: received.map((row: any) => row.id as string).sort() })
 }
 return result
}
