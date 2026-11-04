import type { Actor, AgentPreparation, Order } from './model'

/** Server admission owns these identities; customer text never supplies provenance. */
export const agentPreparation = (actor: Actor): AgentPreparation | undefined => actor.agent && actor.door
 ? { agent: actor.door.agentId, person: actor.door.sponsorId, label: actor.door.label } : undefined

export function recordedPreparation(value: unknown): AgentPreparation | undefined {
 if (!value || typeof value !== 'object') return
 const row = value as Record<string, unknown>
 if (['agent','person','label'].every(key => typeof row[key] === 'string' && row[key].length > 0))
  return { agent: row.agent as string, person: row.person as string, label: row.label as string }
}

/** Older orders retain their original preparer field; their native preparation audit
 * supplies typed provenance without interpreting a label as an identity. */
export async function withPreparation(db: D1Database, orders: Order[]): Promise<Order[]> {
 const missing = orders.filter(order => !order.agentPreparation)
 if (!missing.length) return orders
 const rows = (await db.prepare(`SELECT subject_id,actor_id,context_json FROM bw_audit
  WHERE action='order.prepared' AND subject_id IN (SELECT value FROM json_each(?)) ORDER BY rowid`)
  .bind(JSON.stringify(missing.map(order => order.id))).all<{subject_id:string;actor_id:string;context_json:string|null}>()).results
 const recorded = new Map<string, AgentPreparation>()
 for (const row of rows) {
  const preparation = recordedPreparation(row.context_json ? JSON.parse(row.context_json).preparedBy : null)
  if (preparation && row.actor_id === `agent:${preparation.agent}` && !recorded.has(row.subject_id))
   recorded.set(row.subject_id, preparation)
 }
 return orders.map(order => order.agentPreparation || !recorded.has(order.id) ? order : {...order, agentPreparation: recorded.get(order.id)})
}
