import { prepareLegacyErasure } from './legacy-erasure-journal'
import { applicationAccess } from './application-access'
import type { Bindings } from '../auth.server'
import { supplier, fail, text, type Actor } from './model'
import { audit, changed, commit } from './access'
import { createPortability } from '@runeditrun/rer/modules/portability'
import { toD1Sql } from '@runeditrun/rer/modules/erasure/fence'
import { portabilityPolicy } from './portability-policy.mjs'
import type { ApplicationRow } from './application-records'
import { applicationDocumentReason } from './application-document-policy'
export async function applicationExport(db:D1Database,actor:Actor,accountIds:string[]) {
 const access=applicationAccess(actor)
 if(actor.staff&&!access)return {applications:[],applicationdocuments:[]}
 const rows=(await db.prepare(`SELECT * FROM bw_applications WHERE state<>'unverified'${supplier(actor)?'':' AND account_id IN (SELECT value FROM json_each(?))'} ORDER BY id`).bind(...(supplier(actor)?[]:[JSON.stringify(accountIds)])).all<ApplicationRow>()).results
 const ids=rows.map(row=>row.id)
 const documents=ids.length?(await db.prepare('SELECT id,application_id,name,type,size,sha256,created_at FROM bw_application_documents WHERE application_id IN (SELECT value FROM json_each(?)) ORDER BY application_id,id').bind(JSON.stringify(ids)).all<any>()).results:[]
 return {applications:(actor.staff&&access==='documents'?[]:rows).map(row=>({id:row.id,accountId:row.account_id??'',revision:row.revision,state:row.state,createdAt:row.created_at,updatedAt:row.updated_at,...JSON.parse(row.value_json)})),applicationdocuments:documents.map(row=>({id:row.id,applicationId:row.application_id,name:row.name,type:row.type,bytes:row.size,sha256:row.sha256,time:row.created_at,path:`/api/barrow/applications/${row.application_id}/documents/${row.id}`,available:false,screening:'not malware-screened',reason:applicationDocumentReason}))}
}
export async function applicationRetention(env:Bindings,days:number|null) {
 const rows=(await env.DB.prepare('SELECT * FROM bw_applications ORDER BY id').all<ApplicationRow>()).results
 return Promise.all(rows.map(async row=>{
  const held=!!row.account_id&&!!await env.DB.prepare('SELECT id FROM bw_retention_requests WHERE account_id=? AND held=1').bind(row.account_id).first()
  const expiry=days===null?null:Date.parse(row.updated_at)+days*86400000
  return {id:row.id,accountId:row.account_id,revision:row.revision,name:JSON.parse(row.value_json).name,state:row.state,expiresAt:expiry===null?null:new Date(expiry).toISOString(),held,eligible:['declined','withdrawn'].includes(row.state)&&!held&&expiry!==null&&Date.now()>expiry,reason:row.state==='approved'?'Approved application follows account erasure; submitted orders retain certificates under the seven-year floor.':held?'Legal hold':expiry===null?'No recorded retention age':'Explicit owner review required'}
 }))
}
export { applicationAccountErasure } from './application-erasure-statements'

export async function eraseApplication(env:Bindings,actor:Actor,p:any,policy:{days:any;revision:string|null}) {
 if(actor.agent||actor.role!=='owner')fail('FORBIDDEN','Only the owner may erase a reviewed application.',403)
 const reason=text(p.reason,'Erasure reason',1000),rows=await applicationRetention(env,policy.days.applicationRecords??null),row=rows.find(row=>row.id===p.id)
 if(!row)fail('NOT_FOUND','Application not found.',404)
 if(!row.eligible)fail('RETENTION','Application is not eligible for erasure.')
 if(p.confirm!=='ERASE'||p.revision!==row.revision||p.policyRevision!==policy.revision)fail('CHANGED','Review the exact application and current policy, then type ERASE.')
 const portability=await createPortability({db:env.DB,policy:portabilityPolicy}),checkpoint=[...await portability.invalidateTransfersStatements(),...await portability.redactionStatements()].map(toD1Sql).map(s=>env.DB.prepare(s.sql).bind(...(s.params??[]))),revision=crypto.randomUUID(),at=new Date().toISOString()
 const journal=await prepareLegacyErasure(env,actor,'application',row.accountId??row.id,{id:row.id,reason},{id:revision,applicationId:row.id,erasedAt:at,erasedBy:actor.id})
 await journal.run(()=>commit(env.DB,actor,[env.DB.prepare(journal.statement.sql).bind(...journal.statement.params!),env.DB.prepare("INSERT INTO bw_guard SELECT CASE WHEN COALESCE((SELECT revision FROM bw_settings WHERE key='retention'),'')=? THEN 1 ELSE 0 END").bind(policy.revision??''),env.DB.prepare("DELETE FROM bw_applications WHERE id=? AND revision=? AND state IN ('declined','withdrawn')").bind(row.id,row.revision),changed(env.DB),...['bw_application_documents','bw_application_history','bw_application_codes','bw_application_sessions'].map(table=>env.DB.prepare(`DELETE FROM ${table} WHERE application_id=?`).bind(row.id)),...checkpoint,env.DB.prepare('INSERT INTO bw_erasure_receipts VALUES(?,?,?,?,?,?,?)').bind(revision,row.id,row.accountId??row.id,'application-records',actor.id,at,reason),audit(env.DB,actor,row.id,'application.erased',{revision,source:'retention.erase-application',reason})]))
 return {id:revision,applicationId:row.id,erasedAt:at,erasedBy:actor.id}
}
