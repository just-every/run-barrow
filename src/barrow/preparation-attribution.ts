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
 // A buyer-accepted replacement retains its manager's historical preparer ID.
 // Its exact native proposal link supplies the agent's separate preparation.
 const linked=missing.filter(order=>!recorded.has(order.id)&&order.agentProposal&&order.fromSubstitution)
 if(linked.length) {
  const proposals=(await db.prepare(`SELECT id,number,account_id,order_id,value_json FROM bw_agent_proposals
   WHERE id IN (SELECT value FROM json_each(?))`)
   .bind(JSON.stringify([...new Set(linked.map(order=>order.agentProposal!.id))]))
   .all<{id:string;number:number;account_id:string;order_id:string;value_json:string}>()).results
  for(const order of linked) {
   const row=proposals.find(row=>row.id===order.agentProposal!.id&&row.number===order.agentProposal!.number
    &&row.account_id===order.accountId&&row.order_id===order.fromSubstitution!.orderId)
   const preparation=recordedPreparation(row?JSON.parse(row.value_json).preparedBy:null)
   if(preparation)recorded.set(order.id,preparation)
  }
 }
 return orders.map(order => order.agentPreparation || !recorded.has(order.id) ? order : {...order, agentPreparation: recorded.get(order.id)})
}
