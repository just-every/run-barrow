// ORD-007 supporting PO document: PDF, PNG or JPEG recognised by its bytes, at most 1 MB, one per order, attached while the order is a draft.
import type { Bindings } from '../auth.server'
import { fail, requirePerson, text, type Actor, type Order } from './model'
export const documentLimit = 1048576
const kinds: [string, number[]][] = [['application/pdf', [0x25, 0x50, 0x44, 0x46, 0x2d]], ['image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]], ['image/jpeg', [0xff, 0xd8, 0xff]]]
const extension: Record<string, string> = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg' }
/** The stored name keeps letters, digits, dot, dash and underscore; the extension always follows the detected type. */
const safeName = (name: string, type: string) => `${name.replace(/\.[A-Za-z0-9]{1,5}$/, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 80) || 'purchase-order'}.${extension[type]}`
export async function readDocument(p: any) {
 const name = text(p?.name, 'File name', 200)
 if (typeof p?.contentBase64 !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(p.contentBase64)) fail('DOCUMENT', 'Attach the file contents as base64.', 400)
 let bytes: Uint8Array<ArrayBuffer>
 try { bytes = Uint8Array.from(atob(p.contentBase64), c => c.charCodeAt(0)) } catch { return fail('DOCUMENT', 'Attach the file contents as base64.', 400) }
 if (!bytes.length || bytes.length > documentLimit) fail('DOCUMENT', 'A PO document must be between 1 byte and 1 MB.', 400)
 const type = kinds.find(([, magic]) => magic.every((byte, index) => bytes[index] === byte))?.[0]
 if (!type) fail('DOCUMENT', 'Attach a PDF, PNG or JPEG purchase order.', 400)
 const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('')
 return { name: safeName(name, type), type, size: bytes.length, sha256, contentBase64: p.contentBase64 }
}
export function documentStatement(env: Bindings, orderId: string, document: Awaited<ReturnType<typeof readDocument>>) {
 return env.DB.prepare('INSERT INTO bw_order_documents(order_id,name,type,size,sha256,content_base64) VALUES(?,?,?,?,?,?) ON CONFLICT(order_id) DO UPDATE SET name=excluded.name,type=excluded.type,size=excluded.size,sha256=excluded.sha256,content_base64=excluded.content_base64').bind(orderId, document.name, document.type, document.size, document.sha256, document.contentBase64)
}
/** A replacing draft keeps the supporting document of the draft it replaces. */
export const carryDocument = (env: Bindings, from: string, to: string) => env.DB.prepare('INSERT INTO bw_order_documents(order_id,name,type,size,sha256,content_base64) SELECT ?,name,type,size,sha256,content_base64 FROM bw_order_documents WHERE order_id=?').bind(to, from)
export async function documentResponse(env: Bindings, actor: Actor, order: Order) {
 requirePerson(actor)
 const row = await env.DB.prepare('SELECT name,type,content_base64 FROM bw_order_documents WHERE order_id=?').bind(order.id).first<{ name: string; type: string; content_base64: string }>()
 if (!row) fail('NOT_FOUND', 'This order has no PO document.', 404)
 const bytes = Uint8Array.from(atob(row.content_base64), c => c.charCodeAt(0))
 return new Response(bytes, { headers: { 'content-type': row.type, 'content-disposition': `attachment; filename="${row.name}"`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "sandbox; default-src 'none'" } })
}
