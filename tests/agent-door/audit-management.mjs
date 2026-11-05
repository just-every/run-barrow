import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {auditRows} from './audit-targets.mjs'
import {captureAgents} from './screens.mjs'

/** Audit management uses real prepared drafts and the current person's HTTP doors. */
export async function proveAuditManagement({h,call,policy,account,token,summaryTargets}) {
 const trace='00-12345678901234567890123456789012-1234567890123456-01'
 const prepare=()=>({accountId:account.id,lines:[{sku:'LINEN',quantity:2}],idempotency_key:randomUUID()})
 await policy('review')
 const args=prepare(),answer=await call('barrow.orders.prepare',args,token,{_meta:{traceparent:trace}})
 const draft=answer.result.structuredContent
 assert.equal(draft.status,'draft')
 const meta=answer.result._meta['com.runeditrun/decision']
 const reviewId=answer.result._meta['com.runeditrun/review'].id
 const row=(await auditRows(path=>h.api(path))).find(row=>row.id===meta.id)
 const owner=(await h.api('/auth/operators')).find(person=>person.role==='owner')
 const native=(await h.api('/api/barrow/audit')).events.filter(event=>event.action==='agent.granted').at(-1)
 assert.equal(row.agent.id,'barrow-local:'+native.subjectId)
 assert.equal(row.agent.name,'Barrow scoped agent');assert.equal(row.agent.specialist,null)
 assert.deepEqual(row.sponsor,{id:owner.id,name:owner.displayName})
 assert.equal(row.client_id,row.agent.id);assert.equal(row.consent,null)
 assert.equal(row.label,`Barrow scoped agent for ${owner.displayName}`)
 assert.ok(row.operation_id);assert.equal(row.trace,trace);assert.equal(row.idempotency_key,args.idempotency_key)
 assert.ok(row.scopes.includes('orders:prepare'));assert.equal(row.tool,'barrow.orders.prepare')
 assert.deepEqual(row.resource,{kind:'account',id:account.id})
 assert.deepEqual(row.classes,[{class:'standard',facts:{measure:1}}])
 assert.deepEqual(row.rules,[{class:'standard',rule:'target-proof',do:'review'}])
 assert.equal(row.revision,meta.revision);assert.equal(row.decision,'review');assert.equal(row.outcome,'done')
 assert.equal(row.review.id,reviewId);assert.equal(row.approval,null);assert.equal(row.code,null)
 assert.ok(row.resources.includes('barrow://orders/'+draft.id))
 const markedArgs=prepare(),marked=await call('barrow.orders.prepare',markedArgs,token)
 const flagArgs=prepare(),flagged=await call('barrow.orders.prepare',flagArgs,token)
 const markId=marked.result._meta['com.runeditrun/review'].id,flagId=flagged.result._meta['com.runeditrun/review'].id
 // An unsafe Undo must leave submitted commercial history exactly as it was.
 const locked=await call('barrow.orders.prepare',prepare(),token)
 const lockedId=locked.result._meta['com.runeditrun/review'].id,lockedDraft=locked.result.structuredContent
 await h.command('order.submit',{orderId:lockedDraft.id})
 const beforeLocked=await h.api('/api/barrow/orders/'+lockedDraft.id)
 await h.api('/agents/api/reviews/'+lockedId+'/undo',{},{status:409})
 assert.deepEqual(await h.api('/api/barrow/orders/'+lockedDraft.id),beforeLocked)
 // Review lists must contain precisely the successful review decisions.
 const rows=await auditRows(path=>h.api(path))
 const reviews=(await h.api('/agents/api/reviews')).reviews
 const expected=rows.filter(row=>row.decision==='review'&&['done','replayed'].includes(row.outcome)).map(row=>row.review.id)
 assert.deepEqual(reviews.map(review=>review.id).sort(),[...new Set(expected)].sort())
 for(const review of reviews)assert.equal(review.decision_id,rows.find(row=>row.review?.id===review.id).replay_of??rows.find(row=>row.review?.id===review.id).id)
 // Force a second audit page using real native reads, without direct table writes.
 await policy('autonomous')
 for(let n=rows.length;n<205;n++)assert.equal((await call('barrow.accounts.read',{id:account.id},token)).result.structuredContent.id,account.id)
 const complete=await auditRows(path=>h.api(path))
 assert.ok(complete.length>200)
 assert.equal(new Set(complete.map(row=>row.id)).size,complete.length)
 for(const query of ['', '?agent='+encodeURIComponent(row.agent.id),'?class=standard','?class=money','?agent='+encodeURIComponent(row.agent.id)+'&class=standard']) {
  const params=new URLSearchParams(query),expected=complete.filter(row=>(!params.has('agent')||row.agent.id===params.get('agent'))&&(!params.has('class')||row.classes.some(item=>item.class===params.get('class'))))
  const exported=await h.api('/api/barrow/agent-audit/export'+query)
  assert.deepEqual(exported.rows,expected,'Export must keep every field and all pages, including an empty filtered page')
  const filtered=await auditRows(path=>h.api(path+(path.includes('?')?'&':'?')+params))
  assert.deepEqual(filtered,expected)
 }
 const buyer=await h.signIn(account.value.email)
 for(const path of ['/agents/api/audit','/api/barrow/agent-audit/export']) {
  await h.api(path,undefined,{as:buyer,status:403})
  await h.api(path,undefined,{as:'',headers:{authorization:'Bearer '+token},status:403})
  await h.api(path,undefined,{as:'',status:401})
 }
 await h.api('/agents/api/reviews/'+reviewId+'/undo',{}, {as:buyer,status:403})
 assert.equal((await h.api('/api/barrow/orders/'+draft.id)).status,'draft')
 const expectedCounts=new Map()
 for(const audit of complete)for(const {class:kind} of audit.classes) {
  const key=kind+':'+audit.decision
  expectedCounts.set(key,(expectedCounts.get(key)??0)+1)
 }
 // Public built page, including the real person buttons, always runs in Verify.
 let inspected=false
 await captureAgents({request:(url,init)=>h.raw(new URL(url).pathname+new URL(url).search,init),origin:h.origin,cookie:h.cookie,summaryTargets,prefix:'management-',inspect:async(page,path)=>{
  if(path!=='/agents'||inspected)return
  inspected=true
  const counts=await page.locator('[data-agents-count]').evaluateAll(cells=>cells.map(cell=>[cell.dataset.class+':'+cell.dataset.decision,Number(cell.textContent)]))
  assert.deepEqual(new Map(counts),expectedCounts)
  const visible=await page.locator('[data-review-id]').evaluateAll(items=>items.map(item=>item.dataset.reviewId))
  assert.deepEqual(visible.sort(),reviews.filter(review=>['open','flagged'].includes(review.state)).map(review=>review.id).sort())
  await page.locator(`[data-review-id="${markId}"] [data-review-action="reviewed"]`).click()
  await page.waitForFunction(id=>!document.querySelector(`[data-review-id="${id}"]`),markId)
  const mark=(await h.api('/agents/api/reviews')).reviews.find(review=>review.id===markId)
  assert.equal(mark.state,'reviewed');assert.equal(mark.marked_by,owner.id);assert.ok(mark.marked_at)
  await page.locator(`[data-review-id="${flagId}"] [data-review-action="flag"]`).click()
  await page.waitForFunction(id=>document.querySelector(`[data-review-id="${id}"]`)?.dataset.reviewState==='flagged',flagId)
  const flag=(await h.api('/agents/api/reviews')).reviews.find(review=>review.id===flagId)
  assert.equal(flag.marked_by,owner.id)
  await page.locator(`[data-review-id="${reviewId}"] [data-review-action="undo"]`).click()
  await page.waitForFunction(id=>!document.querySelector(`[data-review-id="${id}"]`),reviewId)
  assert.equal((await h.api('/api/barrow/orders/'+draft.id)).status,'cancelled')
 }})
 assert.ok(inspected)
 const undone=(await h.api('/agents/api/reviews')).reviews.find(review=>review.id===reviewId)
 assert.equal(undone.state,'undone');assert.equal(undone.marked_by,owner.id)
 const discarded=await h.api('/api/barrow/orders/'+draft.id)
 await h.api('/agents/api/reviews/'+reviewId+'/undo',{})
 assert.deepEqual(await h.api('/api/barrow/orders/'+draft.id),discarded)
 assert.equal((await call('barrow.orders.prepare',args,token)).result.structuredContent.id,draft.id)
 assert.deepEqual(await h.api('/api/barrow/orders/'+draft.id),discarded,'Replay cannot resurrect the discarded draft')
 const audit=(await h.api('/api/barrow/audit')).events.find(event=>event.subjectId===draft.id&&event.action==='order.draft-discarded')
 assert.equal(audit.actorId,owner.id);assert.equal(audit.actorKind,'human')
 const retained=(await auditRows(path=>h.api(path))).filter(item=>item.agent.id===row.agent.id)
 await h.api('/agents/api/agents/'+encodeURIComponent(row.agent.id)+'/revoke',{})
 const refused=await call('barrow.accounts.read',{id:account.id},token)
 assert.equal(refused.status,401)
 const afterRemoval=(await auditRows(path=>h.api(path))).filter(item=>item.agent.id===row.agent.id)
 assert.deepEqual(afterRemoval.slice(0,retained.length),retained)
 assert.equal(afterRemoval.length,retained.length+1)
 assert.equal(afterRemoval.at(-1).outcome,'refused');assert.equal(afterRemoval.at(-1).code,'unauthenticated')
 assert.equal(afterRemoval.at(-1).resource,null)
 assert.ok((await h.api('/agents/api/agents')).agents.some(agent=>agent.id===row.agent.id&&agent.revoked&&agent.name==='Barrow scoped agent'))
 assert.deepEqual((await h.api('/api/barrow/agent-audit/export?agent='+encodeURIComponent(row.agent.id))).rows,afterRemoval)
 console.log('PROBE BASE-AGENT-009 audit: real traced draft -> complete actor, target, class, policy, review and replay fields')
 console.log('PROBE BASE-AGENT-009 management: more than 200 calls -> exact week counts, filtered complete JSON, retained names after removal; buyer and bearer exports refused')
 console.log('PROBE BASE-AGENT-009 Undo: person reverses unchanged draft -> cancelled with attributed history; submitted draft, buyer and replay cannot change it')
}
