import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {installation,restore} from '../api/harness.mjs'

/** Owner erasure through native HTTP, with SELECT-only retained-state witnesses. */
export async function proveCustodyErasure({request,origin,cookie,database}) {
 const headers={Cookie:cookie,Origin:origin,'Content-Type':'application/json'}
 async function native(path,body) {
  const response=await request(origin+path,{method:body?'POST':'GET',headers,...(body?{body:JSON.stringify(body)}:{})})
  assert.equal(response.status,200,'Native erasure fixture HTTP '+response.status);return response.json()
 }
 const command=async(type,payload)=>(await native('/api/barrow/commands',{type,payload})).result
 console.log('NATIVE custody fixture begins')
 const db=await database('DB'),peer={}
 for(const table of ['agent_door_calls','agent_door_audit','agent_door_approvals','agent_door_reviews','agent_door_events','agent_door_usage'])peer[table]=(await db.prepare(`SELECT rowid AS retained_rowid,* FROM ${table} ORDER BY rowid`).all()).results

 const accountId='custody-review',personal='synthetic-custody-buyer@example.test'
 await command('account.save',{id:accountId,value:{name:'Custody review market',email:personal,pierCustomerId:accountId,termsDays:30,minimumCents:0,currency:'USD',prices:[{sku:'LINEN',unitCents:2400,minQty:1},{sku:'HEMP',unitCents:2500,minQty:1}]}})
 const order=await command('order.prepare',{accountId,lines:[{sku:'LINEN',quantity:2}]})
 await command('order.submit',{orderId:order.id});await command('order.approve',{orderId:order.id})
 const original=await native('/api/barrow/orders/'+order.id)
 const grant=await native('/api/barrow/proposal-grants',{accountId,costLimitCents:0,contactLimit:3,approvedSubstitutes:[{fromSku:'LINEN',skus:['HEMP']}],consent:true,reason:'Owner permits draft-only alternatives for an erasure review.'})
 async function tool(name,args,token=grant.token) {
  const response=await request(origin+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','MCP-Protocol-Version':'2026-07-28','Mcp-Method':'tools/call','Mcp-Name':name},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args,_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28'}}})})
  return {status:response.status,body:await response.json()}
 }
 const args={grantId:grant.grant.id,orderId:order.id,model:'synthetic-custody-model',runId:'synthetic-custody-run',reportedCostCents:0,candidates:[{lines:[{fromSku:'LINEN',sku:'HEMP',quantity:2}]}],idempotency_key:randomUUID()}
 console.log('NATIVE custody approved source and explicit grant ready')
 const prepared=await tool('barrow.proposals.submit',args)
 assert.equal(prepared.status,200);assert.ok(!prepared.body.result.isError,prepared.body.result._meta?.['com.runeditrun/error']?.code)
 assert.equal(prepared.body.result.structuredContent.runId,'synthetic-custody-run')
 console.log('NATIVE custody proposal prepared')
 const agentId='barrow-local:'+grant.grant.id
 const draftGrant=await native('/api/barrow/agent-token',{})
 const draftArgs={accountId,lines:[{sku:'LINEN',quantity:1}],reference:'Identifier-linked retained draft',idempotency_key:randomUUID()}
 const retainedDraft=await tool('barrow.orders.prepare',draftArgs,draftGrant.token)
 assert.equal(retainedDraft.status,200);assert.ok(!retainedDraft.body.result.isError)

 const list=await command('list.save',{accountId,name:'Customer supplied resource text',shared:true,lines:[{sku:'LINEN',quantity:'1'}]})
 async function readResource(uri,token=draftGrant.token) {
  const response=await request(origin+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','MCP-Protocol-Version':'2026-07-28','Mcp-Method':'resources/read','Mcp-Name':uri},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'resources/read',params:{uri,_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28'}}})})
  return {status:response.status,body:await response.json()}
 }
 const resourceDecisions=[]
 const resources=[['accounts',accountId],['catalogs',accountId],['orders',retainedDraft.body.result.structuredContent.id],['lists',list.id],['proposals',prepared.body.result.structuredContent.id]]
 for(const [kind,id] of resources) {
  const value=await readResource('barrow://'+kind+'/'+id,kind==='proposals'?grant.token:draftGrant.token)
  assert.equal(value.status,200);assert.ok(value.body.result?.contents?.length,JSON.stringify(value.body.error))
  assert.equal(value.body.result.contents[0]._meta['com.runeditrun/untrusted'],true)
  resourceDecisions.push(value.body.result._meta['com.runeditrun/decision'].id)
 }
 async function archive() {
  const {id}=await native('/api/barrow/portability/exports',{})
  let state;do {state=await native('/api/barrow/portability/exports/'+id+'/advance',{})}while(state.phase!=='complete')
  const response=await request(origin+'/api/barrow/portability/exports/'+id+'/download',{headers})
  assert.equal(response.status,200);return (await response.text()).trim().split('\n').map(line=>JSON.parse(line))
 }
 const beforeErasure=await archive()
 const usage=async()=>(await db.prepare('SELECT decision_id,at,seed,agent,classes FROM agent_door_usage WHERE agent=? ORDER BY decision_id').bind(agentId).all()).results
 const counts=await usage();assert.ok(counts.length>0)
 await command('retention.request',{accountId,requester:'Verified account representative',channel:'In-app owner review',verificationNote:'Owner verified identity and scope.',reason:'Owner reviewed erasure of unexecuted agent preparation.',held:false})
 console.log('NATIVE custody verified erasure request ready')
 const preview=await command('retention.preview',{accountId})
 const receipt=await command('retention.erase-account',{accountId,accountRevision:preview.accountRevision,requestRevision:preview.requestRevision,policyRevision:preview.policyRevision,reviewHash:preview.reviewHash,confirm:'ERASE',reason:'Owner authorizes personal redaction while preserving commercial evidence.'})
 console.log('NATIVE custody erasure applied')
 assert.equal(receipt.mode,'erase');assert.equal(JSON.stringify(receipt).includes(personal),false)
 assert.deepEqual(await native('/api/barrow/orders/'+order.id),original)
 for(const [table,rows] of Object.entries(peer))for(const row of rows)assert.deepEqual(await db.prepare(`SELECT rowid AS retained_rowid,* FROM ${table} WHERE rowid=?`).bind(row.retained_rowid).first(),row,'Unrelated peer retained artifact must stay byte for byte')
 const erasedDraft=await tool('barrow.orders.prepare',draftArgs,draftGrant.token)
 assert.equal(erasedDraft.body.result._meta['com.runeditrun/error'].code,'subject_erased')
 assert.equal(JSON.stringify(erasedDraft.body).includes(personal),false)
 assert.equal(JSON.stringify(erasedDraft.body).includes('Identifier-linked retained draft'),false)

 for(const table of ['bw_agent_proposals','bw_agent_proposal_attempts','bw_agent_proposal_grants'])assert.equal((await db.prepare(`SELECT count(*) AS n FROM ${table} WHERE account_id=?`).bind(accountId).first()).n,0)
 const retainedCalls=(await db.prepare('SELECT * FROM agent_door_calls WHERE agent=?').bind(agentId).all()).results
 assert.ok(retainedCalls.length>0);assert.ok(retainedCalls.every(row=>row.key.startsWith('erased:')&&row.digest===''&&JSON.parse(row.outcome).code==='subject_erased'))
 for(const table of ['agent_door_approvals','agent_door_reviews'])assert.equal((await db.prepare(`SELECT count(*) AS n FROM ${table} WHERE json_extract(saved,'$.principal.agent.id')=?`).bind(agentId).first()).n,0)
 const audit=(await db.prepare('SELECT row,evidence FROM agent_door_audit WHERE agent=?').bind(agentId).all()).results
 assert.ok(audit.length>0);assert.ok(audit.every(row=>JSON.parse(row.row).tombstone?.erasure_id===receipt.id&&row.evidence===null))
 assert.equal(JSON.stringify(audit).includes(personal),false)
 assert.deepEqual(await usage(),counts,'Erasure must not reset policy usage or lifetime counters')
 const replay=await tool('barrow.proposals.submit',args)
 assert.ok([401,403].includes(replay.status));assert.equal(JSON.stringify(replay.body).includes(personal),false)
 for(const id of resourceDecisions) {
  const row=await db.prepare('SELECT row,evidence FROM agent_door_audit WHERE id=?').bind(id).first()
  assert.equal(JSON.parse(row.row).tombstone.erasure_id,receipt.id,'URI-linked resource audit must be redacted')
  assert.equal(row.evidence,null)
 }
 for(const [kind,id] of resources) {
  const value=await readResource('barrow://'+kind+'/'+id,kind==='proposals'?grant.token:draftGrant.token)
  assert.equal(value.body.result,undefined,'Erased resource content stays unavailable')
  assert.equal(JSON.stringify(value.body).includes(personal),false)
 }
 const afterErasure=await archive(),independent=await native('/api/barrow/erasure-journal')
 const destination=await installation({built:true})
 try {
  await destination.api('/api/barrow/erasure-journal',{bundle:independent,confirm:'JOURNAL',reason:'Owner attached the complete later erasure journal before an old archive restore.'})
  const refused=await restore(destination,beforeErasure,{status:400,journalSource:undefined,laterJournal:{sourceIdentity:afterErasure[0].sourceIdentity,epoch:afterErasure[0].epoch,journal:afterErasure[0].journal}})
  assert.equal(refused.error.code,'erasure_epoch')
  assert.equal((await destination.api('/api/barrow/state')).accounts.length,0)
  for(const [kind,id] of resources)assert.equal((await destination.request('/mcp',{method:'POST',headers:{Authorization:'Bearer '+draftGrant.token,'MCP-Protocol-Version':'2026-07-28','Mcp-Method':'resources/read','Mcp-Name':'barrow://'+kind+'/'+id},body:{jsonrpc:'2.0',id:1,method:'resources/read',params:{uri:'barrow://'+kind+'/'+id,_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28'}}}})).status,401)
 }finally{await destination.close()}
 console.log('PROBE BASE-AGENT-003 erasure and restore: five resource reads, native owner erasure, pre-erasure archive plus later journal -> URI audits redacted, content withheld and old restore refused with erasure_epoch')
 const account=await native('/api/barrow/accounts/by-id/'+accountId)
 assert.match(account.value.email,/@erased\.invalid$/)
 console.log('NATIVE PASS owner erasure removes proposal content and personal retained results; preserves Base tombstones, exact commercial history and usage; revoked replay refuses')
}
