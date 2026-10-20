// OPS-001: what an owner needs to recover today's handoffs. Pier health is one live read, never a stored guess;
// outstanding handoffs come from the orders themselves, each keyed by its durable Pier command ID.
import type { Bindings } from '../auth.server'
import { pierConfigured, pierOrigin, pierState } from './pier'
import { Problem, requireSupplier, type Actor, type Order } from './model'
const pending: Record<string, { state: string; action: string }> = {
 reserving: { state: 'Reservation sent, not confirmed', action: 'Retry stock reservation' },
 shortfall: { state: 'Reserved short in Pier', action: 'Refresh stock status' },
 releasing: { state: 'Release sent, not confirmed', action: 'Retry stock release' },
}
export async function diagnostics(env: Bindings, actor: Actor) {
 requireSupplier(actor)
 const checkedAt = new Date().toISOString(), origin = await pierOrigin(env)
 let pier: { state: 'ok' | 'failed' | 'not configured'; origin: string | null; checkedAt: string; message?: string } = { state: 'not configured', origin: origin ?? null, checkedAt }
 if (await pierConfigured(env)) {
  try { await pierState(env); pier = { ...pier, state: 'ok' } }
  catch (error) { pier = { ...pier, state: 'failed', message: error instanceof Problem ? error.message : 'Pier did not answer.' } }
 }
 const rows = (await env.DB.prepare(`SELECT value_json FROM bw_orders WHERE json_extract(value_json,'$.status') IN ('reserving','shortfall','releasing') ORDER BY rowid`).all<{ value_json: string }>()).results
 const orders = rows.map(row => JSON.parse(row.value_json) as Order)
 const ids = [...new Set(orders.map(order => order.release?.requestedBy ?? order.approvedBy).filter((id): id is string => Boolean(id)))]
 const names = ids.length ? Object.fromEntries((await env.DB.prepare('SELECT id,display_name FROM oa_operators WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(ids)).all<{ id: string; display_name: string }>()).results.map(row => [row.id, row.display_name])) : {}
 const handoffs = orders.map(order => {
  const release = order.status === 'releasing', owner = release ? order.release?.requestedBy : order.approvedBy
  const moved = order.pierOrigin !== origin
  return {
   orderId: order.id, accountId: order.accountId, customer: order.customerName,
   correlationId: release ? `barrow-release-${order.id}` : `barrow-${order.id}`, pierOrderId: order.pierOrderId ?? null,
   state: moved ? 'Recorded for a different Pier origin' : order.status === 'reserving' && order.pierOrderId ? 'Reservation acknowledged, result pending refresh' : pending[order.status].state,
   since: (release ? order.release?.requestedAt : order.approvedAt) ?? order.preparedAt,
   owner: owner ? names[owner] ?? 'A former user' : 'Not recorded',
   action: moved ? 'Reconnect the original Pier installation' : order.status === 'reserving' && order.pierOrderId ? 'Refresh stock status' : pending[order.status].action,
  }
 })
 // Barrow records an invitation request, not its delivery; INT-015 brings delivery states.
 const deliveries=(await env.DB.prepare("SELECT m.id,m.quote_id,m.recipient,m.status,m.provider_message_id,m.reason,m.attempts,m.created_at,m.updated_at,m.task_id,json_extract(f.value_json,'$.ownerId') AS ownerId FROM bw_quote_mail m LEFT JOIN bw_followups f ON f.id=m.task_id WHERE m.status<>'delivered' ORDER BY m.created_at,m.id").all<any>()).results.map(row=>({...row,ageSeconds:Math.max(0,Math.floor((Date.now()-Date.parse(row.created_at))/1000)),label:row.status==='accepted'&&!row.provider_message_id?'accepted (uncorrelated)':row.status,taskPath:row.task_id?'/app?quote='+row.quote_id:null}))
 const notifications = { recorded: true, deliveries, note: 'Quote mail acceptance is not delivery. Delivered means delivered to the recipient mail server. Open non-success deliveries retain their identity, age and owned contact task; reconnect the configured Resend provider and webhook secret before retrying. Invitation and other notification delivery remain not recorded.' }
 return { checkedAt, pier, handoffs, notifications }
}
