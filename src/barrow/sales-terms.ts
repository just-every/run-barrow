import { companyAccountPredicate } from './company-access'
// ORD-015: versioned sales terms, per-account assignment and the acceptance recorded on each submitted order.
import type { Bindings } from '../auth.server'
import { account } from './accounts'
import { audit, commit, digest } from './access'
import { now } from './clock'
import { readDocument } from './documents'
import { fail, requirePerson, requireSupplier, supplier, text, type Account, type Actor, type Order } from './model'

export type TermsAcceptance = { series: string; version: number; title: string; contentSha256: string; pdfSha256?: string; how: 'buyer' | 'rep-signature'; acceptedBy: string; acceptedAt: string; printedName?: string; signatureSha256?: string }
type VersionRow = { series: string; version: number; title: string; body: string; content_sha256: string; pdf_name: string | null; pdf_size: number | null; pdf_sha256: string | null; created_by: string; created_at: string }
type AssignmentRow = { account_id: string; series: string; require_acceptance: number; assigned_by: string; assigned_at: string }
const bodyLimit = 20000, signatureLimit = 140000
const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const meta = (row: VersionRow) => ({ series: row.series, version: row.version, title: row.title, contentSha256: row.content_sha256, createdBy: row.created_by, createdAt: row.created_at, hasText: row.body !== '', ...(row.pdf_sha256 ? { pdf: { name: row.pdf_name!, size: row.pdf_size!, sha256: row.pdf_sha256 } } : {}) })
const full = (row: VersionRow) => ({ ...meta(row), body: row.body })
const versions = async (db: D1Database, series?: string) => (await db.prepare(`SELECT series,version,title,body,content_sha256,pdf_name,pdf_size,pdf_sha256,created_by,created_at FROM bw_sales_terms ${series === undefined ? '' : 'WHERE series=? '}ORDER BY series,version DESC`).bind(...(series === undefined ? [] : [series])).all<VersionRow>()).results
const assignment = (db: D1Database, accountId: string) => db.prepare('SELECT * FROM bw_terms_assignments WHERE account_id=?').bind(accountId).first<AssignmentRow>()
const newest = async (db: D1Database, series: string) => (await db.prepare('SELECT series,version,title,body,content_sha256,pdf_name,pdf_size,pdf_sha256,created_by,created_at FROM bw_sales_terms WHERE series=? ORDER BY version DESC LIMIT 1').bind(series).first<VersionRow>())

/** Supplier: every series with its versions and every assignment. Buyer: the terms assigned to one of their own accounts. */
export async function readSalesTerms(env: Bindings, actor: Actor, accountId: string | null) {
 requirePerson(actor)
 if (accountId === null) {
  requireSupplier(actor)
  const rows = await versions(env.DB), names = [...new Set(rows.map(row => row.series))]
  const assignments = (await env.DB.prepare('SELECT * FROM bw_terms_assignments ORDER BY account_id').all<AssignmentRow>()).results
  return { series: names.map(name => ({ series: name, versions: rows.filter(row => row.series === name).map(meta), current: full(rows.find(row => row.series === name)!) })), assignments: assignments.map(row => ({ accountId: row.account_id, series: row.series, requireAcceptance: row.require_acceptance === 1, assignedBy: row.assigned_by, assignedAt: row.assigned_at })) }
 }
 const selected = await account(env.DB, actor, accountId), row = await assignment(env.DB, selected.id)
 const current = row ? await newest(env.DB, row.series) : null
 return { assignment: row && current ? { series: row.series, requireAcceptance: row.require_acceptance === 1, current: full(current) } : null }
}

export async function salesTermsCommand(env: Bindings, actor: Actor, type: string, p: any) {
 requirePerson(actor)
 requireSupplier(actor)
 const at = (await now()).toISOString()
 if (type === 'terms.publish') {
  const series = text(p.series, 'Series', 80), title = text(p.title, 'Title', 160)
  const body = p.body === undefined || p.body === '' ? '' : text(p.body, 'Terms text', bodyLimit)
  const pdf = p.pdf === undefined ? undefined : await readDocument(p.pdf, 'A terms PDF', 'sales terms')
  if (pdf && pdf.type !== 'application/pdf') fail('DOCUMENT', 'Attach sales terms as a PDF.', 400)
  if (!body && !pdf) fail('INPUT', 'Publish the terms as text, a PDF or both.', 400)
  const version = ((await newest(env.DB, series))?.version ?? 0) + 1, contentSha256 = await digest(JSON.stringify([title, body, pdf?.sha256 ?? '']))
  await commit(env.DB, actor, [
   env.DB.prepare('INSERT INTO bw_sales_terms(series,version,title,body,content_sha256,pdf_name,pdf_size,pdf_sha256,pdf_base64,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(series, version, title, body, contentSha256, pdf?.name ?? null, pdf?.size ?? null, pdf?.sha256 ?? null, pdf?.contentBase64 ?? null, actor.id, at),
   audit(env.DB, actor, `${series}@${version}`, 'terms.published', { revision: String(version), source: 'terms.publish', reason: `Supplier published sales terms "${series}" version ${version}; accounts assigned to this series must accept it on their next order.` }),
  ])
  return { series, version, title, contentSha256 }
 }
 if (type === 'terms.assign') {
  const selected = await account(env.DB, actor, text(p.accountId, 'Account'))
  const prior = await assignment(env.DB, selected.id)
  const context = { accountId: selected.id, revision: selected.revision, source: 'terms.assign' }
  if (p.series === null) {
   await commit(env.DB, actor, [env.DB.prepare('DELETE FROM bw_terms_assignments WHERE account_id=?').bind(selected.id), audit(env.DB, actor, selected.id, 'terms.unassigned', { ...context, reason: `Supplier removed sales terms${prior ? ` "${prior.series}"` : ''} from this account; earlier acceptances stay on their orders.` })])
   return { accountId: selected.id, series: null }
  }
  const series = text(p.series, 'Series', 80)
  if (typeof p.requireAcceptance !== 'boolean') fail('INPUT', 'Say whether this account must accept the terms before ordering.', 400)
  if (!await newest(env.DB, series)) fail('TERMS_SERIES', 'Publish these sales terms before assigning them.', 404)
  await commit(env.DB, actor, [
   env.DB.prepare('INSERT INTO bw_terms_assignments(account_id,series,require_acceptance,assigned_by,assigned_at) VALUES(?,?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET series=excluded.series,require_acceptance=excluded.require_acceptance,assigned_by=excluded.assigned_by,assigned_at=excluded.assigned_at').bind(selected.id, series, p.requireAcceptance ? 1 : 0, actor.id, at),
   audit(env.DB, actor, selected.id, 'terms.assigned', { ...context, reason: `Supplier assigned sales terms "${series}" (${p.requireAcceptance ? 'acceptance required before submission' : 'acceptance optional'}).` }),
  ])
  return { accountId: selected.id, series, requireAcceptance: p.requireAcceptance }
 }
 return fail('NOT_FOUND', 'Unknown sales terms command.', 404)
}

const signature = async (p: any) => {
 const encoded = p?.signaturePngBase64
 if (typeof encoded !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length > signatureLimit) fail('SIGNATURE', 'Capture the buyer’s on-device signature as a PNG image of at most about 100 KB.', 400)
 let bytes: Uint8Array<ArrayBuffer>
 try { bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0)) } catch { return fail('SIGNATURE', 'Capture the buyer’s on-device signature as a PNG image.', 400) }
 if (!png.every((byte, index) => bytes[index] === byte)) fail('SIGNATURE', 'Capture the buyer’s on-device signature as a PNG image.', 400)
 return { encoded, sha256: [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('') }
}

/**
 * Submission door: the account's assigned series must be accepted at its newest version where acceptance is required.
 * A buyer accepts in the portal; a supplier owner/admin acting for a rep records the buyer's on-device signature image
 * and printed name. The guard holds the exact assignment and newest version this decision saw until the batch commits.
 */
export async function termsAtSubmission(env: Bindings, actor: Actor, selected: Account, orderId: string, p: unknown, at: string) {
 const row = await assignment(env.DB, selected.id), latest = row ? await newest(env.DB, row.series) : null
 const guard = env.DB.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN COALESCE((SELECT series||\':\'||require_acceptance FROM bw_terms_assignments WHERE account_id=?),\'\')=? AND COALESCE((SELECT MAX(version) FROM bw_sales_terms WHERE series=?),0)=? THEN 1 ELSE 0 END').bind(selected.id, row ? `${row.series}:${row.require_acceptance}` : '', row?.series ?? '', latest?.version ?? 0)
 if (!row || !latest) {
  if (p !== undefined) fail('TERMS_NOT_ASSIGNED', 'No sales terms are assigned to this account.')
  return { guard, statements: [] as D1PreparedStatement[] }
 }
 const label = `${latest.title} (version ${latest.version})`
 if (p === undefined) {
  if (row.require_acceptance === 1) fail('TERMS_REQUIRED', supplier(actor) ? `This account must accept ${label}. Capture the buyer’s signature and printed name before submitting.` : `Accept ${label} before submitting this order.`)
  return { guard, statements: [] as D1PreparedStatement[] }
 }
 const given = p as { version?: unknown; accepted?: unknown; printedName?: unknown; signaturePngBase64?: unknown }
 if (typeof given !== 'object' || given === null || given.version !== latest.version) fail('TERMS_VERSION', `Review and accept the current sales terms: ${label}.`)
 const base = { series: latest.series, version: latest.version, title: latest.title, contentSha256: latest.content_sha256, ...(latest.pdf_sha256 ? { pdfSha256: latest.pdf_sha256 } : {}), acceptedBy: actor.id, acceptedAt: at }
 if (supplier(actor)) {
  const printedName = text(given.printedName, 'Printed name', 120), image = await signature(given)
  return { guard, acceptance: { ...base, how: 'rep-signature', printedName, signatureSha256: image.sha256 } satisfies TermsAcceptance, statements: [env.DB.prepare('INSERT INTO bw_terms_signatures(order_id,sha256,png_base64) VALUES(?,?,?)').bind(orderId, image.sha256, image.encoded)] }
 }
 if (given.accepted !== true) fail('TERMS_REQUIRED', `Tick the acceptance of ${label}.`)
 const printedName = given.printedName === undefined || given.printedName === '' ? undefined : text(given.printedName, 'Printed name', 120)
 return { guard, acceptance: { ...base, how: 'buyer', ...(printedName ? { printedName } : {}) } satisfies TermsAcceptance, statements: [] as D1PreparedStatement[] }
}
export async function termsText(db: D1Database, acceptance: TermsAcceptance) {
 const row = await db.prepare('SELECT body FROM bw_sales_terms WHERE series=? AND version=?').bind(acceptance.series, acceptance.version).first<{ body: string }>()
 return row?.body ?? ''
}

export async function termsSignatureResponse(env: Bindings, actor: Actor, order: Order) {
 requirePerson(actor)
 const row = await env.DB.prepare('SELECT png_base64 FROM bw_terms_signatures WHERE order_id=?').bind(order.id).first<{ png_base64: string }>()
 if (!row) fail('NOT_FOUND', 'This order has no captured signature.', 404)
 return new Response(Uint8Array.from(atob(row.png_base64), c => c.charCodeAt(0)), { headers: { 'content-type': 'image/png', 'content-disposition': `attachment; filename="${order.id}-signature.png"`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "sandbox; default-src 'none'" } })
}

export async function termsDocumentResponse(env: Bindings, actor: Actor, series: string, version: number) {
 requirePerson(actor)
 if (!supplier(actor)) {
  const mine = (await env.DB.prepare(`SELECT 1 FROM bw_terms_assignments t JOIN bw_accounts a ON a.id=t.account_id WHERE t.series=? AND ${companyAccountPredicate('a.id')}`).bind(series, actor.id).first())
  if (!mine) fail('NOT_FOUND', 'Sales terms not found.', 404)
 }
 const row = await env.DB.prepare('SELECT pdf_name,pdf_base64 FROM bw_sales_terms WHERE series=? AND version=? AND pdf_base64 IS NOT NULL').bind(series, version).first<{ pdf_name: string; pdf_base64: string }>()
 if (!row) fail('NOT_FOUND', 'Sales terms PDF not found.', 404)
 return new Response(Uint8Array.from(atob(row.pdf_base64), c => c.charCodeAt(0)), { headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${row.pdf_name}"`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "sandbox; default-src 'none'" } })
}

/** DATA-001 rows: published versions (a buyer sees series assigned to their accounts) and the acceptance on each order. */
export async function termsExport(db: D1Database, actor: Actor, accountIds: string[], orders: Order[]) {
 const rows = supplier(actor) ? await versions(db) : (await db.prepare('SELECT s.series,s.version,s.title,s.body,s.content_sha256,s.pdf_name,s.pdf_size,s.pdf_sha256,s.created_by,s.created_at FROM bw_sales_terms s WHERE s.series IN (SELECT series FROM bw_terms_assignments WHERE account_id IN (SELECT value FROM json_each(?))) ORDER BY s.series,s.version').bind(JSON.stringify(accountIds)).all<VersionRow>()).results
 const salesterms = [...rows].sort((a, b) => a.series.localeCompare(b.series) || a.version - b.version).map(row => ({ series: row.series, version: row.version, title: row.title, contentSha256: row.content_sha256, createdBy: row.created_by, createdAt: row.created_at, body: row.body, pdfName: row.pdf_name ?? '', pdfBytes: row.pdf_size ?? '', pdfSha256: row.pdf_sha256 ?? '', pdfPath: row.pdf_sha256 ? `/api/barrow/sales-terms/${encodeURIComponent(row.series)}/${row.version}/document` : '' }))
 const termsacceptances = orders.filter(order => order.termsAcceptance).map(order => { const a = order.termsAcceptance!; return { orderId: order.id, accountId: order.accountId, series: a.series, version: a.version, contentSha256: a.contentSha256, how: a.how, acceptedBy: a.acceptedBy, acceptedAt: a.acceptedAt, printedName: a.printedName ?? '', signatureSha256: a.signatureSha256 ?? '', signaturePath: a.signatureSha256 ? `/api/barrow/orders/${order.id}/terms-signature` : '' } })
 return { salesterms, termsacceptances }
}

/** A company release preserves the purchaser’s exact acceptance while it is still current. */
export async function termsAtCompanyRelease(env:Bindings,actor:Actor,selected:Account,order:Order,p:unknown,at:string) {
 if(p!==undefined)return termsAtSubmission(env,actor,selected,order.id,p,at)
 const assigned=await assignment(env.DB,selected.id),current=assigned?await newest(env.DB,assigned.series):null,accepted=order.termsAcceptance
 if(!accepted)return termsAtSubmission(env,actor,selected,order.id,undefined,at)
 if(!current||accepted.series!==current.series||accepted.version!==current.version||accepted.contentSha256!==current.content_sha256)fail('TERMS_REQUIRED','The sales terms changed. Review and accept the current version before company release.')
 const checked=await termsAtSubmission(env,actor,selected,order.id,{version:accepted.version,accepted:true},at)
 return {...checked,acceptance:accepted,statements:[]}
}
