import type { Bindings } from '../../auth.server.ts'
import { tools } from './tools.ts'
import { proposalTools } from './proposals.ts'
import { prompts } from './prompts.ts'
import { resources } from './records.ts'

/** Seed-owned declarations shared by the runtime and generated operator guide. */
export const specialist = 'wholesale account operator'
export const capabilities = ['tools', 'policy', 'pause', 'audit', 'idempotency', 'prompts'] as const
export const limits = { requestsPerMinute: 600, maxBodyBytes: 1048576 }
export function agentRegistry(env: Bindings) {
  return { specialist, capabilities, limits, tools: [...tools(env), ...proposalTools(env)], resources: resources(env), prompts }
}
