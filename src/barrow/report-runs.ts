import type { Bindings } from '../auth.server'
import { now } from './clock'
import { financeReport } from './finance-report'
import { salesReport } from './sales-report'
import { fail, requirePerson, requireSupplier, supplierDate, type Actor } from './model'
import { reportAudit, reportCoverageSql, reportEntitlement, reportRecipientGuard } from './report-access'
import { nextReportMonth } from './report-schedules'

export function reportPeriod(at: Date) {
 const end=new Date(Date.UTC(at.getUTCFullYear(),at.getUTCMonth(),0)), from=new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth(),1)).toISOString().slice(0,10)
 return { period:from.slice(0,7),from,to:end.toISOString().slice(0,10) }
}
export async function freezeReport(env: Bindings, schedule: any, actorId: string) {
 const at=await now(), today=supplierDate(at), {period,from,to}=reportPeriod(at), id=`${schedule.id}_${period}`
 const existing=await env.DB.prepare('SELECT id FROM bw_report_runs WHERE id=?').bind(id).first()
 if (!existing) {
  // An eligible exact recipient reads the entire immutable filter; scope is never trimmed.
  const recipients=(await env.DB.prepare('SELECT operator_id FROM bw_report_recipients WHERE schedule_id=? ORDER BY operator_id').bind(schedule.id).all<{operator_id:string}>()).results
  let reader: Actor | undefined
  for(const r of recipients) {
   const entitlement=await reportEntitlement(env,schedule.id,r.operator_id)
   if (entitlement.reason || !entitlement.reader) continue
   reader=entitlement.reader;break
  }
  if (!reader) {
   await env.DB.batch([reportAudit(env,actorId,schedule.id,'run-refused','No recipient currently covers the whole saved filter; no trimmed snapshot generated.')])
   return null
  }
  const filters=JSON.parse(schedule.filters_json), params=new URLSearchParams({...filters,from,to,asOf:to})
  const report=schedule.report_type==='sales' ? await salesReport(env,reader,params) : await financeReport(env,reader,params)
  const snapshot={name:schedule.name,reportType:schedule.report_type,schedule:'Monthly, first day at 09:00 UTC',period,from,to,asOf:at.toISOString(),filters,report}
  await env.DB.batch([
   reportRecipientGuard(env,schedule.id,reader.id,today),
   env.DB.prepare('INSERT OR IGNORE INTO bw_report_runs VALUES(?,?,?,?,?,?,?,?)').bind(id,schedule.id,period,from,to,at.toISOString(),new Date(at.getTime()+90*86400000).toISOString(),JSON.stringify(snapshot)),
   reportAudit(env,actorId,id,'frozen','Froze one whole source-linked report for this saved schedule and period; 90-day exact-recipient download.',true),
   env.DB.prepare(`INSERT OR IGNORE INTO bw_report_deliveries(id,run_id,operator_id,status,reason,updated_at)
    SELECT lower(hex(randomblob(16))),?,r.operator_id,
     CASE WHEN p.status='active' AND p.version=r.operator_version AND p.role=r.role AND ${reportCoverageSql(today)} THEN 'queued' ELSE 'cancelled' END,
     CASE WHEN p.status='active' AND p.version=r.operator_version AND p.role=r.role AND ${reportCoverageSql(today)} THEN NULL ELSE 'Recipient no longer covers whole saved filter' END,?
    FROM bw_report_recipients r JOIN bw_report_schedules s ON s.id=r.schedule_id LEFT JOIN oa_operators p ON p.id=r.operator_id
    WHERE r.schedule_id=? AND r.removed_at IS NULL AND s.restored=0`).bind(id,at.toISOString(),schedule.id),
   reportAudit(env,actorId,id,'queued','Created at most one delivery per selected recipient and run; no email delivery inferred.',true),
   env.DB.prepare('DELETE FROM bw_guard'),
  ])
 }
 await env.DB.prepare('UPDATE bw_report_schedules SET next_at=? WHERE id=?').bind(nextReportMonth(at),schedule.id).run()
 return {id}
}
export async function runSavedReport(env: Bindings, actor: Actor, p: any) {
 requirePerson(actor);requireSupplier(actor)
 if (!['owner','admin'].includes(actor.role)) fail('FORBIDDEN','Only an owner or admin may run saved report schedules.',403)
 if (typeof p.scheduleId!=='string') fail('INPUT','Choose a saved schedule.',400)
 const schedule=await env.DB.prepare('SELECT * FROM bw_report_schedules WHERE id=? AND restored=0').bind(p.scheduleId).first<any>()
 if (!schedule) fail('NOT_FOUND','Native report schedule not found.',404)
 const run=await freezeReport(env,schedule,actor.id)
 if (!run) fail('FORBIDDEN','No recipient currently covers this whole report.',403)
 return run
}
