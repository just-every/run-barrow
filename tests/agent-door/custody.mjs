import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'

/** Owner erasure through native HTTP, with SELECT-only retained-state witnesses. */
export async function proveCustodyErasure({request,origin,cookie,database}) {
 const headers={Cookie:cookie,Origin:origin,'Content-Type':'application/json'}
 async function native(path,body) {
  const response=await request(origin+path,{method:body?'POST':'GET',headers,...(body?{body:JSON.stringify(body)}:{})})
  assert.equal(response.status,200,'Native erasure fixture HTTP '+response.status);return response.json()
 }
 const command=async(type,payload)=>(await native('/api/barrow/commands',{type,payload})).result
 console.log('NATIVE custody fixture begins')
 const accountId='custody-review',personal='synthetic-custody-buyer@example.test'
 await command('account.save',{id:accountId,value:{name:'Custody review market',email:personal,pierCustomerId:accountId,termsDays:30,minimumCents:0,currency:'USD',prices:[{sku:'LINEN',unitCents:2400,minQty:1},{sku:'HEMP',unitCents:2500,minQty:1}]}})
 const order=await command('order.prepare',{accountId,lines:[{sku:'LINEN',quantity:2}]})
 await command('order.submit',{orderId:order.id});await command('order.approve',{orderId:order.id})
 const original=await native('/api/barrow/orders/'+order.id)
 const grant=await native('/api/barrow/proposal-grants',{accountId,costLimitCents:0,contactLimit:3,approvedSubstitutes:[{fromSku:'LINEN',skus:['HEMP']}],consent:true,reason:'Owner permits draft-only alternatives for an erasure review.'})
 async function tool(name,args) {
  const response=await request(origin+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+grant.token,'Content-Type':'application/json','MCP-Protocol-Version':'2026-07-28','Mcp-Method':'tools/call','Mcp-Name':name},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args,_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28'}}})})
  return {status:response.status,body:await response.json()}
 }
 const args={grantId:grant.grant.id,orderId:order.id,model:'synthetic-custody-model',runId:'synthetic-custody-run',reportedCostCents:0,candidates:[{lines:[{fromSku:'LINEN',sku:'HEMP',quantity:2}]}],idempotency_key:randomUUID()}
 console.log('NATIVE custody approved source and explicit grant ready')
 const prepared=await tool('barrow.proposals.submit',args)
 assert.equal(prepared.status,200);assert.ok(!prepared.body.result.isError,prepared.body.result._meta?.['com.runeditrun/error']?.code)
 assert.equal(prepared.body.result.structuredContent.runId,'synthetic-custody-run')
 console.log('NATIVE custody proposal prepared')
 const agentId='barrow-local:'+grant.grant.id,db=await database('DB')
 const usage=async()=>(await db.prepare('SELECT decision_id,at,seed,agent,classes FROM agent_door_usage WHERE agent=? ORDER BY decision_id').bind(agentId).all()).results
 const counts=await usage();assert.ok(counts.length>0)
 await command('retention.request',{accountId,requester:'Verified account representative',channel:'In-app owner review',verificationNote:'Owner verified identity and scope.',reason:'Owner reviewed erasure of unexecuted agent preparation.',held:false})
 console.log('NATIVE custody verified erasure request ready')
 const preview=await command('retention.preview',{accountId})
 const receipt=await command('retention.erase-account',{accountId,accountRevision:preview.accountRevision,requestRevision:preview.requestRevision,policyRevision:preview.policyRevision,reviewHash:preview.reviewHash,confirm:'ERASE',reason:'Owner authorizes personal redaction while preserving commercial evidence.'})
 console.log('NATIVE custody erasure applied')
 assert.equal(receipt.mode,'erase');assert.equal(JSON.stringify(receipt).includes(personal),false)
 assert.deepEqual(await native('/api/barrow/orders/'+order.id),original)
 for(const table of ['bw_agent_proposals','bw_agent_proposal_attempts','bw_agent_proposal_grants'])assert.equal((await db.prepare(`SELECT count(*) AS n FROM ${table} WHERE account_id=?`).bind(accountId).first()).n,0)
 assert.equal((await db.prepare('SELECT count(*) AS n FROM agent_door_calls WHERE agent=?').bind(agentId).first()).n,0)
 for(const table of ['agent_door_approvals','agent_door_reviews'])assert.equal((await db.prepare(`SELECT count(*) AS n FROM ${table} WHERE json_extract(saved,'$.principal.agent.id')=?`).bind(agentId).first()).n,0)
 const audit=(await db.prepare('SELECT row,evidence FROM agent_door_audit WHERE agent=?').bind(agentId).all()).results
 assert.ok(audit.length>0);assert.ok(audit.every(row=>JSON.parse(row.row).erased===true&&row.evidence===null))
 assert.equal(JSON.stringify(audit).includes(personal),false)
 assert.deepEqual(await usage(),counts,'Erasure must not reset policy usage or lifetime counters')
 const replay=await tool('barrow.proposals.submit',args)
 assert.ok([401,403].includes(replay.status));assert.equal(JSON.stringify(replay.body).includes(personal),false)
 const account=await native('/api/barrow/accounts/by-id/'+accountId)
 assert.match(account.value.email,/@erased\.invalid$/)
 console.log('NATIVE PASS owner erasure removes proposal content and personal retained results; preserves non-personal audit, exact commercial history and usage; revoked replay refuses')
}
