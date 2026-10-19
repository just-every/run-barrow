import type { Bindings } from './auth.server'
import type { Order } from './barrow/model'
import { demoCustomers, demoOrders, demoPrice, demoPriceUpdate, demoProducts, demoItemId, demoCustomerId, demoPierOrigin, demoSku } from './demo-data'

// The demo's records carry the story's own dates (as of Tue Oct 20, 2026, 6:44 pm ET), not the start time.
export async function seedDemo(env: Bindings, { ownerEmail, now }: { ownerEmail: string; now: Date }) {
  const owner = await env.DB.prepare('SELECT id FROM oa_operators WHERE email=?').bind(ownerEmail).first<{ id: string }>()
  if (!owner) return
  const statements = [env.DB.prepare('INSERT OR IGNORE INTO oa_first_run VALUES(1,?,?)').bind(owner.id, now.getTime())]
  const priceLists = new Map(demoCustomers.map(customer => [customer.id, demoProducts.map(product => ({ sku: product.sku, unitCents: demoPrice(customer, product), minQty: 1 }))]))
  for (const customer of demoCustomers) {
    const updated = customer.id === demoPriceUpdate.customer
    // Palmetto & Pine's list took the scheduled noon update, so its revision moved on from the one its drafts were written against.
    const prices = priceLists.get(customer.id)!.map(price => updated && price.sku.startsWith(`JV-${demoPriceUpdate.style}-`) ? { ...price, unitCents: demoPriceUpdate.cents } : price)
    statements.push(env.DB.prepare('INSERT OR IGNORE INTO bw_accounts VALUES(?,?,?)').bind(`demo-${customer.id}`, JSON.stringify({ name: customer.name, email: `${customer.buyer}@${customer.id}.example.test`, pierCustomerId: demoCustomerId(customer.id), termsDays: customer.termsDays, minimumCents: 50000, prices, ...(customer.city ? { city: customer.city, state: customer.state } : {}) }), `demo-account-${customer.id}-${updated ? 2 : 1}`))
  }
  for (const record of demoOrders) {
    const customer = demoCustomers.find(value => value.id === record.customer)!, prices = priceLists.get(customer.id)!
    const lines = Object.entries(record.lines).flatMap(([code, sizes]) => Object.entries(sizes).map(([size, quantity]) => {
      const sku = demoSku(code, size), price = prices.find(value => value.sku === sku)!, product = demoProducts.find(value => value.sku === sku)!
      return { ...price, name: product.name, itemId: demoItemId(sku), quantity }
    }))
    const written = Date.parse(record.at), approvedAt = new Date(written + 3600000).toISOString(), termsDays = customer.termsDays
    const due = new Date(written + 3600000 + termsDays * 86400000).toISOString().slice(0, 10)
    const order: Order = { id: record.id, accountId: `demo-${customer.id}`, accountRevision: `demo-account-${customer.id}-1`, customerName: customer.name, reference: record.reference, lines, totalCents: lines.reduce((sum, line) => sum + line.quantity * line.unitCents, 0), currency: 'USD', termsDays, status: record.status, preparedBy: record.agent ? 'agent:demo-agent' : owner.id, preparedAt: record.at, pierCustomerId: demoCustomerId(customer.id), pierOrigin: demoPierOrigin, revision: `${record.id}-1`,
      ...(record.status !== 'draft' ? { submittedBy: owner.id } : {}),
      ...(record.status === 'approved' ? { approvedBy: owner.id, approvedAt, pierOrderId: `pier-${record.id}`, pierReference: `SO-${record.id.slice(3)}`, reservation: lines.map(line => ({ itemId: line.itemId, quantity: String(line.quantity), reserved: String(line.quantity), cancelled: '0' })), invoice: { number: `BAR-${record.id}`, issuedAt: approvedAt.slice(0, 10), dueAt: due } } : {}),
    }
    statements.push(env.DB.prepare('INSERT OR IGNORE INTO bw_orders VALUES(?,?,?,?)').bind(order.id, order.accountId, JSON.stringify(order), order.revision))
    statements.push(env.DB.prepare('INSERT OR IGNORE INTO bw_audit VALUES(?,?,?,?,?)').bind(`audit-${order.id}`, order.id, owner.id, record.status === 'approved' ? 'order.reserved' : `order.${record.status === 'draft' ? 'prepared' : 'submitted'}`, order.preparedAt))
  }
  await env.DB.batch(statements)
}
