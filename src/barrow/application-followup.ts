// AUTO-001: one persistent owner task per verified trade application. It is created when the application is verified,
// restarts its review deadline when the applicant answers a request, escalates once the deadline has passed, and ends only
// with a recorded decision (approve, decline, applicant withdrawal) or an explicit human closure. Queuing or sending a
// request never ends it. These tasks are owner/admin only: the follow-up doors hide application tasks from staff roles.
import { routeApplication } from './application-rules'
import { commercialAuditEvent } from './audit-event'
import { supplierDate } from './model'

export type ApplicationEvent = 'submitted' | 'information-requested' | 'answered' | 'approved' | 'declined' | 'withdrawn'
export const applicationTaskId = (applicationId: string) => `application:${applicationId}`
type Stored = { value_json: string; revision: string }
const addDays = (date: string, days: number) => new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10)

/** What the board and the refresh show: past its deadline an open application task is escalated, priority 1. */
export function escalatedView<T extends { status: string; nextContactDate: string; reason: string; priority: number; application?: { baseReason: string; escalateToId: string } }>(task: T, today: string): T {
 if (task.status !== 'open' || !task.application || today <= task.nextContactDate) return task
 return { ...task, priority: 1, reason: `${task.application.baseReason} Escalated: the review deadline ${task.nextContactDate} passed with no decision; the escalation person ${task.application.escalateToId} owns this until a decision or explicit closure.` }
}

/** Statements for the caller's own batch; they never read or change the application row itself. */
export async function applicationTaskStatements(db: D1Database, application: { id: string; value_json: string }, event: ApplicationEvent, at: string, actorId: string): Promise<D1PreparedStatement[]> {
 const id = applicationTaskId(application.id), prior = await db.prepare('SELECT value_json,revision FROM bw_followups WHERE id=?').bind(id).first<Stored>()
 const before = prior ? JSON.parse(prior.value_json) : null, value = JSON.parse(application.value_json), today = supplierDate(new Date(at))
 const revision = crypto.randomUUID(), audit = (action: string, reason: string) => { const e = commercialAuditEvent('system:applications', id, action, { revision, source: 'application.followup', reason }); return db.prepare(e.sql).bind(...e.params) }
 if (['approved', 'declined', 'withdrawn'].includes(event)) {
  if (!before || before.status !== 'open') return []
  return [db.prepare('UPDATE bw_followups SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify({ ...before, status: 'closed', resolution: `Decision recorded: application ${event}.` }), revision, id, prior!.revision), audit('application.task-closed', `Closed the review task because the application was ${event}; queuing a message never closes it.`)]
 }
 if (before && before.status !== 'open') return []
 const documents = Array.isArray(value.documents) ? value.documents.length : (await db.prepare('SELECT COUNT(*) AS count FROM bw_application_documents WHERE application_id=?').bind(application.id).first<{ count: number }>())?.count ?? 0
 const route = before?.application ? { ...before.application } : await routeApplication(db, { states: (value.locations ?? []).map((place: any) => place.state), volumeUsd: value.annualVolumeUsd ?? 0, documents })
 const deadline = addDays(today, route.deadlineDays)
 const baseReason = event === 'information-requested' ? `Information requested from the applicant; follow up if they have not answered by ${deadline}.`
  : event === 'answered' ? `The applicant answered; review again by ${deadline}.`
  : `Verified application${route.ruleName ? ` routed by “${route.ruleName}”` : ''}${route.territory ? ` to territory ${route.territory}` : ''}; ${documents ? `${documents} document${documents === 1 ? '' : 's'} attached, not validated` : 'no certificate attached'}. Review by ${deadline}.`
 const next = { ...(before ?? {}), id, kind: 'application', accountId: id, sourceId: application.id, sourcePath: '/api/barrow/applications', title: `Review trade application ${value.name}`, reason: baseReason, priority: 2, createdAt: before?.createdAt ?? at,
  ownerId: before?.ownerId ?? route.ownerId, nextContactDate: deadline, status: 'open', contacts: before?.contacts ?? [], application: { ruleId: route.ruleId ?? null, ruleName: route.ruleName ?? null, ...(route.territory ? { territory: route.territory } : {}), ownerId: route.ownerId, escalateToId: route.escalateToId, deadlineDays: route.deadlineDays, baseReason } }
 return [prior ? db.prepare('UPDATE bw_followups SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify(next), revision, id, prior.revision) : db.prepare('INSERT OR IGNORE INTO bw_followups(id,account_id,value_json,revision) VALUES(?,?,?,?)').bind(id, id, JSON.stringify(next), revision),
  audit(prior ? 'application.task-updated' : 'application.task-opened', `${prior ? 'Restarted' : 'Opened'} the owner review task (${event}); reviewer ${next.ownerId}, deadline ${deadline}.`)]
}
