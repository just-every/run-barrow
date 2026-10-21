// ACC-007: who may decide the step an order is waiting on, and what the buyer and approvers are shown. The frozen route on
// the order, dated delegations and the escalation clock decide; ACC-002's right and limit checks still apply afterwards.
import { now } from './clock'
import { fail, supplierDate, type Actor, type Order } from './model'
import type { OrderRoute } from './company-routes'

export type ApprovalStatus = { step: number; of: number; label: string; waitingSince: string; escalated: boolean; escalatesAt: string | null; approvers: string[]; escalateTo: string[]; decided: OrderRoute['decided']; canDecide: boolean }
export type Decision = { via: 'approver' | 'delegate' | 'escalation'; delegatedFrom?: string; last: boolean; label: string; step: number }

const escalated = (route: OrderRoute, nowMs: number) => {
 const step = route.steps[route.decided.length]
 return Boolean(step?.escalateAfterHours && nowMs - Date.parse(route.stepRequestedAt) >= step.escalateAfterHours * 3600000)
}
/** Dated delegations in force today that let `delegate` act for one of `approvers` on this company. */
async function delegatedFor(db: D1Database, accountId: string, delegate: string, approvers: string[], today: string) {
 return (await db.prepare("SELECT delegator_id FROM bw_company_delegations WHERE account_id=? AND delegate_id=? AND state='active' AND starts_on<=? AND ends_on>=? AND delegator_id IN (SELECT value FROM json_each(?)) ORDER BY created_at,id")
  .bind(accountId, delegate, today, today, JSON.stringify(approvers)).first<{ delegator_id: string }>())?.delegator_id ?? null
}
/** Refuse anyone the current step does not name, in order and with a different person at every step. */
export async function routeDecision(db: D1Database, actor: Actor, order: Order & { approvalRoute: OrderRoute }): Promise<Decision> {
 const route = order.approvalRoute, index = route.decided.length, step = route.steps[index]
 if (!step) fail('APPROVAL_ROUTE', 'Every step of this approval route is already decided.', 409)
 if (route.decided.some(entry => entry.by === actor.id)) fail('DISTINCT_APPROVER', 'Each approval step needs a different person; you already decided an earlier step of this request.', 403)
 const at = await now(), meta = { last: index === route.steps.length - 1, label: step.label, step: index + 1 }
 if (step.approvers.includes(actor.id)) return { via: 'approver', ...meta }
 const from = await delegatedFor(db, order.accountId, actor.id, step.approvers, supplierDate(at))
 if (from) return { via: 'delegate', delegatedFrom: from, ...meta }
 if (escalated(route, at.getTime()) && step.escalateTo.includes(actor.id)) return { via: 'escalation', ...meta }
 fail('APPROVAL_ROUTE', `Step ${index + 1} (${step.label}) is assigned to other approvers; you cannot approve it or skip ahead.`, 403)
}
export const decidedEntry = (decision: Decision, actor: Actor, at: string) => ({ step: decision.step, label: decision.label, by: actor.id, at, via: decision.via, ...(decision.delegatedFrom ? { delegatedFrom: decision.delegatedFrom } : {}) })

/** What each reader sees of a waiting request: its step, the escalation clock and whether they may decide it now. */
export async function withApprovalStatus<T extends Order>(db: D1Database, actor: Actor, orders: T[]): Promise<(T & { approvalStatus?: ApprovalStatus })[]> {
 const at = await now(), today = supplierDate(at)
 return Promise.all(orders.map(async order => {
  const route = order.approvalRoute
  if (!route || order.status !== 'awaiting-company-approval') return order
  const index = route.decided.length, step = route.steps[index]
  if (!step) return order
  let canDecide = false
  if (!actor.agent && !actor.staff && actor.role === 'member' && !route.decided.some(entry => entry.by === actor.id) && order.preparedBy !== actor.id && order.companyPreparedBy !== actor.id) {
   canDecide = step.approvers.includes(actor.id) || Boolean(await delegatedFor(db, order.accountId, actor.id, step.approvers, today)) || escalated(route, at.getTime()) && step.escalateTo.includes(actor.id)
  }
  const after = step.escalateAfterHours ? new Date(Date.parse(route.stepRequestedAt) + step.escalateAfterHours * 3600000).toISOString() : null
  return { ...order, approvalStatus: { step: index + 1, of: route.steps.length, label: step.label, waitingSince: route.stepRequestedAt, escalated: escalated(route, at.getTime()), escalatesAt: after, approvers: step.approvers, escalateTo: step.escalateTo, decided: route.decided, canDecide } }
 }))
}
