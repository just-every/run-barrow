import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {installation} from '../api/harness.mjs'
import {proveCustodyErasure} from './custody.mjs'

const code=answer=>answer.result?._meta?.['com.runeditrun/error']?.code??answer.error?.data?.code

/** Exercise the built app at deterministic times without editing retained rows. */
export async function proveWriteRetention(phase) {
 // Each disposable installation gets independent external stock-edge state.
 const {default:pierEdge}=await import('./pier-edge.mjs?retention='+randomUUID())
 const start=Date.parse('2035-01-15T12:00:00.000Z'),day=86400000
 const stockOrigin='https://rer-hosted-check.invalid',stockCookie=randomUUID()
 const h=await installation({built:true,wallClock:new Date(start).toISOString(),
  bindings:{PIER_ORIGIN:stockOrigin,PIER_SESSION:stockCookie},
  networkEdge:request=>new URL(request.url).origin===stockOrigin?pierEdge.fetch(request,{fixture:{cookie:stockCookie}}):undefined})
 try {
  await h.request('/agents/api/policy',{method:'PUT',body:{document:{schema:'rer-agent-policy/1',catalogue:'rer-agent-classes/1',
   rules:phase==='held'?[{id:'all',class:'*',do:'approval',approver:['sponsor'],wait:'PT1H'},{id:'standard',class:'standard',do:'review'}]:[{id:'all',class:'*',do:'autonomous'}],reviewers:['sponsor'],spend:{none:true}}}}).then(async response=>assert.equal(response.status,200,await response.text()))
  const account=await h.command('account.save',{id:'synthetic-barrow-24',value:{name:'Synthetic Barrow retention account',email:'synthetic-barrow-24'+'@'+'example.invalid',pierCustomerId:'juniper',termsDays:30,minimumCents:0,currency:'USD',prices:[{sku:'LINEN',unitCents:2400,minQty:1},{sku:'HEMP',unitCents:2500,minQty:1}]}})
  let original=await h.command('order.prepare',{accountId:account.id,lines:[{sku:'LINEN',quantity:2}]})
  await h.command('order.submit',{orderId:original.id})
  original=await h.command('order.approve',{orderId:original.id})
  const draftGrant=await h.api('/api/barrow/agent-token',{})
  const admin={as:await h.signIn('synthetic-barrow-25'+'@'+'example.invalid','admin')}
  const buyer={as:await h.signIn(account.value.email)}
  const adminGrant=await h.api('/api/barrow/agent-token',{},admin)
  const proposalGrant=await h.api('/api/barrow/proposal-grants',{accountId:account.id,costLimitCents:0,contactLimit:3,approvedSubstitutes:[{fromSku:'LINEN',skus:['HEMP']}],consent:true,reason:'Owner authorizes draft-only retention proof with no contact or stock execution.'})
  const cases=[{name:'barrow.orders.prepare',token:adminGrant.token,args:{accountId:account.id,lines:[{sku:'LINEN',quantity:2}],reference:'synthetic-barrow-admin-retention',expected_revision:account.revision,idempotency_key:randomUUID()}},
   {name:'barrow.orders.prepare',token:draftGrant.token,args:{accountId:account.id,lines:[{sku:'LINEN',quantity:2}],reference:'synthetic-barrow-retention',expected_revision:account.revision,idempotency_key:randomUUID()}},
   {name:'barrow.proposals.submit',token:proposalGrant.token,args:{grantId:proposalGrant.grant.id,orderId:original.id,model:'synthetic-barrow-24',runId:'synthetic-barrow-24',reportedCostCents:0,candidates:[{lines:[{fromSku:'LINEN',sku:'HEMP',quantity:2}]}],expected_revision:original.revision,idempotency_key:randomUUID()}}]
  async function call(item,args=item.args) {
   const id=randomUUID(),response=await h.request('/mcp',{method:'POST',as:'',headers:{authorization:'Bearer '+item.token,'MCP-Protocol-Version':'2026-07-28','Mcp-Method':'tools/call','Mcp-Name':item.name},
    body:{jsonrpc:'2.0',id,method:'tools/call',params:{name:item.name,arguments:args,_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28'}}}})
   const answer=await response.json()
   if(response.status===200)assert.equal(answer.id,id)
   return {status:response.status,answer}
  }
  const successful=result=>{
   assert.equal(result.status,200);assert.equal(code(result.answer),undefined)
   assert.equal(result.answer.result._meta['com.runeditrun/decision'].disposition,phase==='held'?'review':'autonomous')
   return result.answer.result.structuredContent
  }
  async function snapshot(as) {
   const options=as?{as}:{}
   const state=await h.api('/api/barrow/state',undefined,options)
   const history=await h.api('/api/barrow/orders/'+original.id+'/agent-proposals',undefined,options)
   const events=[];let cursor
   do {
    const page=await h.api('/api/barrow/audit?'+new URLSearchParams({accountId:account.id,limit:'200',...(cursor?{cursor}:{})}),undefined,options)
    events.push(...page.events);cursor=page.nextCursor
   } while(cursor)
   return {orders:state.orders,proposals:history.proposals,audit:events.filter(row=>['order.prepared','proposal.submitted'].includes(row.action))}
  }
  const authorityBefore=await snapshot()
  await h.api('/api/barrow/agent-token',{}, {...buyer,status:403})
  for(const who of [admin,buyer])await h.api('/api/barrow/proposal-grants',{accountId:account.id,costLimitCents:0,contactLimit:0,approvedSubstitutes:[{fromSku:'LINEN',skus:['HEMP']}],consent:true,reason:'A role without owner grant authority must be refused.'},{...who,status:403})
  const refused=await call({...cases[2],token:adminGrant.token})
  assert.equal(refused.status,403);assert.equal(code(refused.answer),'insufficient_scope');assert.equal(refused.answer.result,undefined)
  assert.deepEqual(await snapshot(),authorityBefore,'Refused roles cannot create or read an owner proposal outcome')
  console.log('PROBE BASE-AGENT-012 '+phase+' roles: owner and admin draft credentials admitted; buyer issuance, non-owner proposal grants and admin proposal mutation refused without preparation')
  for(const item of cases)item.saved=successful(await call(item))
  const before=await snapshot()
  for(const offset of [day+1,7*day-1]) {
   await h.setWallClock(new Date(start+offset).toISOString())
   for(const item of cases) {
    assert.deepEqual(successful(await call(item)),item.saved,'Saved outcomes survive the retention floor and repeated Worker restarts')
    const conflict=await call(item,{...item.args,expected_revision:randomUUID()})
    assert.equal(conflict.status,200);assert.equal(code(conflict.answer),'idempotency_conflict');assert.equal(conflict.answer.result.structuredContent,undefined)
   }
   // Renew only the person's normal session if needed; agent credentials are unchanged.
   const owner=await h.signIn('owner'+'@'+'example.test','existing')
   assert.deepEqual(await snapshot(owner),before,'Aged recovery adds no native revision or preparation audit effect')
   console.log('PROBE BASE-AGENT-012 '+phase+' retention '+offset+'ms: owner draft, admin draft and owner proposal -> equal saved outcomes, changed-revision conflicts and unchanged native effects')
  }
  const activeOwner={as:await h.signIn('owner'+'@'+'example.test','existing')}
  async function pause(paused) {
   const response=await h.request('/agents/api/pause',{method:'POST',body:{paused},...activeOwner})
   assert.equal(response.status,200);await response.body?.cancel()
  }
  await pause(true)
  for(const item of cases) {
   const stopped=await call(item)
   assert.equal(stopped.status,200);assert.equal(code(stopped.answer),'agents_paused');assert.equal(stopped.answer.result.structuredContent,undefined)
  }
  assert.deepEqual(await snapshot(activeOwner.as),before,'Pause cannot recover retained payloads or change native preparations')
  await pause(false)
  for(const item of cases)assert.deepEqual(successful(await call(item)),item.saved,'Resume recovers the original outcome without another effect')
  const operators=await h.api('/auth/operators',undefined,activeOwner),adminPerson=operators.find(row=>row.email==='synthetic-barrow-25'+'@'+'example.invalid')
  assert.ok(adminPerson)
  await h.api('/auth/operator/status',{operatorId:adminPerson.id,status:'inactive'},activeOwner)
  const deactivated=await call(cases[0]);assert.equal(deactivated.status,401);assert.equal(deactivated.answer.result,undefined)
  await h.api('/api/barrow/proposal-grants/revoke',{grantId:proposalGrant.grant.id,revision:proposalGrant.grant.revision,reason:'Owner revoked the current proposal authority before this retained replay.'},activeOwner)
  const revoked=await call(cases[2]);assert.equal(revoked.status,401);assert.equal(revoked.answer.result,undefined)
  assert.deepEqual(await snapshot(activeOwner.as),{...before,proposals:before.proposals.map(row=>({...row,grantActive:false}))},'Current revocation changes authority only, preserving the original native effect')
  console.log('PROBE BASE-AGENT-012 '+phase+' aged authority: Pause withholds every saved outcome; resume recovers it once; inactive admin and revoked proposal grant -> 401 without another preparation')
  await h.setWallClock(new Date(start+7*day+1).toISOString())
  for(const item of cases) {
   const expired=await call(item)
   assert.equal(expired.status,401,'An expired native credential cannot retrieve an otherwise retained result')
   assert.equal(expired.answer.result,undefined)
  }
  let owner=await h.signIn('owner'+'@'+'example.test','existing')
  const expiredSnapshot={...before,proposals:before.proposals.map(row=>({...row,grantActive:false}))}
  assert.ok(before.proposals.every(row=>row.grantActive),'The owner sees the active proposal grant before expiry')
  assert.deepEqual(await snapshot(owner),expiredSnapshot,'Only live grant visibility changes when the credential expires')
  const keys=cases.map(item=>item.args.idempotency_key)
  const placeholders=keys.map(()=>'?').join(',')
  const retained=await h.db.prepare('SELECT key,expires_at FROM agent_door_calls WHERE key IN ('+placeholders+') ORDER BY key').bind(...keys).all()
  assert.equal(retained.results.length,cases.length,'Credential expiry does not shorten retained outcome custody')
  for(const row of retained.results)assert.equal(row.expires_at,start+30*day)
  await h.setWallClock(new Date(start+30*day-1).toISOString())
  await (await h.mf.getWorker()).scheduled({scheduledTime:start+30*day-1})
  assert.equal((await h.db.prepare('SELECT key FROM agent_door_calls WHERE key IN ('+placeholders+')').bind(...keys).all()).results.length,cases.length)
  await h.setWallClock(new Date(start+30*day+1).toISOString())
  await (await h.mf.getWorker()).scheduled({scheduledTime:start+30*day+1})
  assert.equal((await h.db.prepare('SELECT key FROM agent_door_calls WHERE key IN ('+placeholders+')').bind(...keys).all()).results.length,0,'Native scheduled cleanup removes expired replay records')
  for(const item of cases)assert.equal((await call(item)).status,401,'Cleanup never revives an expired credential')
  owner=await h.signIn('owner'+'@'+'example.test','existing')
  assert.deepEqual(await snapshot(owner),expiredSnapshot,'Cleanup preserves native records and preparation audit history')
  console.log('PROBE BASE-AGENT-012 '+phase+' expiry: seven-day credentials -> 401; thirty-day native scheduled cleanup -> no replay rows, no revived credential or changed native effect')
  // Reuse the native custody journey; every retained artifact is only read by tests.
  await proveCustodyErasure({request:(url,init)=>h.raw(new URL(url).pathname+new URL(url).search,init),origin:h.origin,cookie:owner,
   database:async binding=>{assert.equal(binding,'DB');return h.db},
   beforeErase:()=>h.setWallClock(new Date(start+31*day+2).toISOString()),
   beforeErasedReplay:()=>h.setWallClock(new Date(start+32*day+3).toISOString())})
  console.log('PROBE BASE-AGENT-012 '+phase+' aged erasure: native preparation aged beyond 24 hours, owner erasure, another 24 hours -> value-free tombstone or revoked refusal; unchanged financial history, usage and peer artifacts')
 } finally {await h.close()}
}
