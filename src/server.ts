import { expireReplayCalls } from './modules/agent-door/index.ts'
import { agentDoor } from './barrow/agent-door/index.ts'
import { businessSettings } from './barrow/agent-door/business.ts'
import { reconcilePaymentPromises } from './barrow/payment-promises'
import { dispatchCampaigns } from './barrow/campaigns'
import { runStockSync } from './barrow/stock-sync'
import { dispatchWebhooks } from './barrow/webhook-delivery'
import { reconcileErasureJournal } from './barrow/erasure-journal'
import { purgeUnverified } from './barrow/application-records'
import { dispatchReports } from './barrow/report-delivery'
import { dispatchQuoteMail } from './barrow/quote-mail'
import { escalateApprovals } from './barrow/approval-escalation'
import { withDemo } from './modules/demo/index.mjs'
import { seedDemo } from './demo'
import { rejectedResponse } from './base/rejected-response'
import start from '@tanstack/react-start/server-entry'
import { Hono } from 'hono'
import { dispatch } from './base/dispatch'
import { staticAssetResponse } from './base/static-assets'
import { deploymentHealth } from './base/deployment-health'
import { lobbyResponse } from './base/lobby'
import { setupStateResponse } from './base/setup-state'
import { authResponse, runtimeBindings, type Bindings } from './auth.server'
import { barrowResponse } from './barrow/api'
import { identity } from './identity'

const api = new Hono<{ Bindings: Bindings }>()
api.get('/health', (context) => context.json({ status: 'ok', ...deploymentHealth(context.env) }))

// Start documents keep their own cache policy and add no-transform, so no proxy
// rewrites the HTML React hydrates (Cloudflare's email address obfuscation
// honours it; src/base/hydration/README.md).
function noTransform(response: Response): Response {
  const headers = new Headers(response.headers), policy = headers.get('cache-control')
  headers.set('cache-control', policy ? `${policy}, no-transform` : 'no-transform')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

export default withDemo({
  async scheduled(_event, env, execution) { execution.waitUntil((async()=>{await reconcileErasureJournal(runtimeBindings(env));await expireReplayCalls({options:{db:env.DB},now:Date.now});await purgeUnverified(runtimeBindings(env));await dispatchQuoteMail(runtimeBindings(env));await dispatchReports(runtimeBindings(env));await dispatchCampaigns(runtimeBindings(env));await escalateApprovals(runtimeBindings(env));await reconcilePaymentPromises(runtimeBindings(env));await dispatchWebhooks(runtimeBindings(env));await runStockSync(runtimeBindings(env))})()) },
  async fetch(request, env, execution) {
    const bindings = runtimeBindings(env)
    const business = await businessSettings(bindings).handle(request)
    if (business) return business
    const agent = await agentDoor(bindings).handle(request)
    if (agent) return agent
    const asset = await staticAssetResponse(request, env)
    if (asset) return asset
    const barrow = await barrowResponse(request, env)
    if (barrow) return barrow
    const auth = await authResponse(request, env)
    if (auth) return auth
    // The installed variant: the Lobby at / and the public claim state it reads.
    // Local dev serves the saved origin's data at its own port (RER_DEV_ORIGIN).
    const state = await setupStateResponse(request, runtimeBindings(env))
    if (state) return state
    const lobby = await lobbyResponse(request, runtimeBindings(env), identity)
    if (lobby) return lobby
    return rejectedResponse(request, await dispatch(request, () => api.fetch(request, env, execution), async () => noTransform(await start.fetch(request))))
  },
} satisfies ExportedHandler<Bindings>, { seed: seedDemo })
