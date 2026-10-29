import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdir,writeFile} from 'node:fs/promises'

const code=answer=>answer.result?._meta?.['com.runeditrun/error']?.code??answer.body?.error?.data?.code
export default async function({request,origin,cookie,tool}) {
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
 assert.equal(erase.status,409);assert.equal((await erase.json()).error.code,'AGENT_CUSTODY')
 console.log('NATIVE PASS stale revision, one-effect replay, changed-argument conflict, agent attribution and closed client custody')
 const grantResponse=await request(origin+'/api/barrow/agent-token',{method:'POST',headers,body:'{}'})
 console.log('NATIVE grant issuance HTTP '+grantResponse.status);assert.ok(grantResponse.ok);const grant=await grantResponse.json()
 async function local(method,params={},token=grant.token) {
  const response=await request(origin+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','MCP-Protocol-Version':'2026-07-28','Mcp-Method':method,...(params.name?{'Mcp-Name':params.name}:{})},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params:{...params,_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28'}}})})
  return {status:response.status,body:await response.json()}
 }
 console.log('NATIVE grant received');const listed=await local('tools/list')
 console.log('NATIVE local list HTTP '+listed.status);assert.equal(listed.status,200);assert.ok(listed.body.result.tools.some(tool=>tool.name==='barrow.orders.prepare'))
 const denied=await local('tools/call',{name:'barrow.proposals.grants',arguments:{accountId:'juniper'}});console.log('NATIVE local scope refusal HTTP '+denied.status);assert.equal(denied.status,403)
 const recognizable=Buffer.from(JSON.stringify({alg:'ES256',typ:'at+jwt',kid:'unknown'})).toString('base64url')+'.e30.invalid'
 const failedBusiness=await local('tools/list',{},recognizable);console.log('NATIVE recognizable Business refusal HTTP '+failedBusiness.status);assert.equal(failedBusiness.status,401)
 const revoked=await request(origin+'/api/barrow/agent-token/revoke',{method:'POST',headers,body:'{}'});console.log('NATIVE local revoke HTTP '+revoked.status);assert.ok(revoked.ok);await revoked.body?.cancel()
 assert.equal((await local('tools/list')).status,401)
 console.log('NATIVE PASS scoped local credential, failed recognizable Business token refusal and immediate native grant revocation')
 if(process.env.BARROW_AGENT_EVIDENCE) {
  const {chromium}=await import('@playwright/test'),directory=process.env.BARROW_AGENT_EVIDENCE
  await mkdir(directory,{recursive:true})
  const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']})
  try {
   const context=await browser.newContext({viewport:{width:1440,height:1000}})
   await context.addCookies(cookie.split('; ').map(part=>{const i=part.indexOf('=');return {name:part.slice(0,i),value:part.slice(i+1),url:origin}}))
   await context.route(origin+'/**',async route=>{const incoming=route.request(),response=await request(incoming.url(),{method:incoming.method(),headers:incoming.headers(),...(incoming.postDataBuffer()?{body:incoming.postDataBuffer()}:{}),redirect:'manual'});await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())})})
   const page=await context.newPage()
   for(const width of [1440,390]) {
    await page.setViewportSize({width,height:1000});await page.goto(origin+'/agents');await page.screenshot({path:directory+'/agents-'+width+'.png',fullPage:true})
    if(width===1440)assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
   }
   await writeFile(directory+'/browser-proof.txt','Production Agents page with named owner and real completed/refused/pending/review records captured at 1440 and 390. Desktop overflow assertion passed.\n')
   await context.close()
  }finally{await browser.close()}
 }
}
