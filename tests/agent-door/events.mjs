import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'

const content=answer=>{
 assert.equal(answer.status,200)
 assert.ok(!answer.result?.isError)
 assert.ok(Array.isArray(answer.result?.structuredContent?.events))
 return answer.result.structuredContent
}
export async function retainedEvents(tool) {
 const events=[];let after
 for(let page=0;page<100;page++) {
  const result=content(await tool('barrow.events.list',{limit:200,...(after?{after}:{})}))
  events.push(...result.events)
  if(result.events.length<200)return {events,cursor:result.cursor}
  assert.notEqual(result.cursor,after);after=result.cursor
 }
 assert.fail('Retained event pagination did not terminate')
}

/** The same native commands used by the UI publish only retained record identity. */
export async function proveNativeChanges({request,origin,cookie,tool}) {
 const headers={Cookie:cookie,Origin:origin,'Content-Type':'application/json'}
 const native=async(path,body)=>{
  const response=await request(origin+path,{method:body?'POST':'GET',headers,...(body?{body:JSON.stringify(body)}:{})})
  assert.ok(response.ok,'Native event fixture HTTP '+response.status)
  return response.json()
 }
 const command=async(type,payload)=>(await native('/api/barrow/commands',{type,payload})).result
 const person=(await native('/api/barrow/state')).actor
 const account=await command('account.save',{id:'event-native',value:{name:'Native event market',email:person.email.replace('@','+events@'),pierCustomerId:'juniper',termsDays:30,minimumCents:0,currency:'USD',prices:[{sku:'LINEN',unitCents:2400,minQty:1}]},actor:{id:'synthetic-barrow-1'}})
 const draft=await command('order.prepare',{accountId:account.id,lines:[{sku:'LINEN',quantity:1}],reference:'Private native draft body',actor:{id:'synthetic-barrow-1'}})
 let shared=await command('list.save',{accountId:account.id,name:'Private native list body',shared:true,lines:[{sku:'LINEN',quantity:'1'}]})
 const first=await retainedEvents(tool)
 for(const [type,uri,revision] of [
  ['account.saved','barrow://accounts/'+account.id,account.revision],
  ['catalog.changed','barrow://catalogs/'+account.id,account.revision],
  ['order.prepared','barrow://orders/'+draft.id,draft.revision],
  ['list.saved','barrow://lists/'+shared.id,shared.revision]
 ]) {
  const matches=first.events.filter(event=>event.type===type&&event.uri===uri)
  assert.equal(matches.length,1)
  assert.equal(matches[0].revision,revision)
  assert.equal(matches[0].actor.kind,'person');assert.equal(matches[0].actor.person.id,person.id)
  assert.notEqual(matches[0].actor.person.id,'synthetic-barrow-1')
  assert.ok(Number.isFinite(Date.parse(matches[0].at)))
  assert.equal(JSON.stringify(matches).includes('Private native'),false)
 }
 const submitted=await command('order.submit',{orderId:draft.id})
 assert.equal(submitted.status,'submitted')
 const after=await retainedEvents(tool),changed=after.events.filter(event=>event.uri==='barrow://orders/'+draft.id)
 assert.deepEqual(changed.map(event=>event.type),['order.prepared','order.submitted'])
 assert.equal(changed[1].revision,submitted.revision)
 await command('order.submit',{orderId:draft.id})
 assert.deepEqual((await retainedEvents(tool)).events,after.events,'A no-change retry produces no record-change event')
 const cursor=changed[0].id
 const resumed=content(await tool('barrow.events.list',{after:cursor,limit:200}))
 assert.deepEqual(resumed,content(await tool('barrow.events.list',{after:cursor,limit:200})))
 assert.ok(resumed.events.some(event=>event.id===changed[1].id))

 // One guarded edit wins; the refused stale edit must not publish an event.
 const edits=await Promise.all(['2','3'].map(quantity=>request(origin+'/api/barrow/commands',{method:'POST',headers,body:JSON.stringify({type:'list.save',payload:{listId:shared.id,revision:shared.revision,lines:[{sku:'LINEN',quantity}]}})})))
 assert.deepEqual(edits.map(response=>response.status).sort(),[200,409])
 for(const response of edits){const value=await response.json();if(response.ok)shared=value.result}
 const edited=(await retainedEvents(tool)).events.filter(event=>event.uri==='barrow://lists/'+shared.id)
 assert.equal(edited.length,2);assert.equal(edited.at(-1).revision,shared.revision)
 const hidden=await command('list.save',{listId:shared.id,revision:shared.revision,shared:false})
 const filtered=await retainedEvents(tool)
 assert.equal(JSON.stringify(filtered).includes(shared.id),false,'Making the list private withholds all earlier event ids and URIs')
 const privateList=await command('list.save',{accountId:account.id,name:'Never shared',shared:false,lines:[{sku:'LINEN',quantity:'1'}]})
 assert.equal(JSON.stringify(await retainedEvents(tool)).includes(privateList.id),false)
 shared=await command('list.save',{listId:shared.id,revision:hidden.revision,shared:true})
 assert.ok((await retainedEvents(tool)).events.some(event=>event.uri==='barrow://lists/'+shared.id))
 await command('list.delete',{listId:shared.id,revision:shared.revision})
 const removed=await retainedEvents(tool)
 assert.equal(JSON.stringify(removed).includes(shared.id),false,'A removed native resource reveals neither its retained ids nor a cursor')
 assert.equal(JSON.stringify(removed).includes(privateList.id),false)
 assert.ok(removed.events.some(event=>event.uri==='barrow://orders/'+draft.id))
 console.log('PROBE BASE-AGENT-010 native changes: public account, draft, submission and list commands -> exact revisions, native person actors, stable replay, one concurrent edit, private and deleted records withheld')
}

/** The descriptor runs these real writes under both autonomous and held policy. */
export async function proveEventStep({phase,step,result,args,tool,database}) {
 if(!['autonomous','held'].includes(phase)||!['prepare','proposal'].includes(step.id))return
 const type=step.id==='prepare'?'order.prepared':'proposal.submitted'
 const uri='barrow://'+(step.id==='prepare'?'orders':'proposals')+'/'+result.id
 const db=await database('DB')
 const stored=(await db.prepare('SELECT event FROM agent_door_events WHERE uri=? ORDER BY sequence').bind(uri).all()).results.map(row=>JSON.parse(row.event))
 const {events}=await retainedEvents(tool),matching=events.filter(event=>event.uri===uri&&event.type===type)
 assert.equal(matching.length,1,'A successful native preparation retains one record-change event')
 const event=matching[0]
 assert.deepEqual(event,stored.find(row=>row.id===event.id),'Deliver the original retained event without rewriting identity or actor')
 assert.equal(event.actor.kind,'agent')
 assert.equal(event.actor.label,typeof result.preparedBy==='string'?result.preparedBy:result.preparedBy.label)
 assert.ok(event.actor.agent.id);assert.ok(event.actor.for.id)
 assert.ok(Number.isFinite(Date.parse(event.at)))
 const repeated=await tool(step.tool,args)
 assert.ok(!repeated.result.isError);assert.deepEqual(repeated.result.structuredContent,result)
 const replayed=await retainedEvents(tool)
 assert.deepEqual(replayed.events.filter(row=>row.uri===uri&&row.type===type),matching,'Successful replay emits no second record change')
 const position=events.findIndex(row=>row.id===event.id)
 if(position>0) {
  const after=events[position-1].id
  const first=content(await tool('barrow.events.list',{after,limit:2}))
  const second=content(await tool('barrow.events.list',{after,limit:2}))
  assert.deepEqual(first,second);assert.equal(first.events[0].id,event.id)
 }
 console.log('PROBE BASE-AGENT-010 '+phase+' '+type+': public MCP preparation and replay -> original event, server actor, one change and stable cursor order')
}

/** Native grants keep their existing scopes, including the proposal-only refusal. */
export async function proveEventAdmission({request,origin,cookie,tool,local}) {
 const headers={Cookie:cookie,Origin:origin,'Content-Type':'application/json'}
 async function native(path,body) {
  const response=await request(origin+path,{method:body?'POST':'GET',headers,...(body?{body:JSON.stringify(body)}:{})})
  assert.ok(response.ok,'Event fixture native HTTP '+response.status)
  return response.json()
 }
 const state=await native('/api/barrow/state')
 const source=state.orders.find(order=>order.status==='approved')
 assert.ok(source)
 const issued=await native('/api/barrow/proposal-grants',{accountId:source.accountId,costLimitCents:0,contactLimit:3,approvedSubstitutes:[{fromSku:'LINEN',skus:['HEMP']}],consent:true,reason:'Owner authorizes this bounded event visibility proof.'})
 const refused=await local('tools/call',{name:'barrow.events.list',arguments:{limit:200}},issued.token)
 assert.equal(refused.status,403)
 assert.equal(refused.body.error.data.code,'insufficient_scope')
 assert.equal(refused.body.result,undefined)
 const args={grantId:issued.grant.id,orderId:source.id,model:'synthetic-barrow-1',runId:'synthetic-barrow-2',reportedCostCents:0,candidates:[{lines:[{fromSku:'LINEN',sku:'HEMP',quantity:2}]}],idempotency_key:randomUUID()}
 const prepared=await tool('barrow.proposals.submit',args)
 assert.ok(!prepared.result.isError)
 const uri='barrow://proposals/'+prepared.result.structuredContent.id
 const visible=await retainedEvents(tool),event=visible.events.find(row=>row.uri===uri)
 assert.ok(event)
 // A draft grant already has events:read, but no proposal read authority.
 const draft=await native('/api/barrow/agent-token',{})
 const draftRead=await local('tools/call',{name:'barrow.events.list',arguments:{after:visible.events[0].id,limit:200}},draft.token)
 assert.equal(draftRead.status,200)
 const scoped=draftRead.body.result.structuredContent
 assert.ok(scoped.events.some(row=>row.type==='order.prepared'),'The scoped client still receives readable native records')
 assert.equal(scoped.cursor,scoped.events.at(-1).id)
 assert.equal(JSON.stringify(scoped).includes(event.id),false)
 assert.equal(JSON.stringify(scoped).includes(uri),false)
 assert.notEqual(scoped.cursor,event.id,'Invisible records cannot become a cursor')
 await native('/api/barrow/proposal-grants/revoke',{grantId:issued.grant.id,revision:issued.grant.revision,reason:'Owner withdraws event fixture authority.'})
 const filtered=await retainedEvents(tool)
 assert.equal(JSON.stringify(filtered).includes(event.id),false)
 assert.equal(JSON.stringify(filtered).includes(uri),false)
 const tail=content(await tool('barrow.events.list',{after:visible.cursor,limit:200}))
 assert.deepEqual(tail,{events:[],cursor:visible.cursor})
 await native('/agents/api/pause',{paused:true})
 const paused=await local('tools/call',{name:'barrow.events.list',arguments:{}},draft.token)
 assert.equal(paused.body.result._meta['com.runeditrun/error'].code,'agents_paused')
 await native('/agents/api/pause',{paused:false})
 await native('/api/barrow/agent-token/revoke',{})
 assert.equal((await local('tools/call',{name:'barrow.events.list',arguments:{}},draft.token)).status,401)
 console.log('PROBE BASE-AGENT-010 admission: public grants and MCP -> missing scope, unreadable proposal, withdrawn grant, Pause and revocation disclose no event or hidden cursor')
}

/** Exercise existing person decision events through a fresh standalone door. */
export async function proveDecisionEvents() {
 const {installation}=await import('../api/harness.mjs')
 const edge=(await import('./pier-edge.mjs')).default
 const session='synthetic-barrow-3'
 const h=await installation({bindings:{PIER_ORIGIN:'https://rer-hosted-check.invalid',PIER_SESSION:session},networkEdge:request=>edge.fetch(request,{fixture:{cookie:session}})})
 try {
  console.log('NATIVE decision fixture initialized')
  const person=(await h.api('/api/barrow/state')).actor
  await h.command('account.save',{id:'juniper',value:{name:'Event review market',email:person.email,pierCustomerId:'juniper',termsDays:30,minimumCents:0,currency:'USD',prices:[{sku:'LINEN',unitCents:2400,minQty:1}]}})
  console.log('NATIVE decision account prepared')
  const grant=await h.api('/api/barrow/agent-token',{})
  const call=async(name,args)=>(await h.api('/mcp',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args,_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28'}}},{headers:{authorization:'Bearer '+grant.token,'MCP-Protocol-Version':'2026-07-28','Mcp-Method':'tools/call','Mcp-Name':name}}))
  const policy=async rules=>h.api('/agents/api/policy',{document:{schema:'rer-agent-policy/1',catalogue:'rer-agent-classes/1',rules,reviewers:['sponsor'],spend:{none:true}}},{method:'PUT'})
  await policy([{id:'approval',class:'*',do:'approval',approver:['sponsor'],wait:'PT1H'}])
  const before=(await h.api('/api/barrow/state')).orders
  const args={accountId:'juniper',lines:[{sku:'LINEN',quantity:1}],idempotency_key:randomUUID()}
  console.log('NATIVE decision policy adopted')
  const pending=await call('barrow.orders.prepare',args),handle=pending.result._meta['com.runeditrun/approval']
  assert.ok(handle?.id);assert.deepEqual((await h.api('/api/barrow/state')).orders,before)
  const {approval}=await h.api('/agents/api/approvals/'+handle.id)
  const decided=await h.api('/agents/api/approvals/'+handle.id+'/approve',{revision:approval.revision,summary_sha256:approval.summary_sha256})
  assert.equal(decided.approval.state,'executed')
  const replay=await call('barrow.orders.prepare',args)
  assert.ok(!replay.result.isError)
  assert.equal((await h.api('/api/barrow/state')).orders.length,before.length+1)
  const refused=await call('barrow.orders.prepare',{...args,idempotency_key:randomUUID()})
  const rejectedId=refused.result._meta['com.runeditrun/approval'].id
  const rejectedView=(await h.api('/agents/api/approvals/'+rejectedId)).approval
  await h.api('/agents/api/approvals/'+rejectedId+'/reject',{revision:rejectedView.revision,summary_sha256:rejectedView.summary_sha256})
  assert.equal((await h.api('/api/barrow/state')).orders.length,before.length+1)
  await policy([{id:'review',class:'*',do:'review'}])
  const listed=await call('barrow.events.list',{limit:200}),events=listed.result.structuredContent.events
  for(const [type,kind] of [['approval.pending','agent'],['approval.decided','person']]) {
   const event=events.find(event=>event.type===type&&event.uri===h.origin+'/agents/approvals/'+handle.id)
   assert.ok(event);assert.equal(event.actor.kind,kind)
   assert.deepEqual(event.classes,[{class:'standard',facts:{measure:1}}])
   if(kind==='person'){assert.equal(event.actor.person.id,person.id);assert.equal(event.state,'executed');assert.equal(event.decision,'approval')}
  }
  assert.ok(events.some(event=>event.type==='approval.decided'&&event.uri.endsWith(rejectedId)&&event.state==='rejected'))
  const review=(await h.api('/agents/api/reviews')).reviews.find(review=>review.tool==='barrow.events.list')
  assert.ok(review)
  await h.api('/agents/api/reviews/'+review.id+'/flag',{})
  const flagged=(await call('barrow.events.list',{limit:200})).result.structuredContent.events.find(event=>event.type==='review.flagged'&&event.uri.endsWith(review.id))
  assert.ok(flagged);assert.equal(flagged.actor.kind,'person');assert.equal(flagged.actor.person.id,person.id)
  assert.deepEqual(flagged.classes,[{class:'standard',facts:{measure:1}}])
  console.log('PROBE BASE-AGENT-010 decisions: public native policy, approval and review doors -> pending, approved, rejected and flagged events retain actors and computed classes')
 } finally {await h.close()}
}
