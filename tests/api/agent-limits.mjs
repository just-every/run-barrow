import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {captureAgents} from '../agent-door/screens.mjs'

const decision=answer=>answer.body.result?._meta?.['com.runeditrun/decision']
const errorCode=answer=>answer.body.result?._meta?.['com.runeditrun/error']?.code??answer.body.error?.data?.code
export function limitClient({request,origin,cookie}) {
 const personHeaders={Cookie:cookie,Origin:origin,'Content-Type':'application/json'}
 const person=async(path,body,method=body===undefined?'GET':'POST')=>{
  const response=await request(origin+path,{method,headers:personHeaders,...(body===undefined?{}:{body:JSON.stringify(body)})})
  assert.equal(response.status,200,path);return response.json()
 }
 const rpc=async(token,method,params={})=>{
  const response=await request(origin+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','MCP-Protocol-Version':'2026-07-28','Mcp-Method':method,...(params.name?{'Mcp-Name':params.name}:{})},body:JSON.stringify({jsonrpc:'2.0',id:randomUUID(),method,params:{...params,_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28'}}})})
  return {status:response.status,retryAfter:response.headers.get('retry-after'),body:await response.json()}
 }
 return {person,rpc}
}

/** Use the discovered production window; no clock, capacity or storage override. */
export async function proveRequestCapacity(context) {
 const {person,rpc}=limitClient(context)
 const limited=await person('/api/barrow/agent-token',{}),peer=await person('/api/barrow/agent-token',{})
 const discovered=await rpc(limited.token,'server/discover')
 assert.equal(discovered.status,200)
 const capacity=discovered.body.result._meta['com.runeditrun/limits'].requestsPerMinute
 assert.ok(Number.isSafeInteger(capacity)&&capacity>0)
 const before=await person('/api/barrow/state')
 let refusal,attempted=0
 // Two windows allow a real minute boundary without relying on time of day.
 while(!refusal&&attempted<2*capacity+1) {
  const batch=await Promise.all(Array.from({length:Math.min(24,2*capacity+1-attempted)},()=>rpc(limited.token,'tools/list')))
  attempted+=batch.length
  for(const answer of batch) {
   if(answer.status===429){assert.equal(errorCode(answer),'rate_limited');assert.ok(Number(answer.retryAfter)>0);refusal=answer}
   else {assert.equal(answer.status,200);assert.ok(answer.body.result.tools.some(tool=>tool.name==='barrow.orders.prepare'))}
  }
 }
 assert.ok(refusal,'The discovered request capacity must refuse an overrun')
 const independent=await rpc(peer.token,'tools/list')
 assert.equal(independent.status,200);assert.ok(independent.body.result.tools.length>0)
 assert.deepEqual(await person('/api/barrow/state'),before,'Capacity refusal leaves commercial records and the person session unchanged')
 console.log('PROBE BASE-AGENT-011 capacity: /mcp tools/list over discovered '+capacity+' requests per minute -> HTTP 429, positive Retry-After, unchanged native state, peer and person still admitted')
}

/** Isolate each policy from every other journey's usage and commercial records. */
export async function proveDailyItemLimits({pier,products}) {
 const {installation,accountValue}=await import('./harness.mjs')
 for(const fallback of ['blocked','approval']) {
  const h=await installation({built:true,bindings:{PIER_ORIGIN:pier.origin,PIER_SESSION:pier.cookie}})
  try {
   const context={origin:h.origin,cookie:h.cookie,request:(url,init)=>h.raw(url.slice(h.origin.length),init)}
   const {person,rpc}=limitClient(context)
   const value=accountValue(products.customer.id)
   await h.command('account.save',{id:'capacity-account',value:{...value,minimumCents:0,prices:value.prices.map(price=>({...price,units:[{code:'double',baseQuantity:'2',unitCents:12500,packContents:'Two cases'}]}))}})
   // Forecast windows move with the real clock; all other Pier state is retained.
   const stockWitness=({forecasts,...state})=>state
   const pierBefore=stockWitness(await pier.api('/api/pier/state')),before=await person('/api/barrow/state')
   const expectedCounts={autonomous:0,[fallback]:0}
   const setPolicy=async(agent,max=1)=>{
    const document={schema:'rer-agent-policy/1',catalogue:'rer-agent-classes/1',rules:[
     {id:'daily-native-items',class:'standard',seed:'barrow',agent,max,max_per_day:3,do:'autonomous'},
     {id:'past-allowance',class:'standard',do:fallback,...(fallback==='approval'?{approver:['role:owner'],wait:'P1D'}:{})}
    ],spend:{none:true}}
    const adopted=await person('/agents/api/policy',{document},'PUT')
    assert.equal(adopted.complete,true);assert.deepEqual((await person('/agents/api/policy')).document,document)
    return document
   }
   const fresh=async()=>{
    // Listing registers the credential, without consuming business usage.
    const {token}=await person('/api/barrow/agent-token',{})
    const prior=new Set((await person('/agents/api/agents')).agents.map(row=>row.id))
    assert.equal((await rpc(token,'tools/list')).status,200)
    const added=(await person('/agents/api/agents')).agents.filter(row=>!prior.has(row.id))
    assert.equal(added.length,1);return {token,id:added[0].id}
   }
   const args=()=>({accountId:'capacity-account',lines:[{sku:'OAT-1',quantity:2}],reference:'Daily native item proof',idempotency_key:randomUUID()})
   const call=(agent,input)=>rpc(agent.token,'tools/call',{name:'barrow.orders.prepare',arguments:input})
   const allowed=(answer,lines=[{sku:'OAT-1',quantity:2}],totalCents=13000)=>{
    assert.equal(answer.status,200);assert.equal(answer.body.result.isError,false)
    assert.equal(decision(answer).disposition,'autonomous')
    const order=answer.body.result.structuredContent
    assert.equal(order.status,'draft');assert.equal(order.totalCents,totalCents)
    assert.equal(order.lines.length,lines.length)
    assert.deepEqual(order.lines.map(({sku,unit,quantity})=>({sku,unit,quantity})),lines.map(line=>({unit:'case',...line})))
    expectedCounts.autonomous++;return order
   }
   const held=answer=>{
    assert.equal(answer.status,200);assert.equal(decision(answer).disposition,fallback)
    if(fallback==='blocked'){assert.equal(errorCode(answer),'policy_blocked');assert.equal(answer.body.result.isError,true)}
    else {assert.equal(answer.body.result.resultType,'input_required');assert.ok(answer.body.result._meta['com.runeditrun/approval'].id)}
    assert.equal(answer.body.result.structuredContent,undefined);expectedCounts[fallback]++
   }
   const agent=await fresh();await setPolicy(agent.id)
   const firstArgs=args(),first=allowed(await call(agent,firstArgs))
   const replay=allowed(await call(agent,firstArgs));assert.deepEqual(replay,first)
   const admitted=[first,allowed(await call(agent,args())),allowed(await call(agent,args()))]
   held(await call(agent,args()))
   let state=await person('/api/barrow/state')
   assert.deepEqual(state.orders.map(row=>row.id).sort(),admitted.map(row=>row.id).sort())
   console.log('PROBE BASE-AGENT-011 daily '+fallback+': owner policy and /mcp -> three one-item drafts, fourth '+fallback+', replay adds no draft or allowance usage')
   // The same one-item call also exceeds an explicit zero per-call allowance.
   await setPolicy(agent.id,0);held(await call(agent,args()))
   assert.deepEqual((await person('/api/barrow/state')).orders,state.orders)
   const concurrent=await fresh();await setPolicy(concurrent.id)
   const answers=await Promise.all(Array.from({length:6},()=>call(concurrent,args())))
   const completed=[]
   for(const answer of answers) {
    if(answer.body.result?.structuredContent)completed.push(allowed(answer))
    else held(answer)
   }
   assert.equal(completed.length,3,'Concurrent calls share the daily allowance')
   state=await person('/api/barrow/state')
   assert.deepEqual(state.orders.map(row=>row.id).sort(),[...admitted,...completed].map(row=>row.id).sort())
   assert.equal(new Set(state.orders.map(row=>row.id)).size,6)
   const commercial=value=>{const {orders,orderPage,waitingDraft,...rest}=value;return rest}
   assert.deepEqual(commercial(state),commercial(before))
   assert.ok(state.orders.some(row=>row.id===state.waitingDraft.id))
   assert.ok(state.orders.every(row=>row.status==='draft'&&!row.invoice&&!row.submittedBy&&!row.approvedBy&&!row.pierOrderId))
   assert.deepEqual(stockWitness(await pier.api('/api/pier/state')),pierBefore,'Draft preparation never reserves stock or issues an inventory command')
   const audits=await person('/agents/api/audit')
   assert.equal(audits.differs_from_policy,0)
   const rows=audits.rows.filter(row=>row.tool==='barrow.orders.prepare')
   assert.equal(rows.filter(row=>row.outcome==='done').length,6)
   assert.equal(rows.filter(row=>row.outcome==='replayed').length,1)
   assert.equal(rows.filter(row=>row.outcome===(fallback==='approval'?'pending':'refused')).length,5)
   assert.equal(rows.length,12)
   for(const row of rows) {
    assert.ok([agent.id,concurrent.id].includes(row.agent.id))
    assert.equal(row.classes.length,1);assert.equal(row.classes[0].class,'standard');assert.equal(row.classes[0].facts.measure,1)
   }
   // A real two-line draft distinguishes item measures from request counts,
   // unit quantities and commercial value, without another stock authority.
   const pair=[{sku:'OAT-1',quantity:2},{sku:'OAT-1',unit:'double',quantity:1}]
   const measured=await fresh();await setPolicy(measured.id)
   held(await call(measured,{...args(),lines:pair}))
   assert.deepEqual((await person('/api/barrow/state')).orders,state.orders,'Per-call refusal creates neither line of a draft')
   await setPolicy(measured.id,2)
   const invalid=await call(measured,{...args(),lines:[{sku:'OAT-1',unit:'unknown',quantity:2}]})
   assert.equal(invalid.status,200);assert.equal(invalid.body.result.isError,true)
   assert.equal(errorCode(invalid),'UNIT');assert.equal(decision(invalid).disposition,'autonomous')
   expectedCounts.autonomous++
   assert.deepEqual((await person('/api/barrow/state')).orders,state.orders,'Native validation refusal creates no draft')
   const one=args(),single=allowed(await call(measured,one))
   assert.deepEqual(allowed(await call(measured,one)),single)
   const two=allowed(await call(measured,{...args(),lines:pair}),pair,25500)
   held(await call(measured,args()))
   let extended=await person('/api/barrow/state')
   assert.deepEqual(extended.orders.map(row=>row.id).sort(),[...admitted,...completed,single,two].map(row=>row.id).sort())
   console.log('PROBE BASE-AGENT-011 measured '+fallback+': two-line call exceeds max 1 with no draft; invalid unit consumes no allowance; one-line call, identical replay and two-line call fill exactly three items; next call '+fallback)
   const racing=await fresh();await setPolicy(racing.id,2)
   const raced=await Promise.all(Array.from({length:6},()=>call(racing,{...args(),lines:pair})))
   const winners=[]
   for(const answer of raced) {
    if(answer.body.result?.structuredContent)winners.push(allowed(answer,pair,25500))
    else held(answer)
   }
   assert.equal(winners.length,1,'Concurrent two-line calls cannot partially consume the last item or exceed three')
   const remainder=allowed(await call(racing,args()))
   held(await call(racing,args()))
   extended=await person('/api/barrow/state')
   const all=[...admitted,...completed,single,two,...winners,remainder]
   assert.deepEqual(extended.orders.map(row=>row.id).sort(),all.map(row=>row.id).sort())
   assert.equal(new Set(extended.orders.map(row=>row.id)).size,10)
   assert.deepEqual(commercial(extended),commercial(before))
   assert.ok(extended.orders.every(row=>row.status==='draft'&&!row.invoice&&!row.submittedBy&&!row.approvedBy&&!row.pierOrderId))
   assert.deepEqual(stockWitness(await pier.api('/api/pier/state')),pierBefore)
   const finalAudit=await person('/agents/api/audit')
   assert.equal(finalAudit.differs_from_policy,0)
   const finalRows=finalAudit.rows.filter(row=>row.tool==='barrow.orders.prepare')
   assert.equal(finalRows.filter(row=>row.outcome==='done').length,10)
   assert.equal(finalRows.filter(row=>row.outcome==='replayed').length,2)
   assert.equal(finalRows.filter(row=>row.code==='UNIT').length,1)
   for(const credential of [agent,concurrent,measured,racing]) {
    const own=(await person('/agents/api/audit?agent='+encodeURIComponent(credential.id))).rows
    assert.ok(own.length);assert.ok(own.every(row=>row.agent.id===credential.id))
    assert.deepEqual(own,finalRows.filter(row=>row.agent.id===credential.id))
    assert.equal(own.filter(row=>row.outcome==='done').reduce((sum,row)=>sum+row.classes[0].facts.measure,0),3,'Each credential admits exactly its three-item allowance')
   }
   await captureAgents({...context,limits:{name:'limits-'+fallback,counts:expectedCounts}})
   console.log('PROBE BASE-AGENT-011 concurrency '+fallback+': six simultaneous two-line calls -> one two-line draft, five '+fallback+'; final one-line call fits; next call '+fallback+'; ten native drafts and per-agent audit reconcile; Agents class counts '+JSON.stringify(expectedCounts))
  }finally{await h.close()}
 }
}
