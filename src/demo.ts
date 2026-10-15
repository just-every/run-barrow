import type { Bindings } from './auth.server'
import type { Order } from './barrow/model'
import { demoCustomers, demoProducts, demoItemId, demoCustomerId, demoPierOrigin } from './demo-data'

export async function seedDemo(env: Bindings, { ownerEmail, now }: { ownerEmail: string; now: Date }) {
  const owner = await env.DB.prepare('SELECT id FROM oa_operators WHERE email=?').bind(ownerEmail).first<{ id: string }>()
  if (!owner) return
  const date = (days: number) => new Date(now.getTime() + days * 86400000).toISOString()
  const statements = [env.DB.prepare('INSERT OR IGNORE INTO oa_first_run VALUES(1,?,?)').bind(owner.id, now.getTime())]
  for (const [index, [id, name]] of demoCustomers.entries()) {
    const termsDays = [30, 14, 0][index % 3]
    const prices = demoProducts.map(product => ({ sku: product.sku, unitCents: product.cents - (index % 3) * 100, minQty: 2 }))
    statements.push(env.DB.prepare('INSERT OR IGNORE INTO bw_accounts VALUES(?,?,?)').bind(`demo-${id}`, JSON.stringify({ name, email: `${id}@example.test`, pierCustomerId: demoCustomerId(id), termsDays, minimumCents: 10000, prices }), `demo-account-${id}-1`))
    // Two recent orders per customer: active drafts and submissions alongside invoiced history.
    for (let number = 0; number < 2; number++) {
      const orderId = `demo-${id}-${number + 1}`, status = number === 0 ? (index % 2 ? 'submitted' : 'draft') : 'approved'
      const lines = [0, 1].map(offset => {
        const product = demoProducts[(index + offset) % demoProducts.length], price = prices.find(p => p.sku === product.sku)!
        return { ...price, name: product.name, itemId: demoItemId(product.sku), quantity: 4 + (index % 3) * 2 }
      })
      const issued = -3 - index
      const order: Order = { id: orderId, accountId: `demo-${id}`, accountRevision: `demo-account-${id}-1`, customerName: name, reference: `${id.toUpperCase()}-${now.toISOString().slice(0, 7)}-${number + 1}`, lines, totalCents: lines.reduce((sum, line) => sum + line.quantity * line.unitCents, 0), termsDays, status, preparedBy: owner.id, preparedAt: date(number ? issued - 2 : -index / 2), pierCustomerId: demoCustomerId(id), pierOrigin: demoPierOrigin, revision: `${orderId}-1`,
        ...(status !== 'draft' ? { submittedBy: owner.id } : {}),
        ...(status === 'approved' ? { approvedBy: owner.id, approvedAt: date(issued), pierOrderId: `pier-${orderId}`, pierReference: `SO-${1040 + index}`, reservation: lines.map(line => ({ itemId: line.itemId, quantity: String(line.quantity), reserved: String(line.quantity), cancelled: '0' })), invoice: { number: `BAR-${orderId}`, issuedAt: date(issued).slice(0, 10), dueAt: date(issued + termsDays).slice(0, 10) } } : {}),
      }
      statements.push(env.DB.prepare('INSERT OR IGNORE INTO bw_orders VALUES(?,?,?,?)').bind(orderId, order.accountId, JSON.stringify(order), order.revision))
      statements.push(env.DB.prepare('INSERT OR IGNORE INTO bw_audit VALUES(?,?,?,?,?)').bind(`audit-${orderId}`, orderId, owner.id, status === 'approved' ? 'order.reserved' : `order.${status === 'draft' ? 'prepared' : 'submitted'}`, order.preparedAt))
    }
  }
  await env.DB.batch(statements)
}
