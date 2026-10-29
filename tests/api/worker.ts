import { agentDoor } from '../../src/barrow/agent-door/index.ts'
import { dispatchCampaigns } from '../../src/barrow/campaigns'
import { setTestClock } from './clock'
import { barrowResponse } from '../../src/barrow/api'
import { authResponse } from '../../src/auth.server'
export default { async scheduled(_event:any,env:any,ctx:any){setTestClock(env.BARROW_TEST_CLOCK);ctx.waitUntil(dispatchCampaigns(env))},async fetch(request:Request,env:any) { setTestClock(env.BARROW_TEST_CLOCK); return await agentDoor(env).handle(request) ?? await barrowResponse(request,env) ?? await authResponse(request,env) ?? new Response('Not found',{status:404}) } }
