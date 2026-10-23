import type { Bindings } from '../../auth.server'
import { audit, commit } from '../access'
import { fail, text, type Actor } from '../model'
import { canonicalJson, sha256 } from '../../modules/import-kit/src/d1/index'
import { cutoverOwner } from './cutover-targets'
import type { CutoverInput } from './cutover-source'
export { canonicalJson, sha256, cutoverOwner }

export type DeltaState = 'rehearsal'|'signedoff'|'rolledback'|'inactive'|'erased'
export type DeltaRow = {
 id:string; state:DeltaState; revision:string; fingerprint:string; source_system:string; scope_json:string;
 source_json:string; report_json:string; feed_json:string; authorities_json:string; cutoff_at:string|null;
 excluded_order_ids_json:string; native_watermark_json:string; created_by:string; created_at:string; updated_at:string;
 signedoff_by:string|null; signedoff_at:string|null; reason:string; io_until?:number;
}
export type DeltaInput = CutoverInput & {sourceSystem:string;reason:string}
export const deltaReason = (value:unknown) => text(value,'Cutover reason',1000)
export function deltaSystem(value:unknown) {
 const result=text(value,'Responsible system',120)
 if(result!==result.trim()||/[\u0000-\u001f\u007f]/u.test(result)||/^(unknown|unassigned|none|n\/a|pending|tbd)$/i.test(result))fail('DELTA_AUTHORITY','Name the actual responsible system.',400)
 return result
}
export function deltaRevision(row:DeltaRow,revision:unknown) {
 if(typeof revision!=='string'||revision!==row.revision)fail('DELTA_CHANGED','The cutover session changed. Read and review its current revision.')
}
export async function deltaRow(env:Bindings,actor:Actor,id:string) {
 cutoverOwner(actor)
 if(typeof id!=='string'||id.length>100)fail('NOT_FOUND','Cutover session not found.',404)
 const row=await env.DB.prepare('SELECT * FROM bw_delta_cutovers WHERE id=?').bind(id).first<DeltaRow>()
 if(!row)fail('NOT_FOUND','Cutover session not found.',404)
 return row
}
export function deltaView(row:DeltaRow) {
 return {id:row.id,state:row.state,revision:row.revision,fingerprint:row.fingerprint,sourceSystem:row.source_system,
 scope:JSON.parse(row.scope_json),source:JSON.parse(row.source_json),report:JSON.parse(row.report_json),feed:JSON.parse(row.feed_json),
 authorities:JSON.parse(row.authorities_json),cutoffAt:row.cutoff_at,excludedOrderIds:JSON.parse(row.excluded_order_ids_json),
 nativeWatermark:JSON.parse(row.native_watermark_json),createdBy:row.created_by,createdAt:row.created_at,updatedAt:row.updated_at,
 signedoffBy:row.signedoff_by,signedoffAt:row.signedoff_at,reason:row.reason,ioBusy:(row.io_until??0)>Date.now()}
}
export const deltaFingerprint = (source:unknown,report:unknown,feed:unknown,sourceSystem:string) => sha256(canonicalJson({model:'barrow-delta-cutover-v1',source,report,feed,sourceSystem}))
export function deltaFence(env:Bindings,row:DeltaRow) {
 return env.DB.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_delta_cutovers WHERE id=? AND revision=? AND state=? AND io_until<=?) THEN 1 ELSE 0 END').bind(row.id,row.revision,row.state,Date.now())
}
/** All writes reauthorize the real owner session within the same D1 transaction. */
export async function deltaCommit(env:Bindings,actor:Actor,statements:D1PreparedStatement[]) {
 cutoverOwner(actor)
 try { await commit(env.DB,actor,statements) }
 catch(error) {
  if((error as Error).message.includes('CHECK constraint'))fail('DELTA_CHANGED','The session, native records or owner authorization changed. Review again.')
  throw error
 }
}
export const deltaAudit = (env:Bindings,actor:Actor,id:string,action:string,revision:string,reason:string,accountId?:string) => audit(env.DB,actor,id,action,{accountId,revision,source:`cutover.${action}`,reason})

export const deltaScopeAudits=(env:Bindings,actor:Actor,id:string,action:string,revision:string,reason:string,scope:string[])=>scope.map(accountId=>deltaAudit(env,actor,id,action,revision,reason,accountId))
