// AUTO-001 under ct's 22 October ACC-001 ruling: an applicant receives one generic status-change email per staff decision
// (information requested, approved, declined) carrying only the new state and the application link, never the reason
// or request text, which the applicant reads after a fresh code. It uses the AUTO-003 sender and labels; development is
// never sent, and the send result (never the message) is audited.
import type { Bindings } from '../auth.server'
import { operatorMail } from '../mail.server.mjs'

export type ApplicationMailState = 'information requested' | 'approved' | 'declined'
export const applicationStatusSubject = 'Your trade application status changed'

export async function sendApplicationStatus(env: Bindings, application: { id: string; email: string }, state: ApplicationMailState) {
 const link = `${env.AUTH_ORIGIN}/apply?application=${encodeURIComponent(application.id)}`, safe = link.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
 let status = 'uncertain', providerMessageId: string | null = null
 try {
  const result = await operatorMail(env)?.send({ deliveryId: crypto.randomUUID(), from: env.MAIL_FROM!, to: [application.email], subject: applicationStatusSubject, headers: {},
   text: `Your trade application status is now: ${state}. Open ${link} and request a fresh code to read the details.`,
   html: `<p>Your trade application status is now: <strong>${state}</strong>.</p><p><a href="${safe}">Open your application</a> and request a fresh code to read the details.</p>` })
  status = result?.status ?? 'not configured'; providerMessageId = result?.providerMessageId ?? null
 } catch { status = 'failed' }
 const label = env.MAIL_PROVIDER === 'development' ? 'development, not delivered' : status
 await env.DB.prepare('INSERT INTO bw_audit(id,subject_id,actor_id,action,created_at,context_json) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(), application.id, 'system:applications', 'application.status-email', new Date().toISOString(),
  JSON.stringify({ revision: application.id, source: 'application.status-email', state, status: label, reason: `Generic status email (${state}) send result: ${label}; provider ID ${providerMessageId ?? 'not recorded'}. It carries the state and link only.` })).run()
 return { state, status: label }
}

/** Staff read every status email's state, send label and time; the applicant's own view never shows them. */
export async function applicationStatusEmails(db: D1Database, applicationId: string) {
 return (await db.prepare("SELECT created_at AS at,json_extract(context_json,'$.state') AS state,json_extract(context_json,'$.status') AS status FROM bw_audit WHERE subject_id=? AND action='application.status-email' ORDER BY created_at,rowid").bind(applicationId).all<{ at: string; state: string; status: string }>()).results
}
