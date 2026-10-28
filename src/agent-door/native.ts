import { type Bindings } from '../auth.server'
import { current } from '../barrow/access'
import { account } from '../barrow/accounts'
import { accountPage } from '../barrow/account-directory'
import { readOrder } from '../barrow/orders'
import { workspaceOrders } from '../barrow/workspace-orders'
import { readList, readLists } from '../barrow/lists'
import { readProposalGrant } from '../barrow/proposal-grants'
import { Problem, type Actor } from '../barrow/model'
import { ToolRefusal, type Person, type ToolContext } from '../modules/agent-door/index.ts'
import { erasureRestoreResponse } from '../barrow/erasure-journal'

/** Only native readers are exposed. No session, local grant or approval is fabricated. */
export async function actor(env: Bindings, person: Person): Promise<Actor> {
 if (await erasureRestoreResponse(env)) throw new ToolRefusal('installation_unavailable')
 const row = await env.DB.prepare("SELECT id,email,role,version FROM oa_operators WHERE id=? AND status='active'").bind(person.id).first<Omit<Actor, 'agent'>>()
 if (!row || row.role !== person.role) throw new ToolRefusal('sponsor_unavailable')
 return { ...row, agent: true }
}

export async function localCredential(request: Request, env: Bindings) {
 if (!request.headers.has('authorization')) return null
 try {
  const native = await current(request, env)
  if (!native.agent || !native.grantId) return null
  return { sponsor: { id: native.id }, agent: { id: `barrow-grant:${native.grantId}`, name: 'Barrow scoped agent' }, scopes: ['orders:read'] }
 } catch { return null }
}

export async function nativeRead<T>(read: () => Promise<T>): Promise<T> {
 try { return await read() }
 catch (error) {
  if (error instanceof Problem) throw new ToolRefusal(error.status === 403 || error.status === 404 ? 'resource_unavailable' : error.code.toLowerCase())
  throw error
 }
}

/** The original local proposal credential stays confined to its exact account. */
export async function orderRead(env: Bindings, ctx: Pick<ToolContext, 'person' | 'agent'>, id: string) {
 return nativeRead(async () => {
  const native = await actor(env, ctx.person), order = await readOrder(env.DB, native, id)
  if (ctx.agent.id.startsWith('barrow-grant:')) {
   const grantId = ctx.agent.id.slice('barrow-grant:'.length)
   const token = await env.DB.prepare("SELECT scope_kind FROM bw_agent_tokens WHERE id=? AND actor_id=? AND actor_version=? AND expires_at>?").bind(grantId, native.id, native.version, Date.now()).first<{ scope_kind: string }>()
   if (!token) throw new ToolRefusal('sponsor_unavailable')
   if (token.scope_kind === 'proposal') {
    const grant = await readProposalGrant(env.DB, grantId)
    if (!grant || grant.accountId !== order.accountId) throw new ToolRefusal('resource_unavailable')
   }
  }
  return order
 })
}

export const readers = {
 account: (env: Bindings, person: Person, id: string) => nativeRead(async () => account(env.DB, await actor(env, person), id)),
 accounts: (env: Bindings, person: Person, query: URLSearchParams) => nativeRead(async () => accountPage(env.DB, await actor(env, person), query)),
 orders: (env: Bindings, person: Person, query: URLSearchParams) => nativeRead(async () => workspaceOrders(env, await actor(env, person), query)),
 list: (env: Bindings, person: Person, id: string) => nativeRead(async () => readList(env.DB, await actor(env, person), id)),
 lists: (env: Bindings, person: Person, id: string) => nativeRead(async () => ({ lists: await readLists(env.DB, await actor(env, person), id) })),
}
