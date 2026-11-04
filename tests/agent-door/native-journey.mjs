import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {captureAgents} from './screens.mjs'
import {proveCustodyErasure} from './custody.mjs'
import {takeLocalAdmin} from './initialize-admin.mjs'

const code=answer=>answer.result?._meta?.['com.runeditrun/error']?.code??answer.body?.error?.data?.code
export default async function({request,origin,cookie,tool,database}) {
 try {
 const before=(await tool('barrow.workspace.read',{})).result.structuredContent
 const args={accountId:'juniper',lines:[{sku:'LINEN',quantity:2}],reference:'Explicit native draft proof',idempotency_key:randomUUID()}
 const stale=await tool('barrow.orders.prepare',{...args,expected_revision:randomUUID()})
 assert.equal(code(stale),'revision_conflict')
 assert.deepEqual((await tool('barrow.workspace.read',{})).result.structuredContent,before)
 const prepared=await tool('barrow.orders.prepare',args)
 assert.ok(!prepared.result.isError)
 const draft=prepared.result.structuredContent
 assert.equal(draft.status,'draft');assert.match(draft.preparedBy,/ for /)
 const replay=await tool('barrow.orders.prepare',args)
 assert.deepEqual(replay.result.structuredContent,draft)
 assert.equal(code(await tool('barrow.orders.prepare',{...args,reference:'Changed native draft proof'})),'idempotency_conflict')
 const headers={Cookie:cookie,Origin:origin,'Content-Type':'application/json'}
 const audit=await(await request(origin+'/api/barrow/audit',{headers})).json()
 const event=audit.events.find(row=>row.subjectId===draft.id&&row.action==='order.prepared')
 assert.equal(event.actorKind,'agent');assert.equal(event.actorName,draft.preparedBy)
 const erase=await request(origin+'/api/barrow/commands',{method:'POST',headers,body:JSON.stringify({type:'retention.erase-account',payload:{accountId:'juniper',confirm:'ERASE',reason:'Check retained native custody boundary'}})})
 assert.equal(erase.status,409);assert.equal((await erase.json()).error.code,'REQUEST')
 console.log('NATIVE PASS stale revision, one-effect replay, changed-argument conflict, agent attribution and owner-reviewed erasure admission')
 const grantResponse=await request(origin+'/api/barrow/agent-token',{method:'POST',headers,body:'{}'})
 console.log('NATIVE grant issuance HTTP '+grantResponse.status);assert.ok(grantResponse.ok);const grant=await grantResponse.json()
 async function legacy(path,payload) {
  const response=await request(origin+path,{method:payload?'POST':'GET',headers:{Authorization:'Bearer '+grant.token,'Content-Type':'application/json'},...(payload?{body:JSON.stringify({type:'order.prepare',payload})}:{})})
  return {status:response.status,body:await response.json()}
 }
 const directory=await legacy('/api/barrow/accounts')
 assert.equal(directory.status,200);assert.equal(directory.body.accounts[0].id,'juniper')
 for(const path of ['/api/barrow/orders/search','/api/barrow/orders/history']) {
  const response=await legacy(path);assert.equal(response.status,403);assert.equal(response.body.code,'PERSON_REQUIRED')
 }
 const legacyArgs={accountId:'juniper',lines:[{sku:'LINEN',quantity:2}],reference:'Legacy transport through one door',idempotency_key:randomUUID()}
 const {idempotency_key,...withoutKey}=legacyArgs
 assert.equal((await legacy('/api/barrow/commands',withoutKey)).body.code,'idempotency_key_required')
 const legacyDraft=await legacy('/api/barrow/commands',legacyArgs)
 assert.equal(legacyDraft.status,200);assert.match(legacyDraft.body.result.preparedBy,/Barrow scoped agent for Juniper wholesale owner/)
 const nativeBeforePause=await(await request(origin+'/api/barrow/state',{headers})).json()
 async function pause(paused) {
  const response=await request(origin+'/agents/api/pause',{method:'POST',headers,body:JSON.stringify({paused})})
  assert.ok(response.ok);await response.body?.cancel()
 }
 await pause(true)
 assert.equal((await legacy('/api/barrow/catalogue?accountId=juniper')).body.code,'agents_paused')
 assert.equal((await legacy('/api/barrow/commands',legacyArgs)).body.code,'agents_paused')
 assert.equal((await legacy('/api/barrow/commands',{...legacyArgs,idempotency_key:randomUUID()})).body.code,'agents_paused')
 const nativeAfterPause=await(await request(origin+'/api/barrow/state',{headers})).json()
 assert.deepEqual(nativeAfterPause.orders,nativeBeforePause.orders)
 await pause(false)
 assert.deepEqual((await legacy('/api/barrow/commands',legacyArgs)).body.result,legacyDraft.body.result)
 assert.equal((await legacy('/api/barrow/commands',{...legacyArgs,reference:'Changed'})).body.code,'idempotency_conflict')
 const doorAudit=await(await request(origin+'/agents/api/audit',{headers})).json()
 assert.equal(doorAudit.differs_from_policy,0)
 assert.ok(doorAudit.rows.some(row=>row.agent.name==='Barrow scoped agent'&&row.code==='agents_paused'))
 console.log('NATIVE PASS legacy HTTP enters shared policy, Pause, audit and once-only replay; missing key and changed arguments refuse')
 async function local(method,params={},token=grant.token) {
  const response=await request(origin+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','MCP-Protocol-Version':'2026-07-28','Mcp-Method':method,...((params.name??params.uri)?{'Mcp-Name':params.name??params.uri}:{})},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params:{...params,_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28'}}})})
  return {status:response.status,body:await response.json()}
 }
 async function person(path,body,session=cookie) {
  const response=await request(origin+path,{method:body?'POST':'GET',headers:{...headers,Cookie:session},...(body?{body:JSON.stringify(body)}:{})})
  assert.equal(response.status,200,'Native resource witness '+path);return response.json()
 }
 const command=async(type,payload)=>(await person('/api/barrow/commands',{type,payload})).result
 const nativeOrder=await person('/api/barrow/orders/'+draft.id)
 async function resource(uri,token=grant.token) {
  const answer=await local('resources/read',{uri},token)
  assert.equal(answer.status,200);assert.ok(answer.body.result,JSON.stringify(answer.body.error))
  const content=answer.body.result.contents
  assert.equal(content.length,1);assert.equal(content[0].uri,uri);assert.equal(content[0].mimeType,'application/json')
  assert.equal(content[0]._meta['com.runeditrun/untrusted'],true)
  return JSON.parse(content[0].text)
 }
 const nativeLists=(await person('/api/barrow/lists?accountId=juniper')).lists
 const shared=nativeLists.find(value=>value.shared),privateList=nativeLists.find(value=>!value.shared)
 assert.ok(shared&&privateList)
 const projections=[['accounts','juniper',await person('/api/barrow/accounts/by-id/juniper')],['catalogs','juniper',await person('/api/barrow/catalogue?accountId=juniper')],['orders',draft.id,nativeOrder],['lists',shared.id,Object.fromEntries(Object.entries(shared).filter(([key])=>!['mine','creatorName'].includes(key)))]]
 function projection(kind,actual,expected) {
  if(kind==='catalogs') {
   assert.ok(Date.parse(actual.observedAt)>=Date.parse(expected.observedAt)&&Date.parse(actual.observedAt)<=Date.now(),'Catalogue reports the current observation time')
   assert.deepEqual({...actual,observedAt:expected.observedAt},expected,'All catalogue fields match the native projection; observation times describe their own request')
  }else assert.deepEqual(actual,expected,kind+' exact native projection')
 }
 for(const [kind,id,expected] of projections)projection(kind,await resource('barrow://'+kind+'/'+id),expected)
 const draftLink=prepared.result.content.find(value=>value.type==='resource_link')
 assert.equal(draftLink.uri,'barrow://orders/'+draft.id)
 assert.deepEqual(await resource(draftLink.uri),nativeOrder,'The linked record is the actual committed draft')
 const missing=await local('resources/read',{uri:'barrow://lists/missing'})
 assert.equal(missing.body.error.data.code,'resource_unavailable')
 const hidden=await local('resources/read',{uri:'barrow://lists/'+privateList.id})
 assert.deepEqual(hidden,missing,'A private list is indistinguishable from a missing list')
 const source=before.orders.find(value=>value.status==='reserved'||value.status==='approved'||value.pierOrderId)||before.orders[0]
 const proposalGrant=await person('/api/barrow/proposal-grants',{accountId:'juniper',costLimitCents:0,contactLimit:3,approvedSubstitutes:[{fromSku:'LINEN',skus:['HEMP']}],consent:true,reason:'Explicit one-account resource readback proof.'})
 const proposalAnswer=await local('tools/call',{name:'barrow.proposals.submit',arguments:{grantId:proposalGrant.grant.id,orderId:source.id,model:'synthetic-barrow-model',runId:'synthetic-barrow-resource-run',reportedCostCents:0,candidates:[{lines:[{fromSku:'LINEN',sku:'HEMP',quantity:2}]}],idempotency_key:randomUUID()}},proposalGrant.token)
 assert.equal(proposalAnswer.status,200);assert.ok(!proposalAnswer.body.result.isError,JSON.stringify(proposalAnswer.body.result._meta))
 const proposal=proposalAnswer.body.result.structuredContent,proposalLink=proposalAnswer.body.result.content.find(value=>value.type==='resource_link')
 assert.equal(proposalLink.uri,'barrow://proposals/'+proposal.id)
 assert.deepEqual(await resource(proposalLink.uri,proposalGrant.token),proposal)
 const nativeProposal=(await person('/api/barrow/orders/'+source.id+'/agent-proposals')).proposals.find(value=>value.id===proposal.id)
 assert.deepEqual(proposal,nativeProposal,'Proposal reads include the exact current native review and attempt state')
 const beforeRefusal=await person('/api/barrow/orders/'+source.id)
 const refusedExecution=await request(origin+'/api/barrow/commands',{method:'POST',headers,body:JSON.stringify({type:'proposal.execute',payload:{id:proposal.id,number:proposal.number,revision:proposal.revision,idempotencyKey:'unapproved-resource-attempt'}})})
 assert.equal(refusedExecution.status,409)
 assert.equal((await refusedExecution.json()).error.code,'PROPOSAL_KEY')
 assert.deepEqual(await person('/api/barrow/orders/'+source.id),beforeRefusal,'A refused proposal execution changes no order or inventory identity')
 const reviewed=(await person('/api/barrow/orders/'+source.id+'/agent-proposals')).proposals.find(value=>value.id===proposal.id)
 assert.equal(reviewed.attempts.length,1);assert.equal(reviewed.attempts[0].code,'PROPOSAL_KEY');assert.equal(reviewed.grantActive,true)
 assert.deepEqual(await resource(proposalLink.uri,proposalGrant.token),reviewed,'Resource refresh includes the actual attributed refusal history')
 await command('proposal.withdraw',{id:proposal.id,number:proposal.number,revision:proposal.revision,reason:'A person withdrew this unexecuted proposal after reviewing its failed attempt.'})
 const withdrawn=(await person('/api/barrow/orders/'+source.id+'/agent-proposals')).proposals.find(value=>value.id===proposal.id)
 assert.equal(withdrawn.state,'superseded')
 assert.deepEqual(await resource(proposalLink.uri,proposalGrant.token),withdrawn,'The same URI rereads current human-reviewed state rather than the prepared result')
 const changingList=await command('list.save',{accountId:'juniper',name:'Current resource visibility',shared:true,lines:[{sku:'LINEN',quantity:'1'}]})
 const listUri='barrow://lists/'+changingList.id
 assert.deepEqual(await resource(listUri),changingList)
 const updatedList=await command('list.save',{listId:changingList.id,revision:changingList.revision,lines:[{sku:'LINEN',quantity:'4'}]})
 assert.deepEqual(await resource(listUri),updatedList,'An existing resource URI reads the current native list revision')
 await command('list.save',{listId:updatedList.id,revision:updatedList.revision,shared:false})
 assert.deepEqual(await local('resources/read',{uri:listUri}),missing,'Removing list sharing immediately withholds the next resource read')
 console.log('PROBE BASE-AGENT-003 current state: refused execution, human withdrawal, list revision and sharing removal -> exact attributed proposal history, superseded state, updated quantities and private-record refusal')
 const foreignOrder=await command('order.prepare',{accountId:'zinnia',lines:[{sku:'LINEN',quantity:1}]})
 for(const [kind,id] of [['catalogs','zinnia'],['orders',foreignOrder.id]]) {
  assert.deepEqual(await local('resources/read',{uri:'barrow://'+kind+'/'+id},proposalGrant.token),await local('resources/read',{uri:'barrow://'+kind+'/missing'},proposalGrant.token),'Foreign account and missing record refusals match')
 }
 const scopeRefusal=await local('resources/read',{uri:proposalLink.uri})
 assert.equal(scopeRefusal.status,403);assert.equal(scopeRefusal.body.error.data.code,'insufficient_scope')
 const scopedTemplates=await local('resources/templates/list',{},proposalGrant.token)
 assert.deepEqual(scopedTemplates.body.result.resourceTemplates.map(value=>value.uriTemplate).sort(),['barrow://catalogs/{id}','barrow://orders/{id}','barrow://proposals/{id}'])
 await pause(true)
 const pausedRead=await local('resources/read',{uri:draftLink.uri})
 assert.equal(pausedRead.body.error.data.code,'agents_paused');assert.equal(pausedRead.body.result,undefined)
 await pause(false)
 assert.deepEqual(await resource(draftLink.uri),nativeOrder)
 const resourceAudit=await person('/agents/api/audit')
 assert.ok(resourceAudit.rows.some(value=>value.tool==='resources/read'&&value.resource===draftLink.uri&&value.outcome==='done'))
 await person('/api/barrow/proposal-grants/revoke',{grantId:proposalGrant.grant.id,revision:proposalGrant.grant.revision,reason:'Remove this one-account resource authority.'})
 assert.equal((await local('resources/read',{uri:proposalLink.uri},proposalGrant.token)).status,401)
 console.log('PROBE BASE-AGENT-003 projections and links: native account, catalog, order, shared-list and proposal HTTP state -> exact MCP JSON and committed write readback with untrusted markers')
 console.log('PROBE BASE-AGENT-003 isolation: private lists, foreign accounts, missing ids, removed scope, Pause and revoked proposal grant -> content withheld with matching record refusals')
 console.log('NATIVE grant received');const listed=await local('tools/list')
 console.log('NATIVE local list HTTP '+listed.status);assert.equal(listed.status,200);assert.ok(listed.body.result.tools.some(tool=>tool.name==='barrow.orders.prepare'))
 const denied=await local('tools/call',{name:'barrow.proposals.grants',arguments:{accountId:'juniper'}});console.log('NATIVE local scope refusal HTTP '+denied.status);assert.equal(denied.status,403)
 const recognizable=Buffer.from(JSON.stringify({alg:'ES256',typ:'at+jwt',kid:'unknown'})).toString('base64url')+'.e30.invalid'
 const failedBusiness=await local('tools/list',{},recognizable);console.log('NATIVE recognizable Business refusal HTTP '+failedBusiness.status);assert.equal(failedBusiness.status,401)
 const admin=takeLocalAdmin(),adminHeaders={Cookie:admin.cookie,Origin:origin,'Content-Type':'application/json'}
 for(const path of ['/agents/api/state','/agents/api/audit']) {
  const response=await request(origin+path,{headers:adminHeaders});assert.equal(response.status,403);await response.body?.cancel()
 }
 const adminGrantResponse=await request(origin+'/api/barrow/agent-token',{method:'POST',headers:adminHeaders,body:'{}'})
 assert.equal(adminGrantResponse.status,200);const adminGrant=await adminGrantResponse.json()
 const adminRead=await local('tools/call',{name:'barrow.accounts.read',arguments:{id:'juniper'}},adminGrant.token)
 assert.equal(adminRead.status,200);assert.equal(adminRead.body.result.structuredContent.id,'juniper')
 for(const [kind,id] of projections) {
  const expected=kind==='accounts'?await person('/api/barrow/accounts/by-id/'+id,undefined,admin.cookie):kind==='catalogs'?await person('/api/barrow/catalogue?accountId='+id,undefined,admin.cookie):kind==='orders'?await person('/api/barrow/orders/'+id,undefined,admin.cookie):Object.fromEntries(Object.entries((await person('/api/barrow/lists?accountId=juniper',undefined,admin.cookie)).lists.find(value=>value.id===id)).filter(([key])=>!['mine','creatorName'].includes(key)))
  projection(kind,await resource('barrow://'+kind+'/'+id,adminGrant.token),expected)
 }
 assert.deepEqual(await local('resources/read',{uri:'barrow://lists/'+privateList.id},adminGrant.token),await local('resources/read',{uri:'barrow://lists/missing'},adminGrant.token))
 const operators=await(await request(origin+'/auth/operators',{headers})).json(),adminPerson=operators.find(person=>person.email===admin.email)
 const inactive=await request(origin+'/auth/operator/status',{method:'POST',headers,body:JSON.stringify({operatorId:adminPerson.id,status:'inactive'})})
 assert.ok(inactive.ok);await inactive.body?.cancel()
 assert.equal((await local('tools/list',{},adminGrant.token)).status,401)
 assert.equal((await local('resources/read',{uri:draftLink.uri},adminGrant.token)).status,401)
 console.log('NATIVE PASS native admin keeps scoped commercial access without Business editor authority; native deactivation refuses the next call')
 const revoked=await request(origin+'/api/barrow/agent-token/revoke',{method:'POST',headers,body:'{}'});console.log('NATIVE local revoke HTTP '+revoked.status);assert.ok(revoked.ok);await revoked.body?.cancel()
 assert.equal((await local('tools/list')).status,401)
 assert.equal((await local('resources/read',{uri:draftLink.uri})).status,401)
 assert.equal((await legacy('/api/barrow/catalogue?accountId=juniper')).status,401)
 console.log('NATIVE PASS scoped local credential, failed recognizable Business token refusal and immediate native grant revocation')
 await proveCustodyErasure({request,origin,cookie,database})
 await captureAgents({request,origin,cookie})
 }catch(error){console.error('Native resource journey assertion:',error);throw error}
}
