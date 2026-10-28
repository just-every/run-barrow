// STK-002 stock freshness policy. A draft's stock observation is its preparedAt: order.prepare reads live Pier stock
// in the same request. With a limit set, submitting a draft observed longer ago than the limit is refused until the
// buyer prepares it again at live stock or a supplier owner/admin records an explicit exception with a reason.
// Unset means no limit. Supplier approval always reserves against live Pier stock.
import { audit, changed, commit } from './access'
import { fail, integer, requireSupplier, type Actor, type Order } from './model'
import { when } from './ui/types'

export async function freshnessLimit(db: D1Database): Promise<number | undefined> {
 const row = await db.prepare("SELECT value_json FROM bw_settings WHERE key='stockFreshnessMinutes'").first<{ value_json: string }>()
 const value = row ? JSON.parse(row.value_json) : null
 return typeof value === 'number' ? value : undefined
}

export async function saveFreshness(db: D1Database, actor: Actor, p: any) {
 requireSupplier(actor)
 const minutes = p.stockFreshnessMinutes === null ? null : integer(p.stockFreshnessMinutes, 'Stock freshness limit (minutes)', 1, 10080)
 const revision = crypto.randomUUID()
 await commit(db, actor, [
  db.prepare("INSERT INTO bw_settings(key,value_json,revision) VALUES('stockFreshnessMinutes',?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,revision=excluded.revision").bind(JSON.stringify(minutes), revision),
  changed(db),
  audit(db, actor, 'settings:stockFreshnessMinutes', 'settings.stock-freshness', { revision, source: 'settings.save', reason: minutes === null ? 'Supplier removed the stock freshness limit.' : `Supplier set the stock freshness limit to ${minutes} minutes.` }),
 ])
 return { stockFreshnessMinutes: minutes, revision }
}

/** The refusal for a draft whose stock observation is older than the limit, unless an exception was recorded on it. */
export function staleStock(order: Order, limit: number | undefined, at: Date) {
 if (limit === undefined || order.stockException) return undefined
 const age = at.getTime() - Date.parse(order.preparedAt)
 if (age <= limit * 60000) return undefined
 return `${order.pierOrigin.includes('#woocommerce:')?'WooCommerce':'Pier'} stock for this draft was observed ${when(order.preparedAt)}, more than the ${limit}-minute freshness limit ago. Prepare it again at live stock, or ask the supplier to record an exception.`
}
