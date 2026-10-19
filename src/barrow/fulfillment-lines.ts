// RPT-003: quantities are exact base units; an unallocated backorder has no warehouse.
import { decimal } from './pier'
import { formatMicro } from './units'
import { type Order } from './model'
import { calendarDate } from './report-zone'

export function fulfillmentLines(order: Order, upstream: any, state: any, today: string, timeZone: string) {
 if (upstream.customerId !== order.pierCustomerId) throw new Error('Source customer differs')
 const locations = new Map<string, string>((state.locations ?? []).map((location: any) => [location.id, location.warehouse || 'Unnamed warehouse']))
 const promisedDate: string | null = upstream.promiseDate ?? null
 const shipments = (state.shipments ?? []).filter((shipment: any) => shipment.orderId === upstream.id)
 const items = [...new Set(order.lines.map(line => line.itemId))]
 return items.map(itemId => {
  const originals = order.lines.filter(line => line.itemId === itemId), line = upstream.lines.find((line: any) => line.itemId === itemId)
  if (!line) throw new Error('Missing source line')
  const ordered = originals.reduce((sum, item) => sum + decimal(item.baseQuantity ?? String(item.quantity)), 0n)
  const shipped = decimal(line.dispatched), cancelled = decimal(line.cancelled), allocated = decimal(line.reserved), backordered = decimal(line.backorder)
  if (ordered !== decimal(line.quantity) || ordered !== shipped + cancelled + allocated + backordered) throw new Error('Source quantities do not reconcile')
  const warehouses = new Map<string, { allocated: bigint; shipped: bigint }>()
  const add = (locationId: string, kind: 'allocated' | 'shipped', quantity: string, micro = false) => {
   const name = locations.get(locationId) ?? 'Unknown warehouse', row = warehouses.get(name) ?? { allocated: 0n, shipped: 0n }
   row[kind] += micro ? BigInt(quantity) : decimal(quantity); warehouses.set(name, row)
  }
  for (const reservation of state.reservations ?? []) if (reservation.orderLineId === line.id) add(reservation.locationId, 'allocated', reservation.quantity, true)
  let byDate = 0n, late = 0n
  for (const shipment of shipments) for (const sent of shipment.lines ?? []) if (sent.orderLineId === line.id) {
   if (promisedDate) {
    if (calendarDate(new Date(shipment.createdAt), timeZone) <= promisedDate) byDate += decimal(sent.quantity)
    else late += decimal(sent.quantity)
   }
   for (const link of sent.reservations ?? []) add(link.locationId, 'shipped', link.quantity)
  }
  const outstanding = allocated + backordered, overdue = Boolean(promisedDate && promisedDate < today && outstanding > 0n)
  const demand = ordered - cancelled
  return {
   orderId: order.id, accountId: order.accountId, customer: order.customerName, reference: order.reference,
   sku: originals[0].sku, unit: originals[0].baseUnit ?? originals[0].unit ?? 'base unit', sourceOrderId: upstream.id,
   ordered: formatMicro(ordered), shipped: formatMicro(shipped), cancelled: formatMicro(cancelled), allocated: formatMicro(allocated), backordered: formatMicro(backordered), outstanding: formatMicro(outstanding),
   // Integer basis points rounded half up; never combine different base units into a quantity total.
   fillBasisPoints: demand > 0n ? Number((shipped * 10000n + demand / 2n) / demand) : null,
   promisedDate, agreedDate: order.requestedDate ?? null, promiseChanged: (order.requestedDate ?? null) !== promisedDate,
   promiseHistory: 'Not recorded by Pier',
   dispatchedByDate: promisedDate ? formatMicro(byDate) : null, dispatchedLate: promisedDate ? formatMicro(late) : null,
   delivery: 'unknown' as const, tracking: 'Not recorded: no connected carrier source', onTimeDelivery: null,
   overdue, ageDays: Math.max(0, Math.floor((Date.parse(today + 'T12:00:00Z') - Date.parse(calendarDate(new Date(order.approvedAt!), timeZone) + 'T12:00:00Z')) / 86400000)),
   warehouses: [...warehouses].sort(([a], [b]) => a.localeCompare(b)).map(([warehouse, value]) => ({ warehouse, allocated: formatMicro(value.allocated), shipped: formatMicro(value.shipped) })),
   unassignedBackorder: formatMicro(backordered), owner: 'Supplier',
   action: overdue || backordered > 0n ? 'Review this order in Pier; reconcile stock and contact the buyer about its promise.' : null,
  }
 })
}
