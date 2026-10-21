import { readStaffGrant, requireStaffReport } from './staff-policy'
import type { Bindings } from '../auth.server'
import { audit, changed, commit } from './access'
import { now } from './clock'
import { fail, requirePerson, requireSupplier, supplierDate, type Actor } from './model'
import { cancelReportRecipient, reportAudit, reportCoverageSql, reportEntitlement, reportRecipientGuard } from './report-access'

export const nextReportMonth = (at: Date) => new Date(Date.UTC(at.getUTCFullYear(),at.getUTCMonth()+1,1,9)).toISOString()
export async function readReportSchedules(env: Bindings, actor: Actor) {
 requirePerson(actor); requireSupplier(actor)
 const manage=['owner','admin'].includes(actor.role)
 const schedules = (await env.DB.prepare(`SELECT s.* FROM bw_report_schedules s WHERE ?=1 OR EXISTS(SELECT 1 FROM bw_report_recipients r WHERE r.schedule_id=s.id AND r.operator_id=?) ORDER BY s.created_at DESC,s.id`).bind(manage?1:0,actor.id).all<any>()).results
 const recipients = (await env.DB.prepare('SELECT * FROM bw_report_recipients WHERE ?=1 OR operator_id=? ORDER BY schedule_id,operator_id').bind(manage?1:0,actor.id).all<any>()).results
 const runs = (await env.DB.prepare(`SELECT r.id,r.schedule_id,r.period,r.from_date,r.to_date,r.as_of,r.expires_at,d.status,d.reason
 FROM bw_report_runs r JOIN bw_report_deliveries d ON d.run_id=r.id WHERE d.operator_id=? ORDER BY r.as_of DESC,r.id LIMIT 100`).bind(actor.id).all<any>()).results
 const operators = manage ? (await env.DB.prepare("SELECT p.id,p.display_name,p.role FROM oa_operators p WHERE p.status='active' AND (p.role IN ('owner','admin') OR p.role='member' AND EXISTS(SELECT 1 FROM bw_staff_members g WHERE g.user_id=p.id AND g.state='active' AND g.native_version=p.version)) ORDER BY p.display_name,p.id").all()).results : []
 return { schedules: schedules.map(s => ({ ...s, filters:JSON.parse(s.filters_json),recipients:recipients.filter(r => r.schedule_id===s.id) })),runs,operators,viewer:actor.id }
}
export async function reportScheduleCommand(env: Bindings, actor: Actor, type: string, p: any) {
 requirePerson(actor); requireSupplier(actor)
 const at = await now(), stamp = at.toISOString()
 if (type==='report.save') {
  if (!['owner','admin'].includes(actor.role)) fail('FORBIDDEN','Only an owner or admin may configure saved report recipients.',403)
  if (typeof p.name!=='string' || !p.name.trim() || p.name.trim().length>120 || /[\r\n]|https?:\/\//i.test(p.name) || !['sales','finance'].includes(p.reportType)) fail('INPUT','Name the report (up to 120 characters) and choose sales or finance.',400)
  if (!Array.isArray(p.recipientIds) || !p.recipientIds.length || p.recipientIds.length>100 || p.recipientIds.some((v:any)=>typeof v!=='string') || new Set(p.recipientIds).size!==p.recipientIds.length) fail('INPUT','Choose one to 100 distinct active staff operator IDs.',400)
  const filters: Record<string,string> = {}, allowed = p.reportType==='sales' ? ['accountId','channel','territory','sku'] : ['accountId','territory']
  if (!p.filters || typeof p.filters!=='object' || Array.isArray(p.filters)) fail('INPUT','Supply report filters.',400)
  for (const [key,value] of Object.entries(p.filters)) {
   if (!allowed.includes(key) || typeof value!=='string' || value.length>160) fail('INPUT','Use only the listed report filters, up to 160 characters each.',400)
   if (value.trim()) filters[key]=value.trim()
  }
  if (filters.accountId && !await env.DB.prepare('SELECT id FROM bw_accounts WHERE id=?').bind(filters.accountId).first()) fail('INPUT','Choose an existing account.',400)
  const id=crypto.randomUUID(), recipients=[]
  for (const operatorId of p.recipientIds) {
   const row=await env.DB.prepare("SELECT id,email,version,role FROM oa_operators WHERE id=? AND status='active'").bind(operatorId).first<any>()
   if (!row) fail('INPUT','Recipients must be active native staff with authority over the whole saved filter.',400)
   const recipient: Actor={...row,agent:false}
   recipient.staff=await readStaffGrant(env.DB,recipient)
   try { requireStaffReport(recipient,p.reportType,new URLSearchParams(filters),true) }
   catch { fail('INPUT','Every recipient must be entitled to the report type and whole saved filter.',400) }
   row.staffGrantRevision=recipient.role==='member' ? recipient.staff?.revision ?? null : null
   recipients.push(row)
  }
  await commit(env.DB,actor,[
   env.DB.prepare('INSERT INTO bw_report_schedules(id,name,report_type,filters_json,created_by,created_at,next_at) VALUES(?,?,?,?,?,?,?)').bind(id,p.name.trim(),p.reportType,JSON.stringify(filters),actor.id,stamp,nextReportMonth(at)),
   ...recipients.flatMap(row=>[
    env.DB.prepare(`INSERT INTO bw_report_recipients(schedule_id,operator_id,operator_version,role,staff_grant_revision)
     SELECT s.id,p.id,p.version,p.role,r.staff_grant_revision FROM oa_operators p JOIN bw_report_schedules s ON s.id=?
     JOIN (SELECT ? AS staff_grant_revision) r WHERE p.id=? AND p.version=? AND p.status='active' AND p.role=? AND ${reportCoverageSql(supplierDate(at))}`).bind(id,row.staffGrantRevision,row.id,row.version,row.role),changed(env.DB),
   ]),
   audit(env.DB,actor,id,'report.saved',{revision:id,source:type,reason:'Saved immutable monthly report filters and exact active staff recipient identities; first day at 09:00 UTC for the previous calendar month.'}),
  ])
  return {id}
 }
 if (type==='report.remove-recipient') {
  const operatorId = p.operatorId ?? actor.id
  if (!['owner','admin'].includes(actor.role) && operatorId!==actor.id) fail('FORBIDDEN','Staff may remove only themselves from saved reports.',403)
  if (typeof p.scheduleId!=='string' || typeof operatorId!=='string') fail('INPUT','Choose a schedule and recipient.',400)
  await commit(env.DB,actor,[
   env.DB.prepare('UPDATE bw_report_recipients SET removed_at=? WHERE schedule_id=? AND operator_id=? AND removed_at IS NULL').bind(stamp,p.scheduleId,operatorId),changed(env.DB),
   env.DB.prepare(`UPDATE bw_report_deliveries SET status='cancelled',reason='recipient removed',updated_at=? WHERE operator_id=? AND run_id IN (SELECT id FROM bw_report_runs WHERE schedule_id=?) AND status IN ('queued','not configured')`).bind(stamp,operatorId,p.scheduleId),
   audit(env.DB,actor,p.scheduleId,'report.recipient-removed',{revision:p.scheduleId,source:type,reason:`Removed recipient ${operatorId}; queued deliveries cancelled and existing links revoked.`}),
  ])
  return {removed:true}
 }
 fail('COMMAND','Unknown report schedule command.',404)
}
export async function reportDownload(env: Bindings, actor: Actor, id: string) {
 requirePerson(actor)
 const run=await env.DB.prepare('SELECT * FROM bw_report_runs WHERE id=?').bind(id).first<any>()
 if (!run) fail('NOT_FOUND','Report run not found.',404)
 const entitlement=await reportEntitlement(env,run.schedule_id,actor.id,actor)
 const reason=entitlement.reason ?? ((await now()).toISOString()>=run.expires_at ? 'snapshot expired after 90 days' : null)
 if (reason) {
  await cancelReportRecipient(env,run.schedule_id,actor.id,reason)
  fail('FORBIDDEN','This report is unavailable to your current sign-in: '+reason+'.',403)
 }
 await commit(env.DB,actor,[reportRecipientGuard(env,run.schedule_id,actor.id,supplierDate(await now())),reportAudit(env,actor.id,id,'downloaded','Exact recipient downloaded the whole frozen snapshot after current entitlement and suppression checks.')])
 return new Response(run.snapshot_json,{headers:{'content-type':'application/json; charset=utf-8','content-disposition':'attachment; filename="barrow-report.json"','cache-control':'no-store','x-content-type-options':'nosniff'}})
}
