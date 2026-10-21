import type { Bindings } from '../auth.server'
import { commercialAuditEvent } from './audit-event'
import type { Actor } from './model'

export function reportAudit(env: Bindings, actor: string, subject: string, action: string, reason: string, onlyChanged = false) {
 const event = commercialAuditEvent(actor, subject, 'report.' + action, { revision: subject, source: 'scheduled-report', reason })
 return env.DB.prepare(onlyChanged ? event.sql.replace('VALUES(?,?,?,?,?,?)','SELECT ?,?,?,?,?,? WHERE changes()>0') : event.sql).bind(...event.params)
}
export async function reportSuppressed(env: Bindings, email: string) {
 return Boolean(await env.DB.prepare(`SELECT 1 FROM bw_quote_mail WHERE recipient=? COLLATE BINARY AND status IN ('bounced','complained','rejected')
 UNION ALL SELECT 1 FROM bw_report_deliveries WHERE recipient=? COLLATE BINARY AND status IN ('bounced','complained','rejected')
 UNION ALL SELECT 1 FROM rer_mail_event_receipts e,json_each(e.event_json,'$.recipients') r
 WHERE e.provider='resend' AND json_extract(e.event_json,'$.status') IN ('bounced','complained','rejected') AND r.value=? COLLATE BINARY LIMIT 1`).bind(email,email,email).first())
}
// Every report currently supported requires complete supplier scope. Future functional roles
// must implement whole-filter coverage here before becoming eligible; never trim a snapshot.
export async function reportEntitlement(env: Bindings, scheduleId: string, operatorId: string, actor?: Actor) {
 const row = await env.DB.prepare(`SELECT p.email,p.version,p.role,p.status,r.operator_version,r.role AS saved_role,r.removed_at,s.restored
 FROM bw_report_recipients r JOIN bw_report_schedules s ON s.id=r.schedule_id
 LEFT JOIN oa_operators p ON p.id=r.operator_id WHERE r.schedule_id=? AND r.operator_id=?`).bind(scheduleId,operatorId).first<any>()
 let reason: string | null = null
 if (!row) reason = 'not an exact recipient'
 else if (row.restored) reason = 'restored schedule requires a new native definition'
 else if (row.removed_at) reason = 'recipient removed'
 else if (row.status !== 'active') reason = 'recipient account inactive or unavailable'
 else if (row.version !== row.operator_version) reason = 'recipient account version changed'
 else if (row.role !== row.saved_role || !['owner','admin'].includes(row.role)) reason = 'role no longer covers the whole saved filter'
 else if (actor && (actor.agent || actor.id !== operatorId || actor.version !== row.version || actor.role !== row.role)) reason = 'current sign-in does not cover the whole saved filter'
 else if (await reportSuppressed(env,row.email)) reason = 'terminal address suppression'
 return { reason, email: row?.email as string | undefined }
}
export async function cancelReportRecipient(env: Bindings, scheduleId: string, operatorId: string, reason: string) {
 await env.DB.batch([
  env.DB.prepare(`UPDATE bw_report_deliveries SET status='cancelled',reason=?,updated_at=? WHERE operator_id=? AND run_id IN (SELECT id FROM bw_report_runs WHERE schedule_id=?) AND status IN ('queued','not configured')`).bind(reason,new Date().toISOString(),operatorId,scheduleId),
  reportAudit(env,'system:reports',scheduleId,'refused',`${operatorId}: ${reason}; no report trimmed.`),
 ])
}
