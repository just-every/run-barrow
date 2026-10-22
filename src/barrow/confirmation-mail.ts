// ORD-014: each recorded confirmation revision is emailed once to the trade account's contact address. The email
// carries the confirmation number and links to that exact revision's PDF and CSV behind the reader's own sign-in;
// no commercial values go to the mail provider. The send result (never the address or message) is audited, and a
// restored or replayed history never re-sends because only the recording request sends.
import type { Bindings } from '../auth.server'
import { operatorMail } from '../mail.server.mjs'

const escape = (value: string) => value.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)
export async function emailLatestConfirmation(env: Bindings, orderId: string) {
 const record = await env.DB.prepare('SELECT c.number,c.stage,o.account_id FROM bw_confirmations c JOIN bw_orders o ON o.id=c.order_id WHERE c.order_id=? ORDER BY c.number DESC LIMIT 1').bind(orderId).first<{ number: number; stage: string; account_id: string }>()
 if (!record) return
 const id = `${orderId}-C${record.number}`
 if (await env.DB.prepare("SELECT 1 FROM bw_audit WHERE subject_id=? AND action='order.confirmation-email' AND json_extract(context_json,'$.revision')=?").bind(orderId, id).first()) return
 const row = await env.DB.prepare('SELECT value_json FROM bw_accounts WHERE id=?').bind(record.account_id).first<{ value_json: string }>()
 const email = row ? JSON.parse(row.value_json).email as string : ''
 const base = `${env.AUTH_ORIGIN}/api/barrow/orders/${encodeURIComponent(orderId)}/confirmations/${record.number}`
 let status = 'uncertain', providerMessageId: string | null = null
 try {
  const result = email ? await operatorMail(env)?.send({ deliveryId: `confirmation-${id}`, from: env.MAIL_FROM!, to: [email], subject: `Order confirmation ${id} (${record.stage})`, headers: {},
   text: `Order confirmation ${id} (${record.stage}) was recorded for order ${orderId}.\nSign in to Barrow, then download this exact revision:\nPDF: ${base}.pdf\nCSV: ${base}.csv`,
   html: `<p>Order confirmation <strong>${escape(id)}</strong> (${escape(record.stage)}) was recorded for order ${escape(orderId)}.</p><p>Sign in to Barrow, then download this exact revision: <a href="${escape(base)}.pdf">PDF</a> · <a href="${escape(base)}.csv">CSV</a></p>` }) : undefined
  status = !email ? 'no contact address' : result?.status ?? 'not configured'; providerMessageId = result?.providerMessageId ?? null
 } catch { status = 'failed' }
 const label = env.MAIL_PROVIDER === 'development' && email ? 'development, not delivered' : status
 await env.DB.prepare('INSERT INTO bw_audit(id,subject_id,actor_id,action,created_at,context_json) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(), orderId, 'system:confirmations', 'order.confirmation-email', new Date().toISOString(),
  JSON.stringify({ accountId: record.account_id, orderId, revision: id, source: 'order.confirmation-email', confirmation: record.number, status: label, reason: `Confirmation ${id} email send result: ${label}; provider ID ${providerMessageId ?? 'not recorded'}. It links the exact revision only.` })).run()
}
/** Each confirmation's email send label and time, for the confirmation list. */
export async function confirmationEmails(db: D1Database, orderId: string) {
 const rows = (await db.prepare("SELECT created_at,json_extract(context_json,'$.confirmation') AS number,json_extract(context_json,'$.status') AS status FROM bw_audit WHERE subject_id=? AND action='order.confirmation-email' ORDER BY created_at,rowid").bind(orderId).all<{ created_at: string; number: number; status: string }>()).results
 return Object.fromEntries(rows.map(row => [row.number, { status: row.status, at: row.created_at }]))
}
