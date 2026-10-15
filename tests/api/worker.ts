import { barrowResponse } from '../../src/barrow/api'
import { authResponse } from '../../src/auth.server'
export default { async fetch(request:Request,env:any) { return await barrowResponse(request,env) ?? await authResponse(request,env) ?? new Response('Not found',{status:404}) } }
