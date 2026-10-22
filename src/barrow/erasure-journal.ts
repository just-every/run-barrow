/** Private R2 write-ahead journal. D1 Time Travel cannot roll this bucket back.
 * No cache: each request checks the independent journal before reading identity
 * or business data; every cron does the same before considering outbound work.
 * An intent without either its atomic D1 receipt or R2 completion marker is
 * indeterminate, so serving stops. It is never guessed to have failed. */
import type { Bindings } from '../auth.server'
import { digest } from './access'
import type { ErasureOperation } from './account-erasure'
import type { LegacyErasure } from './legacy-erasure-journal'
type JournalOperation = ErasureOperation | LegacyErasure
export const journalPrefix = 'account-erasure/v1/'
const sourceKey=(source:string)=>'sources/v1/'+source+'.json'
type Source={sourceIdentity:string;initialized?:boolean;operations:{id:string;fingerprint:string}[]}
export async function journalSource(env:Bindings) {
 if(!env.ERASURE_JOURNAL)throw new Error('ERASURE_JOURNAL_UNAVAILABLE')
 await env.DB.prepare('INSERT OR IGNORE INTO rer_portability_state(id,source_identity) VALUES(1,?)').bind(crypto.randomUUID()).run()
 const row=await env.DB.prepare('SELECT source_identity FROM rer_portability_state WHERE id=1').first<{source_identity:string}>()
 const source=row!.source_identity,existing=await env.ERASURE_JOURNAL.get(sourceKey(source))
 if(!existing) {
  // A populated/restored database must bring its original independent journal.
  // An empty replacement bucket is not evidence that nobody was ever erased.
  if(await env.DB.prepare("SELECT 1 FROM bw_accounts UNION ALL SELECT 1 FROM rer_portability_jobs WHERE kind='import' UNION ALL SELECT 1 FROM bw_account_erasure_journal LIMIT 1").first())throw new Error('ERASURE_SOURCE_JOURNAL_REQUIRED')
  await env.ERASURE_JOURNAL.put(sourceKey(source),JSON.stringify({sourceIdentity:source,initialized:true,operations:[]}),{onlyIf:{etagDoesNotMatch:'*'}})
 }
 return source
}
export async function requireArchiveJournal(env:Bindings,source:string) {
 if(!env.ERASURE_JOURNAL||typeof source!=='string')throw new Error('ERASURE_SOURCE_JOURNAL_REQUIRED')
 const object=await env.ERASURE_JOURNAL.get(sourceKey(source));if(!object)throw new Error('ERASURE_SOURCE_JOURNAL_REQUIRED')
 const registry=await object.json<Source>();if(registry.sourceIdentity!==source||registry.initialized!==true||!Array.isArray(registry.operations))throw new Error('ERASURE_JOURNAL_INVALID')
 for(const entry of registry.operations){const operation=await env.ERASURE_JOURNAL.get(journalPrefix+entry.id+'.json'),marker=await env.ERASURE_JOURNAL.get(journalPrefix+entry.id+'.complete');if(!operation||!marker||await digest(await operation.text())!==entry.fingerprint||await marker.text()!==entry.fingerprint)throw new Error('ERASURE_JOURNAL_INCOMPLETE')}
}
async function updateSource(env:Bindings,source:string,change:(source:Source)=>Source) {
 for(let attempt=0;attempt<3;attempt++) {
  const prior=await env.ERASURE_JOURNAL!.get(sourceKey(source));if(!prior)throw new Error('ERASURE_SOURCE_JOURNAL_REQUIRED')
  const value=change(await prior.json<Source>())
  const saved=await env.ERASURE_JOURNAL!.put(sourceKey(source),JSON.stringify(value),{onlyIf:{etagMatches:prior.etag}})
  if(saved)return
 }
 throw new Error('ERASURE_JOURNAL_CHANGED')
}
export async function abandonErasureIntent(env:Bindings,operation:JournalOperation) {
 await updateSource(env,operation.sourceIdentity,source=>({...source,operations:source.operations.filter(row=>row.id!==operation.id)}))
 await env.ERASURE_JOURNAL!.delete(journalPrefix+operation.id+'.json')
}
export async function writeErasureIntent(env:Bindings, operation:JournalOperation) {
 if (!env.ERASURE_JOURNAL) throw new Error('ERASURE_JOURNAL_UNAVAILABLE')
 const body=JSON.stringify(operation),fingerprint=await digest(body),key=journalPrefix+operation.id+'.json'
 await env.ERASURE_JOURNAL.put(key,body,{onlyIf:{etagDoesNotMatch:'*'}})
 const stored=await env.ERASURE_JOURNAL.get(key)
 if(!stored||await digest(await stored.text())!==fingerprint)throw new Error('ERASURE_JOURNAL_WRITE_FAILED')
 await updateSource(env,operation.sourceIdentity,source=>({...source,operations:[...source.operations,{id:operation.id,fingerprint}]}))
 return fingerprint
}
export async function completeErasureIntent(env:Bindings,id:string,fingerprint:string) {
 await env.ERASURE_JOURNAL!.put(journalPrefix+id+'.complete',fingerprint)
 const marker=await env.ERASURE_JOURNAL!.get(journalPrefix+id+'.complete')
 if(!marker||await marker.text()!==fingerprint)throw new Error('ERASURE_JOURNAL_COMPLETION_FAILED')
}
export async function reconcileErasureJournal(env:Bindings) {
 if(!env.ERASURE_JOURNAL)throw new Error('ERASURE_JOURNAL_UNAVAILABLE')
 const source=await journalSource(env),record=await env.ERASURE_JOURNAL.get(sourceKey(source))
 if(!record)throw new Error('ERASURE_SOURCE_JOURNAL_REQUIRED')
 const registry=await record.json<Source>()
 if(registry.initialized!==true||registry.sourceIdentity!==source||!Array.isArray(registry.operations))throw new Error('ERASURE_JOURNAL_INVALID')
 const operations:{operation:JournalOperation;fingerprint:string}[]=[]
 for(const entry of registry.operations) {
  const object=await env.ERASURE_JOURNAL.get(journalPrefix+entry.id+'.json')
  if(!object)throw new Error('ERASURE_JOURNAL_MISSING')
  const body=await object.text(),fingerprint=await digest(body),operation=JSON.parse(body) as JournalOperation
  if(fingerprint!==entry.fingerprint||operation.version!==1||operation.sourceIdentity!==source||operation.id!==entry.id)throw new Error('ERASURE_JOURNAL_INVALID')
  operations.push({operation,fingerprint})
 }
 for(const {operation,fingerprint} of operations.sort((a,b)=>a.operation.at.localeCompare(b.operation.at)||a.operation.id.localeCompare(b.operation.id))) {
  const applied=await env.DB.prepare('SELECT fingerprint FROM bw_account_erasure_journal WHERE id=?').bind(operation.id).first<{fingerprint:string}>()
  if(applied&&applied.fingerprint!==fingerprint)throw new Error('ERASURE_JOURNAL_CONFLICT')
  const marker=await env.ERASURE_JOURNAL.get(journalPrefix+operation.id+'.complete')
  if(marker) {
   if(await marker.text()!==fingerprint)throw new Error('ERASURE_JOURNAL_CONFLICT')
   if(!applied){if('kind' in operation){const {replayLegacyErasure}=await import('./legacy-erasure-journal');await replayLegacyErasure(env,operation,fingerprint)}else{const {applyAccountErasure}=await import('./account-erasure');await applyAccountErasure(env,operation,fingerprint)}}
  } else if(applied) await completeErasureIntent(env,operation.id,fingerprint)
  else throw new Error('ERASURE_JOURNAL_INDETERMINATE')
 }
 if(await env.DB.prepare('SELECT 1 FROM bw_erasure_receipts r WHERE NOT EXISTS(SELECT 1 FROM bw_account_erasure_journal j WHERE j.id=r.id) LIMIT 1').first())throw new Error('ERASURE_MIGRATION_REVIEW_REQUIRED')
}
export async function erasureRestoreResponse(env:Bindings):Promise<Response|null> {
 try {await reconcileErasureJournal(env);return null}
 catch {return Response.json({error:{code:'ERASURE_RESTORE_FENCE',message:'Serving is paused: the independent erasure journal must be available, complete and re-applied before this installation can serve data or send mail.'}},{status:503,headers:{'cache-control':'no-store'}})}
}

/** The source bucket (or its separately saved current journal) accompanies a
 * database restore. It is never embedded in that database's older archive. */
export async function historicalErasurePeople(env:Bindings,accountId:string) {
 const source=await journalSource(env),record=await env.ERASURE_JOURNAL!.get(sourceKey(source)),registry=await record!.json<Source>(),people:ErasureOperation['people']=[]
 for(const row of registry.operations){const object=await env.ERASURE_JOURNAL!.get(journalPrefix+row.id+'.json');if(!object)throw new Error('ERASURE_JOURNAL_MISSING');const body=await object.text();if(await digest(body)!==row.fingerprint)throw new Error('ERASURE_JOURNAL_CONFLICT');const operation=JSON.parse(body);if(operation.accountId===accountId&&Array.isArray(operation.people))people.push(...operation.people)}
 return people
}
export async function exportIndependentJournal(env:Bindings) {
 await reconcileErasureJournal(env)
 const source=await journalSource(env),record=await env.ERASURE_JOURNAL!.get(sourceKey(source)),registry=await record!.json<Source>(),entries=[]
 for(const row of registry.operations){const object=await env.ERASURE_JOURNAL!.get(journalPrefix+row.id+'.json'),marker=await env.ERASURE_JOURNAL!.get(journalPrefix+row.id+'.complete');if(!object||!marker||await marker.text()!==row.fingerprint)throw new Error('ERASURE_JOURNAL_INCOMPLETE');entries.push({body:await object.text(),fingerprint:row.fingerprint})}
 return {version:1,sourceIdentity:source,exportedAt:new Date().toISOString(),entries}
}
export async function attachIndependentJournal(env:Bindings,bundle:any) {
 if(!env.ERASURE_JOURNAL||bundle?.version!==1||typeof bundle.sourceIdentity!=='string'||!/^[a-f0-9-]{36}$/.test(bundle.sourceIdentity)||!Array.isArray(bundle.entries))throw new Error('ERASURE_JOURNAL_INVALID')
 const entries:{body:string;fingerprint:string;operation:JournalOperation}[]=[],seen=new Set<string>()
 for(const entry of bundle.entries) {
  if(typeof entry?.body!=='string'||await digest(entry.body)!==entry.fingerprint)throw new Error('ERASURE_JOURNAL_INVALID')
  const operation=JSON.parse(entry.body) as JournalOperation
  if(operation.version!==1||operation.sourceIdentity!==bundle.sourceIdentity||typeof operation.accountId!=='string'||!/^[a-f0-9-]{36}$/.test(operation.id)||seen.has(operation.id)||('kind' in operation&&!['unused-account','company-user','po-document','application'].includes(operation.kind)))throw new Error('ERASURE_JOURNAL_INVALID')
  seen.add(operation.id);entries.push({...entry,operation})
 }
 const existing=await env.ERASURE_JOURNAL.get(sourceKey(bundle.sourceIdentity)),prior=existing?await existing.json<Source>():{sourceIdentity:bundle.sourceIdentity,initialized:true,operations:[]}
 for(const row of prior.operations)if(seen.has(row.id)&&!entries.some(entry=>entry.operation.id===row.id&&entry.fingerprint===row.fingerprint))throw new Error('ERASURE_JOURNAL_CONFLICT')
 // Publish verified objects first; publish the complete registry last. Existing
 // later operations are merged, so an older supplied copy cannot remove them.
 for(const entry of entries){const key=journalPrefix+entry.operation.id+'.json',old=await env.ERASURE_JOURNAL.get(key);if(old&&await digest(await old.text())!==entry.fingerprint)throw new Error('ERASURE_JOURNAL_CONFLICT');await env.ERASURE_JOURNAL.put(key,entry.body);await completeErasureIntent(env,entry.operation.id,entry.fingerprint)}
 const merged={...prior,initialized:true,operations:[...prior.operations,...entries.filter(entry=>!prior.operations.some(row=>row.id===entry.operation.id)).map(entry=>({id:entry.operation.id,fingerprint:entry.fingerprint}))]}
 const published=await env.ERASURE_JOURNAL.put(sourceKey(bundle.sourceIdentity),JSON.stringify(merged),{onlyIf:existing?{etagMatches:existing.etag}:{etagDoesNotMatch:'*'}})
 if(!published)throw new Error('ERASURE_JOURNAL_CHANGED')
 return {sourceIdentity:bundle.sourceIdentity,operations:merged.operations.length}
}
export async function initializeIndependentJournal(env:Bindings,actor:{id:string},reason:string) {
 if(!env.ERASURE_JOURNAL)throw new Error('ERASURE_JOURNAL_UNAVAILABLE')
 await env.DB.prepare('INSERT OR IGNORE INTO rer_portability_state(id,source_identity) VALUES(1,?)').bind(crypto.randomUUID()).run()
 const source=(await env.DB.prepare('SELECT source_identity FROM rer_portability_state WHERE id=1').first<any>()).source_identity,key=sourceKey(source),prior=await env.ERASURE_JOURNAL.get(key)
 const untracked=await env.DB.prepare('SELECT 1 FROM bw_erasure_receipts r WHERE NOT EXISTS(SELECT 1 FROM bw_account_erasure_journal j WHERE j.id=r.id) LIMIT 1').first()
 if(prior&&(await prior.json<Source>()).initialized===true&&!untracked)return {sourceIdentity:source,initialized:true}
 if(prior)await updateSource(env,source,value=>({...value,initialized:false}))
 // Importing a database is never authorization to invent an empty journal.
 if(await env.DB.prepare("SELECT 1 FROM rer_portability_jobs WHERE kind='import' LIMIT 1").first())throw new Error('ERASURE_SOURCE_JOURNAL_REQUIRED')
 if(!prior)await env.ERASURE_JOURNAL.put(key,JSON.stringify({sourceIdentity:source,initialized:false,operations:[]}),{onlyIf:{etagDoesNotMatch:'*'}})
 const receipts=(await env.DB.prepare('SELECT * FROM bw_erasure_receipts ORDER BY erased_at,id').all<any>()).results
 const unused=(await env.DB.prepare("SELECT * FROM bw_audit WHERE action='account.erased' ORDER BY created_at,id").all<any>()).results
 const operations:LegacyErasure[]=[]
 for(const receipt of receipts){const kind:LegacyErasure['kind']=receipt.document_sha256==='company-user'?'company-user':receipt.document_sha256==='application-records'?'application':'po-document';const member=kind==='company-user'?await env.DB.prepare('SELECT user_id,email,display_name FROM bw_company_members WHERE id=?').bind(receipt.order_id).first<any>():null;if(kind==='company-user'&&!member)throw new Error('ERASURE_MIGRATION_REVIEW_REQUIRED');operations.push({version:1,kind,sourceIdentity:source,id:receipt.id,accountId:receipt.account_id,actorId:receipt.actor_id,at:receipt.erased_at,reason:receipt.reason,payload:kind==='company-user'?{userId:member.user_id,email:member.email,name:member.display_name}:kind==='application'?{id:receipt.order_id}:{orderId:receipt.order_id,sha256:receipt.document_sha256},receipt:{id:receipt.id,erasedBy:receipt.actor_id,erasedAt:receipt.erased_at,reason:receipt.reason}})}
 for(const row of unused)operations.push({version:1,kind:'unused-account',sourceIdentity:source,id:row.id,accountId:row.subject_id,actorId:row.actor_id,at:row.created_at,reason:JSON.parse(row.context_json??'{}').reason??'Previously authorized account erasure',payload:{},receipt:{id:row.id,erasedBy:row.actor_id,erasedAt:row.created_at}})
 for(const operation of operations){const found=await env.DB.prepare('SELECT 1 FROM bw_account_erasure_journal WHERE id=?').bind(operation.id).first();if(found)continue;const fingerprint=await writeErasureIntent(env,operation);await env.DB.prepare('INSERT INTO bw_account_erasure_journal VALUES(?,?,?,?)').bind(operation.id,operation.accountId,fingerprint,JSON.stringify(operation.receipt)).run();await completeErasureIntent(env,operation.id,fingerprint)}
 await updateSource(env,source,value=>({...value,initialized:true}))
 await env.DB.prepare('INSERT INTO oa_auth_audit VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),actor.id,'retention.journal-initialized',JSON.stringify({source:'retention.initialize-journal',reason,revision:source}),Date.now()).run()
 return {sourceIdentity:source,initialized:true,operations:operations.length}
}
