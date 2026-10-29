import type { Bindings } from '../../auth.server.ts'
import type { ToolDefinition, ToolContext, ResourceContext } from '../../modules/agent-door/types.ts'
import { ToolRefusal } from '../../modules/agent-door/index.ts'
import { readProposalGrant,grantGuard } from '../proposal-grants.ts'
import { agentProposalCommand } from '../agent-proposals.ts'
import { readProposal } from '../proposal-store.ts'
import { native,nativeActor } from './native.ts'
import { readAccount,order } from './records.ts'

export async function proposalActor(env:Bindings,id:string,ctx:Pick<ToolContext|ResourceContext,'person'|'agent'|'clientId'|'scopes'> & Partial<Pick<ToolContext,'operationId'|'actor'|'approvers'>>) {
 const actor=await nativeActor(env,ctx),grant=await readProposalGrant(env.DB,id)
 if(!grant||grant.authorizerId!==actor.id||ctx.clientId?.startsWith('barrow-local:')&&actor.grantId!==id)throw new ToolRefusal('not_found')
 try{await env.DB.batch([grantGuard(env.DB,grant),env.DB.prepare('DELETE FROM bw_guard')])}catch{throw new ToolRefusal('proposal_revoked')}
 await readAccount(env,grant.accountId,ctx)
 return {...actor,grantId:id,agentScope:'proposal' as const}
}
export async function proposalRecord(env:Bindings,id:string,ctx:ResourceContext|ToolContext) {
 return native(async()=>{const row=await env.DB.prepare('SELECT grant_id FROM bw_agent_proposals WHERE id=? ORDER BY number DESC LIMIT 1').bind(id).first<{grant_id:string}>()
  if(!row)throw new ToolRefusal('not_found')
  return readProposal(env,await proposalActor(env,row.grant_id,ctx),id)
 })
}
export function proposalTools(env:Bindings):ToolDefinition[] {
 const str={type:'string',minLength:1},schema={type:'object' as const,properties:{accountId:str},required:['accountId'],additionalProperties:false}
 return [{name:'barrow.proposals.grants',title:'Read existing proposal grants',description:'Read this sponsor’s current explicit account grants, without bearer credentials.',scope:'proposals:submit',readOnly:true,classes:['standard'],clauses:['AGT-008','BAR-003'],inputSchema:schema,outputSchema:{type:'object'},untrusted:true,
  classify:async(a,c)=>{await readAccount(env,String(a.accountId),c);return [{class:'standard',facts:{measure:1}}]},run:async(a,c)=>native(async()=>{const actor=await nativeActor(env,c);await readAccount(env,String(a.accountId),c)
   const rows=(await env.DB.prepare("SELECT id FROM bw_agent_proposal_grants WHERE account_id=? AND authorizer_id=? AND state='active' ORDER BY created_at").bind(a.accountId,actor.id).all<{id:string}>()).results
   const grants=[];for(const row of rows){try{await proposalActor(env,row.id,c);grants.push(await readProposalGrant(env.DB,row.id))}catch(error){if(!(error instanceof ToolRefusal))throw error}}
   return {result:{grants}}
  })},
 {name:'barrow.proposals.submit',title:'Prepare a scoped substitution proposal',description:'Prepare native-priced alternatives under an existing owner-authorized account grant. Manager/buyer decisions and stock execution remain native person actions.',scope:'proposals:submit',readOnly:false,classes:['standard'],clauses:['AGT-002','AGT-008','BAR-003'],
  inputSchema:{type:'object',additionalProperties:false,required:['grantId','orderId','model','runId','reportedCostCents','candidates'],properties:{grantId:str,orderId:str,model:str,runId:str,reportedCostCents:{type:'integer',minimum:0},candidates:{type:'array',minItems:1,maxItems:5,items:{type:'object',additionalProperties:false,required:['lines'],properties:{methodId:str,warehouse:str,lines:{type:'array',minItems:1,maxItems:100,items:{type:'object',additionalProperties:false,required:['fromSku','sku','quantity'],properties:{fromSku:str,fromUnit:str,sku:str,unit:str,quantity:{type:'integer',minimum:1}}}}}}}}},outputSchema:{type:'object'},untrusted:true,revisionType:'string',
  revision:async(a,c)=>{await proposalActor(env,String(a.grantId),c);return (await order(env,String(a.orderId),c)).revision},
  target:async(a,c)=>{await proposalActor(env,String(a.grantId),c);return {kind:'order',id:(await order(env,String(a.orderId),c)).id}},
  classify:async(a,c)=>{await proposalActor(env,String(a.grantId),c);await order(env,String(a.orderId),c);return [{class:'standard',facts:{measure:(a.candidates as unknown[]).length}}]},
  summary:async(a,c)=>{const value=await order(env,String(a.orderId),c);return {target:{id:value.id,name:value.customerName},items:(a.candidates as {lines:{sku:string;quantity:number}[]}[]).flatMap(item=>item.lines.map(line=>`${line.quantity} × ${line.sku}`))}},
  run:async(a,c)=>native(async()=>{const actor=await proposalActor(env,String(a.grantId),c),{grantId,...args}=a
   const value=await agentProposalCommand(env,actor,'proposal.submit',args)
   c.emit('proposal.submitted',`barrow://proposals/${value.id}`,{operationId:c.operationId})
   return {result:JSON.parse(JSON.stringify(value)),resources:[{uri:`barrow://proposals/${value.id}`,name:'Prepared substitution proposal'}]}
  })},
 {name:'barrow.proposals.read',title:'Read a prepared proposal',description:'Read a proposal within its current explicit native account grant.',scope:'proposals:submit',readOnly:true,classes:['standard'],clauses:['AGT-008'],inputSchema:{type:'object',properties:{id:str},required:['id'],additionalProperties:false},outputSchema:{type:'object'},untrusted:true,
  classify:async(a,c)=>{await proposalRecord(env,String(a.id),c);return [{class:'standard',facts:{measure:1}}]},run:async(a,c)=>({result:await proposalRecord(env,String(a.id),c)})}]
}
