// AUTO-002: the scheduled approval escalation (hourly, and on demand by owner/admin as `approval.escalate`). For every
// request waiting on company approval it opens the notices its current step owes (delegations dated after submission,
// escalation people once the escalation time passes) and closes those nobody can act on any more. For every order
// waiting on supplier approval for more than 24 elapsed hours it opens or escalates the AUTO-005 approval task with the
// exact blocking cause, owned by a person who can approve it. Each order runs in its own batch guarded by its revision,
// so a request that changed meanwhile waits for the next run, and reruns never notify or open anything twice.
import type { Bindings } from '../auth.server'
import { approvalNoticeStatements } from './approval-notices'
import { commercialAuditEvent } from './audit-event'
import { now } from './clock'
import { followupSources } from './followup-sources'
import { fail, requirePerson, type Actor, type Order } from './model'
import { calendarDate, reportZone } from './report-zone'

const guard = (db: D1Database, order: { id: string; revision: string }) => db.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_orders WHERE id=? AND revision=?) THEN 1 ELSE 0 END').bind(order.id, order.revision)

export async function escalateApprovals(env: Bindings, at?: Date) {
 const db = env.DB, moment = at ?? await now(), iso = moment.toISOString()
 const waiting = (await db.prepare("SELECT value_json,revision FROM bw_orders WHERE json_extract(value_json,'$.status')='awaiting-company-approval' ORDER BY id").all<{ value_json: string; revision: string }>()).results.map(row => ({ ...JSON.parse(row.value_json), revision: row.revision }) as Order)
 let requests = 0
 for (const order of waiting) {
  try { await db.batch([guard(db, order), ...await approvalNoticeStatements(db, order, moment, 'You can no longer decide this step (delegation ended or rights changed).'), db.prepare('DELETE FROM bw_guard')]); requests++ } catch { /* the request changed meanwhile; the next run sees its new state */ }
 }
 // Supplier side: the same overdue-approval sources AUTO-005 reconciles, owned by someone who can approve.
 const [sources, rows, owner] = await Promise.all([followupSources(db, moment), db.prepare("SELECT value_json,revision FROM bw_followups WHERE id LIKE 'approval:%'").all<{ value_json: string; revision: string }>(), db.prepare("SELECT id FROM oa_operators WHERE status='active' AND role='owner' ORDER BY email=? DESC,created_at,id LIMIT 1").bind(env.OWNER_EMAIL ?? '').first<{ id: string }>()])
 const tasks = new Map(rows.results.map(row => { const task = JSON.parse(row.value_json); return [task.id as string, { ...task, revision: row.revision }] }))
 const today = calendarDate(moment, await reportZone(db)), statements: D1PreparedStatement[] = []
 const event = (subject: string, accountId: string, action: string, reason: string) => { const e = commercialAuditEvent('system:approvals', subject, action, { accountId, revision: iso, source: 'approval.escalate', reason }); return db.prepare(e.sql).bind(...e.params) }
 let opened = 0, escalated = 0, closed = 0
 for (const source of sources.candidates.filter(row => row.kind === 'approval')) {
  const task = tasks.get(source.id)
  if (!task) {
   if (!owner || !sources.accountRevisions.has(source.accountId)) continue
   const value = { ...source, createdAt: iso, ownerId: owner.id, nextContactDate: today, status: 'open', contacts: [] }
   statements.push(db.prepare('INSERT OR IGNORE INTO bw_followups(id,account_id,value_json,revision) VALUES(?,?,?,?)').bind(source.id, source.accountId, JSON.stringify(value), crypto.randomUUID()), event(source.id, source.accountId, 'followup.escalated', `Opened the overdue supplier approval task for the installation owner: ${source.reason}`))
   opened++
  } else if (task.status === 'open' && (task.reason !== source.reason || task.priority !== source.priority)) {
   const { revision, ...value } = task
   statements.push(db.prepare('UPDATE bw_followups SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify({ ...value, reason: source.reason, priority: source.priority }), crypto.randomUUID(), task.id, revision), event(task.id, task.accountId, 'followup.escalated', `Escalated with the current blocking cause: ${source.reason}`))
   escalated++
  }
 }
 for (const task of tasks.values()) {
  const resolution = sources.resolved.get(task.id)
  if (task.status !== 'open' || !resolution) continue
  const { revision, ...value } = task
  statements.push(db.prepare('UPDATE bw_followups SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify({ ...value, status: 'closed', resolution }), crypto.randomUUID(), task.id, revision), event(task.id, task.accountId, 'followup.resolved', `Closed the approval task: ${resolution}`))
  closed++
 }
 if (statements.length) await db.batch(statements)
 return { requests, supplierTasks: { opened, escalated, closed }, ranAt: iso }
}

export async function approvalEscalationCommand(env: Bindings, actor: Actor) {
 requirePerson(actor)
 if (actor.staff || !['owner', 'admin'].includes(actor.role)) fail('FORBIDDEN', 'Only owner or admin people run the approval escalation on demand; it also runs every hour.', 403)
 return escalateApprovals(env)
}
