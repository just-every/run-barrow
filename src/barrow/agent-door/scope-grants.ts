import type { Bindings } from '../../auth.server.ts'
import type { ToolDefinition } from '../../modules/agent-door/types.ts'
import { audit, commit } from '../access.ts'
import { fail, type Actor } from '../model.ts'
import { authorizedRead } from './staff-authority.ts'
import { native, nativeActor, scopes } from './native.ts'

export async function droppedScopes(db:D1Database,agentId:string):Promise<string[]> {
 return (await db.prepare('SELECT scope FROM bw_agent_scope_drops WHERE agent_id=? ORDER BY scope').bind(agentId).all<{scope:string}>()).results.map(row=>row.scope)
}
/** Drops are irrevocable for this agent identity. A newer token cannot add them back. */
export async function dropScope(env:Bindings,actor:Actor,input:{agentId:unknown;scope:unknown}) {
 const id=typeof input.agentId==='string'?input.agentId:'',scope=typeof input.scope==='string'?input.scope:''
 if(!scopes.includes(scope))fail('INPUT','Choose one declared agent scope.',400)
 const agent=await env.DB.prepare('SELECT sponsor FROM agent_door_agents WHERE id=? AND revoked=0').bind(id).first<{sponsor:string}>()
 if(!agent||agent.sponsor!==actor.id||actor.agent&&actor.door?.agentId!==id)fail('NOT_FOUND','Agent grant not found.',404)
 await commit(env.DB,actor,[env.DB.prepare('INSERT INTO bw_agent_scope_drops(agent_id,scope) VALUES(?,?) ON CONFLICT DO NOTHING').bind(id,scope),
  audit(env.DB,actor,id,'agent.scope-dropped',{source:'agent-scope.drop',reason:'Sponsor or its admitted agent removed one scope; no authority was added.'})])
 return {id,removed:await droppedScopes(env.DB,id)}
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
 }]
}
