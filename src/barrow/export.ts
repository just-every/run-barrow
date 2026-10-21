// DATA-001: an open export of every commercial record the signed-in person may see, as one JSON document or one
// RFC 4180 CSV per kind. Owner/admin export every trade account; a buyer exports only accounts under their email;
// agents are refused. Audit references are internal decisions (DATA-002) and appear only in supplier exports.
import type { Bindings } from '../auth.server'
import { accounts } from './accounts'
import { fail, requirePerson, supplier, type Actor, type Order } from './model'
import { csvText } from './cart-csv'
import { now } from './clock'
import type { Quote } from './quotes'
import { exportEntries } from './quote-thread'
import { termsExport } from './sales-terms'

export const exportKinds = ['accounts', 'prices', 'orders', 'lines', 'invoices', 'documents', 'quotes', 'quotelines', 'quotemessages', 'locations', 'followups', 'confirmations', 'quotedeliveries', 'salesterms', 'termsacceptances', 'audit'] as const
type Kind = (typeof exportKinds)[number]
// Each CSV keeps its header row even when empty, so a spreadsheet or importer always sees the same columns.
const columns: Record<Kind, string[]> = {
 accounts: ['id', 'revision', 'name', 'email', 'pierCustomerId', 'termsDays', 'minimumCents', 'currency', 'city', 'state', 'lifecycle', 'channel', 'territory', 'assignedRep', 'catalogs', 'providerReferences'],
 prices: ['accountId', 'accountRevision', 'sku', 'currency', 'unitCents', 'minQty', 'casePack', 'increment', 'units', 'pricing'],
 orders: ['id', 'revision', 'accountId', 'accountRevision', 'customerName', 'status', 'currency', 'totalCents', 'termsDays', 'reference', 'poRelease', 'requestedDate', 'cancelAfter', 'deliveryLocation', 'instructions', 'preparedBy', 'preparedAt', 'submittedBy', 'approvedBy', 'approvedAt', 'replaces', 'supersededBy', 'reorderedFrom', 'pierOrigin', 'pierOrderId', 'pierReference', 'invoiceNumber', 'document', 'quote', 'billTo', 'shipTo', 'delivery', 'merchandiseCents', 'shippingCents', 'substitutions', 'fromSubstitution'],
 lines: ['orderId', 'line', 'sku', 'name', 'pierItemId', 'buyerSku', 'quantity', 'unit', 'baseQuantity', 'baseUnit', 'conversion', 'currency', 'unitCents', 'lineCents', 'pricing', 'substitutedFrom'],
 invoices: ['number', 'orderId', 'accountId', 'issuedAt', 'dueAt', 'currency', 'totalCents', 'csv'],
 documents: ['orderId', 'name', 'type', 'bytes', 'sha256', 'uploadedBy', 'uploadedAt', 'path'],
 // ORD-004: one quotes row per quote (its latest revision) and one quotelines row per line of every revision.
 quotes: ['id', 'revision', 'accountId', 'customerName', 'status', 'currency', 'latestRevision', 'validUntil', 'termsDays', 'shipping', 'basisCents', 'totalCents', 'requestedBy', 'requestedAt', 'acceptedRevision', 'acceptedBy', 'acceptedAt', 'orderId', 'delivery', 'shippingCents', 'deliveredTotalCents'],
 quotelines: ['quoteId', 'quoteRevision', 'line', 'sku', 'name', 'quantity', 'unit', 'currency', 'basisUnitCents', 'basisLineCents', 'discountBps', 'negotiatedUnitCents', 'unitCents', 'lineCents', 'pricing', 'proposedBy', 'proposedAt', 'discountApprovedBy', 'discountApprovedAt'],
 // ORD-005: one row per quote conversation entry; internal notes appear in supplier exports only.
 quotemessages: ['id', 'quoteId', 'accountId', 'quoteRevision', 'visibility', 'side', 'authorId', 'authorEmail', 'body', 'createdAt', 'attachmentName', 'attachmentType', 'attachmentBytes', 'attachmentSha256', 'attachmentPath'],
 // ACC-003: one row per bill-to, ship-to or contact record, archived ones included.
 locations: ['id', 'revision', 'accountId', 'kind', 'default', 'archived', 'name', 'line1', 'line2', 'city', 'state', 'zip', 'jurisdiction', 'deliveryInstructions', 'exemptionReference', 'exemptionState', 'email', 'phone', 'role'],
 followups: ['id', 'revision', 'accountId', 'kind', 'sourceId', 'sourcePath', 'title', 'reason', 'priority', 'createdAt', 'ownerId', 'nextContactDate', 'status', 'resolution', 'contacts'],
 confirmations: ['orderId', 'number', 'stage', 'recordedAt', 'snapshot', 'pdf', 'csv'],
 // ORD-015: published sales-terms versions and the acceptance recorded on each order; the signature image is at signaturePath.
 salesterms: ['series', 'version', 'title', 'contentSha256', 'createdBy', 'createdAt', 'body', 'pdfName', 'pdfBytes', 'pdfSha256', 'pdfPath'],
 termsacceptances: ['orderId', 'accountId', 'series', 'version', 'contentSha256', 'how', 'acceptedBy', 'acceptedAt', 'printedName', 'signatureSha256', 'signaturePath'],
 quotedeliveries: ['id','quote_id','account_id','recipient_id','recipient','status','reason','provider_message_id','attempts','created_at','updated_at','task_id'],
 audit: ['id', 'subjectId', 'actorId', 'action', 'createdAt', 'accountId', 'orderId', 'revision'],
}
const json = (value: unknown) => value === undefined ? '' : JSON.stringify(value)
const lineCents = (line: Order['lines'][number]) => line.lineCents ?? line.quantity * line.unitCents
// Records written before USD carry AUD, exactly as their invoices do.
const currency = (order: Order) => order.currency ?? 'AUD'

export async function commercialExport(env: Bindings, actor: Actor) {
 requirePerson(actor)
 const selected = await accounts(env.DB, actor), ids = selected.map(account => account.id)
 const rows = ids.length ? (await env.DB.prepare('SELECT value_json,revision FROM bw_orders WHERE account_id IN (SELECT value FROM json_each(?)) ORDER BY rowid').bind(JSON.stringify(ids)).all<{ value_json: string; revision: string }>()).results : []
 const orders = rows.map(row => ({ ...JSON.parse(row.value_json), revision: row.revision }) as Order & { pierOrigin?: string })
 const quotes = ids.length ? (await env.DB.prepare('SELECT value_json,revision FROM bw_quotes WHERE account_id IN (SELECT value FROM json_each(?)) ORDER BY rowid').bind(JSON.stringify(ids)).all<{ value_json: string; revision: string }>()).results.map(row => ({ ...JSON.parse(row.value_json), revision: row.revision }) as Quote) : []
 // A requested quote has no proposal yet; its total is the cart at the prices of the request.
 const quoted = (quote: Quote) => quote.revisions.at(-1)?.totalCents ?? quote.request.reduce((sum, line) => sum + lineCents(line), 0)
 const entries = await exportEntries(env.DB, actor, ids)
 const locations = ids.length ? (await env.DB.prepare('SELECT * FROM bw_locations WHERE account_id IN (SELECT value FROM json_each(?)) ORDER BY rowid').bind(JSON.stringify(ids)).all<any>()).results : []
 const audit = supplier(actor) ? (await env.DB.prepare("SELECT id,subject_id,actor_id,action,created_at,json_extract(context_json,'$.accountId') AS account_id,json_extract(context_json,'$.orderId') AS order_id,json_extract(context_json,'$.revision') AS revision FROM bw_audit ORDER BY rowid").all<Record<string, string | null>>()).results : undefined
 const followups = supplier(actor) ? (await env.DB.prepare('SELECT id,revision,value_json FROM bw_followups ORDER BY id').all<{id:string;revision:string;value_json:string}>()).results.map(row => ({...JSON.parse(row.value_json),id:row.id,revision:row.revision})) : undefined
 const confirmations = ids.length ? (await env.DB.prepare('SELECT c.* FROM bw_confirmations c JOIN bw_orders o ON o.id=c.order_id WHERE o.account_id IN (SELECT value FROM json_each(?)) ORDER BY c.order_id,c.number').bind(JSON.stringify(ids)).all<any>()).results : []
 // Historical order metadata survives DATA-003 erasure; only extant bytes belong in the download manifest.
 const documentIds = new Set((await env.DB.prepare('SELECT d.order_id FROM bw_order_documents d JOIN bw_orders o ON o.id=d.order_id WHERE o.account_id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(ids)).all<{order_id:string}>()).results.map(row=>row.order_id))
 const quotedeliveries=supplier(actor)?(await env.DB.prepare('SELECT id,quote_id,account_id,recipient_id,recipient,status,reason,provider_message_id,attempts,created_at,updated_at,task_id FROM bw_quote_mail ORDER BY rowid').all<Record<string,unknown>>()).results:undefined
 const terms = await termsExport(env.DB, actor, ids, orders)
 const records = {
  ...terms,
  ...(quotedeliveries?{quotedeliveries}:{}),
  confirmations: confirmations.map(row => ({orderId:row.order_id,number:row.number,stage:row.stage,recordedAt:row.created_at,snapshot:row.value_json,pdf:`/api/barrow/orders/${row.order_id}/confirmations/${row.number}.pdf`,csv:`/api/barrow/orders/${row.order_id}/confirmations/${row.number}.csv`})),
  accounts: selected.map(({ id, revision, value }) => ({ id, revision, name: value.name, email: value.email, pierCustomerId: value.pierCustomerId, termsDays: value.termsDays, minimumCents: value.minimumCents, currency: 'USD', city: value.city ?? '', state: value.state ?? '', lifecycle: value.lifecycle ?? 'active', channel: value.channel ?? '', territory: value.territory ?? '', assignedRep: value.assignedRep ?? '', catalogs: json(value.catalogs), providerReferences: json(value.providerReferences) })),
  prices: selected.flatMap(({ id, revision, value }) => value.prices.map(price => ({ accountId: id, accountRevision: revision, sku: price.sku, currency: 'USD', unitCents: price.unitCents, minQty: price.minQty, casePack: price.casePack ?? '', increment: price.increment ?? '', units: json(price.units), pricing: json(price.pricing) }))),
  orders: orders.map(order => ({ id: order.id, revision: order.revision, accountId: order.accountId, accountRevision: order.accountRevision, customerName: order.customerName, status: order.status, currency: currency(order), totalCents: order.totalCents, termsDays: order.termsDays, reference: order.reference, poRelease: order.poRelease ? `${order.poRelease.number} of ${order.poRelease.of}` : '', requestedDate: order.requestedDate ?? '', cancelAfter: order.cancelAfter ?? '', deliveryLocation: order.deliveryLocation ?? '', instructions: order.instructions ?? '', preparedBy: order.preparedBy, preparedAt: order.preparedAt, submittedBy: order.submittedBy ?? '', approvedBy: order.approvedBy ?? '', approvedAt: order.approvedAt ?? '', replaces: order.replaces ?? '', supersededBy: order.supersededBy ?? '', reorderedFrom: order.reorderedFrom ?? '', pierOrigin: order.pierOrigin ?? '', pierOrderId: order.pierOrderId ?? '', pierReference: order.pierReference ?? '', invoiceNumber: order.invoice?.number ?? '', document: order.document ? `/api/barrow/orders/${order.id}/document` : '', quote: order.quote ? `${order.quote.id} r${order.quote.revision}` : '', billTo: json(order.billTo), shipTo: json(order.shipTo), delivery:json(order.delivery), merchandiseCents:order.lines.reduce((sum,line)=>sum+lineCents(line),0), shippingCents:order.delivery?.totalCents??0, substitutions:json(order.substitutions), fromSubstitution:json(order.fromSubstitution) })),
  lines: orders.flatMap(order => order.lines.map((line, index) => ({ orderId: order.id, line: index + 1, sku: line.sku, name: line.name, pierItemId: line.itemId, buyerSku: line.buyerSku ?? '', quantity: line.quantity, unit: line.unit ?? '', baseQuantity: line.baseQuantity ?? String(line.quantity), baseUnit: line.baseUnit ?? '', conversion: line.conversion ?? '', currency: currency(order), unitCents: line.unitCents, lineCents: lineCents(line), pricing: json(line.pricing), substitutedFrom:json(line.substitutedFrom) }))),
  invoices: orders.filter(order => order.invoice).map(order => ({ number: order.invoice!.number, orderId: order.id, accountId: order.accountId, issuedAt: order.invoice!.issuedAt, dueAt: order.invoice!.dueAt, currency: currency(order), totalCents: order.totalCents, csv: `/api/barrow/invoices/${order.id}.csv` })),
  documents: orders.filter(order => order.document && documentIds.has(order.id)).map(order => ({ orderId: order.id, name: order.document!.name, type: order.document!.type, bytes: order.document!.size, sha256: order.document!.sha256, uploadedBy: order.document!.uploadedBy, uploadedAt: order.document!.uploadedAt, path: `/api/barrow/orders/${order.id}/document` })),
  quotes: quotes.map(quote => { const latest = quote.revisions.at(-1); return { id: quote.id, revision: quote.revision, accountId: quote.accountId, customerName: quote.customerName, status: quote.status, currency: quote.currency, latestRevision: latest?.number ?? 0, validUntil: latest?.validUntil ?? '', termsDays: latest?.termsDays ?? '', shipping: latest?.shipping ?? '', basisCents: latest?.basisCents ?? quoted(quote), totalCents: quoted(quote), requestedBy: quote.requestedBy, requestedAt: quote.requestedAt, acceptedRevision: quote.accepted?.revision ?? '', acceptedBy: quote.accepted?.by ?? '', acceptedAt: quote.accepted?.at ?? '', orderId: quote.accepted?.orderId ?? '', delivery:json(latest?.delivery), shippingCents:latest?.delivery?.totalCents??0, deliveredTotalCents:quoted(quote)+(latest?.delivery?.totalCents??0) } }),
  // The supplier's discount approval is an internal decision: buyer exports leave it blank.
  quotelines: quotes.flatMap(quote => quote.revisions.flatMap(revision => revision.lines.map((line, index) => ({ quoteId: quote.id, quoteRevision: revision.number, line: index + 1, sku: line.sku, name: line.name, quantity: line.quantity, unit: line.unit ?? '', currency: quote.currency, basisUnitCents: line.basisUnitCents, basisLineCents: line.basisLineCents, discountBps: line.discountBps ?? '', negotiatedUnitCents: line.negotiatedUnitCents ?? '', unitCents: line.unitCents, lineCents: lineCents(line), pricing: json(line.pricing), proposedBy: revision.proposedBy, proposedAt: revision.proposedAt, discountApprovedBy: supplier(actor) ? revision.approval?.by ?? '' : '', discountApprovedAt: supplier(actor) ? revision.approval?.at ?? '' : '' })))),
  quotemessages: entries.map(row => ({ id: row.id, quoteId: row.quoteId, accountId: row.accountId, quoteRevision: row.quoteRevision, visibility: row.kind === 'internal' ? 'internal' : 'buyer-visible', side: row.side, authorId: row.authorId, authorEmail: row.authorEmail, body: row.body, createdAt: row.at, attachmentName: row.attachment?.name ?? '', attachmentType: row.attachment?.type ?? '', attachmentBytes: row.attachment?.size ?? '', attachmentSha256: row.attachment?.sha256 ?? '', attachmentPath: row.attachment?.path ?? '' })),
  locations: locations.map(row => { const value = JSON.parse(row.value_json); return { id: row.id, revision: row.revision, accountId: row.account_id, kind: row.kind, default: row.is_default ? 'yes' : 'no', archived: row.archived ? 'yes' : 'no', name: value.name, line1: value.line1 ?? '', line2: value.line2 ?? '', city: value.city ?? '', state: value.state ?? '', zip: value.zip ?? '', jurisdiction: row.kind === 'ship-to' ? `US-${value.state}` : '', deliveryInstructions: value.deliveryInstructions ?? '', exemptionReference: value.exemption?.reference ?? '', exemptionState: value.exemption?.state ?? '', email: value.email ?? '', phone: value.phone ?? '', role: value.role ?? '' } }),
  ...(followups ? { followups: followups.map(row => ({...row, contacts: json(row.contacts)})) } : {}),
  ...(audit ? { audit: audit.map(row => ({ id: row.id, subjectId: row.subject_id, actorId: row.actor_id, action: row.action, createdAt: row.created_at, accountId: row.account_id ?? '', orderId: row.order_id ?? '', revision: row.revision ?? '' })) } : {}),
 }
 const totals = [...new Set([...orders.map(currency), ...quotes.map(quote => quote.currency)])].sort().map(code => {
  const mine = orders.filter(order => currency(order) === code), invoiced = mine.filter(order => order.invoice), offered = quotes.filter(quote => quote.currency === code)
  return { currency: code, orders: mine.length, orderCents: mine.reduce((sum, order) => sum + order.totalCents, 0), invoices: invoiced.length, invoiceCents: invoiced.reduce((sum, order) => sum + order.totalCents, 0), quotes: offered.length, quoteCents: offered.reduce((sum, quote) => sum + quoted(quote), 0) }
 })
 const counts = Object.fromEntries(Object.entries(records).map(([kind, list]) => [kind, list.length]))
 return { manifest: { format: 'barrow-commercial-export', version: 1, exportedAt: (await now()).toISOString(), scope: supplier(actor) ? 'installation' : 'buyer', accountIds: ids, counts, totals }, ...records }
}

export async function exportResponse(env: Bindings, actor: Actor, kind: Kind | 'json') {
 const data = await commercialExport(env, actor)
 const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
 if (kind === 'json') return new Response(JSON.stringify(data, null, 2), { headers: { ...headers, 'content-type': 'application/json; charset=utf-8', 'content-disposition': 'attachment; filename="barrow-export.json"' } })
 const list = (data as unknown as Record<Kind, Record<string, unknown>[] | undefined>)[kind]
 if (!list) fail('FORBIDDEN', 'Staff records are available to the supplier only.', 403)
 return new Response(csvText([columns[kind], ...list.map(row => columns[kind].map(column => row[column]))]), { headers: { ...headers, 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="barrow-${kind}.csv"` } })
}
