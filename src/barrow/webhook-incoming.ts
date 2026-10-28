import type { Bindings } from '../auth.server'
/** Called only after Base authenticates and commits authorized provider events. */
export async function recordWebhookIntake(env:Bindings,namespace:'quotes'|'reports'|'campaigns',occurredAt:number,outcomes:any) {
 if(!Array.isArray(outcomes)||!outcomes.length)return
 await env.DB.batch(outcomes.map(outcome=>env.DB.prepare('INSERT INTO bw_webhook_incoming(id,provider,namespace,event_id,occurred_at,received_at,outcome,applied) VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),'resend',namespace,outcome.eventId,occurredAt,new Date().toISOString(),outcome.outcome,outcome.recipients.some((r:any)=>r.applied)?1:0)))
}
