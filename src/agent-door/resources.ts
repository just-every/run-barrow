import type { Bindings } from '../auth.server'
import type { ResourceDefinition } from '../modules/agent-door/index.ts'
import { readers } from './native'

/** Native readers hide missing and restricted rows behind the same refusal. */
export function resources(env: Bindings): ResourceDefinition[] {
 return [
  { uriTemplate: 'barrow://accounts/{id}', name: 'Trade account', scope: 'accounts:read', classes: ['standard'],
   classify: record => [{ class: 'standard', facts: { measure: (record.json as { id?: string })?.id ? 1 : 0 } }],
   async read(uri, ctx) { try { return { json: await readers.account(env, ctx.person, decodeURIComponent(new URL(uri).pathname.slice(1))), untrusted: true } } catch { return null } },
  },
  { uriTemplate: 'barrow://lists/{id}', name: 'Shared shopping list', scope: 'lists:read', classes: ['standard'],
   classify: record => [{ class: 'standard', facts: { measure: (record.json as { id?: string })?.id ? 1 : 0 } }],
   async read(uri, ctx) { try { return { json: await readers.list(env, ctx.person, decodeURIComponent(new URL(uri).pathname.slice(1))), untrusted: true } } catch { return null } },
  },
 ]
}
