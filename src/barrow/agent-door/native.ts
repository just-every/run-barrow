import { authConfig, operatorAuth, type Bindings } from '../../auth.server.ts'
import { operatorAuthPeople } from '../../modules/agent-door/operator-people.ts'
import { ToolRefusal } from '../../modules/agent-door/index.ts'
import type { PeopleAdapter, ToolContext, ResourceContext } from '../../modules/agent-door/types.ts'
import { current } from '../access.ts'
import { Problem, type Actor } from '../model.ts'
import { erasureRestoreResponse } from '../erasure-journal.ts'
import { readProposalGrant } from '../proposal-grants.ts'

export const scopes = ['accounts:read','catalog:read','orders:read','orders:prepare','lists:read','events:read','proposals:submit']
const localId = (id: string) => `barrow-local:${id}`
export function people(env: Bindings): PeopleAdapter {
 const native=operatorAuthPeople({db:env.DB,session:request=>operatorAuth(env).getSession(request),allowList:authConfig(env).allowList})
 return {...native,async sponsor(claims) {
  const person=await native.sponsor(claims)
  // Barrow's native bearer admission has always required an owner/admin sponsor.
  return person?.active && ['owner','admin'].includes(person.role) ? person : null
 }}
}
export async function localCredential(env:Bindings,request:Request) {
 if(!request.headers.get('authorization')?.startsWith('Bearer '))return null
 try {
  const actor=await current(request,env)
  if(!actor.agent||!actor.grantId||actor.integration)return null
  return {sponsor:{id:actor.id},agent:{id:localId(actor.grantId),name:'Barrow scoped agent'},
   clientId:localId(actor.grantId),scopes:actor.agentScope==='proposal'?['catalog:read','orders:read','proposals:submit']:scopes.filter(scope=>scope!=='proposals:submit')}
 } catch(error) {if(error instanceof Problem)return null;throw error}
}
/** Native grant lookup by id: neither token email nor a caller-provided scope can move it. */
export async function localGrant(env:Bindings,personId:string,clientId:string|undefined) {
 if(!clientId?.startsWith('barrow-local:'))return null
 const id=clientId.slice('barrow-local:'.length)
 return env.DB.prepare(`SELECT t.id,t.scope_kind,o.version FROM bw_agent_tokens t JOIN oa_operators o ON o.id=t.actor_id
  WHERE t.id=? AND o.id=? AND t.actor_version=o.version AND t.expires_at>? AND o.status='active' AND o.role IN ('owner','admin')`).bind(id,personId,Date.now()).first<{id:string;scope_kind:string;version:number}>()
}
export async function currentScopes(env:Bindings,principal:{person:{id:string};clientId?:string}) {
 if(!principal.clientId?.startsWith('barrow-local:'))return scopes
 const grant=await localGrant(env,principal.person.id,principal.clientId)
 if(!grant)return []
 if(grant.scope_kind==='proposal')return await readProposalGrant(env.DB,grant.id)?['catalog:read','orders:read','proposals:submit']:[]
 return grant.scope_kind==='draft'?scopes.filter(scope=>scope!=='proposals:submit'):[]
}
/** Every native read and atomic mutation rechecks the operator and the installation's restore fence. */
export async function nativeActor(env:Bindings,ctx:Pick<ToolContext|ResourceContext,'person'|'agent'|'clientId'|'scopes'> & Partial<Pick<ToolContext,'operationId'|'actor'|'approvers'>>) : Promise<Actor> {
 if(await erasureRestoreResponse(env))throw new ToolRefusal('restore_fenced')
 const person=await people(env).person(ctx.person.id)
 if(!person?.active||!['owner','admin'].includes(person.role))throw new ToolRefusal('sponsor_inactive')
 const row=await env.DB.prepare('SELECT version FROM oa_operators WHERE id=?').bind(person.id).first<{version:number}>()
 const local=await localGrant(env,person.id,ctx.clientId)
 if(ctx.clientId?.startsWith('barrow-local:')&&!local)throw new ToolRefusal('credential_revoked')
 const state=await env.DB.prepare('SELECT envelope,local_document,local_revision FROM agent_door_state WHERE id=1').first<{envelope:string|null;local_document:string|null;local_revision:number}>()
 const grantId=local?.id??ctx.agent.id
 return {id:person.id,email:person.email,role:person.role,version:row!.version,agent:true,grantId,agentScope:local?.scope_kind==='proposal'?'proposal':'draft',
  door:{label:ctx.actor?.label??`${ctx.agent.name} for ${person.name}`,operationId:ctx.operationId??'',agentId:ctx.agent.id,sponsorId:person.id,approvers:ctx.approvers??[],
   admission:()=>env.DB.prepare(`INSERT INTO bw_guard(value) SELECT CASE WHEN
    EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND status='active' AND role IN ('owner','admin'))
    AND EXISTS(SELECT 1 FROM agent_door_state WHERE id=1 AND local_paused=0 AND envelope IS ? AND local_document IS ? AND local_revision=?
     AND (envelope IS NULL OR (json_extract(envelope,'$.paused')=0 AND json_extract(envelope,'$.exp')*1000>?)))
    AND EXISTS(SELECT 1 FROM agent_door_agents WHERE id=? AND sponsor=? AND revoked=0)
    AND (? IS NULL OR EXISTS(SELECT 1 FROM bw_agent_tokens WHERE id=? AND actor_id=? AND actor_version=? AND expires_at>?))
    THEN 1 ELSE 0 END`).bind(person.id,row!.version,state?.envelope??null,state?.local_document??null,state?.local_revision??0,Date.now(),ctx.agent.id,person.id,local?.id??null,local?.id??null,person.id,row!.version,Date.now())}}
}
export async function native<T>(run:()=>Promise<T>):Promise<T> {
 try{return await run()}catch(error){if(error instanceof Problem)throw new ToolRefusal(error.code,error.message,{native_status:error.status,message:error.message});throw error}
}
export async function restrictAccount(env:Bindings,actor:Actor,id:string) {
 if(actor.agentScope!=='proposal')return
 const grant=await readProposalGrant(env.DB,actor.grantId!)
 if(!grant||grant.accountId!==id)throw new ToolRefusal('not_found')
}
