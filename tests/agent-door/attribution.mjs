import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'

const preparations=[]
const nativeHeaders=({origin,cookie})=>({Cookie:cookie,Origin:origin,'Content-Type':'application/json'})
async function read(ctx,path) {
 const response=await ctx.request(ctx.origin+path,{headers:nativeHeaders(ctx)})
 assert.equal(response.status,200,path)
 return response.json()
}

/** The same native outcomes are inspected during autonomous and held MCP journeys. */
export async function attributionStep(ctx) {
 const {step,result,phase,args,tool}=ctx
 if(!['barrow.orders.prepare','barrow.proposals.submit'].includes(step.tool))return
 const provenance=step.tool==='barrow.orders.prepare'?result.agentPreparation:result.preparedBy
 assert.ok(provenance,'Preparation must carry server-owned identities')
 const db=await ctx.database('DB')
 const registered=await db.prepare('SELECT id,sponsor,name,sponsor_name FROM agent_door_agents WHERE id=?').bind(provenance.agent).first()
 const owner=(await read(ctx,'/api/barrow/state')).actor
 assert.equal(provenance.person,owner.id)
 assert.equal(registered.sponsor,owner.id)
 assert.equal(provenance.label,registered.name+' for Juniper wholesale owner')
 if(step.tool==='barrow.orders.prepare')assert.equal(result.preparedBy,provenance.label)
 const action=step.tool==='barrow.orders.prepare'?'order.prepared':'proposal.submitted'
 const page=await read(ctx,'/api/barrow/audit?'+new URLSearchParams({person:provenance.label}))
 const event=page.events.find(row=>row.subjectId===result.id&&row.action===action)
 assert.ok(event,'Recorded agent label must be searchable')
 assert.equal(event.actorId,'agent:'+provenance.agent);assert.equal(event.actorKind,'agent')
 assert.equal(event.actorName,provenance.label)
 assert.equal(event.agentId,provenance.agent);assert.equal(event.sponsorId,provenance.person)
 const exported=await read(ctx,'/api/barrow/export.json')
 const exportedEvent=exported.audit.find(row=>row.id===event.id)
 assert.equal(exportedEvent.actorName,provenance.label)
 assert.equal(exportedEvent.agentId,provenance.agent);assert.equal(exportedEvent.sponsorId,provenance.person)
 if(step.tool==='barrow.orders.prepare') {
  const row=exported.orders.find(row=>row.id===result.id)
  assert.equal(row.preparedBy,result.preparedBy)
  assert.deepEqual(JSON.parse(row.agentPreparation),provenance)
 }
 const auditCsv=await ctx.request(ctx.origin+'/api/barrow/audit.csv?'+new URLSearchParams({person:provenance.label}),{headers:nativeHeaders(ctx)})
 assert.equal(auditCsv.status,200);assert.ok((await auditCsv.text()).includes(provenance.label))
 const commercialCsv=await ctx.request(ctx.origin+'/api/barrow/export/audit.csv',{headers:nativeHeaders(ctx)})
 assert.equal(commercialCsv.status,200)
 const [columns,...rows]=(await commercialCsv.text()).trim().split('\r\n').map(line=>line.slice(1,-1).split('","'))
 const csvRow=rows.find(row=>row[columns.indexOf('id')]===event.id)
 assert.ok(csvRow,'Export must include the actual preparation event')
 const csvEvent=Object.fromEntries(columns.map((key,index)=>[key,csvRow[index]]))
 assert.equal(csvEvent.agentId,provenance.agent);assert.equal(csvEvent.sponsorId,provenance.person)
 assert.equal(csvEvent.actorName,provenance.label)
 const replay=await tool(step.tool,args)
 assert.deepEqual(replay.result.structuredContent,result)
 const before=(await read(ctx,'/api/barrow/export.json')).manifest.counts
 const forged=await tool(step.tool,{...args,preparedBy:'Synthetic impostor',agentPreparation:{agent:'synthetic-barrow-forged',person:owner.id,label:'Synthetic impostor for Juniper wholesale owner'}})
 assert.deepEqual(forged.result.structuredContent,result,'Caller identity fields must not change recorded preparation')
 assert.deepEqual((await read(ctx,'/api/barrow/export.json')).manifest.counts,before)
 if(step.tool==='barrow.orders.prepare') {
  const hostile=await tool(step.tool,{...args,idempotency_key:randomUUID(),preparedBy:'Synthetic impostor',agentPreparation:{agent:'synthetic-barrow-forged',person:'synthetic-barrow-forged-person',label:'Synthetic impostor'},submittedBy:owner.id,approvedBy:owner.id,confirmed:true,approved:true})
  const fresh=hostile.result.structuredContent
  assert.ok(!hostile.result.isError)
  assert.deepEqual(fresh.agentPreparation,provenance)
  assert.equal(fresh.preparedBy,provenance.label);assert.equal(fresh.status,'draft')
  assert.equal(fresh.submittedBy,undefined);assert.equal(fresh.approvedBy,undefined)
  assert.deepEqual(hostile.decision.classes,replay.decision.classes)
  assert.equal(hostile.decision.disposition,replay.decision.disposition)
 }
 preparations.push({phase,tool:step.tool,result,provenance,eventId:event.id})
 console.log('PROBE BASE-AGENT-008 '+phase+' '+step.id+': MCP preparation -> exact registered agent for sponsor, attributed audit and export, one-effect replay and hostile identity ignored')
}

export async function proveHumanAttribution(ctx) {
 for(const phase of ['autonomous','held'])for(const tool of ['barrow.orders.prepare','barrow.proposals.submit'])
  assert.ok(preparations.some(row=>row.phase===phase&&row.tool===tool),'Both policies must prepare each native job')
 const owner=(await read(ctx,'/api/barrow/state')).actor
 const reviewer=(await read({...ctx,cookie:ctx.reviewer.cookie},'/api/barrow/state')).actor
 assert.notEqual(reviewer.id,owner.id,'A different signed-in person must own their own decisions')
 async function command(type,payload,cookie=ctx.cookie) {
  const response=await ctx.request(ctx.origin+'/api/barrow/commands',{method:'POST',headers:nativeHeaders({...ctx,cookie}),body:JSON.stringify({type,payload})})
  const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));return body.result
 }
 const proposal=preparations.find(row=>row.tool==='barrow.proposals.submit'&&row.phase==='held')
 const offered=await command('proposal.offer',{id:proposal.result.id,number:proposal.result.number,revision:proposal.result.revision,candidate:0,reason:'Signed-in manager reviewed this exact native basket.'},ctx.reviewer.cookie)
 assert.equal(offered.managerApproval.by,reviewer.id)
 assert.deepEqual(offered.preparedBy,proposal.provenance)
 const draft=preparations.find(row=>row.tool==='barrow.orders.prepare'&&row.phase==='autonomous')
 await command('order.submit',{orderId:draft.result.id})
 const approved=await command('order.approve',{orderId:draft.result.id},ctx.reviewer.cookie)
 assert.equal(approved.submittedBy,owner.id);assert.equal(approved.approvedBy,reviewer.id)
 assert.equal(approved.preparedBy,draft.result.preparedBy)
 assert.deepEqual(approved.agentPreparation,draft.provenance)
 const audit=(await read(ctx,'/api/barrow/audit?'+new URLSearchParams({orderId:approved.id}))).events
 for(const action of ['order.submitted','order.approved']) {
  const event=audit.find(row=>row.action===action)
  const person=action==='order.approved'?reviewer:owner
  assert.equal(event.actorId,person.id);assert.equal(event.actorKind,'human')
  assert.equal(event.actorName,action==='order.approved'?'Avery stock operator':'Juniper wholesale owner')
  assert.equal(event.agentId,null);assert.equal(event.sponsorId,null)
 }
 const exported=await read(ctx,'/api/barrow/export.json'),row=exported.orders.find(row=>row.id===approved.id)
 assert.equal(row.submittedBy,owner.id);assert.equal(row.approvedBy,reviewer.id)
 assert.deepEqual(JSON.parse(row.agentPreparation),draft.provenance)
 const csv=await ctx.request(ctx.origin+'/api/barrow/export/orders.csv',{headers:nativeHeaders(ctx)})
 assert.equal(csv.status,200);assert.ok((await csv.text()).includes(draft.provenance.label))
 console.log('PROBE BASE-AGENT-008 human decisions: signed-in submission, approval and proposal offer -> person identities retained alongside agent preparation')
 await provePersonBoundary(ctx,{draft,proposal,owner})
 return {preparations,approved,offered}
}

/** Bearer credentials and form answers never become a signed-in person. */
async function provePersonBoundary(ctx,{draft,proposal,owner}) {
 const response=await ctx.request(ctx.origin+'/api/barrow/agent-token',{method:'POST',headers:nativeHeaders(ctx),body:'{}'})
 assert.equal(response.status,200)
 const {token}=await response.json()
 const headers={Authorization:'Bearer '+token,Origin:ctx.origin,'Content-Type':'application/json'}
 const before=await read(ctx,'/api/barrow/export.json')
 for(const [type,payload] of [
  ['order.submit',{orderId:draft.result.id}],
  ['order.approve',{orderId:draft.result.id}],
  ['proposal.offer',{id:proposal.result.id,number:proposal.result.number,revision:proposal.result.revision,candidate:0,reason:'Synthetic person confirmation'}],
  ['substitution.accept',{orderId:proposal.result.orderId,number:1,acknowledged:true}]
 ]) {
  const result=await ctx.request(ctx.origin+'/api/barrow/commands',{method:'POST',headers,body:JSON.stringify({type,payload:{...payload,approved:true,confirmed:true,person:owner.id,elicitation:{action:'accept'}}})})
  assert.equal(result.status,403,type)
  assert.equal((await result.json()).error.code,'PERSON_REQUIRED')
 }
 const reviews=await read(ctx,'/agents/api/reviews')
 const review=reviews.reviews.find(row=>row.state==='open')
 assert.ok(review,'Held preparation must create a real review to protect')
 const state=await read(ctx,'/agents/api/state')
 for(const [path,method,body] of [
  ['/agents/api/reviews/'+encodeURIComponent(review.id)+'/reviewed','POST',{}],
  ['/agents/api/approvals/synthetic-barrow-unavailable/approve','POST',{decision_id:'synthetic-barrow-unavailable',revision:1,summary_sha256:'synthetic-barrow-unavailable'}],
  ['/agents/api/policy','PUT',{document:{schema:'rer-agent-policy/1',catalogue:'rer-agent-classes/1',rules:[{id:'synthetic-barrow-confirmed',class:'*',do:'autonomous'}],spend:{none:true}}}]
 ]) {
  // Even a copied native cookie cannot turn an explicit bearer call into a person action.
  const result=await ctx.request(ctx.origin+path,{method,headers:{...headers,Cookie:ctx.cookie},body:JSON.stringify({...body,action:'accept',confirmed:true})})
  assert.equal(result.status,403,path)
  assert.equal((await result.json()).code,'person_session_required')
 }
 assert.deepEqual(await read(ctx,'/agents/api/reviews'),reviews)
 assert.deepEqual(await read(ctx,'/agents/api/state'),state)
 const after=await read(ctx,'/api/barrow/export.json')
 const {exportedAt:beforeTime,...beforeManifest}=before.manifest
 const {exportedAt:afterTime,...afterManifest}=after.manifest
 assert.deepEqual(afterManifest,beforeManifest)
 assert.deepEqual({...after,manifest:undefined},{...before,manifest:undefined})
 console.log('PROBE BASE-AGENT-008 person boundary: active bearer, forged confirmation and form accept -> submission, approval, offer, buyer decision, review and policy refused with no commercial change')
}
