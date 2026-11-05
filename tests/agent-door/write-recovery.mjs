import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'

const error=answer=>answer.result?._meta?.['com.runeditrun/error']
const receipt=answer=>answer.result?._meta?.['com.runeditrun/receipt']

/** Real MCP requests and native person reads; no retained-call or table writes. */
export async function proveWriteRecovery({request,origin,cookie,phase}) {
 const headers={Cookie:cookie,Origin:origin,'Content-Type':'application/json'}
 async function native(path,body) {
  const response=await request(origin+path,{method:body?'POST':'GET',headers,...(body?{body:JSON.stringify(body)}:{})})
  assert.equal(response.status,200,'Recovery native door '+path)
  return response.json()
 }
 const command=async(type,payload)=>(await native('/api/barrow/commands',{type,payload})).result
 const accountId='synthetic-barrow-'+(phase==='autonomous'?12:13)
 const directory=await native('/api/barrow/state')
 const source=directory.accounts.find(row=>row.id==='juniper')
 let account=await command('account.save',{id:accountId,value:{...source.value,name:accountId,email:accountId+'@'+'example.invalid'},
  duplicateReviews:directory.accounts.filter(row=>row.value.pierCustomerId===source.value.pierCustomerId).map(({id,revision})=>({id,revision}))})
 const draftGrant=await native('/api/barrow/agent-token',{})
 const rpcIds=new Set()
 async function send(name,args,token) {
  const id=randomUUID()
  assert.ok(!rpcIds.has(id));rpcIds.add(id)
  const response=await request(origin+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','MCP-Protocol-Version':'2026-07-28','Mcp-Method':'tools/call','Mcp-Name':name},
   body:JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',params:{name,arguments:args,_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28'}}})})
  return {response,id}
 }
 async function call(name,args,token) {
  const {response,id}=await send(name,args,token)
  assert.equal(response.status,200,'Recovery MCP transport '+name)
  const answer=await response.json()
  assert.equal(answer.id,id,'A retry responds to its new JSON-RPC id')
  return answer
 }
 function completed(answer) {
  assert.equal(error(answer),undefined,'Recovery must return the saved successful outcome')
  assert.ok(answer.result.structuredContent)
  assert.equal(answer.result._meta['com.runeditrun/decision'].disposition,phase==='held'?'review':'autonomous')
  return answer.result.structuredContent
 }
 async function audit() {
  const events=[];let cursor
  do {
   const page=await native('/api/barrow/audit?'+new URLSearchParams({accountId,limit:'200',...(cursor?{cursor}:{})}))
   events.push(...page.events);cursor=page.nextCursor
  } while(cursor)
  return events
 }
 let original
 async function snapshot() {
  const state=await native('/api/barrow/state')
  return {orders:state.orders.filter(row=>row.accountId===accountId),
   proposals:original?(await native('/api/barrow/orders/'+original.id+'/agent-proposals')).proposals:[],
   preparations:(await audit()).filter(row=>['order.prepared','proposal.submitted'].includes(row.action))}
 }
 async function once({name,token,args,changed,mode}) {
  const before=await snapshot()
  let answers=[]
  if(mode==='lost') {
   const {idempotency_key,...withoutKey}=args
   const missing=await call(name,withoutKey,token)
   assert.equal(error(missing)?.code,'idempotency_key_required')
   assert.equal(missing.result.structuredContent,undefined)
   assert.deepEqual(await snapshot(),before,'Missing keys cannot prepare a native record')
   const {response:lost}=await send(name,args,token)
   assert.equal(lost.status,200)
   // The server has completed the mutation. Consume and discard every byte;
   // recovery never sees or parses the first result or its JSON-RPC id.
   await lost.arrayBuffer()
  } else {
   answers=await Promise.all([call(name,args,token),call(name,args,token)])
   assert.ok(answers.some(answer=>!error(answer)),'At least one concurrent request must complete')
   for(const answer of answers)if(error(answer))assert.equal(error(answer).code,'call_in_progress')
  }
  const after=await snapshot(),isDraft=name==='barrow.orders.prepare'
  const records=isDraft?after.orders:after.proposals,previous=isDraft?before.orders:before.proposals
  assert.equal(records.length,previous.length+1,'Exactly one native preparation record')
  const created=records.filter(row=>!previous.some(prior=>prior.id===row.id&&prior.number===row.number))
  assert.equal(created.length,1,'Retry cannot append a second proposal revision')
  if(isDraft) {
   assert.equal(created[0].status,'draft');assert.equal(created[0].reference,args.reference)
   assert.equal(created[0].pierOrderId,undefined)
  } else {
   assert.equal(created[0].number,(args.number??0)+1);assert.equal(created[0].state,'proposed')
   if(args.id)assert.equal(created[0].id,args.id,'A revised proposal keeps its native identity')
   assert.equal(created[0].runId,args.runId)
   assert.deepEqual(after.orders,before.orders,'Proposal preparation cannot change its original order')
  }
  const action=isDraft?'order.prepared':'proposal.submitted'
  assert.equal(after.preparations.filter(row=>row.action===action).length,before.preparations.filter(row=>row.action===action).length+1)
  assert.equal(after.preparations.filter(row=>row.action===action&&row.subjectId===created[0].id&&row.revision===created[0].revision).length,1,'Exactly one native preparation audit effect')
  const recovered=await call(name,args,token),saved=completed(recovered)
  assert.equal(saved.id,created[0].id);assert.equal(saved.revision,created[0].revision)
  for(const [key,value] of Object.entries(saved))assert.deepEqual(created[0][key],value,'Saved outcome matches the native '+key)
  for(const answer of answers)if(!error(answer))assert.deepEqual(completed(answer),saved)
  const repeated=await call(name,args,token)
  assert.deepEqual(completed(repeated),saved)
  assert.deepEqual(receipt(repeated),receipt(recovered))
  for(const conflict of [changed,{expected_revision:randomUUID()}]) {
   const refused=await call(name,{...args,...conflict},token)
   assert.equal(error(refused)?.code,'idempotency_conflict')
   assert.equal(refused.result.structuredContent,undefined)
  }
  assert.deepEqual(await snapshot(),after,'Recovery, conflicts and later retries leave the native effect unchanged')
  console.log('PROBE BASE-AGENT-012 '+phase+' '+name+' '+mode+(args.id?' proposal revision':'')+': MCP new JSON-RPC ids and one key -> one native revision, one preparation audit, saved retries and changed-input conflicts')
  return {name,token,args,saved,receipt:receipt(recovered)}
 }
 async function replayAfterSourceChange(items,currentRevision) {
  const before=await snapshot()
  for(const item of items) {
   const replay=await call(item.name,item.args,item.token)
   assert.deepEqual(completed(replay),item.saved,'Source edits cannot replace the first recorded outcome')
   assert.deepEqual(receipt(replay),item.receipt,'Source edits preserve the original preparation receipt')
   const changed=await call(item.name,{...item.args,expected_revision:currentRevision},item.token)
   assert.equal(error(changed)?.code,'idempotency_conflict')
   assert.equal(changed.result.structuredContent,undefined)
  }
  assert.deepEqual(await snapshot(),before,'Replay after a person edits the source cannot prepare another native revision')
  console.log('PROBE BASE-AGENT-012 '+phase+' '+items[0].name+' source edit: successful keys keep their saved outcome and receipt; a changed expected revision conflicts without preparation')
 }
 async function stale(name,args,token,currentRevision) {
  const before=await snapshot(),answer=await call(name,{...args,idempotency_key:randomUUID()},token)
  assert.equal(error(answer)?.code,'revision_conflict')
  assert.equal(error(answer).current_revision,currentRevision)
  assert.equal(answer.result.structuredContent,undefined)
  assert.deepEqual(await snapshot(),before,'Stale expected revision cannot prepare another record')
  console.log('PROBE BASE-AGENT-012 '+phase+' '+name+' stale: native person changes source revision -> revision_conflict with the current revision and zero preparation')
 }
 const drafts=[]
 for(const mode of ['lost','concurrent'])drafts.push(await once({name:'barrow.orders.prepare',token:draftGrant.token,mode,
  args:{accountId,lines:[{sku:'LINEN',quantity:2}],reference:'synthetic-barrow-'+phase+'-'+mode,idempotency_key:randomUUID(),expected_revision:account.revision},changed:{lines:[{sku:'LINEN',quantity:3}]}}))
 const oldRevision=account.revision
 account=await command('account.save',{id:accountId,revision:account.revision,value:{...account.value,termsDays:31}})
 assert.notEqual(account.revision,oldRevision)
 await replayAfterSourceChange(drafts,account.revision)
 await stale('barrow.orders.prepare',{accountId,lines:[{sku:'LINEN',quantity:2}],expected_revision:oldRevision},draftGrant.token,account.revision)

 original=await command('order.prepare',{accountId,lines:[{sku:'LINEN',quantity:2}]})
 await command('order.submit',{orderId:original.id})
 await command('order.approve',{orderId:original.id})
 original=await native('/api/barrow/orders/'+original.id)
 const proposalGrant=await native('/api/barrow/proposal-grants',{accountId,costLimitCents:0,contactLimit:3,approvedSubstitutes:[{fromSku:'LINEN',skus:['HEMP']}],consent:true,reason:'Owner authorizes native draft-only retry proof; no stock changes or contact permission.'})
 const proposalArgs={grantId:proposalGrant.grant.id,orderId:original.id,model:'synthetic-barrow-12',reportedCostCents:0,
  candidates:[{lines:[{fromSku:'LINEN',sku:'HEMP',quantity:2}]}],expected_revision:original.revision}
 const proposals=[]
 for(const mode of ['lost','concurrent']) {
  const first=await once({name:'barrow.proposals.submit',token:proposalGrant.token,mode,
   args:{...proposalArgs,runId:'synthetic-barrow-'+phase+'-'+mode,idempotency_key:randomUUID()},changed:{candidates:[{lines:[{fromSku:'LINEN',sku:'HEMP',quantity:1}]}]}})
  proposals.push(first)
  const withdrawn=await command('proposal.withdraw',{id:first.saved.id,number:first.saved.number,revision:first.saved.revision,reason:'Owner withdraws the unexecuted basket before requesting its next preparation revision.'})
  assert.equal(withdrawn.state,'superseded')
  const revised=await once({name:first.name,token:first.token,mode,
   args:{...proposalArgs,id:withdrawn.id,number:withdrawn.number,revision:withdrawn.revision,runId:'synthetic-barrow-'+phase+'-'+mode+'-revised',idempotency_key:randomUUID()},changed:{candidates:[{lines:[{fromSku:'LINEN',sku:'HEMP',quantity:1}]}]}})
  proposals.push(revised)
 }

 const revised=await command('substitution.propose',{orderId:original.id,orderRevision:original.revision,lines:[{fromSku:'LINEN',sku:'HEMP',quantity:2}],reason:'Person reviews an unaccepted alternative; no replacement or stock effect.'})
 assert.notEqual(revised.revision,original.revision)
 await replayAfterSourceChange(proposals,revised.revision)
 await stale('barrow.proposals.submit',{...proposalArgs,runId:'synthetic-barrow-stale'},proposalGrant.token,revised.revision)
 console.log('NATIVE PASS '+phase+' lost-response and concurrent recovery for both existing mutating tools; current-revision conflicts leave native preparation unchanged')
}
