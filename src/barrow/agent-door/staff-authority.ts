import type { Bindings } from '../../auth.server.ts'
import { ToolRefusal } from '../../modules/agent-door/index.ts'
import type { Person, ToolContext } from '../../modules/agent-door/types.ts'
import { type Actor } from '../model.ts'
import { readStaffGrant, staffGuard } from '../staff-policy.ts'
import { companyMembership, companyRightsGuard, requireCompanyRight } from '../company-policy.ts'
import { requireUsageTerms } from '../usage-terms.ts'
import { readOrder } from '../orders.ts'
import { staffCommandGate, staffRequestGate } from '../staff-access.ts'

/** Resolve authority from the mapped native identity, never from token role text. */
export async function personAuthority(env:Bindings,person:Person):Promise<Actor|null> {
 if(!person.active)return null
 const row=await env.DB.prepare("SELECT id,email,role,version FROM oa_operators WHERE id=? AND status='active'").bind(person.id).first<{id:string;email:string;role:string;version:number}>()
 if(!row)return null
 const actor:Actor={...row,agent:false}
 if(['owner','admin'].includes(actor.role))return actor
 actor.staff=await readStaffGrant(env.DB,actor)
 if(actor.staff)return actor
 actor.company=await companyMembership(env.DB,actor)
 return actor.company?actor:null
}

/** Reads fence the same native and staff snapshots as a commercial commit. */
export async function authorizedRead<T>(env:Bindings,actor:Actor,path:string,read:()=>Promise<T>):Promise<T> {
 await staffRequestGate(env,actor,path,'GET')
 if(actor.company)await requireUsageTerms(env,actor)
 const value=await read()
 try {
  await env.DB.batch([actor.door!.admission(),...(actor.staff?[staffGuard(env.DB,actor.staff)]:[]),...(actor.company?[companyRightsGuard(env.DB,actor.company)]:[]),env.DB.prepare('DELETE FROM bw_guard')])
 } catch {throw new ToolRefusal('authority_changed')}
 return value
}
export async function authorizeDraft(env:Bindings,actor:Actor,args:Record<string,unknown>,replay?:Pick<ToolContext,'agent'|'idempotencyKey'>) {
 await staffCommandGate(env,actor,'order.prepare',args)
 await requireCompanyRight(env.DB,actor,String(args.accountId),'purchaser',typeof args.shipToId==='string'?args.shipToId:undefined)
 if(actor.company&&replay) {
  // A retry has a fresh operation ID. Bind visibility to the original effect,
  // including its resolved default ship-to, before the door returns its receipt.
  const prior=await env.DB.prepare(`SELECT a.subject_id FROM agent_door_calls c JOIN bw_audit a
   ON json_extract(a.context_json,'$.operationId')=c.decision_id
   WHERE c.agent=? AND c.key=? AND a.action='order.prepared'`).bind(replay.agent.id,replay.idempotencyKey).first<{subject_id:string}>()
  if(!prior)throw new ToolRefusal('not_found')
  await readOrder(env.DB,actor,prior.subject_id)
 }
}
