import {proveAuditManagement} from './audit-management.mjs'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {installation,accountValue} from '../api/harness.mjs'
import pier from './pier-edge.mjs'
import {captureAgents} from './screens.mjs'

const decision=answer=>answer.result?._meta?.['com.runeditrun/decision']
const code=answer=>answer.result?._meta?.['com.runeditrun/error']?.code??answer.error?.data?.code

export async function auditRows(read) {
 const rows=[];let cursor
 for(let page=0;page<100;page++) {
  const result=await read('/agents/api/audit'+(cursor?'?after='+cursor:''))
  assert.equal(result.differs_from_policy,0)
  rows.push(...result.rows)
  if(!result.cursor||result.cursor===cursor)return rows
  cursor=result.cursor
 }
 assert.fail('Audit cursor did not finish')
}

/** Independent native session reads establish the descriptor's recorded targets. */
export async function proveRecordedTargets({request,origin,cookie,tool}) {
 const read=async path=>{
  const response=await request(origin+path,{headers:{Cookie:cookie}})
  assert.equal(response.status,200);return response.json()
 }
 const account=await read('/api/barrow/accounts/by-id/juniper')
 const rows=await auditRows(read)
 for(const tool of ['barrow.accounts.read','barrow.catalog.read','barrow.lists.list','barrow.cart.preview','barrow.cart.form','barrow.proposals.grants']) {
  const calls=rows.filter(row=>row.tool===tool&&row.classes.length&&['autonomous','review','unset','paused'].includes(row.decision))
  assert.ok(calls.length,tool+' must have recorded calls')
  for(const row of calls)assert.deepEqual(row.resource,{kind:'account',id:account.id},tool+' '+row.decision)
 }
 for(const row of rows.filter(row=>['barrow.workspace.read','barrow.accounts.list'].includes(row.tool)))assert.equal(row.resource,null)
 const reviews=(await read('/agents/api/reviews')).reviews
 for(const row of rows.filter(row=>row.decision==='review'&&row.resource&&row.review)) {
  const review=reviews.find(review=>review.id===row.review.id)
  assert.deepEqual(review?.summary?.nativeTarget,row.resource)
 }
 console.log('PROBE BASE-AGENT-009 signed policies: native account session and paginated audit -> resolved account targets under autonomous, review, unset and Pause; directory and workspace stay null')
 const write=async(path,body)=>{
  const response=await request(origin+path,{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)})
  assert.equal(response.status,200);return response.json()
 }
 const order=(await read('/api/barrow/state')).orders.find(order=>order.status==='approved')
 assert.ok(order)
 const {grant}=await write('/api/barrow/proposal-grants',{accountId:account.id,costLimitCents:0,contactLimit:9,approvedSubstitutes:[{fromSku:'LINEN',skus:['HEMP']}],consent:true,reason:'Owner permits a native target revocation proof.'})
 const prepared=await tool('barrow.proposals.submit',{grantId:grant.id,orderId:order.id,model:'synthetic-barrow-4',runId:'synthetic-barrow-5',reportedCostCents:0,candidates:[{lines:[{fromSku:'LINEN',sku:'HEMP',quantity:2}]}],idempotency_key:randomUUID()})
 assert.ok(!prepared.result.isError)
 const id=prepared.result.structuredContent.id
 await write('/api/barrow/proposal-grants/revoke',{grantId:grant.id,revision:grant.revision,reason:'Owner revokes native proposal access while the Business credential remains valid.'})
 const before=new Set((await auditRows(read)).map(row=>row.id))
 const refused=await tool('barrow.proposals.read',{id})
 assert.equal(code(refused.body),'proposal_revoked');assert.equal(refused.result?.structuredContent,undefined)
 const added=(await auditRows(read)).filter(row=>!before.has(row.id))
 assert.equal(added.length,1);assert.equal(added[0].resource,null)
 console.log('PROBE BASE-AGENT-009 native revocation: valid Business principal reads a proposal after grant revocation -> proposal_revoked and one audit with null target')
}

/** All existing tools exercise standalone policies through the built HTTP door. */
export async function proveTargetPolicies() {
 const provider='https://rer-hosted-check.invalid',session='synthetic-barrow-1'
 console.log('NATIVE target policy fixture begins')
 const h=await installation({built:true,clock:'2026-11-04T12:00:00.000Z',bindings:{PIER_ORIGIN:provider,PIER_SESSION:session},networkEdge:request=>new URL(request.url).origin===provider?pier.fetch(request,{fixture:{cookie:session}}):undefined})
 try {
  console.log('NATIVE target policy installation ready')
  const value={...accountValue('juniper'),minimumCents:0,prices:[{sku:'LINEN',unitCents:2400,minQty:1},{sku:'HEMP',unitCents:2500,minQty:1}]}
  const account=await h.command('account.save',{id:'juniper',value})
  const foreign=await h.command('account.save',{id:'foreign-target',value:{...value,name:'Other Market',pierCustomerId:'custody-review',email:value.email.replace('buyer','foreign')}})
  const shared=await h.command('list.save',{accountId:account.id,name:'Shared target',shared:true,lines:[{sku:'LINEN',quantity:'2'}]})
  const privateList=await h.command('list.save',{accountId:account.id,name:'Private target',shared:false,lines:[{sku:'LINEN',quantity:'2'}]})
  const original=await h.command('order.prepare',{accountId:account.id,lines:[{sku:'LINEN',quantity:2}]})
  await h.command('order.submit',{orderId:original.id});await h.command('order.approve',{orderId:original.id})
  const foreignOrder=await h.command('order.prepare',{accountId:foreign.id,lines:[{sku:'LINEN',quantity:2}]})
  const draftGrant=await h.api('/api/barrow/agent-token',{})
  const grant=await h.api('/api/barrow/proposal-grants',{accountId:account.id,costLimitCents:0,contactLimit:9,approvedSubstitutes:[{fromSku:'LINEN',skus:['HEMP']}],consent:true,reason:'Owner permits only native draft alternatives for target audit proof.'})
  async function call(name,args,token=name.startsWith('barrow.proposals.')?grant.token:draftGrant.token,extra={}) {
   const response=await h.request('/mcp',{method:'POST',as:'',headers:{authorization:'Bearer '+token,'MCP-Protocol-Version':'2026-07-28','Mcp-Method':'tools/call','Mcp-Name':name},body:{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args,...extra,_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28',...extra._meta}}}})
   return {status:response.status,...await response.json()}
  }
  const proposalArgs=()=>({grantId:grant.grant.id,orderId:original.id,model:'synthetic-barrow-2',runId:'synthetic-barrow-3',reportedCostCents:0,candidates:[{lines:[{fromSku:'LINEN',sku:'HEMP',quantity:2}]}],idempotency_key:randomUUID()})
  const prepared=await call('barrow.proposals.submit',proposalArgs())
  assert.equal(code(prepared),undefined)
  const proposal=prepared.result.structuredContent
  const nativeProposal=(await h.api('/api/barrow/orders/'+original.id+'/agent-proposals')).proposals.find(row=>row.id===proposal.id)
  assert.ok(nativeProposal)
  const nativeOrder=await h.api('/api/barrow/orders/'+original.id)
  const expected=(kind,id)=>({kind,id})
  const cases=[
   ['barrow.workspace.read',{},null],['barrow.accounts.list',{},null],
   ['barrow.accounts.read',{id:account.id},expected('account',account.id)],
   ['barrow.catalog.read',{accountId:account.id},expected('account',account.id)],
   ['barrow.lists.list',{accountId:account.id},expected('account',account.id)],
   ['barrow.lists.read',{id:shared.id},expected('list',shared.id)],
   ['barrow.cart.preview',{listId:shared.id},expected('account',account.id)],
   ['barrow.cart.form',{accountId:account.id,layout:'vertical'},expected('account',account.id)],
   ['barrow.orders.read',{id:nativeOrder.id},expected('order',nativeOrder.id)],
   ['barrow.orders.prepare',{accountId:account.id,lines:[{sku:'LINEN',quantity:2}]},expected('account',account.id)],
   ['barrow.proposals.grants',{accountId:account.id},expected('account',account.id)],
   ['barrow.proposals.submit',proposalArgs(),expected('order',nativeOrder.id)],
   ['barrow.proposals.read',{id:nativeProposal.id},expected('proposal',nativeProposal.id)],
  ]
  const policy=async mode=>h.api('/agents/api/policy',{document:{schema:'rer-agent-policy/1',catalogue:'rer-agent-classes/1',rules:[{id:'target-proof',class:'*',do:mode,...(mode==='approval'?{approver:['role:owner'],wait:'PT1H'}:{})}],reviewers:['role:owner'],spend:{none:true}}},{method:'PUT'})
  const observed=[];const summaryTargets=new Map()
  const snapshot=async()=>(await h.api('/api/barrow/state')).orders
  for(const mode of ['autonomous','review','approval','blocked','paused']) {
   await policy(mode==='paused'?'autonomous':mode)
   if(mode==='paused')await h.api('/agents/api/pause',{paused:true})
   const before=await snapshot()
   for(const [name,input,target] of cases) {
    const args={...input,...(['barrow.orders.prepare','barrow.proposals.submit'].includes(name)?{idempotency_key:randomUUID()}:{})}
    const answer=await call(name,args),meta=decision(answer)
    assert.equal(meta?.disposition,mode,name+' '+mode)
    observed.push({id:meta.id,target})
    if(mode==='blocked'||mode==='paused') {
     assert.equal(code(answer),mode==='blocked'?'policy_blocked':'agents_paused');assert.equal(answer.result.structuredContent,undefined)
    } else if(mode==='approval') {
     const handle=answer.result._meta['com.runeditrun/approval']
     const {approval}=await h.api('/agents/api/approvals/'+handle.id)
     assert.deepEqual(approval.summary.nativeTarget,target??undefined)
     summaryTargets.set(approval.id,target)
     assert.deepEqual(await snapshot(),before)
     // Read approval execution must preserve the same server-resolved identity.
     if(!['barrow.orders.prepare','barrow.proposals.submit'].includes(name)) {
      const approved=await h.api('/agents/api/approvals/'+handle.id+'/approve',{revision:approval.revision,summary_sha256:approval.summary_sha256})
      assert.equal(approved.approval.state,'executed')
      const replay=await call(name,args,undefined,{requestState:answer.result.requestState})
      assert.equal(code(replay),undefined)
     }
    } else assert.equal(code(answer),undefined,name+' '+mode)
   }
   if(['blocked','paused'].includes(mode))assert.deepEqual(await snapshot(),before)
   if(mode==='paused')await h.api('/agents/api/pause',{paused:false})
   console.log('PROBE BASE-AGENT-009 '+mode+': thirteen MCP tools -> authorized native identities, null directory and workspace, preserved decision and effects')
  }
  const rows=await auditRows(path=>h.api(path))
  for(const {id,target} of observed)assert.deepEqual(rows.find(row=>row.id===id)?.resource,target)
  for(const row of rows.filter(row=>row.decision_id&&row.approval))assert.deepEqual(row.resource,summaryTargets.get(row.approval.id))
  const reviews=(await h.api('/agents/api/reviews')).reviews
  for(const review of reviews) {
   const row=rows.find(row=>row.id===review.decision_id)
   assert.deepEqual(review.summary.nativeTarget,row.resource??undefined)
  }
  await policy('autonomous')
  for(const [name,args,token] of [
   ['barrow.accounts.read',{id:'missing-target'}],['barrow.orders.read',{id:'missing-target'}],
   ['barrow.lists.read',{id:privateList.id}],['barrow.lists.read',{id:'missing-target'}],
   ['barrow.cart.preview',{listId:privateList.id}],
   ['barrow.catalog.read',{accountId:foreign.id},grant.token],
   ['barrow.orders.read',{id:foreignOrder.id},grant.token],
   ['barrow.proposals.read',{id:'missing-target'}],
  ]) {
   const before=new Set((await auditRows(path=>h.api(path))).map(row=>row.id))
   const refused=await call(name,args,token)
   assert.ok(code(refused),name+' must refuse')
   assert.equal(refused.result?.structuredContent,undefined)
   const added=(await auditRows(path=>h.api(path))).filter(row=>!before.has(row.id))
   assert.equal(added.length,1);assert.equal(added[0].resource,null,name+' refusal must disclose no target')
  }
  await h.api('/api/barrow/proposal-grants/revoke',{grantId:grant.grant.id,revision:grant.grant.revision,reason:'Owner revoked the proposal target grant.'})
  const revoked=await call('barrow.proposals.read',{id:nativeProposal.id},grant.token)
  assert.equal(revoked.status,401);assert.equal(revoked.result?.structuredContent,undefined)
  assert.equal(JSON.stringify(revoked).includes(nativeProposal.id),false)
  console.log('PROBE BASE-AGENT-009 refusals: missing, private, foreign and revoked native records -> no content and null audit target')
  await proveAuditManagement({h,call,policy,account,token:draftGrant.token,summaryTargets})
  await captureAgents({request:(url,init)=>h.raw(new URL(url).pathname+new URL(url).search,init),origin:h.origin,cookie:h.cookie,summaryTargets,prefix:'targets-'})
 } catch(error) {console.error('Native target proof: '+error.message);throw error}
 finally {await h.close()}
}
