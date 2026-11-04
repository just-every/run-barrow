import assert from 'node:assert/strict'
import { installation } from '../api/harness.mjs'
import { inspectPrompts, mcpClient, documentedRegistry } from './prompt-fixture.mjs'

// One public-door journey: policy setup, allowed jobs and revoked authority.
export async function provePromptPolicies() {
  let outbound = 0
  const h = await installation({ agentPolicy: false, networkEdge: () => { outbound++; return new Response(null, { status: 503 }) } })
  try {
  const grant = await h.api('/api/barrow/agent-token', {})
  const mcp = mcpClient((url, init) => h.raw(new URL(url).pathname, init), h.origin, grant.token)
  const unauthenticated = mcpClient((url, init) => h.raw(new URL(url).pathname, init), h.origin, '')
  for (const method of ['server/discover', 'initialize']) {
    const answer = await unauthenticated(method)
    assert.equal(answer.status, 401)
    assert.equal(answer.body.result, undefined, 'Registry instructions cannot bypass authentication')
  }
  const model = await documentedRegistry(), name = model.prompts[0].name
  const before = await h.api('/api/barrow/state'), deliveries = h.mail.deliveries.length
  const refused = async expected => {
    const answer = await mcp('prompts/get', { name })
    assert.equal(answer.body.error.data.code, expected)
    assert.equal(answer.body.result, undefined)
    assert.deepEqual(await h.api('/api/barrow/state'), before)
  }
  assert.deepEqual((await mcp('prompts/list')).body.result.prompts, [])
  await refused('policy_unset')
  const document = rules => ({ schema: 'rer-agent-policy/1', catalogue: 'rer-agent-classes/1', rules, spend: { none: true } })
  const policy = async (rules, extra = {}) => {
    const response = await h.request('/agents/api/policy', { method: 'PUT', body: { document: { ...document(rules), ...extra } } })
    assert.equal(response.status, 200, await response.text())
  }
  for (const disposition of ['autonomous', 'review']) {
    await policy([{ id: 'all', class: '*', do: disposition }], disposition === 'review' ? { reviewers: ['sponsor'] } : {})
    await inspectPrompts(mcp)
  }
  await policy([{ id: 'all', class: '*', do: 'blocked' }])
  await refused('policy_blocked')
  await policy([{ id: 'all', class: '*', do: 'approval', approver: ['sponsor'], wait: 'PT1H' }])
  await refused('approval_required')
  await policy([{ id: 'all', class: '*', do: 'autonomous' }])
  await h.api('/agents/api/pause', { paused: true })
  assert.deepEqual((await mcp('prompts/list')).body.result.prompts, [])
  await refused('agents_paused')
  await h.api('/agents/api/pause', { paused: false })
  await inspectPrompts(mcp)
  await h.api('/api/barrow/agent-token/revoke', {})
  for (const method of ['server/discover', 'initialize', 'prompts/list', 'prompts/get']) assert.equal((await mcp(method, { name })).status, 401)
  assert.deepEqual(await h.api('/api/barrow/state'), before)
  assert.equal(h.mail.deliveries.length, deliveries)
  assert.equal(outbound, 0)
  console.log('PROBE BASE-AGENT-013 prompts: unset, autonomous, held review, blocked, approval, Pause and revocation -> instructions only or refusal; zero commercial or provider effects')
  } finally { await h.close() }
}
