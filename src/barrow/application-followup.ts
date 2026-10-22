// AUTO-001: one persistent owner task per verified trade application. It is created when the application is verified,
// restarts its review deadline when staff request information or the applicant answers, escalates once a deadline has
// passed with no decision, and stays escalated until a recorded decision (approve, decline, applicant withdrawal) or an
// explicit human closure. Requests, answers and queued emails never end it. ACC-005 current application reviewers
// may read and manage them; other functional staff never see these records.
import { routeApplication } from './application-rules'
import { commercialAuditEvent } from './audit-event'
import { supplierDate } from './model'

export type ApplicationEvent = 'submitted' | 'information-requested' | 'answered' | 'approved' | 'declined' | 'withdrawn'
export type ApplicationTaskRoute = { ruleId: string | null; ruleName: string | null; territory?: string; ownerId: string; escalateToId: string; deadlineDays: number; request?: string; baseReason: string; deadline: string; escalatedOn?: string }
export const applicationTaskId = (applicationId: string) => `application:${applicationId}`
type Stored = { value_json: string; revision: string }
const addDays = (date: string, days: number) => new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10)
const termsLabel = (days: number | null | undefined) => days ? `Net ${days} terms requested` : 'no payment terms requested'

/** The first day this open task counted as escalated, or null while its deadline has not passed. */
function escalatedSince(application: ApplicationTaskRoute, today: string) {
 return application.escalatedOn ?? (today > application.deadline ? addDays(application.deadline, 1) : null)
}

/** What the board, the refresh and the staff review show: once escalated an open application task is priority 1 until it closes. */
export function escalatedView<T extends { status: string; reason: string; priority: number; application?: ApplicationTaskRoute }>(task: T, today: string): T & { escalated?: { since: string; toId: string } } {
 const since = task.status === 'open' && task.application ? escalatedSince(task.application, today) : null
 if (!since || !task.application) return task
 return { ...task, priority: 1, escalated: { since, toId: task.application.escalateToId }, reason: `${task.application.baseReason} Escalated since ${since}: a review deadline passed with no decision. It stays escalated until a decision (approve, decline or withdrawal) or an explicit closure.` }
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
 const earlier: ApplicationTaskRoute | undefined = before?.application
 const route = await routeApplication(db, { states: (value.locations ?? []).map((place: any) => place.state), termsDays: value.requestedTermsDays ?? 0, volumeUsd: value.annualVolumeUsd ?? 0, documents }, earlier ? { ...earlier, ownerId: before.ownerId } : undefined)
 const deadline = addDays(today, route.deadlineDays), escalatedOn = earlier ? escalatedSince(earlier, today) : null
 const baseReason = event === 'information-requested' ? `Information requested from the applicant; follow up if they have not answered by ${deadline}.`
  : event === 'answered' ? `The applicant answered; review again by ${deadline}.`
  : `Verified application${route.ruleName ? ` routed by “${route.ruleName}”` : ''}${route.territory ? ` to territory ${route.territory}` : ''}; ${termsLabel(value.requestedTermsDays)}; ${documents ? `${documents} document${documents === 1 ? '' : 's'} attached, not validated` : 'no certificate attached'}. Review by ${deadline}.`
 const block: ApplicationTaskRoute = { ruleId: route.ruleId ?? null, ruleName: route.ruleName ?? null, ...(route.territory ? { territory: route.territory } : {}), ownerId: route.ownerId, escalateToId: route.escalateToId, deadlineDays: route.deadlineDays, ...(route.request ? { request: route.request } : {}), baseReason, deadline, ...(escalatedOn ? { escalatedOn } : {}) }
 const next = { ...(before ?? {}), id, kind: 'application', accountId: id, sourceId: application.id, sourcePath: `/app?application=${encodeURIComponent(application.id)}`, title: `Review trade application ${value.name}`, reason: baseReason, priority: escalatedOn ? 1 : 2, createdAt: before?.createdAt ?? at,
  ownerId: route.ownerId, nextContactDate: deadline, status: 'open', contacts: before?.contacts ?? [], application: block }
 return [...route.guards, prior ? db.prepare('UPDATE bw_followups SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify(next), revision, id, prior.revision) : db.prepare('INSERT OR IGNORE INTO bw_followups(id,account_id,value_json,revision) VALUES(?,?,?,?)').bind(id, id, JSON.stringify(next), revision),
  audit(prior ? 'application.task-updated' : 'application.task-opened', `${prior ? 'Restarted' : 'Opened'} the owner review task (${event}); reviewer ${next.ownerId}, deadline ${deadline}${escalatedOn ? `, escalated since ${escalatedOn}` : ''}.`)]
}

/** The routing facts staff read beside an application: rule, territory, people by name, deadline, escalation and prepared request. */
export async function applicationReview(db: D1Database, applicationId: string, today: string) {
 const row = await db.prepare('SELECT value_json FROM bw_followups WHERE id=?').bind(applicationTaskId(applicationId)).first<{ value_json: string }>()
 if (!row) return null
 const task = escalatedView(JSON.parse(row.value_json), today), application: ApplicationTaskRoute = task.application
 const names = new Map((await db.prepare("SELECT id,display_name AS name FROM oa_operators WHERE id IN (?,?)").bind(task.ownerId, application.escalateToId).all<{ id: string; name: string }>()).results.map(person => [person.id, person.name]))
 return { taskId: task.id, status: task.status as string, resolution: (task.resolution ?? null) as string | null, ruleName: application.ruleName, territory: application.territory ?? null, reviewer: names.get(task.ownerId) ?? 'a former application reviewer', escalationPerson: names.get(application.escalateToId) ?? 'a former application reviewer', deadline: application.deadline, escalatedSince: task.escalated?.since ?? null, preparedRequest: application.request ?? null }
}
