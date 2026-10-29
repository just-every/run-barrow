import type { Bindings } from '../../auth.server.ts'
import { boundedJson } from '@runeditrun/rer/modules/portability/http'
import { agentDoor } from './index.ts'
import type { Actor } from '../model.ts'

const refuse = (code: string, status = 403, fields: Record<string, unknown> = {}) => Response.json(
 { code, ...fields, error: { code, message: fields.message ?? code } },
 { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } },
)

/** Compatibility is transport only: authentication, scope, policy and execution
 * all enter the same production MCP handler as an ordinary company client. */
export async function agentHttp(request: Request, env: Bindings, actor: Actor): Promise<Response> {
 const url = new URL(request.url), path = url.pathname
 let name: string, args: Record<string, unknown>, command = false
 if (request.method === 'POST' && path === '/api/barrow/commands') {
  const body = await boundedJson(request, 1500000) as { type?: string; payload?: Record<string, unknown> }
  const names: Record<string, string> = {
   'order.prepare': 'barrow.orders.prepare', 'cart.preview': 'barrow.cart.preview',
   'cart.form': 'barrow.cart.form', 'proposal.submit': 'barrow.proposals.submit',
  }
  if (!body || typeof body.type !== 'string' || !body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) return refuse('INPUT', 400)
  if (!Object.hasOwn(names,body.type) || actor.agentScope === 'proposal' && body.type !== 'proposal.submit') return refuse('PERSON_REQUIRED')
  name = names[body.type]!
  args = { ...body.payload, ...(body.type === 'proposal.submit' ? { grantId: actor.grantId } : {}) }
  command = true
 } else if (request.method === 'GET') {
  const account = /^\/api\/barrow\/accounts\/by-id\/([^/]+)$/.exec(path)
  const order = /^\/api\/barrow\/orders\/([-a-zA-Z0-9_]+)$/.exec(path)
  if (path === '/api/barrow/state') { name = 'barrow.workspace.read'; args = {} }
  else if (account) { name = 'barrow.accounts.read'; args = { id: decodeURIComponent(account[1]!) } }
  else if (path === '/api/barrow/catalogue') { name = 'barrow.catalog.read'; args = { accountId: url.searchParams.get('accountId') ?? '', ...(url.searchParams.has('profileId') ? { profileId: url.searchParams.get('profileId') } : {}) } }
  else if (order) { name = 'barrow.orders.read'; args = { id: order[1] } }
  else if (path === '/api/barrow/lists') { name = 'barrow.lists.list'; args = { accountId: url.searchParams.get('accountId') ?? '' } }
  else return refuse('PERSON_REQUIRED')
 } else return refuse('PERSON_REQUIRED')
 const headers = new Headers({ 'content-type': 'application/json', 'mcp-protocol-version': '2025-11-25' })
 headers.set('authorization', request.headers.get('authorization') ?? '')
 if (request.headers.has('origin')) headers.set('origin', request.headers.get('origin')!)
 const response = (await agentDoor(env).handle(new Request(env.AUTH_ORIGIN + '/mcp', {
  method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
 })))!
 const rpc = await response.json() as any
 if (rpc.error) return refuse(rpc.error.data?.code ?? (response.status === 401 ? 'AUTH' : 'door_refused'), response.ok ? 403 : response.status)
 const error = rpc.result?._meta?.['com.runeditrun/error']
 if (error) {
  const status = Number.isInteger(error.native_status) && error.native_status >= 400 && error.native_status < 600 ? error.native_status : error.code === 'NOT_FOUND' || error.code === 'not_found' ? 404
   : error.code === 'invalid_arguments' ? 400
   : /^(policy_|agents_paused|paused|approval_required|review_required|insufficient_scope)/.test(error.code) ? 403 : 409
  return refuse(error.code, status, error)
 }
 return Response.json(command ? { result: rpc.result.structuredContent } : rpc.result.structuredContent,
  { headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } })
}
