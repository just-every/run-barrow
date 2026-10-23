import type { Bindings } from '../../auth.server'
import { audit, commit } from '../access'
import { fail, text, type Actor } from '../model'
import { parseCutoverSource, type CutoverInput } from './cutover-source'
import { cutoverOwner, cutoverTargets } from './cutover-targets'
import { reconcileCutover } from './cutover-reconcile'

async function prepare(env:Bindings,actor:Actor,input:CutoverInput) {
 cutoverOwner(actor)
 if(input?.consent!==true)fail('CUTOVER_CONSENT','Explicitly authorize the named native read-only scope before comparing exports.',400)
 if(!input||typeof input.runId!=='string'||!/^[-\w.:]{1,100}$/.test(input.runId))fail('CUTOVER_RUN','Supply a stable mapping run ID.',400)
 const native=await cutoverTargets(env,actor,input.scope),source=await parseCutoverSource(input)
 const report=reconcileCutover(source,native.targets,input,native.nativeFingerprint)
 return {...native,source,report}
}
export async function previewCutover(env:Bindings,actor:Actor,input:CutoverInput) {
 const {report}=await prepare(env,actor,input)
 return report
}
export async function listCutovers(env:Bindings,actor:Actor) {
 cutoverOwner(actor)
 return {imports:(await env.DB.prepare('SELECT id,fingerprint,state,scope_json,approved_by,approved_at,reason,undone_by,undone_at FROM bw_cutover_imports ORDER BY approved_at DESC').all<any>()).results}
}
export async function readCutover(env:Bindings,actor:Actor,id:string) {
 cutoverOwner(actor)
 const row=await env.DB.prepare('SELECT * FROM bw_cutover_imports WHERE id=?').bind(id).first<any>()
 if(!row)fail('NOT_FOUND','Cutover history not found.',404)
 return {...row,source:JSON.parse(row.source_json),report:JSON.parse(row.report_json),source_json:undefined,report_json:undefined}
}
export async function applyCutover(env:Bindings,actor:Actor,input:CutoverInput&{fingerprint:string;approveMappings:boolean;approveBalances:boolean;disposition:string}) {
 cutoverOwner(actor)
 if(input.approveMappings!==true||input.approveBalances!==true)fail('CUTOVER_APPROVAL','Approve both the exact mappings and the balances/differences before activating retained history.',400)
 const reason=text(input.disposition,'Disposition for differences and missing releases',1000)
 if(typeof input.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(input.fingerprint))fail('CUTOVER_APPROVAL','Supply the reviewed fingerprint.',400)
 // Replay is inert even if native records have since changed. No source is reapplied.
 const previous=await env.DB.prepare('SELECT id FROM bw_cutover_imports WHERE fingerprint=?').bind(input.fingerprint).first<{id:string}>()
 if(previous)return readCutover(env,actor,previous.id)
 const prepared=await prepare(env,actor,input)
 if(prepared.report.fingerprint!==input.fingerprint)fail('CUTOVER_CHANGED','Exports, scope, mappings or native records changed. Run and approve a fresh comparison.')
 if(!prepared.report.canApply)fail('CUTOVER_UNRESOLVED','Resolve every source identity and supply each missing export category before applying.')
 const id=crypto.randomUUID(),at=new Date().toISOString()
 try {
  await commit(env.DB,actor,[...prepared.guards,
   env.DB.prepare('INSERT INTO bw_cutover_imports(id,fingerprint,scope_json,state,native_fingerprint,source_json,report_json,approved_by,approved_at,reason) VALUES(?,?,?,\'active\',?,?,?,?,?,?)').bind(id,input.fingerprint,JSON.stringify([...input.scope].sort()),prepared.nativeFingerprint,JSON.stringify(prepared.source),JSON.stringify({...prepared.report,approvedMappings:true,approvedBalances:true}),actor.id,at,reason),
   audit(env.DB,actor,id,'cutover.approved',{revision:input.fingerprint,source:'cutover.apply',reason:'Owner approved exact mappings, source balances and explicit differences for retained history only.'}),
   env.DB.prepare('DELETE FROM bw_guard'),
  ])
 }catch(error) {
  // Two requests may finish the same approved fingerprint together. The UNIQUE
  // fence rolls the losing batch back, including its audit; return the winner.
  if((error as Error).message.includes('UNIQUE constraint failed: bw_cutover_imports.fingerprint')) {
   const winner=await env.DB.prepare('SELECT id FROM bw_cutover_imports WHERE fingerprint=?').bind(input.fingerprint).first<{id:string}>()
   if(winner)return readCutover(env,actor,winner.id)
  }
  if((error as Error).message.includes('CHECK constraint'))fail('CUTOVER_CHANGED','Native records changed during approval. Refresh the comparison.')
  throw error
 }
 return readCutover(env,actor,id)
}
export async function undoCutover(env:Bindings,actor:Actor,id:string) {
 const previous=await readCutover(env,actor,id)
 if(previous.state!=='active')return previous
 const native=await cutoverTargets(env,actor,JSON.parse(previous.scope_json))
 if(native.nativeFingerprint!==previous.native_fingerprint)fail('NATIVE_EDIT_CONFLICT','Native records changed after approval. Retain the cutover history and later work; undo refused.')
 try {
  await commit(env.DB,actor,[...native.guards,
   env.DB.prepare("UPDATE bw_cutover_imports SET state='undone',undone_by=?,undone_at=? WHERE id=? AND state='active'").bind(actor.id,new Date().toISOString(),id),
   audit(env.DB,actor,id,'cutover.undone',{revision:previous.fingerprint,source:'cutover.undo',reason:'Owner withdrew activation of untouched retained history; original evidence preserved.'}),
   env.DB.prepare('DELETE FROM bw_guard'),
  ])
 }catch(error) {
  if((error as Error).message.includes('CHECK constraint'))fail('NATIVE_EDIT_CONFLICT','Native records changed during undo. Later work is preserved.')
  throw error
 }
 return readCutover(env,actor,id)
}
