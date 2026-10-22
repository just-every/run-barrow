// AUTO-002: in-app approval notices. Every person who may decide the step a company-approval request waits on gets one
// notice for that step of that request: the step's approvers, the delegates on today's dated delegations for them and,
// once the step's escalation time has passed, its escalation people. Without an ACC-007 route, every current approver
// whose limit covers the order is notified (ACC-002). Each must be a current approver with this ship-to and a limit
// covering the order, and never the preparer or an earlier step's decider. A notice closes when its step is decided,
// the request is released, voided, withdrawn or superseded, or the person can no longer decide it. Notices are in-app
// only; no approval email is sent.
import { commercialAuditEvent } from './audit-event'
import { companyLocationAllowed, parseCompanyMember } from './company-policy'
import { fail, requirePerson, supplierDate, type Actor, type Order } from './model'

export type NoticeRole = 'approver' | 'delegate' | 'escalation'
type Recipient = { userId: string; role: NoticeRole; delegatedFrom?: string; cause: string }

/** Active company members holding the approver right whose location access and approval limit cover this order. */
async function eligibleApprovers(db: D1Database, order: Order) {
 const rows = (await db.prepare(`SELECT m.* FROM bw_company_members m JOIN oa_operators p ON p.id=m.user_id
  WHERE m.account_id=? AND m.state='active' AND m.erased_at IS NULL AND p.status='active' AND p.role='member'
  AND EXISTS(SELECT 1 FROM json_each(m.policy_json,'$.rights') r WHERE r.value='approver') ORDER BY m.display_name,m.user_id`).bind(order.accountId).all<any>()).results.map(parseCompanyMember)
 return rows.filter(member => {
  if (!companyLocationAllowed(member, order.shipTo?.id)) return false
  const limit = order.shipTo && member.locationLimits?.[order.shipTo.id]?.approvalLimitCents !== undefined ? member.locationLimits[order.shipTo.id].approvalLimitCents! : member.approvalLimitCents
  return limit === null || order.totalCents <= limit
 })
}

/** Who may decide the step this order waits on now, with the exact cause each is told; null when nothing waits. */
export async function approvalRecipients(db: D1Database, order: Order, at: Date): Promise<{ step: number; recipients: Recipient[] } | null> {
 if (order.status !== 'awaiting-company-approval' || !order.companyRequestedAt) return null
 const route = order.approvalRoute, members = await eligibleApprovers(db, order), names = new Map(members.map(member => [member.userId, member.name]))
 const excluded = new Set([order.preparedBy, order.companyPreparedBy, ...(route?.decided.map(entry => entry.by) ?? [])])
 const out: Recipient[] = [], add = (recipient: Recipient) => { if (!excluded.has(recipient.userId) && names.has(recipient.userId) && !out.some(row => row.userId === recipient.userId)) out.push(recipient) }
 if (!route) {
  for (const member of members) add({ userId: member.userId, role: 'approver', cause: `Order ${order.id} waits since ${order.companyRequestedAt} for a company approver whose limit covers it.` })
  return { step: 1, recipients: out }
 }
 const index = route.decided.length, step = route.steps[index]
 if (!step) return null
 // Causes name steps, times and roles, never people: names are read live, so erasing a person leaves no copy here.
 const label = `Order ${order.id} step ${index + 1} of ${route.steps.length} (${step.label})`
 for (const id of step.approvers) add({ userId: id, role: 'approver', cause: `${label} waits for your approval since ${route.stepRequestedAt}.` })
 const today = supplierDate(at)
 const delegations = (await db.prepare("SELECT delegator_id,delegate_id,ends_on FROM bw_company_delegations WHERE account_id=? AND state='active' AND starts_on<=? AND ends_on>=? ORDER BY created_at,id").bind(order.accountId, today, today).all<{ delegator_id: string; delegate_id: string; ends_on: string }>()).results
 for (const row of delegations) if (step.approvers.includes(row.delegator_id)) add({ userId: row.delegate_id, role: 'delegate', delegatedFrom: row.delegator_id, cause: `${label} waits since ${route.stepRequestedAt} for the approver you stand in for; you may decide it as their delegate through ${row.ends_on}.` })
 if (step.escalateAfterHours && at.getTime() - Date.parse(route.stepRequestedAt) >= step.escalateAfterHours * 3600000) {
  for (const id of step.escalateTo) add({ userId: id, role: 'escalation', cause: `${label} has waited since ${route.stepRequestedAt} for its approvers, past its ${step.escalateAfterHours}-hour escalation time; as an escalation approver you may decide it now.` })
 }
 return { step: index + 1, recipients: out }
}

/**
 * Statements for the caller's own batch, after `order` is written: open a notice for each current recipient (once per
 * request, step and person) and close every other open notice of this order with `closing` as the reason.
 */
export async function approvalNoticeStatements(db: D1Database, order: Order, at: Date, closing: string): Promise<D1PreparedStatement[]> {
 const current = await approvalRecipients(db, order, at), iso = at.toISOString()
 if (!current) return [db.prepare('UPDATE bw_approval_notices SET closed_at=?,closed_reason=? WHERE order_id=? AND closed_at IS NULL').bind(iso, closing, order.id)]
 const key = order.companyRequestedAt!
 return [
  db.prepare('UPDATE bw_approval_notices SET closed_at=?,closed_reason=? WHERE order_id=? AND closed_at IS NULL AND (request_key<>? OR step<>? OR recipient_id NOT IN (SELECT value FROM json_each(?)))').bind(iso, closing, order.id, key, current.step, JSON.stringify(current.recipients.map(row => row.userId))),
  ...current.recipients.flatMap(row => {
   const event = commercialAuditEvent('system:approvals', order.id, 'order.approval-notified', { accountId: order.accountId, orderId: order.id, revision: key, source: 'approval.notice', reason: `In-app notice to ${row.userId} (${row.role}${row.delegatedFrom ? ` for ${row.delegatedFrom}` : ''}) for step ${current.step}: ${row.cause}` })
   return [db.prepare('INSERT OR IGNORE INTO bw_approval_notices(id,order_id,account_id,request_key,step,recipient_id,role,delegated_from,cause,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), order.id, order.accountId, key, current.step, row.userId, row.role, row.delegatedFrom ?? null, row.cause, iso),
    // Audited only when this run opened the notice, so a rerun or retry records nothing new.
    db.prepare(`INSERT INTO bw_audit(id,subject_id,actor_id,action,created_at,context_json) SELECT ?,?,?,?,?,? WHERE changes()=1`).bind(...event.params)]
  }),
 ]
}

/** The signed-in person's open notices for requests still waiting on the notified step. */
export async function readApprovalNotices(db: D1Database, actor: Actor) {
 requirePerson(actor)
 if (actor.staff || actor.role !== 'member') fail('FORBIDDEN', 'Approval notices belong to company approvers.', 403)
 const rows = (await db.prepare(`SELECT n.*,o.value_json,(SELECT m.display_name FROM bw_company_members m WHERE m.user_id=n.delegated_from AND m.account_id=n.account_id AND m.erased_at IS NULL) AS delegator
  FROM bw_approval_notices n JOIN bw_orders o ON o.id=n.order_id WHERE n.recipient_id=? AND n.closed_at IS NULL ORDER BY n.created_at,n.id`).bind(actor.id).all<any>()).results
 const notices = rows.filter(row => {
  const order = JSON.parse(row.value_json) as Order
  return order.status === 'awaiting-company-approval' && order.companyRequestedAt === row.request_key && (order.approvalRoute ? order.approvalRoute.decided.length + 1 : 1) === row.step
 }).map(row => { const order = JSON.parse(row.value_json) as Order; return { id: row.id as string, orderId: row.order_id as string, reference: order.reference, totalCents: order.totalCents, step: row.step as number, role: row.role as NoticeRole, ...(row.delegated_from ? { standingInFor: (row.delegator ?? 'a former approver') as string } : {}), cause: row.cause as string, createdAt: row.created_at as string } })
 return { notices, note: 'Each notice names the step that waits for you. It closes when that step is decided, the request is released, withdrawn, voided or revised, or you can no longer decide it. Barrow sends these in the app only.' }
}
