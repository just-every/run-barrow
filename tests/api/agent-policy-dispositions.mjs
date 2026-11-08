import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {proposalFixture} from './proposal-fixture.mjs';

const version='2026-07-28';
const clock='2026-11-05T12:00:00.000Z';
export const policyCode=answer=>answer.body.code??answer.body.error?.data?.code??answer.body.result?._meta?.['com.runeditrun/error']?.code;
export function policyClient(f) {
 const {h}=f;
 const mcp=async(name,args,token,requestState)=>{
  const response=await h.request('/mcp',{method:'POST',as:'',headers:{authorization:'Bearer '+token,'mcp-protocol-version':version,'mcp-method':'tools/call','mcp-name':name},body:{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args,...(requestState===undefined?{}:{requestState}),_meta:{'io.modelcontextprotocol/protocolVersion':version,'io.modelcontextprotocol/clientCapabilities':{elicitation:{url:{}}}}}}});
  return {status:response.status,body:await response.json(),headers:response.headers};
 };
 const legacy=async(path,args,token,requestState)=>{
  const url=new URL(path,h.origin);
  if(!args&&requestState!==undefined)url.searchParams.set('requestState',requestState);
  const response=await h.request(url.pathname+url.search,{as:'',headers:{authorization:'Bearer '+token},...(args?{method:'POST',body:{type:path,payload:args,...(requestState===undefined?{}:{requestState})}}:{})});
  return {status:response.status,body:await response.json(),headers:response.headers};
 };
 const command=async(type,args,token,requestState)=>{
  const response=await h.request('/api/barrow/commands',{method:'POST',as:'',headers:{authorization:'Bearer '+token},body:{type,payload:args,...(requestState===undefined?{}:{requestState})}});
  return {status:response.status,body:await response.json(),headers:response.headers};
 };
 const setPolicy=async(disposition)=>{
  const document={schema:'rer-agent-policy/1',catalogue:'rer-agent-classes/1',rules:[{id:'standard-'+disposition,class:'standard',do:disposition,...(disposition==='approval'?{approver:['sponsor'],wait:'PT1H'}:{})}],spend:{none:true}};
  await h.api('/agents/api/policy',{document},{method:'PUT'});
  return (await h.api('/agents/api/state')).policy.revision;
 };
 const pending=answer=>{
  const result=answer.body.resultType?answer.body:answer.body.result;
  assert.equal(result.resultType,'input_required',JSON.stringify(answer.body));
  assert.equal(result.structuredContent,undefined);
  assert.equal(result.content,undefined);
  assert.equal(result.result,undefined);
  assert.equal(typeof result.requestState,'string');
  const approval=result.approval??result._meta['com.runeditrun/approval'];
  assert.equal(result.inputRequests.approval.params.mode,'url');
  assert.equal(result.inputRequests.approval.params.url,approval.url);
  assert.equal(new URL(approval.url).origin,h.origin);
  assert.ok(Date.parse(approval.expires_at)>Date.now());
  return {approval,requestState:result.requestState,decision:result.decision??result._meta['com.runeditrun/decision']};
 };
 const decide=async(held,action='approve',options={})=>{
  const {approval}=await h.api('/agents/api/approvals/'+held.approval.id);
  return h.api('/agents/api/approvals/'+held.approval.id+'/'+action,{revision:approval.revision,summary_sha256:approval.summary_sha256},options);
 };
 const witness=async()=>({
  state:await h.api('/api/barrow/state'),
  history:await f.history(),
  grants:await h.api('/api/barrow/proposal-grants?accountId=cedar'),
  lists:await h.api('/api/barrow/lists?accountId=cedar'),
  stock:await f.pier.api('/api/pier/state'),
  mail:h.mail.deliveries.length,
 });
 return {mcp,legacy,command,setPolicy,pending,decide,witness};
}

const decisionOf=answer=>answer.body.result?._meta?.['com.runeditrun/decision']??answer.body.decision??JSON.parse(answer.headers.get('x-rer-agent-decision'));
const comparable=decision=>({disposition:decision.disposition,revision:decision.revision,classes:decision.classes});
const storedProposal=value=>{
 const {attempts,grantActive,...record}=value;
 assert.deepEqual(attempts,[]);assert.equal(grantActive,true);
 return record;
};
function receipt(value,held,person,decisionId=held.decision.id) {
 assert.equal(value.approval_id,held.approval.id);
 assert.equal(value.decision_id,decisionId);
 assert.deepEqual(value.approved_by,[person]);
}

/** Registered substitution journeys call these public-door qualification steps. */
export async function proveStandardApprovals(t) {
 const f=await proposalFixture(t,{clock}),{h}=f,c=policyClient(f);
 const draft=await h.api('/api/barrow/agent-token',{}),proposalGrant=await f.grant(),existing=await f.submit(proposalGrant);
 const list=await h.command('list.save',{accountId:'cedar',name:'Policy qualification',shared:true,lines:[{sku:'HONEY-1',quantity:'2'}]});
 const definitions=[
  ['workspace.read',{},'/api/barrow/state',value=>assert.ok(value.accounts.some(row=>row.id==='cedar')&&value.orders.some(row=>row.id===f.order.id))],
  ['accounts.list',{},'/api/barrow/accounts',value=>assert.equal(value.accounts[0].id,'cedar')],
  ['accounts.read',{id:'cedar'},'/api/barrow/accounts/by-id/cedar',async value=>assert.deepEqual(value,await h.api('/api/barrow/accounts/by-id/cedar'))],
  ['catalog.read',{accountId:'cedar'},'/api/barrow/catalogue?accountId=cedar',value=>assert.ok(value.items.some(row=>row.sku==='HONEY-1'&&row.unitCents===3100))],
  ['orders.read',{id:f.order.id},'/api/barrow/orders/'+f.order.id,async value=>assert.deepEqual(value,await h.api('/api/barrow/orders/'+f.order.id))],
  ['lists.read',{id:list.id},null,value=>assert.deepEqual(value,list)],
  ['lists.list',{accountId:'cedar'},'/api/barrow/lists?accountId=cedar',value=>assert.ok(value.lists.some(row=>row.id===list.id&&row.lines[0].quantity==='2'))],
  ['cart.preview',{accountId:'cedar',paste:'HONEY-1 2'},'cart.preview',async value=>assert.deepEqual(value,await h.command('cart.preview',{accountId:'cedar',paste:'HONEY-1 2'}))],
  ['cart.form',{accountId:'cedar',layout:'vertical'},'cart.form',async value=>assert.deepEqual(value,await h.command('cart.form',{accountId:'cedar',layout:'vertical'}))],
  ['orders.prepare',{accountId:'cedar',reference:'Policy-approved draft',lines:[{sku:'HONEY-1',quantity:2}],idempotency_key:randomUUID()},'order.prepare',async value=>{
   assert.equal(value.status,'draft');assert.equal(value.totalCents,6200);assert.deepEqual(value.lines.map(row=>[row.sku,row.quantity,row.unitCents]),[['HONEY-1',2,3100]]);
   assert.deepEqual(value,await h.api('/api/barrow/orders/'+value.id));
  }],
  ['proposals.grants',{accountId:'cedar'},null,async value=>assert.deepEqual(value.grants,(await h.api('/api/barrow/proposal-grants?accountId=cedar')).grants)],
  ['proposals.submit',{grantId:proposalGrant.grant.id,orderId:f.order.id,model:'synthetic-barrow-202',runId:'synthetic-barrow-203',reportedCostCents:1,candidates:f.candidates,idempotency_key:randomUUID()},'proposal.submit',async value=>{
   assert.equal(value.state,'proposed');assert.equal(value.number,1);assert.deepEqual(value.candidates.flatMap(row=>row.lines).map(row=>[row.sku,row.quantity,row.unitCents]).sort(),[['HONEY-1',8,3100],['MAPLE-1',8,4400]]);
   assert.deepEqual(value,storedProposal((await f.history()).proposals.at(-1)));
  }],
  ['proposals.read',{id:existing.id},null,async value=>assert.deepEqual(value,storedProposal((await f.history()).proposals.find(row=>row.id===existing.id)))],
 ];
 const revision=await c.setPolicy('approval');
 for(const [suffix,args,route,check] of definitions) {
  const name='barrow.'+suffix,token=suffix.startsWith('proposals.')?proposalGrant.token:draft.token;
  const before=await c.witness(),held=c.pending(await c.mcp(name,args,token));
  assert.equal(held.decision.revision,revision);assert.equal(held.decision.disposition,'approval');
  assert.deepEqual(held.decision.classes.map(row=>[row.class,row.rule,row.do]),[['standard','standard-approval','approval']]);
  const compatibility=route?(route.startsWith('/')?await c.legacy(route,null,token):await c.command(route,args,token)):null;
  const legacyHeld=compatibility?c.pending(compatibility):null;
  if(legacyHeld)assert.deepEqual(comparable(legacyHeld.decision),comparable(held.decision));
  assert.deepEqual(await c.witness(),before,name+' pending must not change commercial records');
  const view=(await h.api('/agents/api/approvals/'+held.approval.id)).approval;
  assert.equal(view.tool,name);assert.equal(view.revision,revision);assert.deepEqual(view.approvers,['sponsor']);assert.ok(view.prepared_by.for.id);
  if(suffix==='orders.prepare')assert.deepEqual(view.summary.items,['2 × HONEY-1']);
  if(suffix==='accounts.read')assert.deepEqual(view.summary.arguments,{id:'cedar'});
  await h.api('/agents/api/approvals/'+held.approval.id+'/approve',{revision:revision+1,summary_sha256:view.summary_sha256},{status:409});
  await h.api('/agents/api/approvals/'+held.approval.id+'/approve',{revision,summary_sha256:'changed'},{status:409});
  await c.decide(held,'approve',{...f.buyer,status:403});
  assert.deepEqual(await c.witness(),before,name+' invalid or unnamed approval must have no effect');
  assert.equal((await c.decide(held)).approval.state,'executed');
  const answer=await c.mcp(name,args,token,held.requestState),result=answer.body.result;
  assert.equal(result.isError,false,JSON.stringify(answer.body));await check(result.structuredContent);
  receipt(result._meta['com.runeditrun/receipt'],held,view.prepared_by.for.id);
  const once=await c.witness();await c.decide(held);await c.mcp(name,args,token,held.requestState);assert.deepEqual(await c.witness(),once,name+' replay must execute once');
  if(legacyHeld) {
   if(!args.idempotency_key)assert.equal((await c.decide(legacyHeld)).approval.state,'executed');
   const recovered=route.startsWith('/')?await c.legacy(route,null,token,legacyHeld.requestState):await c.command(route,args,token,legacyHeld.requestState);
   assert.equal(recovered.status,200,JSON.stringify(recovered.body));
   const native=route.startsWith('/')?recovered.body:recovered.body.result;
   assert.deepEqual(native,result.structuredContent);
   const legacyView=(await h.api('/agents/api/approvals/'+legacyHeld.approval.id)).approval;
   receipt(JSON.parse(recovered.headers.get('x-rer-agent-receipt')),legacyHeld,view.prepared_by.for.id,legacyView.decision_id);
   assert.equal(decisionOf(recovered).revision,revision);
  }
  const rejectArgs=args.idempotency_key?{...args,idempotency_key:randomUUID()}:args;
  const unchanged=await c.witness(),rejected=c.pending(await c.mcp(name,rejectArgs,token));
  await c.decide(rejected,'reject');
  const refusal=await c.mcp(name,rejectArgs,token,rejected.requestState);assert.equal(policyCode(refusal),'approval_rejected');assert.equal(refusal.body.result.structuredContent,undefined);
  assert.deepEqual(await c.witness(),unchanged,name+' rejected must not change commercial records');
  console.log('PROBE BASE-AGENT-007 approval '+name+': pending withheld; exact sponsor decision recovered native result and receipt; rejection and replay preserved commercial effects');
 }
}

export async function proveStandardBlocked(t) {
 const f=await proposalFixture(t,{clock}),{h}=f,c=policyClient(f),draft=await h.api('/api/barrow/agent-token',{}),g=await f.grant(),proposal=await f.submit(g);
 const list=await h.command('list.save',{accountId:'cedar',name:'Blocked policy witness',shared:true,lines:[{sku:'HONEY-1',quantity:'2'}]});
 const inputs=[['workspace.read',{}],['accounts.list',{}],['accounts.read',{id:'cedar'}],['catalog.read',{accountId:'cedar'}],['orders.read',{id:f.order.id}],['lists.read',{id:list.id}],['lists.list',{accountId:'cedar'}],['cart.preview',{accountId:'cedar',paste:'HONEY-1 2'}],['cart.form',{accountId:'cedar',layout:'vertical'}],['orders.prepare',{accountId:'cedar',lines:[{sku:'HONEY-1',quantity:2}],idempotency_key:randomUUID()}],['proposals.grants',{accountId:'cedar'}],['proposals.submit',{grantId:g.grant.id,orderId:f.order.id,model:'synthetic-barrow-204',runId:'synthetic-barrow-205',reportedCostCents:1,candidates:f.candidates,id:proposal.id,number:proposal.number,revision:proposal.revision,idempotency_key:randomUUID()}],['proposals.read',{id:proposal.id}]];
 const revision=await c.setPolicy('blocked'),before=await c.witness();
 for(const [suffix,args] of inputs) {
  const answer=await c.mcp('barrow.'+suffix,args,suffix.startsWith('proposals.')?g.token:draft.token);
  assert.equal(policyCode(answer),'policy_blocked');assert.equal(answer.body.result.structuredContent,undefined);
  const error=answer.body.result._meta['com.runeditrun/error'];assert.deepEqual([error.class,error.rule,error.revision],['standard','standard-blocked',revision]);
  assert.deepEqual(answer.body.result.content.map(item=>JSON.parse(item.text)),[{code:'policy_blocked',class:'standard',rule:'standard-blocked',revision}]);
  assert.equal(answer.body.result._meta['com.runeditrun/decision'].revision,revision);
  assert.deepEqual(await c.witness(),before,suffix+' blocked must not change commercial records');
 }
 const routes=['/api/barrow/state','/api/barrow/accounts','/api/barrow/accounts/by-id/cedar','/api/barrow/catalogue?accountId=cedar','/api/barrow/orders/'+f.order.id,'/api/barrow/lists?accountId=cedar'];
 for(const route of routes) {
  const answer=await c.legacy(route,null,draft.token);assert.equal(answer.status,403);assert.equal(policyCode(answer),'policy_blocked');assert.deepEqual([answer.body.class,answer.body.rule,answer.body.revision],['standard','standard-blocked',revision]);
  assert.deepEqual(Object.keys(answer.body).sort(),['class','code','error','revision','rule']);
 }
 for(const [suffix,args] of inputs.filter(([name])=>['cart.preview','cart.form','orders.prepare','proposals.submit'].includes(name))) {
  const type=suffix==='orders.prepare'?'order.prepare':suffix==='proposals.submit'?'proposal.submit':suffix;
  const answer=await c.command(type,args,suffix.startsWith('proposals.')?g.token:draft.token);assert.equal(policyCode(answer),'policy_blocked');assert.deepEqual([answer.body.class,answer.body.rule,answer.body.revision],['standard','standard-blocked',revision]);
 }
 assert.deepEqual(await c.witness(),before);
 console.log('PROBE BASE-AGENT-007 blocked: all thirteen MCP tools and ten supported compatibility mappings refused standard with the actual rule and revision; no commercial content or effects');
 await proveReadContinuation(f,c,draft);
}

async function proveReadContinuation(f,c,draft) {
 const {h}=f,path='/api/barrow/accounts/by-id/cedar',args={id:'cedar'};
 await c.setPolicy('approval');
 const peer=await h.api('/api/barrow/agent-token',{});
 const admin={as:await h.signIn(f.account.value.email.replace(/^/,'policy-reviewer-'),'admin')};
 const foreign=await h.api('/api/barrow/agent-token',{},admin);
 const held=c.pending(await c.legacy(path,null,draft.token)),before=await c.witness();
 for(const answer of [await c.legacy(path,null,peer.token,held.requestState),await c.legacy(path,null,foreign.token,held.requestState),await c.legacy('/api/barrow/accounts',null,draft.token,held.requestState),await c.mcp('barrow.accounts.read',{id:'foreign'},draft.token,held.requestState),await c.legacy(path,null,draft.token,'foreign')]) {
  assert.equal(policyCode(answer),'invalid_arguments');assert.equal(answer.body.result?.structuredContent,undefined);if(!answer.body.jsonrpc)assert.equal(answer.body.id,undefined);
 }
 const origin=await h.request(path+'?requestState='+held.requestState,{as:'',headers:{authorization:'Bearer '+draft.token,origin:'https://foreign.invalid'}});assert.equal(origin.status,403);
 await c.decide(held,'reject');assert.equal(policyCode(await c.legacy(path,null,draft.token,held.requestState)),'approval_rejected');
 assert.deepEqual(await c.witness(),before);
 const pending=c.pending(await c.legacy(path,null,draft.token));
 await c.setPolicy('blocked');
 assert.equal(policyCode(await c.legacy(path,null,draft.token,pending.requestState)),'policy_blocked');
 assert.equal((await c.decide(pending)).approval.code,'approval_evidence_changed');
 await c.setPolicy('approval');
 const stale=await c.legacy(path,null,draft.token,pending.requestState);assert.equal(policyCode(stale),'approval_required');assert.equal(stale.body.result,undefined);
 const approved=c.pending(await c.legacy(path,null,draft.token));await c.decide(approved);
 assert.equal((await c.legacy(path,null,draft.token,approved.requestState)).body.id,args.id);
 const stable=await c.witness();
 await h.api('/agents/api/pause',{paused:true});
 const paused=await c.legacy(path,null,draft.token,approved.requestState);assert.equal(policyCode(paused),'agents_paused');assert.equal(paused.body.id,undefined);
 await h.api('/agents/api/pause',{paused:false});
 assert.equal((await c.legacy(path,null,draft.token,approved.requestState)).body.id,args.id);
 const blockedRevision=await c.setPolicy('blocked'),blocked=await c.legacy(path,null,draft.token,approved.requestState);
 assert.equal(policyCode(blocked),'policy_blocked');assert.equal(blocked.body.revision,blockedRevision);assert.equal(blocked.body.id,undefined);
 await c.setPolicy('approval');
 const oldReceipt=await c.legacy(path,null,draft.token,approved.requestState);assert.equal(policyCode(oldReceipt),'approval_required');assert.equal(oldReceipt.body.id,undefined);
 const fresh=c.pending(await c.legacy(path,null,draft.token));await c.decide(fresh);assert.equal((await c.legacy(path,null,draft.token,fresh.requestState)).body.id,args.id);
 assert.deepEqual(await c.witness(),stable);
 await h.api('/api/barrow/agent-token/revoke',{});
 assert.equal((await c.legacy(path,null,draft.token,fresh.requestState)).status,401);
 console.log('PROBE BASE-AGENT-007 recovery: changed tool or inputs, peer credential, foreign handle and origin, rejection, new policy and revocation withheld content through the compatibility read door');
}
