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
 const trust=staffTrust(),{signer}=trust,sub=randomUUID(),staffSub=randomUUID(),buyerSub=randomUUID(),buyerEmail=['synthetic-barrow-54','example.invalid'].join('@'),email=['synthetic-barrow-52','example.invalid'].join('@')
 const pierOrigin='https://synthetic-barrow-pier.invalid',pierCookie='synthetic-barrow-51'
 let duringRead
 const h=await installation({https:true,bindings:{BARROW_TEST_CLOCK:'2026-11-04T12:00:00Z',PIER_ORIGIN:pierOrigin,PIER_SESSION:pierCookie},networkEdge:async request=>{
  if(new URL(request.url).origin!==pierOrigin)return
  const action=duringRead;duringRead=undefined;if(action)await action()
  return pierEdge.fetch(request,{fixture:{cookie:pierCookie}})
 }})
 let target,erasedTarget
 try {
  const selected=await h.command('account.save',{id:'juniper',value:{name:'Synthetic admission market',email:['synthetic-barrow-53','example.invalid'].join('@'),pierCustomerId:'juniper',termsDays:30,minimumCents:0,currency:'USD',prices:[{sku:'LINEN',unitCents:2400,minQty:1}]}})
  const owner=(await h.api('/api/barrow/state')).actor
  await h.configure({RER_OWNER_CLAIM_ISSUER:signer.issuer,RER_OWNER_CLAIM_INSTALLATION_ID:signer.installationId,RER_OWNER_CLAIM_PUBLIC_KEYS:trust.publicKeys})
  const iat=Math.floor(Date.now()/1000),settings=await signJws(signer.privateKey,signer.kid,'rer-business-settings+jwt',{v:1,iss:signer.issuer,aud:h.origin,sub:signer.installationId,business:'rer-agent-conformance',email:owner.email,owner_id:sub,jti:randomUUID(),iat,exp:iat+300,rev:1,values:{},logo:null,team:[{id:staffSub,email,name:'Synthetic admission rep',role:'member',invite:1},{id:buyerSub,email:buyerEmail,name:'Synthetic admission buyer',role:'member',invite:1}]})
  await h.api('/api/rer/business-settings',{settings})
  let staff=await activateStaff(h,email,staffPolicy('rep',[]))
  const assignment=await h.command('rep.cover',{userId:staff.id,kind:'account',target:'juniper',startsOn:'2026-11-04',endsOn:'2026-11-04',reason:'Owner approved one supplier-calendar day.'})
  const context={signer,origin:h.origin,business:'rer-agent-conformance',seq:0,revision:0}
  const policy=await policyEnvelope(context,autonomousPolicy());await h.api('/api/rer/agent-policy',{policy:policy.policy})
  const bearer=await accessToken({...context,person:{sub:staffSub,email},agentId:'synthetic-barrow-admission-agent',consent:'synthetic-barrow-admission-consent',surface:{specialist:'wholesale account operator',tools:[]}},{scope:'accounts:read catalog:read orders:read orders:prepare lists:read'})
  const call=async(name,args={},credential=bearer)=>{
   const response=await h.request('/mcp',{method:'POST',as:'',headers:{authorization:'Bearer '+credential,'MCP-Protocol-Version':'2026-07-28','Mcp-Method':callMethod,'Mcp-Name':name},body:{jsonrpc:'2.0',id:1,method:callMethod,params:{name,arguments:args,_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28'}}}})
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
  staff.who={as:await h.signIn(email,'existing')}
  const shared=await h.command('list.save',{accountId:'juniper',name:'Synthetic admission list',shared:true,lines:[{sku:'LINEN',quantity:1}]})
  assert.equal((await call('barrow.lists.list',{accountId:'juniper'})).body.result.structuredContent.lists[0].id,shared.id)
  assert.deepEqual((await call('barrow.scopes.read',{scope_id:'lists:read'})).body.result.structuredContent.grants,['lists:read'])
  const dropped=await call('barrow.scopes.drop',{scope_id:'lists:read',idempotency_key:randomUUID()})
  assert.deepEqual(dropped.body.result.structuredContent.removed,['lists:read'])
  assert.equal(dropped.body.result._meta['com.runeditrun/decision'].classes[0].facts.direction,'narrows')
  assert.deepEqual((await call('barrow.scopes.read',{scope_id:'lists:read'})).body.result.structuredContent.grants,[])
  assert.equal(code(await call('barrow.lists.list',{accountId:'juniper'})),'insufficient_scope')
  assert.equal(code(await call('barrow.scopes.drop',{scope_id:'orders:read',role:'owner',idempotency_key:randomUUID()})),'invalid_arguments')
  console.log('PROBE BASE-AGENT-005 self narrowing: MCP drops a current list scope -> grant witness shrinks, subsequent read refused, hostile widening argument refused')
  const currentOrders=(await h.api('/api/barrow/state')).orders
  duringRead=()=>h.command('agent-scope.drop',{agentId:'synthetic-barrow-admission-agent',scope:'orders:prepare'},staff.who)
  assert.equal(code(await call('barrow.orders.prepare',{...draftArgs,idempotency_key:randomUUID()})),'authority_changed')
  assert.deepEqual((await h.api('/api/barrow/state')).orders,currentOrders)
  assert.equal(code(await call('barrow.orders.prepare',draftArgs)),'insufficient_scope')
  assert.equal(code(await call('barrow.orders.prepare',{...draftArgs,idempotency_key:randomUUID()})),'insufficient_scope')
  console.log('PROBE BASE-AGENT-005 scope drop: sponsor removes draft scope while stock is read -> atomic refusal, no new draft; old signed bearer cannot prepare or replay')
  const addresses=[]
  for(const name of ['First store','Second store'])addresses.push(await h.command('location.save',{accountId:'juniper',kind:'ship-to',value:{name,line1:'101 Main Street',city:'Columbia',state:'SC',zip:'29201'}}))
  let buyerPolicy={rights:['purchaser'],locations:[addresses[0].id],perOrderLimitCents:100000,approvalLimitCents:0}
  const who={as:await h.signIn(buyerEmail,'member')}
  await h.command('company.invite',{accountId:'juniper',email:buyerEmail,name:'Synthetic admission buyer',policy:buyerPolicy,reason:'Owner reviewed one purchasing location.'})
  const message=h.mail.requests.findLast(row=>row.message.subject==='Your company buyer invitation'&&row.message.to.includes(buyerEmail)).message
  const link=new URL(message.text.match(/https?:\/\/[^\s<>]+\/app\?[^\s<>]+/)[0])
  await h.command('company.accept',{invitationId:link.searchParams.get('companyInvitation'),token:link.searchParams.get('companyToken')},who)
  let membership=(await h.api('/api/barrow/state',undefined,who)).actor.company
  const buyerBearer=await accessToken({...context,person:{sub:buyerSub,email:buyerEmail},agentId:'synthetic-barrow-buyer-agent',consent:'synthetic-barrow-buyer-consent',surface:{specialist:'wholesale account operator',tools:[]}},{scope:'accounts:read catalog:read orders:read orders:prepare lists:read'})
  const buyerCall=(name,args={})=>call(name,args,buyerBearer)
  const buyerArgs={accountId:'juniper',lines:[{sku:'LINEN',quantity:1}],idempotency_key:randomUUID()}
  const buyerDraft=await buyerCall('barrow.orders.prepare',buyerArgs);assert.ok(!buyerDraft.body.result.isError,code(buyerDraft))
  assert.equal(buyerDraft.body.result.structuredContent.shipTo.id,addresses[0].id)
  await h.command('order.prepare',{...buyerArgs,shipToId:addresses[1].id},{...who,status:403})
  assert.equal(code(await buyerCall('barrow.orders.prepare',{...buyerArgs,shipToId:addresses[1].id,idempotency_key:randomUUID()})),'FORBIDDEN')
  const buyerBefore=(await h.api('/api/barrow/state')).orders
  duringRead=async()=>{membership=await h.command('company.update',{accountId:'juniper',memberId:membership.id,revision:membership.revision,policy:{...buyerPolicy,rights:['finance']},reason:'Owner removes purchasing during a stock read.'})}
  assert.equal(code(await buyerCall('barrow.orders.prepare',{...buyerArgs,idempotency_key:randomUUID()})),'authority_changed')
  assert.deepEqual((await h.api('/api/barrow/state')).orders,buyerBefore)
  assert.equal(code(await buyerCall('barrow.orders.prepare',buyerArgs)),'FORBIDDEN')
  buyerPolicy={...buyerPolicy,locations:[addresses[1].id]}
  membership=await h.command('company.update',{accountId:'juniper',memberId:membership.id,revision:membership.revision,policy:buyerPolicy,reason:'Owner reviews the second store only.'})
  assert.equal(code(await buyerCall('barrow.orders.read',{id:buyerDraft.body.result.structuredContent.id})),'FORBIDDEN')
  assert.equal(code(await buyerCall('barrow.orders.prepare',buyerArgs)),'FORBIDDEN')
  const freshBuyerDraft=await buyerCall('barrow.orders.prepare',{...buyerArgs,shipToId:addresses[1].id,idempotency_key:randomUUID()})
  assert.equal(freshBuyerDraft.body.result.structuredContent.shipTo.id,addresses[1].id)
  const terms=await h.command('usage.publish',{title:'Synthetic portal usage',body:'Only the current sponsoring buyer accepts these terms.'})
  for(const [name,args] of [['barrow.catalog.read',{accountId:'juniper'}],['barrow.accounts.list',{}],['barrow.workspace.read',{}]])assert.equal(code(await buyerCall(name,args)),'USAGE_TERMS_REQUIRED')
  await h.api('/api/barrow/catalogue?accountId=juniper',undefined,{...who,status:409})
  await h.command('usage.accept',{version:terms.version,sha256:terms.sha256,accepted:true},who)
  assert.equal((await buyerCall('barrow.catalog.read',{accountId:'juniper'})).body.result.structuredContent.items[0].sku,'LINEN')
  await h.command('company.remove',{accountId:'juniper',memberId:membership.id,revision:membership.revision,reason:'Owner ends buyer membership.'})
  assert.equal((await buyerCall('barrow.orders.prepare',buyerArgs)).status,401)
  console.log('PROBE BASE-AGENT-005 buyer authority: native invitation and explicit acceptance -> scoped draft; foreign ship-to, concurrent downgrade and replay refused; sponsor terms required; removed member returns 401')
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
  await h.command('retention.request',{accountId:'juniper',requester:'Verified company purchaser',channel:'In-app owner review',verificationNote:'Owner verified this company scope.',reason:'Owner reviewed buyer sponsorship custody.',held:false})
  const preview=await h.command('retention.preview',{accountId:'juniper'})
  const receipt=await h.command('retention.erase-account',{accountId:'juniper',accountRevision:preview.accountRevision,requestRevision:preview.requestRevision,policyRevision:preview.policyRevision,reviewHash:preview.reviewHash,confirm:'ERASE',reason:'Owner authorizes erasure without changing the financial floor.'})
  const erasedSponsor=await h.db.prepare('SELECT name,sponsor,sponsor_name,revoked,tombstone FROM agent_door_agents WHERE id=?').bind('synthetic-barrow-buyer-agent').first()
  assert.deepEqual([erasedSponsor.name,erasedSponsor.sponsor,erasedSponsor.sponsor_name,erasedSponsor.revoked],['','','',1])
  assert.equal(JSON.parse(erasedSponsor.tombstone).erasure_id,receipt.id)
  assert.equal((await buyerCall('barrow.orders.prepare',buyerArgs)).status,401)
  const later=await archive(h)
  erasedTarget=await installation({https:true})
  const old=await restore(erasedTarget,exported,{status:400,laterJournal:{sourceIdentity:later[0].sourceIdentity,epoch:later[0].epoch,journal:later[0].journal}})
  assert.match(typeof old.error==='string'?old.error:old.error.code,/erasure|journal/i)
  assert.equal((await erasedTarget.api('/api/barrow/state')).orders.length,0)
  console.log('PROBE BASE-AGENT-005 erasure: owner erases a former sponsoring buyer -> sponsor identity tombstoned, captured token refused, later journal refuses the older archive without restored orders')

 } finally {await erasedTarget?.close();await target?.close();await h.close()}
}
