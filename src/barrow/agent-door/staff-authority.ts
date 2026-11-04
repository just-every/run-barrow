import type { Bindings } from '../../auth.server.ts'
import { ToolRefusal } from '../../modules/agent-door/index.ts'
import type { Person } from '../../modules/agent-door/types.ts'
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
export async function authorizeDraft(env:Bindings,actor:Actor,args:Record<string,unknown>) {
 await staffCommandGate(env,actor,'order.prepare',args)
 await requireCompanyRight(env.DB,actor,String(args.accountId),'purchaser',typeof args.shipToId==='string'?args.shipToId:undefined)
 if(actor.company&&actor.door?.operationId) {
  const prior=await env.DB.prepare("SELECT subject_id FROM bw_audit WHERE action='order.prepared' AND json_extract(context_json,'$.operationId')=?").bind(actor.door.operationId).first<{subject_id:string}>()
  if(prior)await readOrder(env.DB,actor,prior.subject_id)
 }
}
