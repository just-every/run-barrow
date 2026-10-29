import {checkFeedPermissions} from '../feeds/permissions'
import {prepareDeltaUnits} from './delta-units'
import { Buffer } from 'node:buffer'
import type { Bindings } from '../../auth.server'
import { now } from '../clock'
import { fail, type Actor } from '../model'
import { parseCutoverSource, type CutoverInput } from './cutover-source'
import { previewCutover } from './cutover-service'
import { cutoverTargets } from './cutover-targets'
import { deltaChanges, deltaSourceIdentity, deltaTotals } from './delta-report'
import { canonicalJson, sha256, cutoverOwner, deltaReason, deltaSystem, deltaRevision, deltaRow, deltaView, deltaFingerprint, deltaFence, deltaCommit, deltaAudit, deltaScopeAudits, type DeltaInput, type DeltaRow } from './delta-store'
export { updateDeltaFeed } from './delta-feed'
export { rollbackDelta } from './delta-rollback'

async function prepare(env:Bindings,actor:Actor,input:CutoverInput,previous:ReturnType<typeof deltaView>['source']|null) {
 cutoverOwner(actor)
 const [source,comparison]=await Promise.all([parseCutoverSource(input),previewCutover(env,actor,input)])
 const dataset={...source,input:{scope:[...input.scope].sort(),runId:input.runId,mappings:input.mappings??{}}}
 if(new TextEncoder().encode(JSON.stringify(dataset)).byteLength>1_800_000)fail('DELTA_CUSTODY_LIMIT','The complete retained source exceeds this session’s storage limit. Split the account scope and export files before starting.',413)
 return {source:dataset,report:{comparison,changes:deltaChanges(previous?.records??[],source.records),deltaTotals:deltaTotals(previous?.records??[],source.records),sourceIdentity:deltaSourceIdentity(source.records),previousSourceIdentity:previous?.records?deltaSourceIdentity(previous.records):null,historyOnly:true}}
}

export async function readDelta(env:Bindings,actor:Actor,id:string) { return deltaView(await deltaRow(env,actor,id)) }
export async function listDeltas(env:Bindings,actor:Actor) {
 cutoverOwner(actor)
 const rows=await env.DB.prepare('SELECT * FROM bw_delta_cutovers ORDER BY created_at DESC,id').all<DeltaRow>()
 return {sessions:rows.results.map(deltaView)}
}

export async function createDelta(env:Bindings,actor:Actor,input:DeltaInput&{freezeOrderEntry:boolean}) {
 cutoverOwner(actor)
 if(input?.freezeOrderEntry!==true)fail('DELTA_FREEZE','Explicitly authorize holding scoped order entry until cutoff sign-off.',400)
 const reason=deltaReason(input.reason),sourceSystem=deltaSystem(input.sourceSystem)
 const prepared=await prepare(env,actor,input,null)
 const id=crypto.randomUUID(),revision=crypto.randomUUID(),at=(await now()).toISOString(),scope=JSON.stringify([...input.scope].sort())
 const fingerprint=deltaFingerprint(prepared.source,prepared.report,{},sourceSystem)
 // Two owners cannot establish overlapping live cutoffs in concurrent batches.
 const overlap=env.DB.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM bw_delta_cutovers d,json_each(d.scope_json) a WHERE d.state IN ('rehearsal','signedoff','inactive') AND a.value IN (SELECT value FROM json_each(?))) THEN 1 ELSE 0 END").bind(scope)
 await deltaCommit(env,actor,[overlap,
  env.DB.prepare("INSERT INTO bw_delta_cutovers(id,state,revision,fingerprint,source_system,scope_json,source_json,report_json,created_by,created_at,updated_at,reason) VALUES(?,'rehearsal',?,?,?,?,?,?,?,?,?,?)").bind(id,revision,fingerprint,sourceSystem,scope,JSON.stringify(prepared.source),JSON.stringify(prepared.report),actor.id,at,at,reason),
  env.DB.prepare('INSERT INTO bw_delta_sources(session_id,revision,source_json,report_json,created_at) VALUES(?,?,?,?,?)').bind(id,revision,JSON.stringify(prepared.source),JSON.stringify(prepared.report),at),
  ...deltaScopeAudits(env,actor,id,'delta.created',revision,reason,input.scope),
 ])
 return readDelta(env,actor,id)
}

export async function compareDelta(env:Bindings,actor:Actor,id:string,input:CutoverInput&{revision:string;reason:string}) {
 const row=await deltaRow(env,actor,id)
 deltaRevision(row,input.revision)
 if(row.state!=='rehearsal')fail('DELTA_STATE','Only an isolated rehearsal can receive a full source delta.')
 const reason=deltaReason(input.reason)
 if(canonicalJson([...input.scope].sort())!==canonicalJson(JSON.parse(row.scope_json)))fail('DELTA_SCOPE','A delta must preserve its original account scope.',400)
 const previousSource=JSON.parse(row.source_json),previousReport=JSON.parse(row.report_json)
 const prepared=await prepare(env,actor,input,previousSource)
 // Correcting identities re-reconciles the same export; it must not erase the
 // already recorded source delta that the owner still needs to sign off.
 if(canonicalJson(prepared.source.artifacts)===canonicalJson(previousSource.artifacts)) {
  prepared.report.changes=previousReport.changes
  prepared.report.deltaTotals=previousReport.deltaTotals
  prepared.report.previousSourceIdentity=previousReport.previousSourceIdentity
 }
 if(canonicalJson(prepared.source)===canonicalJson(JSON.parse(row.source_json))&&prepared.report.comparison.fingerprint===JSON.parse(row.report_json).comparison.fingerprint)return deltaView(row)
 const revision=crypto.randomUUID(),at=(await now()).toISOString()
 // A new full delta makes the previous product/ATS rehearsal stale. It must run
 // again against this exact source snapshot before the cutoff can be signed.
 const fingerprint=deltaFingerprint(prepared.source,prepared.report,{},row.source_system)
 await deltaCommit(env,actor,[deltaFence(env,row),
  env.DB.prepare("UPDATE bw_delta_cutovers SET revision=?,fingerprint=?,source_json=?,report_json=?,feed_json='{}',updated_at=?,reason=? WHERE id=?").bind(revision,fingerprint,JSON.stringify(prepared.source),JSON.stringify(prepared.report),at,reason,id),
  env.DB.prepare('INSERT INTO bw_delta_sources(session_id,revision,source_json,report_json,created_at) VALUES(?,?,?,?,?)').bind(id,revision,JSON.stringify(prepared.source),JSON.stringify(prepared.report),at),
  ...deltaScopeAudits(env,actor,id,'delta.compared',revision,reason,JSON.parse(row.scope_json)),
 ])
 return readDelta(env,actor,id)
}

export type DeltaSignoff = {revision:string;fingerprint:string;cutoffAt:string;authorities:Record<string,string>;consent:boolean;reason:string}
function sourceInput(row:DeltaRow):CutoverInput {
 const source=JSON.parse(row.source_json),[workbook,ledger]=source.artifacts
 return {...source.input,consent:true,workbook:{name:workbook.name,base64:workbook.base64},ledger:{name:ledger.name,csv:Buffer.from(ledger.base64,'base64').toString('utf8')}}
}
export async function signoffDelta(env:Bindings,actor:Actor,id:string,input:DeltaSignoff) {
 const row=await deltaRow(env,actor,id)
 deltaRevision(row,input.revision)
 if(row.state!=='rehearsal')fail('DELTA_STATE','Only a reviewed rehearsal can be signed off.')
 if(input.consent!==true)fail('DELTA_CONSENT','Explicitly approve the reviewed cutoff, source differences and responsible systems.',400)
 if(input.fingerprint!==row.fingerprint)fail('DELTA_CHANGED','Sign off the current exact source and feed fingerprint.')
 const reason=deltaReason(input.reason),at=(await now()).toISOString(),cutoff=new Date(input.cutoffAt)
 if(typeof input.cutoffAt!=='string'||!Number.isFinite(cutoff.getTime())||cutoff.toISOString()!==input.cutoffAt||cutoff.getTime()<Date.parse(row.created_at)||cutoff.getTime()>Date.parse(at)+300000)fail('DELTA_CUTOFF','Use an exact UTC cutoff after rehearsal creation and no more than five minutes ahead.',400)
 const source=JSON.parse(row.source_json),feed=JSON.parse(row.feed_json),report=JSON.parse(row.report_json)
 if(!feed.config||feed.consent!==true||!feed.rehearsal||!(feed.rehearsal.products>0)||!(feed.rehearsal.ats>0)||!Array.isArray(feed.rehearsal.files)||!feed.rehearsal.files.length||feed.rehearsal.unresolvedErrors!==0)fail('DELTA_FEED','Run and review product and ATS feed files without unresolved errors before sign-off.')
 if(!feed.permissions?.read||!feed.permissions?.write||!feed.permissions?.removed||feed.permissions.configHash!==sha256(canonicalJson(feed.config)))fail('FEED_PERMISSION','Test the exact feed connection permissions before sign-off.')
 if(!report.comparison.canApply)fail('DELTA_UNRESOLVED','Resolve source mappings and supply all seven source categories before sign-off.')
 const expected=source.records.filter((r:{kind:string})=>r.kind==='orders'||r.kind==='receivables').map((r:{kind:string;id:string})=>`${r.kind}:${r.id}`).sort()
 if(!input.authorities||typeof input.authorities!=='object'||Array.isArray(input.authorities)||canonicalJson(Object.keys(input.authorities).sort())!==canonicalJson(expected))fail('DELTA_AUTHORITY','Declare one responsible system for every source order and receivable, with no extra records.',400)
 const authorities=Object.fromEntries(expected.map((key:string)=>[key,deltaSystem(input.authorities[key])]))
 // Revalidate the native comparison and fence every scoped row read. There is
 // no reservation, payment, reminder or operational history import here.
 const current=await previewCutover(env,actor,sourceInput(row)),native=await cutoverTargets(env,actor,JSON.parse(row.scope_json))
 if(current.fingerprint!==report.comparison.fingerprint||native.nativeFingerprint!==report.comparison.nativeFingerprint)fail('DELTA_CHANGED','Native comparison changed. Compare the source delta and rehearse the feed again.')
 const orders=(await env.DB.prepare('SELECT id,account_id,revision,value_json FROM bw_orders ORDER BY id').all<{id:string;account_id:string;revision:string;value_json:string}>()).results
 const orderSnapshot=JSON.stringify(orders.map(order=>[order.id,order.account_id,order.revision,order.value_json]))
 const allOrdersFence=env.DB.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN (SELECT json_group_array(json_array(id,account_id,revision,value_json)) FROM (SELECT id,account_id,revision,value_json FROM bw_orders ORDER BY id))=? THEN 1 ELSE 0 END').bind(orderSnapshot)
 const units=await prepareDeltaUnits(env,JSON.parse(row.scope_json),feed)
 const excludedOrderIds=orders.map(order=>order.id),watermark={unitChanges:units.changes,capturedAt:at,accounts:native.targets.filter(target=>target.kind==='accounts').map(target=>({id:target.id,revision:units.changes.find(change=>change[0]===target.id)?.[3]??target.revision})),orders:orders.map(order=>({id:order.id,accountId:order.account_id,revision:order.revision,hash:sha256(order.value_json),preparedAt:JSON.parse(order.value_json).preparedAt})),nativeFingerprint:native.nativeFingerprint}
 try {await checkFeedPermissions(feed.config,env.BARROW_SFTP_SECRETS,at)}
 catch(error) {
  await deltaCommit(env,actor,[deltaFence(env,row),env.DB.prepare("UPDATE bw_delta_cutovers SET last_io_error='Feed permission testing failed; repair the retained destination before sign-off.' WHERE id=?").bind(id),deltaAudit(env,actor,id,'delta.permission-refused',row.revision,reason)])
  throw error
 }
 const revision=crypto.randomUUID()
 await deltaCommit(env,actor,[deltaFence(env,row),...native.guards,allOrdersFence,...units.guards,...units.statements,
  env.DB.prepare("UPDATE bw_delta_cutovers SET state='signedoff',last_io_error=NULL,revision=?,authorities_json=?,cutoff_at=?,excluded_order_ids_json=?,native_watermark_json=?,signedoff_by=?,signedoff_at=?,updated_at=?,reason=? WHERE id=?").bind(revision,JSON.stringify(authorities),input.cutoffAt,JSON.stringify(excludedOrderIds),JSON.stringify(watermark),actor.id,at,at,reason,id),
  ...deltaScopeAudits(env,actor,id,'delta.signedoff',revision,reason,JSON.parse(row.scope_json)),
  ...units.changes.map(change=>deltaAudit(env,actor,change[0],'delta.units-applied',change[3],`Owner approved source case packs and increments at cutoff ${id}: ${reason}`,change[0])),
 ])
 return readDelta(env,actor,id)
}
