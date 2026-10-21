import type { Bindings } from '../auth.server'
import { operatorMail } from '../mail.server.mjs'
import { now } from './clock'
import { cancelReportRecipient, reportAudit, reportEntitlement } from './report-access'
import { freezeReport } from './report-runs'

const escape = (v:string) => v.replace(/[&<>"']/g,c=>`&#${c.charCodeAt(0)};`)
export async function dispatchReports(env: Bindings) {
 const stamp=(await now()).toISOString()
 const schedules=(await env.DB.prepare('SELECT * FROM bw_report_schedules WHERE next_at<=? AND restored=0 ORDER BY next_at,id LIMIT 25').bind(stamp).all<any>()).results
 for(const schedule of schedules)await freezeReport(env,schedule,'system:reports')
 const deliveries=(await env.DB.prepare(`SELECT d.*,r.schedule_id,r.period,r.from_date,r.to_date,r.as_of,r.expires_at,s.name FROM bw_report_deliveries d
 JOIN bw_report_runs r ON r.id=d.run_id JOIN bw_report_schedules s ON s.id=r.schedule_id
 WHERE d.status IN ('queued','not configured') ORDER BY d.updated_at,d.id LIMIT 100`).all<any>()).results
 for(const delivery of deliveries) {
  const access=await reportEntitlement(env,delivery.schedule_id,delivery.operator_id)
  if(access.reason || stamp>=delivery.expires_at) {
   await cancelReportRecipient(env,delivery.schedule_id,delivery.operator_id,access.reason ?? 'snapshot expired after 90 days');continue
  }
  let origin: URL | undefined
  try {origin=new URL(env.AUTH_ORIGIN)}catch{}
  const configured=origin?.protocol==='https:' && !origin.username && !origin.password && origin.pathname==='/' && !origin.search && !origin.hash
   && env.MAIL_PROVIDER==='resend' && env.MAIL_FROM && env.MAIL_API_KEY && env.MAIL_WEBHOOK_SECRET && env.MAIL_EVENT_TENANT && env.RER_DEMO!=='1'
  if(!configured) {
   await env.DB.batch([
    env.DB.prepare("UPDATE bw_report_deliveries SET status='not configured',reason='Requires configured Resend, HTTPS origin, sender and signed-event intake',updated_at=? WHERE id=? AND status='queued'").bind(stamp,delivery.id),
    reportAudit(env,'system:reports',delivery.id,'not-configured','Report notification was not sent; sender or signed-event intake is unavailable.',true),
   ]);continue
  }
  // The durable claim is never automatically retried: an interrupted/uncertain send stays
  // uncertain and owned by this delivery ID, so restart cannot produce a second email.
  const claimed=await env.DB.batch([
   env.DB.prepare(`UPDATE bw_report_deliveries SET status='uncertain',reason='Submission claimed; outcome pending',recipient=?,updated_at=? WHERE id=? AND status IN ('queued','not configured')
    AND EXISTS(SELECT 1 FROM bw_report_recipients r JOIN oa_operators p ON p.id=r.operator_id JOIN bw_report_schedules s ON s.id=r.schedule_id
     WHERE r.schedule_id=? AND r.operator_id=? AND r.removed_at IS NULL AND s.restored=0 AND p.status='active' AND p.version=r.operator_version AND p.role=r.role AND p.role IN ('owner','admin') AND p.email=?)
    AND NOT EXISTS(SELECT 1 FROM rer_mail_event_receipts e,json_each(e.event_json,'$.recipients') r WHERE e.provider='resend' AND json_extract(e.event_json,'$.status') IN ('bounced','complained','rejected') AND r.value=?)
    AND NOT EXISTS(SELECT 1 FROM bw_report_deliveries x WHERE x.recipient=? AND x.status IN ('bounced','complained','rejected'))
    AND NOT EXISTS(SELECT 1 FROM bw_quote_mail x WHERE x.recipient=? AND x.status IN ('bounced','complained','rejected'))`).bind(access.email!,stamp,delivery.id,delivery.schedule_id,delivery.operator_id,access.email!,access.email!,access.email!,access.email!),
   reportAudit(env,'system:reports',delivery.id,'submission','Claimed one notification for this exact recipient/run after whole-filter authority and suppression checks.',true),
  ])
  if(!claimed[0].meta.changes)continue
  const link=`${origin!.origin}/app?reportRun=${encodeURIComponent(delivery.run_id)}`
  const summary=`${delivery.name}\nSchedule: Monthly, first day at 09:00 UTC\nPeriod: ${delivery.from_date} to ${delivery.to_date}\nAs of: ${delivery.as_of}`
  let status='uncertain', reason='Sender outcome unknown', providerId:string|null=null
  try {
   const result=await operatorMail(env)?.send({deliveryId:delivery.id,from:env.MAIL_FROM!,to:[access.email!],subject:`Barrow report: ${delivery.name}`,headers:{},text:`${summary}\n\nOpen using your own Barrow sign-in:\n${link}`,html:`<p>${escape(summary).replaceAll('\n','<br>')}</p><p><a href="${escape(link)}">Open using your own Barrow sign-in</a></p>`})
   status=result?.status==='development'?'not sent (development)':result?.status ?? 'uncertain'; providerId=result?.providerMessageId ?? null
   reason=status==='accepted'?'Provider accepted the notification; delivery is not yet confirmed.':`Sender result: ${status}; no automatic retry.`
  }catch {reason='Sender outcome unknown; no automatic retry.'}
  await env.DB.batch([
   env.DB.prepare('UPDATE bw_report_deliveries SET status=?,reason=?,provider_message_id=?,updated_at=? WHERE id=?').bind(status,reason,providerId,(await now()).toISOString(),delivery.id),
   reportAudit(env,'system:reports',delivery.id,'submission-result',reason),
  ])
 }
}
