// ORD-005: the quote conversation. Beside its numbered revisions, each quote keeps an append-only thread of
// buyer-visible messages from either side and internal notes only supplier staff read, each with at most one PDF, PNG
// or JPEG attachment. Posting never changes the quote's revision, so a message cannot invalidate a proposal or approval
// in progress. Participants are notified in the app: the account's buyer, and the account's assigned or covering reps (ACC-006), or the supplier owner and admins
// acting for the rep while the account has none. A notice is unread until someone on that side marks the quote read; nobody is
// notified of their own action. Email delivery with a direct link is AUTO-003's, through INT-015.
import type { Bindings } from '../auth.server'
import { commit } from './access'
import { readDocument } from './documents'
import { fail, supplier, text, type Actor } from './model'
import { supplierRoute } from './quote-routing'

export type Side = 'buyer' | 'supplier'
export type NoticeKind = 'requested' | 'message' | 'internal' | 'revision' | 'accepted'
export type Attachment = { name: string; type: string; size: number; sha256: string; path: string }
export type Entry = { id: string; quoteId: string; accountId: string; kind: 'message' | 'internal'; side: Side; authorId: string; authorEmail: string; body: string; quoteRevision: number; at: string; erasedAttachment?: {type:string;size:number;sha256:string}; attachment?: Attachment }
export type Notice = { id: string; quoteId: string; kind: NoticeKind; summary: string; at: string }
type QuoteRef = { id: string; accountId: string; revisions: { number: number }[] }

export const side = (actor: Actor): Side => supplier(actor) ? 'supplier' : 'buyer'
const attachmentPath = (quoteId: string, entryId: string) => `/api/barrow/quotes/${quoteId}/attachments/${entryId}`

/** The notice and its trigger-created mail ledger share the action's D1 batch. */
export const notice = (db: D1Database, actor: Actor, quote: { id: string; accountId: string }, audience: Side, kind: NoticeKind, summary: string, at: string, recipients: string[] | null = null) => {
 if (kind === 'internal' && audience === 'buyer') fail('FORBIDDEN', 'Internal notes are for supplier staff.', 403)
 return db.prepare('INSERT INTO bw_quote_notices(id,quote_id,account_id,audience,kind,summary,actor_id,created_at,mail_eligible,recipients_json) VALUES(?,?,?,?,?,?,?,?,1,?)').bind(crypto.randomUUID(), quote.id, quote.accountId, audience, kind, summary, actor.id, at, audience === 'supplier' && recipients ? JSON.stringify(recipients) : null)
}

function entry(row: any): Entry {
 return { id: row.id, quoteId: row.quote_id, accountId: row.account_id, kind: row.kind, side: row.side, authorId: row.author_id, authorEmail: row.author_email, body: row.body, quoteRevision: row.quote_revision, at: row.created_at, ...(row.attachment_name ? { attachment: { name: row.attachment_name, type: row.attachment_type, size: row.attachment_size, sha256: row.attachment_sha256, path: attachmentPath(row.quote_id, row.id) } } : row.attachment_sha256 ? {erasedAttachment:{type:row.attachment_type,size:row.attachment_size,sha256:row.attachment_sha256}} : {}) }
}

/** Thread entries for quotes the actor may already read; buyers never receive internal notes. */
export async function threadEntries(db: D1Database, actor: Actor, quoteIds: string[]) {
 if (!quoteIds.length) return []
 const rows = await db.prepare(`SELECT id,quote_id,account_id,kind,side,author_id,author_email,body,quote_revision,created_at,attachment_name,attachment_type,attachment_size,attachment_sha256 FROM bw_quote_entries WHERE quote_id IN (SELECT value FROM json_each(?))${supplier(actor) ? '' : " AND kind='message'"} ORDER BY created_at,rowid`).bind(JSON.stringify(quoteIds)).all<any>()
 return rows.results.map(entry)
}

/** The actor's side's unread notices on these quotes, leaving out the actor's own actions. */
export async function unreadNotices(db: D1Database, actor: Actor, quoteIds: string[]): Promise<Notice[]> {
 if (!quoteIds.length) return []
 const rows = await db.prepare('SELECT id,quote_id,kind,summary,created_at FROM bw_quote_notices WHERE quote_id IN (SELECT value FROM json_each(?)) AND audience=? AND actor_id<>? AND read_at IS NULL AND (recipients_json IS NULL OR ? IN (SELECT value FROM json_each(recipients_json))) ORDER BY created_at,rowid').bind(JSON.stringify(quoteIds), side(actor), actor.id, actor.id).all<any>()
 return rows.results.map(row => ({ id: row.id, quoteId: row.quote_id, kind: row.kind, summary: row.summary, at: row.created_at }))
}

/** quote.message posts to the thread; quote.read marks the actor's side's notices on the quote read. */
export async function threadCommand(env: Bindings, actor: Actor, type: string, quote: QuoteRef & { customerName: string }, p: any, at: string) {
 if (type === 'quote.read') {
  await commit(env.DB, actor, [env.DB.prepare('UPDATE bw_quote_notices SET read_by=?,read_at=? WHERE quote_id=? AND audience=? AND actor_id<>? AND read_at IS NULL AND (recipients_json IS NULL OR ? IN (SELECT value FROM json_each(recipients_json)))').bind(actor.id, at, quote.id, side(actor), actor.id, actor.id)])
  return { quoteId: quote.id, notices: await unreadNotices(env.DB, actor, [quote.id]) }
 }
 const internal = p.internal === true
 if (internal && !supplier(actor)) fail('FORBIDDEN', 'Internal notes are for supplier staff.', 403)
 const body = text(p.body, internal ? 'Internal note' : 'Message', 2000)
 const file = p.attachment === undefined ? undefined : await readDocument(p.attachment, 'An attachment', 'file')
 const id = crypto.randomUUID(), revision = quote.revisions.at(-1)?.number ?? 0, from = side(actor)
 const summary = internal ? `Internal note on ${quote.id} from ${actor.email}${file ? ` with ${file.name}` : ''}.`
  : `${from === 'buyer' ? quote.customerName : 'Your supplier'} wrote on ${quote.id}${file ? ` and attached ${file.name}` : ''}.`
 await commit(env.DB, actor, [
  env.DB.prepare('INSERT INTO bw_quote_entries(id,quote_id,account_id,kind,side,author_id,author_email,body,quote_revision,created_at,attachment_name,attachment_type,attachment_size,attachment_sha256,attachment_base64) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id, quote.id, quote.accountId, internal ? 'internal' : 'message', from, actor.id, actor.email, body, revision, at, file?.name ?? null, file?.type ?? null, file?.size ?? null, file?.sha256 ?? null, file?.contentBase64 ?? null),
  // Internal notes reach only supplier staff; a buyer-visible message notifies the other side.
  notice(env.DB, actor, quote, internal || from === 'buyer' ? 'supplier' : 'buyer', internal ? 'internal' : 'message', summary, at, internal || from === 'buyer' ? await supplierRoute(env.DB, quote.accountId, actor.id) : null),
 ])
 return (await threadEntries(env.DB, actor, [quote.id])).find(row => row.id === id)!
}

export async function attachmentResponse(env: Bindings, actor: Actor, quoteId: string, entryId: string) {
 const row = await env.DB.prepare(`SELECT attachment_name,attachment_type,attachment_base64 FROM bw_quote_entries WHERE id=? AND quote_id=? AND attachment_base64 IS NOT NULL${supplier(actor) ? '' : " AND kind='message'"}`).bind(entryId, quoteId).first<any>()
 if (!row) fail('NOT_FOUND', 'Attachment not found.', 404)
 const bytes = Uint8Array.from(atob(row.attachment_base64), c => c.charCodeAt(0))
 return new Response(bytes, { headers: { 'content-type': row.attachment_type, 'content-disposition': `attachment; filename="${row.attachment_name}"`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "sandbox; default-src 'none'" } })
}

/** Every thread entry in DATA-001's export, with attachment references; a buyer's export holds no internal note. */
export async function exportEntries(db: D1Database, actor: Actor, accountIds: string[]) {
 if (!accountIds.length) return []
 const rows = await db.prepare(`SELECT id,quote_id,account_id,kind,side,author_id,author_email,body,quote_revision,created_at,attachment_name,attachment_type,attachment_size,attachment_sha256 FROM bw_quote_entries WHERE account_id IN (SELECT value FROM json_each(?))${supplier(actor) ? '' : " AND kind='message'"} ORDER BY rowid`).bind(JSON.stringify(accountIds)).all<any>()
 return rows.results.map(entry)
}
