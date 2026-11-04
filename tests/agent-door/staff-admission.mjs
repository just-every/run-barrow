import assert from 'node:assert/strict'
const callMethod=['tools','call'].join('/')
import {randomUUID} from 'node:crypto'
import {installation,activateStaff,archive,restore} from '../api/harness.mjs'
import pierEdge from './pier-edge.mjs'
import {staffPolicy} from './initialize-staff.mjs'
import {staffTrust} from './staff-trust.mjs'
import {accessToken,signJws,policyEnvelope,autonomousPolicy} from '../../node_modules/@runeditrun/rer/modules/agent-door/conformance/crypto.mjs'

/** Controlled provider latency and supplier time exercise authority changes
 * through real commands. No commercial row or grant is written by a fixture. */
export async function proveStaffAdmission() {
 const trust=staffTrust(),{signer}=trust,sub=randomUUID(),staffSub=randomUUID(),email=['synthetic-barrow-52','example.invalid'].join('@')
 const pierOrigin='https://synthetic-barrow-pier.invalid',pierCookie='synthetic-barrow-51'
 let duringRead
 const h=await installation({https:true,bindings:{BARROW_TEST_CLOCK:'2026-11-04T12:00:00Z',PIER_ORIGIN:pierOrigin,PIER_SESSION:pierCookie},networkEdge:async request=>{
  if(new URL(request.url).origin!==pierOrigin)return
  const action=duringRead;duringRead=undefined;if(action)await action()
  return pierEdge.fetch(request,{fixture:{cookie:pierCookie}})
 }})
 let target
 try {
  const selected=await h.command('account.save',{id:'juniper',value:{name:'Synthetic admission market',email:['synthetic-barrow-53','example.invalid'].join('@'),pierCustomerId:'juniper',termsDays:30,minimumCents:0,currency:'USD',prices:[{sku:'LINEN',unitCents:2400,minQty:1}]}})
  const owner=(await h.api('/api/barrow/state')).actor
  await h.configure({RER_OWNER_CLAIM_ISSUER:signer.issuer,RER_OWNER_CLAIM_INSTALLATION_ID:signer.installationId,RER_OWNER_CLAIM_PUBLIC_KEYS:trust.publicKeys})
  const iat=Math.floor(Date.now()/1000),settings=await signJws(signer.privateKey,signer.kid,'rer-business-settings+jwt',{v:1,iss:signer.issuer,aud:h.origin,sub:signer.installationId,business:'rer-agent-conformance',email:owner.email,owner_id:sub,jti:randomUUID(),iat,exp:iat+300,rev:1,values:{},logo:null,team:[{id:staffSub,email,name:'Synthetic admission rep',role:'member',invite:1}]})
  await h.api('/api/rer/business-settings',{settings})
  let staff=await activateStaff(h,email,staffPolicy('rep',[]))
  const assignment=await h.command('rep.cover',{userId:staff.id,kind:'account',target:'juniper',startsOn:'2026-11-04',endsOn:'2026-11-04',reason:'Owner approved one supplier-calendar day.'})
  const context={signer,origin:h.origin,business:'rer-agent-conformance',seq:0,revision:0}
  const policy=await policyEnvelope(context,autonomousPolicy());await h.api('/api/rer/agent-policy',{policy:policy.policy})
  const bearer=await accessToken({...context,person:{sub:staffSub,email},agentId:'synthetic-barrow-admission-agent',consent:'synthetic-barrow-admission-consent',surface:{specialist:'wholesale account operator',tools:[]}},{scope:'accounts:read catalog:read orders:read orders:prepare'})
  const call=async(name,args={})=>{
   const response=await h.request('/mcp',{method:'POST',as:'',headers:{authorization:'Bearer '+bearer,'MCP-Protocol-Version':'2026-07-28','Mcp-Method':callMethod,'Mcp-Name':name},body:{jsonrpc:'2.0',id:1,method:callMethod,params:{name,arguments:args,_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28'}}}})
   return {status:response.status,body:await response.json()}
  }
  const code=answer=>answer.body.result?._meta?.['com.runeditrun/error']?.code??answer.body.error?.data?.code
  const draftArgs={accountId:'juniper',lines:[{sku:'LINEN',quantity:1}],idempotency_key:randomUUID()}
  const prepared=await call('barrow.orders.prepare',draftArgs);assert.equal(prepared.status,200);assert.ok(!prepared.body.result.isError,code(prepared))
  assert.equal((await h.api('/api/barrow/catalogue?accountId=juniper',undefined,staff.who)).items[0].sku,'LINEN')
  // No epoch changes: crossing the inclusive coverage date alone removes access.
  const epoch=(await h.db.prepare('SELECT value FROM bw_rep_epoch WHERE singleton=1').first()).value
  await h.configure({BARROW_TEST_CLOCK:'2026-11-05T12:00:00Z'})
  assert.equal((await h.db.prepare('SELECT value FROM bw_rep_epoch WHERE singleton=1').first()).value,epoch)
  assert.equal(code(await call('barrow.catalog.read',{accountId:'juniper'})),'NOT_FOUND')
  assert.equal(code(await call('barrow.orders.prepare',draftArgs)),'NOT_FOUND')
  await h.api('/api/barrow/catalogue?accountId=juniper',undefined,{...staff.who,status:404})
  console.log('PROBE BASE-AGENT-005 coverage: supplier clock crosses 4 November coverage end with unchanged epoch -> native read, MCP read and draft replay refuse')
  staff.grant=await h.command('staff.update',{userId:staff.id,revision:staff.grant.revision,policy:staffPolicy('rep',['juniper']),reason:'Owner issued an exact ongoing account grant.'})
  const before=(await h.api('/api/barrow/state')).orders
  duringRead=async()=>{staff.grant=await h.command('staff.update',{userId:staff.id,revision:staff.grant.revision,policy:staffPolicy('rep',[]),reason:'Owner narrows the grant while preparation reads stock.'})}
  const raced=await call('barrow.orders.prepare',{...draftArgs,idempotency_key:randomUUID()})
  assert.equal(code(raced),'authority_changed')
  assert.deepEqual((await h.api('/api/barrow/state')).orders,before)
  assert.equal(code(await call('barrow.orders.prepare',draftArgs)),'NOT_FOUND')
  staff.grant=await h.command('staff.update',{userId:staff.id,revision:staff.grant.revision,policy:staffPolicy('rep',['juniper']),reason:'Owner restores the exact scope for a read admission check.'})
  duringRead=async()=>{staff.grant=await h.command('staff.update',{userId:staff.id,revision:staff.grant.revision,policy:staffPolicy('rep',[]),reason:'Owner removes scope during a catalog read.'})}
  const readRace=await call('barrow.catalog.read',{accountId:'juniper'})
  assert.equal(code(readRace),'authority_changed');assert.equal(readRace.body.result.structuredContent,undefined)
  // The same native revision remains valid; the rep epoch changes during the read.
  const fresh=await h.command('rep.assign',{userId:staff.id,kind:'account',target:'juniper',reason:'Owner grants a current assignment.'})
  duringRead=()=>h.command('rep.end',{id:fresh.id,revision:fresh.revision,reason:'Owner ends assignment during preparation.'})
  const epochRace=await call('barrow.orders.prepare',{...draftArgs,idempotency_key:randomUUID()})
  assert.equal(code(epochRace),'authority_changed');assert.deepEqual((await h.api('/api/barrow/state')).orders,before)
  console.log('PROBE BASE-AGENT-005 concurrent authority: owner changes staff revision or rep epoch at the stock network edge -> no draft written; in-flight catalog result withheld')
  // Native version changes invalidate the old functional grant even after reactivation.
  await h.api('/auth/operator/status',{operatorId:staff.id,status:'inactive'})
  assert.equal((await call('barrow.orders.prepare',draftArgs)).status,401)
  await h.api('/auth/operator/status',{operatorId:staff.id,status:'active'})
  assert.equal((await call('barrow.catalog.read',{accountId:'juniper'})).status,401)
  staff.grant=await h.command('staff.update',{userId:staff.id,revision:staff.grant.revision,policy:staffPolicy('rep',['juniper']),reason:'Owner reviews the new native version.'})
  assert.equal((await call('barrow.orders.prepare',draftArgs)).body.result.structuredContent.id,prepared.body.result.structuredContent.id)
  // Portability keeps draft attribution, but never revives a grant or token.
  const exported=await archive(h)
  target=await installation({https:true})
  await restore(target,exported)
  const members=(await target.api('/api/barrow/staff/members')).members
  assert.ok(members.some(row=>row.userId===staff.id));assert.ok(members.every(row=>row.state==='revoked'&&!row.effective))
  const restored=(await target.api('/api/barrow/state')).orders.find(row=>row.id===prepared.body.result.structuredContent.id)
  assert.equal(restored.preparedBy,prepared.body.result.structuredContent.preparedBy);assert.equal(restored.status,'draft')
  const denied=await target.request('/mcp',{method:'POST',as:'',headers:{authorization:'Bearer '+bearer,'MCP-Protocol-Version':'2026-07-28','Mcp-Method':callMethod,'Mcp-Name':'barrow.orders.prepare'},body:{jsonrpc:'2.0',id:1,method:callMethod,params:{name:'barrow.orders.prepare',arguments:draftArgs}}})
  assert.equal(denied.status,401)
  assert.deepEqual((await target.api('/api/barrow/state')).orders.find(row=>row.id===restored.id),restored)
  console.log('PROBE BASE-AGENT-005 restore: native export and fresh installation import -> retained draft attribution, revoked staff grants and refused captured bearer replay')
 } finally {await target?.close();await h.close()}
}
