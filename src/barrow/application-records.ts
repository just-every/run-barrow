import type { Bindings } from '../auth.server'
import { audit } from './access'
import { normalizedCompanyName } from './account-profile'
import { fail, integer, text, type Actor } from './model'
import { usAddress, addressCheck } from './us-address'
export type ApplicationRow={id:string;value_json:string;revision:string;state:string;account_id:string|null;created_at:string;updated_at:string}
export async function applicationRow(db:D1Database,id:string) {
 const row=await db.prepare('SELECT * FROM bw_applications WHERE id=? UNION ALL SELECT * FROM bw_application_intake WHERE id=?').bind(id,id).first<ApplicationRow>()
 if(!row)fail('NOT_FOUND','Application not found.',404)
 return row
}
export function applicationValue(p:any) {
 const email=text(p?.email,'Contact email',200).normalize('NFKC').toLowerCase()
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('INPUT','Enter a contact email address.',400)
 if(p.noEin!==true&&!/^\d{2}-\d{7}$/.test(p.ein??''))fail('INPUT','Use EIN format XX-XXXXXXX, never a Social Security number, or choose no EIN (sole proprietor).',400)
 if(!Array.isArray(p.locations)||p.locations.length<1||p.locations.length>20)fail('INPUT','Supply between one and twenty requested locations.',400)
 const locations=p.locations.map((v:any)=>({name:text(v.name,'Location name',120),line1:text(v.line1,'Address line 1',120),...(v.line2?{line2:text(v.line2,'Address line 2',120)}:{}),city:text(v.city,'City',80),...usAddress(v.state,v.zip)}))
 return {name:text(p.name,'Company legal name',160),...(p.dba?{dba:text(p.dba,'DBA',160)}:{}),email,ein:p.noEin===true?null:p.ein,noEin:p.noEin===true,contactName:text(p.contactName,'Contact name',120),phone:text(p.phone,'Contact phone',40),annualVolumeUsd:integer(p.annualVolumeUsd,'Expected annual volume USD',0,1000000000),locations,consent:true}
}
export function applicationEvent(db:D1Database,id:string,state:string,reason:string,actorId:string,at:string) {
 return db.prepare('INSERT INTO bw_application_history VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),id,state,reason,actorId,at)
}
export function applicationAudit(db:D1Database,actor:Actor,id:string,action:string,revision:string,reason:string) {
 return audit(db,actor,id,action,{revision,source:'application',reason})
}
export async function applicationView(db:D1Database,row:ApplicationRow,staff=false) {
 const value=JSON.parse(row.value_json)
 const documents=(await db.prepare('SELECT id,name,type,size,sha256,created_at FROM bw_application_documents WHERE application_id=? ORDER BY created_at,id').bind(row.id).all<any>()).results.map(doc=>({...doc,path:`/api/barrow/applications/${row.id}/documents/${doc.id}`}))
 const history=(await db.prepare('SELECT state,reason,created_at FROM bw_application_history WHERE application_id=? ORDER BY created_at,rowid').bind(row.id).all<any>()).results
 return {id:row.id,value,revision:row.revision,state:row.state,accountId:row.account_id,createdAt:row.created_at,updatedAt:row.updated_at,documents,history,addressCheck,documentLabels:'Not validated; exemption review is TAX-003’s. Not malware-screened.',...(staff?{duplicates:await applicationDuplicates(db,row)}:{})}
}
export async function applicationDuplicates(db:D1Database,row:ApplicationRow) {
 const value=JSON.parse(row.value_json),name=normalizedCompanyName(value.name)
 const accounts=(await db.prepare("SELECT a.id,json_set(a.value_json,'$.ein',(SELECT json_extract(p.value_json,'$.ein') FROM bw_applications p WHERE p.account_id=a.id AND p.state='approved' LIMIT 1)) AS value_json,a.revision FROM bw_accounts a ORDER BY a.id").all<any>()).results
 const apps=(await db.prepare("SELECT * FROM bw_applications WHERE id<>? AND state IN ('submitted','information requested') ORDER BY id").bind(row.id).all<ApplicationRow>()).results
 return [...accounts.map(r=>({...r,kind:'account'})),...apps.map(r=>({...r,kind:'application'}))].filter(r=>{
  const v=JSON.parse(r.value_json)
  return normalizedCompanyName(v.name)===name||v.email===value.email||(value.ein&&v.ein===value.ein)
 }).map(r=>({id:r.id,kind:r.kind,revision:r.revision,name:JSON.parse(r.value_json).name}))
}
export async function purgeUnverified(env:Bindings) {
 const cutoff=new Date(Date.now()-86400000).toISOString()
 await env.DB.batch([
  env.DB.prepare('DELETE FROM bw_application_codes WHERE application_id IN (SELECT id FROM bw_application_intake WHERE created_at<=?)').bind(cutoff),
  env.DB.prepare('DELETE FROM bw_application_intake WHERE created_at<=?').bind(cutoff),
  env.DB.prepare('DELETE FROM bw_application_sessions WHERE expires_at<=?').bind(Date.now()),env.DB.prepare('DELETE FROM bw_application_rates WHERE expires_at<=?').bind(Date.now())])
}
