import { bootstrapLegacyCompanyMembers, companyPurchasingRecipientSql } from './company-members'
import { repRecipientSql } from './rep-scope'
// AUTO-003 delivers only ORD-005's existing audiences, using durable user identities.
import type { Bindings } from '../auth.server'
import { operatorMail } from '../mail.server.mjs'
import { fail, requirePerson, requireSupplier, supplierDate, type Actor } from './model'
import { now } from './clock'
import { reconcileMailEvents } from './quote-mail-events'
import { recordMailFailure } from './quote-mail-tasks'
import { observeMailConfiguration } from './quote-mail-config'

export type QuoteMailRow = {
 id: string; notice_id: string | null; quote_id: string; account_id: string
 audience: 'buyer' | 'supplier'; recipient_id: string | null; recipient: string | null
 summary: string; kind: 'notice' | 'expiry'; actor_id: string; expiry_revision: number | null
 status: string; reason: string | null; provider_message_id: string | null
 sender_result_json: string | null; submission_json: string | null; attempts: number
 lease_until: number; created_at: string; updated_at: string; first_attempt_at: string | null
 last_event_id: string | null; restored: number; task_id: string | null
}
const htmlEscape = (value: string) => value.replace(/[&<>"']/g, character => `&#${character.charCodeAt(0)};`)
const retryWindow = 24 * 60 * 60 * 1000
const retryable = "status IN ('queued','not configured','rate_limited','uncertain') AND restored=0"
// Supplier-side recipients are owner/admin (accounts with no rep) or the rep who holds the account today (ACC-006).
const authorizedAt = (today: string) => `SELECT p.email FROM oa_operators p WHERE p.id=m.recipient_id AND p.status='active' AND (
 (m.audience='supplier' AND p.id<>m.actor_id AND (p.role IN ('owner','admin') OR ${repRecipientSql('p','m.account_id',today)})) OR
 (m.audience='buyer' AND ${companyPurchasingRecipientSql('p','m.account_id')}))`
const currentExpiry = `SELECT 1 FROM bw_quotes q WHERE q.id=m.quote_id
 AND json_extract(q.value_json,'$.status')='proposed' AND json_extract(q.value_json,'$.accepted') IS NULL
 AND json_extract(q.value_json,'$.revisions[#-1].number')=m.expiry_revision
 AND json_extract(q.value_json,'$.revisions[#-1].validUntil')=?`
const expiryEligible = `json_extract(q.value_json,'$.status')='proposed'
 AND json_extract(q.value_json,'$.accepted') IS NULL
 AND json_extract(q.value_json,'$.revisions[#-1].validUntil')=?`

/** Expiry is email-only. Unique keys include the latest revision and user, never a new notice. */
export async function queueQuoteMail(env: Bindings) {
 await bootstrapLegacyCompanyMembers(env.DB)
 const at = await now(), stamp = at.toISOString(), today = supplierDate(at)
 const columns = 'id,quote_id,account_id,audience,recipient_id,recipient,summary,kind,actor_id,expiry_revision,created_at,updated_at'
 const summary = "q.id || ' revision ' || json_extract(q.value_json,'$.revisions[#-1].number') || ' expires after today (America/New_York).'"
 await env.DB.batch([
  env.DB.prepare(`INSERT OR IGNORE INTO bw_quote_mail(${columns})
   SELECT lower(hex(randomblob(16))),q.id,q.account_id,CASE WHEN p.role IN ('owner','admin') OR ${repRecipientSql('p','q.account_id',today)} THEN 'supplier' ELSE 'buyer' END,
   p.id,p.email,${summary},'expiry','system',json_extract(q.value_json,'$.revisions[#-1].number'),?,?
   FROM bw_quotes q JOIN oa_operators p ON p.status='active' AND (
    (p.role IN ('owner','admin') AND NOT EXISTS(SELECT 1 FROM oa_operators r WHERE ${repRecipientSql('r','q.account_id',today)}))
    OR ${repRecipientSql('p','q.account_id',today)} OR (${companyPurchasingRecipientSql('p','q.account_id')}))
   WHERE ${expiryEligible} AND NOT EXISTS (SELECT 1 FROM bw_quote_mail m WHERE m.quote_id=q.id
   AND m.expiry_revision=json_extract(q.value_json,'$.revisions[#-1].number') AND m.kind='expiry'
   AND m.recipient_id=p.id)`).bind(stamp,stamp,today),
  env.DB.prepare(`INSERT OR IGNORE INTO bw_quote_mail(${columns},status,reason)
   SELECT lower(hex(randomblob(16))),q.id,q.account_id,'buyer',NULL,NULL,${summary},'expiry','system',
   json_extract(q.value_json,'$.revisions[#-1].number'),?,?,'withdrawn','no authorized buyer recipient'
   FROM bw_quotes q WHERE ${expiryEligible} AND NOT EXISTS (SELECT 1 FROM bw_quote_mail m WHERE m.quote_id=q.id
   AND m.expiry_revision=json_extract(q.value_json,'$.revisions[#-1].number') AND m.kind='expiry' AND m.audience='buyer')
   AND NOT EXISTS (SELECT 1 FROM oa_operators p WHERE ${companyPurchasingRecipientSql('p','q.account_id')})`).bind(stamp,stamp,today),
 ])
}

async function withdraw(env: Bindings, row: QuoteMailRow, reason: string, stamp: string) {
 await env.DB.prepare(`UPDATE bw_quote_mail SET status='withdrawn',reason=?,lease_until=0,updated_at=? WHERE id=? AND ${retryable} AND lease_until<=?`)
  .bind(reason,stamp,row.id,Date.parse(stamp)).run()
}

async function withdrawalReason(env:Bindings,row:QuoteMailRow) {
 if(row.audience==='buyer'&&!await env.DB.prepare(`SELECT 1 FROM oa_operators p JOIN bw_quote_mail m ON m.id=? WHERE p.id=m.recipient_id AND ${companyPurchasingRecipientSql('p','m.account_id')}`).bind(row.id).first())return 'no authorized buyer recipient'
 return 'recipient no longer authorized'
}

function configuredOrigin(env: Bindings): string | null {
 try {
  const url = new URL(env.AUTH_ORIGIN)
  return url.protocol==='https:' && !url.username && !url.password && url.pathname==='/' && !url.search && !url.hash ? url.origin : null
 } catch { return null }
}

async function suppressed(env: Bindings, recipient: string) {
 // Receipts retain terminal rejection even if a later delivery event changes the visible state.
 return Boolean(await env.DB.prepare(`SELECT 1 FROM bw_quote_mail WHERE recipient=? COLLATE BINARY AND status IN ('bounced','complained','rejected')
 UNION ALL SELECT 1 FROM rer_mail_event_receipts e,json_each(e.event_json,'$.recipients') r
 WHERE e.provider='resend' AND json_extract(e.event_json,'$.status') IN ('bounced','complained','rejected')
 AND r.value=? COLLATE BINARY LIMIT 1`).bind(recipient,recipient).first())
}

/** Submission is leased; interrupted work retains the same delivery ID and immutable request. */
async function submit(env: Bindings, row: QuoteMailRow, origin: string, stamp: string, time: number, today: string) {
 const person = await env.DB.prepare(`SELECT (${authorizedAt(today)}) AS email FROM bw_quote_mail m WHERE m.id=?`).bind(row.id).first<{email:string | null}>()
 if (!person?.email || (row.first_attempt_at && person.email!==row.recipient)) {
  await withdraw(env,row,await withdrawalReason(env,row),stamp)
  return
 }
 const recipient = person.email
 if (await suppressed(env,recipient)) {
  await env.DB.prepare(`UPDATE bw_quote_mail SET status='suppressed',recipient=?,reason='terminal address suppression',lease_until=0,updated_at=? WHERE id=? AND ${retryable} AND lease_until<=?`)
   .bind(recipient,stamp,row.id,time).run()
  return
 }
 const link = `${origin}/app?quote=${encodeURIComponent(row.quote_id)}`
 const message = row.submission_json ? JSON.parse(row.submission_json) : {
  deliveryId: row.id, from: env.MAIL_FROM ?? '', to: [recipient], subject: `Barrow quote ${row.quote_id}`, headers: {},
  html: `<p>${htmlEscape(row.summary)}</p><p>Quote: ${htmlEscape(row.quote_id)}</p><p><a href="${htmlEscape(link)}">Open the quote using your own Barrow sign-in</a></p>`,
  text: `${row.summary}\n\nQuote: ${row.quote_id}\nOpen the quote using your own Barrow sign-in:\n${link}`, 
 }
 // Refresh the clock after recipient/suppression reads: an expiry can never submit on a later NY date.
 const attemptAt = await now()
 time = attemptAt.getTime(); stamp = attemptAt.toISOString(); today = supplierDate(attemptAt)
 // Authorization and expiry are checked again by the claim statement immediately before submit.
 const claimed = await env.DB.prepare(`UPDATE bw_quote_mail AS m SET status='uncertain',reason='submission in progress',recipient=?,
  submission_json=?,first_attempt_at=COALESCE(first_attempt_at,?),attempts=attempts+1,lease_until=?,updated_at=?
  WHERE id=? AND ${retryable} AND lease_until<=? AND EXISTS (${authorizedAt(today)} AND p.email=? COLLATE BINARY)
  AND (m.kind<>'expiry' OR EXISTS (${currentExpiry}))
  AND (first_attempt_at IS NULL OR first_attempt_at>?) RETURNING *`)
  .bind(recipient,JSON.stringify(message),stamp,time+120000,stamp,row.id,time,recipient,today,new Date(time-retryWindow).toISOString()).first<QuoteMailRow>()
 if (!claimed) return
 let result: any = null, status: string, reason: string | null = null
 try {
  result = await operatorMail(env)?.send(message)
  status = result?.status==='development' ? 'not sent (development)' : result?.status ?? 'uncertain'
  if (!result) reason='sender returned no outcome'
  else if (status==='accepted' && result.providerMessageId===null) reason='accepted (uncorrelated)'
 } catch (error) {
  status = error instanceof Error && error.name==='MailValidationError' ? 'rejected' : 'uncertain'
  reason = status==='rejected' ? 'submission validation rejected' : 'submission outcome unknown'
 }
 // Keep the complete sender result and exact provider ID; acceptance never means delivery.
 await env.DB.prepare(`UPDATE bw_quote_mail SET status=CASE WHEN last_event_id IS NULL THEN ? ELSE status END,
  reason=?,provider_message_id=?,sender_result_json=?,lease_until=0,updated_at=? WHERE id=? AND lease_until=?`)
  .bind(status,reason,result?.providerMessageId ?? null,result===null ? null : JSON.stringify(result),(await now()).toISOString(),row.id,time+120000).run()
}

async function recordFailures(env: Bindings, time: number) {
 const rows = (await env.DB.prepare(`SELECT * FROM bw_quote_mail WHERE status IN ('bounced','failed','rejected','complained','suppressed')
  OR (status='withdrawn' AND reason='no authorized buyer recipient')
  OR (status IN ('rate_limited','uncertain') AND COALESCE(first_attempt_at,updated_at,created_at)<=?)`)
  .bind(new Date(time-retryWindow).toISOString()).all<QuoteMailRow>()).results
 for (const row of rows) await recordMailFailure(env,row)
}

export async function dispatchQuoteMail(env: Bindings) {
 const configuration = await observeMailConfiguration(env)
 await reconcileMailEvents(env)
 await queueQuoteMail(env)
 const at = await now(), dispatchTime = at.getTime()
 const rows = (await env.DB.prepare(`SELECT * FROM bw_quote_mail WHERE ${retryable} AND lease_until<=? ORDER BY created_at,id LIMIT 100`)
  .bind(dispatchTime).all<QuoteMailRow>()).results
 const origin = configuredOrigin(env)
 const development = env.RER_DEMO==='1' || (env.MAIL_PROVIDER==='development' && env.AUTH_LOCAL==='true')
 for (const row of rows) {
  const current = await now(), time = current.getTime(), stamp = current.toISOString(), today = supplierDate(current)
  if (row.kind==='expiry' && !await env.DB.prepare(`SELECT 1 FROM bw_quote_mail m WHERE m.id=? AND EXISTS (${currentExpiry})`).bind(row.id,today).first()) {
   await withdraw(env,row,'expiry reminder no longer current',stamp)
   continue
  }
  const person = await env.DB.prepare(`SELECT (${authorizedAt(today)}) AS email FROM bw_quote_mail m WHERE m.id=?`).bind(row.id).first<{email:string | null}>()
  if (!person?.email || (row.first_attempt_at && person.email!==row.recipient)) {
   await withdraw(env,row,await withdrawalReason(env,row),stamp)
   continue
  }
  if (row.first_attempt_at && time-Date.parse(row.first_attempt_at)>=retryWindow) continue
  if (development && !row.first_attempt_at) {
   await env.DB.prepare(`UPDATE bw_quote_mail SET status='not sent (development)',reason=NULL,updated_at=? WHERE id=? AND ${retryable} AND lease_until<=?`).bind(stamp,row.id,time).run()
   continue
  }
  if (!configuration.configured || !origin || env.MAIL_PROVIDER!=='resend' || !env.MAIL_API_KEY || !env.MAIL_FROM || !env.MAIL_WEBHOOK_SECRET || !env.MAIL_EVENT_TENANT) {
   if (!row.first_attempt_at) await env.DB.prepare(`UPDATE bw_quote_mail SET status='not configured',reason='Configure Resend, sender, HTTPS origin, delivery tenant and webhook secret.',updated_at=? WHERE id=? AND ${retryable} AND lease_until<=?`).bind(stamp,row.id,time).run()
   continue
  }
  await submit(env,row,origin,stamp,time,today)
 }
 await reconcileMailEvents(env)
 await recordFailures(env,(await now()).getTime())
}

export async function quoteMailCommand(env: Bindings, actor: Actor, type: string, _p: any) {
 requirePerson(actor); requireSupplier(actor)
 if (type==='quote-mail.dispatch') {
  await dispatchQuoteMail(env)
  return { deliveries: (await env.DB.prepare('SELECT id,quote_id,kind,expiry_revision,recipient_id,recipient,status,reason,attempts,created_at,updated_at,first_attempt_at,provider_message_id,task_id FROM bw_quote_mail ORDER BY created_at,id').all()).results }
 }
 fail('COMMAND','Unknown quote delivery command.',404)
}
