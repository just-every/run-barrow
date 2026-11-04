import type { Bindings } from '../../auth.server.ts'
import type { ToolDefinition, ToolContext } from '../../modules/agent-door/types.ts'
import { ToolRefusal } from '../../modules/agent-door/index.ts'
import { audit, commit } from '../access.ts'
import { fail, type Actor } from '../model.ts'
import { authorizedRead } from './staff-authority.ts'
import { native, nativeActor, scopes } from './native.ts'

export async function droppedScopes(db:D1Database,agentId:string):Promise<string[]> {
 return (await db.prepare('SELECT scope FROM bw_agent_scope_drops WHERE agent_id=? ORDER BY scope').bind(agentId).all<{scope:string}>()).results.map(row=>row.scope)
}
/** Drops are irrevocable for this agent identity. A newer token cannot add them back. */
async function removeScopes(env:Bindings,actor:Actor,id:string,removed:string[]) {
 if(removed.some(scope=>!scopes.includes(scope))||new Set(removed).size!==removed.length)fail('INPUT','Choose distinct declared agent scopes.',400)
 const agent=await env.DB.prepare('SELECT sponsor FROM agent_door_agents WHERE id=? AND revoked=0').bind(id).first<{sponsor:string}>()
 if(!agent||agent.sponsor!==actor.id||actor.agent&&actor.door?.agentId!==id)fail('NOT_FOUND','Agent grant not found.',404)
 await commit(env.DB,actor,[...removed.map(scope=>env.DB.prepare('INSERT INTO bw_agent_scope_drops(agent_id,scope) VALUES(?,?) ON CONFLICT DO NOTHING').bind(id,scope)),
  audit(env.DB,actor,id,'agent.scope-dropped',{source:'agent-scope.drop',reason:'Sponsor or its admitted agent removed scopes; no authority was added.'})])
 return {id,removed:await droppedScopes(env.DB,id)}
}
export async function dropScope(env:Bindings,actor:Actor,input:{agentId:unknown;scope:unknown}) {
 if(typeof input.scope!=='string'||typeof input.agentId!=='string')fail('INPUT','Choose one declared scope of the sponsored agent.',400)
 return removeScopes(env,actor,input.agentId,[input.scope])
}
/** Only desired scope subsets can have an effect. Protected company controls
 * are explicit attempted changes, never instructions inferred from text. */
function requestedAuthority(args:Record<string,unknown>,ctx:ToolContext) {
 const desired=args.scopes as string[],protectedChange=['sponsorRole','policy','paused'].some(key=>Object.hasOwn(args,key))
 return {widens:protectedChange||desired.some(scope=>!ctx.scopes.includes(scope)),removed:ctx.scopes.filter(scope=>!desired.includes(scope)),
  subject:protectedChange?ctx.person.id:ctx.agent.id,setting:Object.hasOwn(args,'policy')?'company policy':Object.hasOwn(args,'paused')?'company pause':Object.hasOwn(args,'sponsorRole')?'sponsor role':'agent grant'}
}

export function scopeTools(env:Bindings):ToolDefinition[] {
 return [{name:'barrow.scopes.read',title:'Read this agent’s scope',description:'Read whether this calling agent still holds one declared scope. Signed scope text cannot restore a native drop.',scope:'accounts:read',readOnly:true,classes:['standard'],clauses:['BASE-AGENT-005'],
  inputSchema:{type:'object',additionalProperties:false,properties:{scope_id:{type:'string',enum:scopes}},required:['scope_id']},outputSchema:{type:'object'},
  classify:async()=>[{class:'standard',facts:{measure:1}}],
  run:async(a,c)=>native(async()=>{const actor=await nativeActor(env,c);return authorizedRead(env,actor,'/api/barrow/commands',async()=>({result:{grants:c.scopes.includes(String(a.scope_id))?[String(a.scope_id)]:[]}}))})
 },{name:'barrow.scopes.drop',title:'Drop one of this agent’s scopes',description:'Permanently remove one declared scope from the calling agent. Tokens and replay cannot restore it. Other grants, roles, company policy and Pause remain person-only.',scope:'accounts:read',readOnly:false,classes:['access'],clauses:['BASE-AGENT-005'],
  inputSchema:{type:'object',additionalProperties:false,properties:{scope_id:{type:'string',enum:scopes}},required:['scope_id']},outputSchema:{type:'object'},
  widens:false,narrowing:{effect:'narrow',target:'scope_id'},authority:async(_a,c)=>({subject:c.agent.id,widens:false}),
  classify:async()=>[{class:'access',facts:{measure:1,direction:'narrows'}}],
  summary:async(a,c)=>({target:{id:c.agent.id,name:c.agent.name},items:['Remove scope '+a.scope_id]}),
  run:async(a,c)=>native(async()=>{const actor=await nativeActor(env,c);return {result:await dropScope(env,actor,{agentId:c.agent.id,scope:a.scope_id})}})
 },{name:'barrow.authority.update',title:'Replace this agent’s scope set',description:'Replace the calling agent’s current scopes with a subset. Adding or restoring a scope, changing its sponsor role, company policy or Pause is self_escalation and changes nothing. All other grant management remains person-only.',scope:'accounts:read',readOnly:false,classes:['access','security'],clauses:['BASE-AGENT-005'],
  inputSchema:{type:'object',additionalProperties:false,required:['scopes'],properties:{scopes:{type:'array',maxItems:scopes.length,uniqueItems:true,items:{type:'string',enum:scopes}},sponsorRole:{type:'string',enum:['owner','admin','member']},policy:{type:'object'},paused:{type:'boolean'}}},outputSchema:{type:'object'},
  authority:async(a,c)=>{const effect=requestedAuthority(a,c);return {subject:effect.subject,widens:effect.widens}},
  classify:async(a,c)=>{const effect=requestedAuthority(a,c);await nativeActor(env,c);return [{class:'access',facts:{measure:effect.removed.length,direction:effect.widens?'widens':'narrows'}},{class:'security',facts:{measure:1,setting:effect.setting}}]},
  summary:async(a,c)=>({target:{id:requestedAuthority(a,c).subject},items:['Retain only scopes '+(a.scopes as string[]).join(', ')]}),
  run:async(a,c)=>native(async()=>{const effect=requestedAuthority(a,c);if(effect.widens)throw new ToolRefusal('self_escalation');return {result:await removeScopes(env,await nativeActor(env,c),c.agent.id,effect.removed)}})
 }]
}
