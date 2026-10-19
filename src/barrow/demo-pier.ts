// Provider success envelopes only; Barrow keeps no second stock ledger.
// Private account stock is simulated. Public reads still use Base's real network policy.
import { demoCustomers, demoProducts, demoCustomerId, demoItemId } from '../demo-data'
import type { Line } from './model'
export function demoPierState() {
  return {
    items: demoProducts.map(({ available, ...product }) => ({ id: demoItemId(product.sku), ...product, archived: false })),
    locations: [{ id: 'demo-charleston', name: 'Charleston warehouse', kind: 'bin' }],
    positions: demoProducts.map(product => ({ itemId: demoItemId(product.sku), locationId: 'demo-charleston', status: 'sellable', available: String(product.available) })),
    parties: demoCustomers.map(({ id, name }) => ({ id: demoCustomerId(id), name, kind: 'customer' })),
    orders: [],
  }
}
export function demoReservation(orderId: string, lines: Line[]) {
  return { id: `pier-${orderId}`, reference: `SO-${orderId.split('-').pop()}`, lines: lines.map(line => ({ itemId: line.itemId, quantity: String(line.quantity), reserved: String(line.quantity), cancelled: '0' })) }
}
