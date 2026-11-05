import type { Bindings } from '../../auth.server.ts'
import type { UndoContext } from '../../modules/agent-door/types.ts'
import { ToolRefusal } from '../../modules/agent-door/index.ts'
import { current } from '../access.ts'
import { readStaffGrant } from '../staff-policy.ts'
import { orderCommand } from '../orders.ts'
import { native } from './native.ts'

/** Resolve only the reviewer request's session; never select another session. */
export async function undoDraft(env:Bindings,saved:unknown,ctx:UndoContext,request?:Request) {
 if(!request)throw new ToolRefusal('person_session_required')
 await native(async()=>{
  const actor=await current(request,env)
  if(actor.agent||actor.id!==ctx.person.id||!['owner','admin'].includes(actor.role)||await readStaffGrant(env.DB,actor))throw new ToolRefusal('forbidden')
  await orderCommand(env,actor,'order.discard',saved)
 })
 const {orderId}=saved as {orderId:string}
 ctx.emit('order.draft-discarded',`barrow://orders/${orderId}`)
}
