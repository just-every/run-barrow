// ORD-007 purchase references: dates are calendar days in the supplier's zone (America/New_York), bounds inclusive.
import { fail, text, type Actor, type Order } from './model'
const day = (value: unknown, name: string) => {
 if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) fail('INPUT', `${name} must be a calendar date (YYYY-MM-DD).`, 400)
 return value
}
/** Requested delivery and cancel-after dates are optional; neither may be before today, and cancel-after is on or after the requested date. */
export function purchaseDetails(p: any, today: string) {
 const requestedDate = p.requestedDate ? day(p.requestedDate, 'Requested delivery date') : undefined
 const cancelAfter = p.cancelAfter ? day(p.cancelAfter, 'Cancel-after date') : undefined
 for (const [value, name] of [[requestedDate, 'Requested delivery date'], [cancelAfter, 'Cancel-after date']] as const) if (value && value < today) fail('DATES', `${name} cannot be before today (${today}, Eastern time).`, 400)
 if (requestedDate && cancelAfter && cancelAfter < requestedDate) fail('DATES', 'The cancel-after date must be on or after the requested delivery date.', 400)
 const instructions = p.instructions ? text(p.instructions, 'Instructions', 1000) : undefined
 return { ...(requestedDate ? { requestedDate } : {}), ...(cancelAfter ? { cancelAfter } : {}), ...(instructions ? { instructions } : {}) }
}
/** ORD-014: a line may carry its own ship window (requested delivery and cancel-after dates); lines without one follow the order's. */
export function lineWindow(line: any, today: string) {
 const { requestedDate, cancelAfter } = purchaseDetails({ requestedDate: line?.requestedDate, cancelAfter: line?.cancelAfter }, today)
 return { ...(requestedDate ? { requestedDate } : {}), ...(cancelAfter ? { cancelAfter } : {}) }
}
/** Pier records one promise date per order: the earliest requested date of the order or any of its line windows. */
export const promiseDate = (order: Order) => [order.requestedDate, ...order.lines.map(line => line.requestedDate)].filter((date): date is string => Boolean(date)).sort()[0]
/** A buyer SKU alias is the buyer's own code for a line, kept as written; it never selects the supplier SKU. */
export const buyerSku = (line: any) => line?.buyerSku ? { buyerSku: text(line.buyerSku, 'Buyer SKU', 60) } : {}
/** POs match within one trade account after trimming, collapsing spaces and ignoring case. */
export const poKey = (reference: string) => reference.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')
const live = ['prebook', 'submitted', 'reserving', 'shortfall', 'approved', 'releasing']
/**
 * Submitting a PO already on a live order of the same account is refused unless the person explicitly authorizes a
 * numbered release. Release numbers count every submitted order with that PO, cancelled ones included; the first is 1.
 * The returned guard fails the submission if another order of the account was submitted after this check.
 */
export async function purchaseRelease(db: D1Database, actor: Actor, order: Order, authorize: unknown, at: string) {
 const rows = await db.prepare('SELECT value_json FROM bw_orders WHERE account_id=? AND id<>?').bind(order.accountId, order.id).all<{ value_json: string }>()
 const others = rows.results.map(row => JSON.parse(row.value_json) as Order), submitted = others.filter(other => other.status !== 'draft' && other.status !== 'superseded')
 const guard = db.prepare(`INSERT INTO bw_guard(value) SELECT CASE WHEN COUNT(*)=? THEN 1 ELSE 0 END FROM bw_orders WHERE account_id=? AND id<>? AND json_extract(value_json,'$.status') NOT IN ('draft','superseded')`).bind(submitted.length, order.accountId, order.id)
 const key = order.reference ? poKey(order.reference) : ''
 const same = key ? submitted.filter(other => poKey(other.reference) === key) : []
 const earlier = same.filter(other => live.includes(other.status))
 if (!earlier.length) return { guard }
 if (authorize !== true) fail('DUPLICATE_PO', `PO ${order.reference} is already on order ${earlier[0].id}. Confirm a numbered release to submit it again.`)
 const number = Math.max(1, ...same.map(other => other.poRelease?.number ?? 1)) + 1
 const first = [...same].sort((a, b) => a.preparedAt.localeCompare(b.preparedAt))[0]
 return { guard, poRelease: { number, of: first.poRelease?.of ?? first.id, authorizedBy: actor.id, authorizedAt: at } }
}
