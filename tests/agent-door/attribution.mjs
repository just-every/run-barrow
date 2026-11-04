import assert from 'node:assert/strict'

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
 const replay=await tool(step.tool,args)
 assert.deepEqual(replay.result.structuredContent,result)
 const before=(await read(ctx,'/api/barrow/export.json')).manifest.counts
 const forged=await tool(step.tool,{...args,preparedBy:'Synthetic impostor',agentPreparation:{agent:'synthetic-barrow-forged',person:owner.id,label:'Synthetic impostor for Juniper wholesale owner'}})
 assert.deepEqual(forged.result.structuredContent,result,'Caller identity fields must not change recorded preparation')
 assert.deepEqual((await read(ctx,'/api/barrow/export.json')).manifest.counts,before)
 preparations.push({phase,tool:step.tool,result,provenance,eventId:event.id})
 console.log('PROBE BASE-AGENT-008 '+phase+' '+step.id+': MCP preparation -> exact registered agent for sponsor, attributed audit and export, one-effect replay and hostile identity ignored')
}

export async function proveHumanAttribution(ctx) {
 for(const phase of ['autonomous','held'])for(const tool of ['barrow.orders.prepare','barrow.proposals.submit'])
  assert.ok(preparations.some(row=>row.phase===phase&&row.tool===tool),'Both policies must prepare each native job')
 const owner=(await read(ctx,'/api/barrow/state')).actor
 async function command(type,payload) {
  const response=await ctx.request(ctx.origin+'/api/barrow/commands',{method:'POST',headers:nativeHeaders(ctx),body:JSON.stringify({type,payload})})
  const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));return body.result
 }
 const proposal=preparations.find(row=>row.tool==='barrow.proposals.submit'&&row.phase==='held')
 const offered=await command('proposal.offer',{id:proposal.result.id,number:proposal.result.number,revision:proposal.result.revision,candidate:0,reason:'Signed-in manager reviewed this exact native basket.'})
 assert.equal(offered.managerApproval.by,owner.id)
 assert.deepEqual(offered.preparedBy,proposal.provenance)
 const draft=preparations.find(row=>row.tool==='barrow.orders.prepare'&&row.phase==='autonomous')
 await command('order.submit',{orderId:draft.result.id})
 const approved=await command('order.approve',{orderId:draft.result.id})
 assert.equal(approved.submittedBy,owner.id);assert.equal(approved.approvedBy,owner.id)
 assert.equal(approved.preparedBy,draft.result.preparedBy)
 assert.deepEqual(approved.agentPreparation,draft.provenance)
 const audit=(await read(ctx,'/api/barrow/audit?'+new URLSearchParams({orderId:approved.id}))).events
 for(const action of ['order.submitted','order.approved']) {
  const event=audit.find(row=>row.action===action)
  assert.equal(event.actorId,owner.id);assert.equal(event.actorKind,'human')
  assert.equal(event.actorName,'Juniper wholesale owner')
  assert.equal(event.agentId,null);assert.equal(event.sponsorId,null)
 }
 const exported=await read(ctx,'/api/barrow/export.json'),row=exported.orders.find(row=>row.id===approved.id)
 assert.equal(row.submittedBy,owner.id);assert.equal(row.approvedBy,owner.id)
 assert.deepEqual(JSON.parse(row.agentPreparation),draft.provenance)
 const csv=await ctx.request(ctx.origin+'/api/barrow/export/orders.csv',{headers:nativeHeaders(ctx)})
 assert.equal(csv.status,200);assert.ok((await csv.text()).includes(draft.provenance.label))
 console.log('PROBE BASE-AGENT-008 human decisions: signed-in submission, approval and proposal offer -> person identities retained alongside agent preparation')
 return {preparations,approved,offered}
}
