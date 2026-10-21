import type { Bindings } from '../auth.server'
import { commercialAuditEvent } from './audit-event'
import type { Actor } from './model'
import { readStaffGrant, requireStaffReport } from './staff-policy'
import { allOf, repHoldsSql, supplierToday } from './rep-scope'

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
/** Trusted SQL aliases only. Reused in definition, freeze and the durable send claim. A rep's accounts are the owner's
 * exact list plus ACC-006 assignments and coverage on `today`. A scoped recipient's saved filter names one held account;
 * territory filters stay with all-account readers (requireStaffReport refuses them for saved reports). */
export function reportCoverageSql(today: string, p = 'p', s = 's', r = 'r') {
 const held = (accountId: string) => `max(EXISTS(SELECT 1 FROM json_each(g.policy_json,'$.accounts') a WHERE a.value=${accountId}), ${allOf(`json_extract(g.policy_json,'$.role')='rep'`, repHoldsSql(`${p}.id`, accountId, today))})`
 const account = `json_type(${s}.filters_json,'$.accountId')='text'`, named = `json_extract(${s}.filters_json,'$.accountId')`
 const scoped = allOf(  `${account} AND length(${named})>0 AND EXISTS(SELECT 1 FROM bw_accounts f WHERE f.id=${named}) AND ${held(named)}`)
 const grant = allOf(`g.user_id=${p}.id`, `g.state='active'`, `g.native_version=${p}.version`, `g.revision=${r}.staff_grant_revision`,
  `NOT EXISTS(SELECT 1 FROM bw_company_members m WHERE m.user_id=${p}.id OR m.email_key=lower(trim(${p}.email)))`,
  `NOT EXISTS(SELECT 1 FROM bw_company_invites i WHERE i.email_key=lower(trim(${p}.email)) OR i.accepted_by=${p}.id)`,
  `NOT EXISTS(SELECT 1 FROM bw_accounts a WHERE lower(trim(json_extract(a.value_json,'$.email')))=lower(trim(${p}.email)))`,
  `json_extract(g.policy_json,'$.role') IN ('sales-manager','rep','operations','finance','analyst')`,
  `EXISTS(SELECT 1 FROM json_each(g.policy_json,'$.reports') t WHERE t.value=${s}.report_type)`,
  `json_extract(g.policy_json,'$.accounts')='all' OR ${scoped}`)
 return `(${p}.role IN ('owner','admin') AND ${r}.staff_grant_revision IS NULL OR ${p}.role='member' AND EXISTS(SELECT 1 FROM bw_staff_members g WHERE ${grant}))`
}
export function reportRecipientGuard(env: Bindings, scheduleId: string, operatorId: string, today: string) {
 const suppressed = (rows: string) => `NOT EXISTS(SELECT 1 FROM ${rows} x WHERE x.recipient=p.email COLLATE BINARY AND x.status IN ('bounced','complained','rejected'))`
 return env.DB.prepare(`INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(
 SELECT 1 FROM bw_report_recipients r JOIN bw_report_schedules s ON s.id=r.schedule_id JOIN oa_operators p ON p.id=r.operator_id
 WHERE ${allOf('r.schedule_id=?', 'r.operator_id=?', 'r.removed_at IS NULL', 's.restored=0', `p.status='active'`, 'p.version=r.operator_version', 'p.role=r.role', reportCoverageSql(today),
  suppressed('bw_quote_mail'), suppressed('bw_report_deliveries'),
  `NOT EXISTS(SELECT 1 FROM rer_mail_event_receipts e,json_each(e.event_json,'$.recipients') x WHERE e.provider='resend' AND json_extract(e.event_json,'$.status') IN ('bounced','complained','rejected') AND x.value=p.email COLLATE BINARY)`)}) THEN 1 ELSE 0 END`).bind(scheduleId,operatorId)
}
export async function reportEntitlement(env: Bindings, scheduleId: string, operatorId: string, actor?: Actor) {
 const row = await env.DB.prepare(`SELECT p.id,p.email,p.version,p.role,p.status,r.operator_version,r.role AS saved_role,r.staff_grant_revision,r.removed_at,s.restored,s.report_type,s.filters_json,
 ${reportCoverageSql(await supplierToday())} AS covers FROM bw_report_recipients r JOIN bw_report_schedules s ON s.id=r.schedule_id
 LEFT JOIN oa_operators p ON p.id=r.operator_id WHERE r.schedule_id=? AND r.operator_id=?`).bind(scheduleId,operatorId).first<any>()
 let reason: string | null = null, reader: Actor | undefined
 if (!row) reason = 'not an exact recipient'
 else if (row.restored) reason = 'restored schedule requires a new native definition'
 else if (row.removed_at) reason = 'recipient removed'
 else if (row.status !== 'active') reason = 'recipient account inactive or unavailable'
 else if (row.version !== row.operator_version) reason = 'recipient account version changed'
 else if (row.role !== row.saved_role || !row.covers) reason = 'role or staff grant no longer covers the whole saved filter'
 else if (actor && (actor.agent || actor.id !== operatorId || actor.version !== row.version || actor.role !== row.role)) reason = 'current sign-in does not cover the whole saved filter'
 else {
  reader={id:row.id,email:row.email,version:row.version,role:row.role,agent:false}
  reader.staff=await readStaffGrant(env.DB,reader)
  try { requireStaffReport(reader,row.report_type,new URLSearchParams(JSON.parse(row.filters_json)),true) }
  catch {reason='current staff grant no longer covers the whole saved filter'}
  if (!reason && await reportSuppressed(env,row.email)) reason = 'terminal address suppression'
 }
 return { reason, email: row?.email as string | undefined, reader }
}
export async function cancelReportRecipient(env: Bindings, scheduleId: string, operatorId: string, reason: string) {
 await env.DB.batch([
  env.DB.prepare(`UPDATE bw_report_deliveries SET status='cancelled',reason=?,updated_at=? WHERE operator_id=? AND run_id IN (SELECT id FROM bw_report_runs WHERE schedule_id=?) AND status IN ('queued','not configured')`).bind(reason,new Date().toISOString(),operatorId,scheduleId),
  reportAudit(env,'system:reports',scheduleId,'refused',`${operatorId}: ${reason}; no report trimmed.`),
 ])
}
