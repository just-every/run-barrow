// ORD-012: an order's timeline lists only recorded facts, each with its source, time and owner. Nothing is inferred:
// a state no connected source records reads "not recorded".
import type { Bindings } from '../auth.server'
import { pierState, pierOrigin } from './pier'
import type { Order } from './model'
const states: Record<string, string> = {
 'order.confirmation':'Order confirmation recorded',
 'substitution.offered':'Substitution offered for buyer review', 'substitution.declined':'Substitution declined by buyer', 'substitution.accepted':'Exact substitution accepted by buyer', 'substitution.replacement':'Replacement linked to accepted substitution',
 'order.prepared': 'Draft prepared', 'order.document-attached': 'PO document attached', 'order.superseded': 'Replaced by a newer draft',
 'order.submitted': 'Submitted: approval pending', 'order.submitted-release': 'Submitted as a numbered PO release: approval pending',
 'order.approved': 'Accepted by the supplier', 'order.reserved': 'Allocated: every unit reserved', 'order.shortfall': 'Backordered: stock shortfall',
 'order.release-requested': 'Cancellation requested: stock release pending', 'order.released': 'Cancelled: stock released',
}
export type TimelineEntry = { state: string; at: string; source: 'Barrow' | 'Pier'; owner: string; detail?: string; confirmation?: number }
export async function orderTimeline(env: Bindings, order: Order) {
 const events = (await env.DB.prepare(`SELECT e.action,e.created_at,e.actor_id,o.display_name,c.number AS confirmation FROM bw_audit e LEFT JOIN oa_operators o ON o.id=e.actor_id LEFT JOIN bw_confirmations c ON e.action='order.confirmation' AND c.order_id=e.subject_id AND json_extract(c.value_json,'$.orderRevision')=json_extract(e.context_json,'$.revision') WHERE e.subject_id=? OR json_extract(e.context_json,'$.orderId')=? ORDER BY e.created_at,e.rowid`).bind(order.id, order.id).all<{ action: string; created_at: string; actor_id: string; display_name: string | null; confirmation: number | null }>()).results
 const entries: TimelineEntry[] = events.filter(event => states[event.action]).map(event => ({ state: states[event.action], at: event.created_at, source: 'Barrow', owner: event.actor_id.startsWith('agent:') ? 'An agent' : event.display_name ?? 'A former user', ...(event.confirmation ? {confirmation:event.confirmation,detail:`${order.id}-C${event.confirmation}`} : {}) }))
 let pier: 'read' | 'none' | 'unavailable' = 'none'
 if (order.pierOrderId && order.pierOrigin === await pierOrigin(env)) {
  try {
   const state = await pierState(env), itemName = (id: string) => order.lines.find(line => line.itemId === id)?.sku ?? id
   for (const shipment of Array.isArray(state.shipments) ? state.shipments.filter((s: any) => s.orderId === order.pierOrderId) : [])
    entries.push({ state: 'Shipped', at: shipment.createdAt, source: 'Pier', owner: 'Pier', detail: `${shipment.reference}: ${shipment.lines.map((line: any) => `${line.quantity} ${itemName(line.itemId)}`).join(', ')}` })
   const shipped = new Set((Array.isArray(state.shipments) ? state.shipments : []).filter((s: any) => s.orderId === order.pierOrderId).map((s: any) => s.id))
   for (const item of Array.isArray(state.returns) ? state.returns.filter((r: any) => shipped.has(r.shipmentId)) : [])
    entries.push({ state: item.status === 'restocked' ? 'Returned and restocked' : 'Return received: in quarantine', at: item.createdAt, source: 'Pier', owner: 'Pier', detail: `${item.quantity} ${itemName(item.itemId)}: ${item.reason}` })
   pier = 'read'
  } catch { pier = 'unavailable' }
 }
 entries.sort((a, b) => a.at.localeCompare(b.at))
 // States with no connected source today; SHIP-003, PAY-005 and PAY-007/SHIP-004 bring their records.
 const unrecorded = ['Delivered', 'Held', 'Closed'].map(state => ({ state, detail: 'Not recorded: no connected source reports it.' }))
 return { orderId: order.id, revision: order.revision, status: order.status, entries, unrecorded, pier }
}
