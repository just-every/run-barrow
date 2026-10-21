import type { Bindings } from '../auth.server'
import { audit, commit, digest } from './access'
import { accounts } from './accounts'
import { readDocument } from './documents'
import { fail, requirePerson, requireSupplier, supplier, text, type Actor } from './model'
const latest=(db:D1Database)=>db.prepare('SELECT version,title,body,sha256,pdf_json,created_by,created_at FROM bw_usage_terms ORDER BY version DESC LIMIT 1').first<any>()
export async function readUsageTerms(env:Bindings,actor:Actor) {
 const row=await latest(env.DB),accepted=row?await env.DB.prepare('SELECT * FROM bw_usage_acceptances WHERE user_id=? AND version=?').bind(actor.id,row.version).first<any>():null
 const pdf=row?.pdf_json?JSON.parse(row.pdf_json):null
 return {current:row?{version:row.version,title:row.title,body:row.body,sha256:row.sha256,publishedAt:row.created_at,pdf:pdf?{name:pdf.name,sha256:pdf.sha256,path:`/api/barrow/usage-terms/${row.version}/document`}:null}:null,accepted,required:!supplier(actor)&&!!row&&!accepted}
}
export async function requireUsageTerms(env:Bindings,actor:Actor,accountId?:string) {
 if(actor.agent&&accountId) {
  const row=await latest(env.DB)
  if(row&&!await env.DB.prepare("SELECT 1 FROM bw_accounts a JOIN oa_operators p ON p.email=json_extract(a.value_json,'$.email') JOIN bw_usage_acceptances u ON u.user_id=p.id WHERE a.id=? AND p.role='member' AND p.status='active' AND u.version=?").bind(accountId,row.version).first())fail('USAGE_TERMS_REQUIRED','The account’s buyer person must accept the current portal usage terms.')
  return
 }
 if(supplier(actor))return
 const usage=await readUsageTerms(env,actor)
 if(usage.required)fail('USAGE_TERMS_REQUIRED','Accept the current portal usage terms before opening commercial records.')
}
export async function usageTermsCommand(env:Bindings,actor:Actor,type:string,p:any) {
 requirePerson(actor)
 if(type==='usage.publish') {
  requireSupplier(actor)
  const title=text(p.title,'Title',160),body=p.body?text(p.body,'Usage terms',20000):'',pdf=p.pdf?await readDocument(p.pdf,'A usage terms PDF','usage terms'):null
  if(pdf&&pdf.type!=='application/pdf')fail('DOCUMENT','Usage terms accept a PDF only.',400)
  if(!body&&!pdf)fail('INPUT','Publish usage terms as text, a PDF or both.',400)
  const version=((await latest(env.DB))?.version??0)+1,sha256=await digest(JSON.stringify([title,body,pdf?.sha256??''])),at=new Date().toISOString()
  await commit(env.DB,actor,[env.DB.prepare('INSERT INTO bw_usage_terms VALUES(?,?,?,?,?,?,?)').bind(version,title,body,sha256,pdf?JSON.stringify(pdf):null,actor.id,at),audit(env.DB,actor,`usage:${version}`,'usage.published',{revision:String(version),source:type,reason:'Supplier published an immutable portal usage version; buyer people must reaccept.'})])
  return {version,sha256}
 }
 const row=await latest(env.DB)
 if(!row||p.version!==row.version||p.sha256!==row.sha256||p.accepted!==true)fail('USAGE_TERMS_REQUIRED','Review and explicitly accept the newest portal usage terms.')
 if(!(await accounts(env.DB,actor)).length)fail('FORBIDDEN','Only an account’s buyer person can accept portal usage terms.',403)
 const at=new Date().toISOString()
 await commit(env.DB,actor,[env.DB.prepare('INSERT INTO bw_guard SELECT CASE WHEN (SELECT MAX(version) FROM bw_usage_terms)=? THEN 1 ELSE 0 END').bind(row.version),env.DB.prepare('INSERT INTO bw_usage_acceptances VALUES(?,?,?,?) ON CONFLICT(user_id,version) DO NOTHING').bind(actor.id,row.version,row.sha256,at),audit(env.DB,actor,`usage:${row.version}`,'usage.accepted',{revision:String(row.version),source:type,reason:'Buyer accepted the exact portal usage content SHA-256.'})])
 return {userId:actor.id,version:row.version,sha256:row.sha256,acceptedAt:at}
}
export async function usageDocument(env:Bindings,actor:Actor,version:number) {
 requirePerson(actor)
 const row=await env.DB.prepare('SELECT pdf_json FROM bw_usage_terms WHERE version=?').bind(version).first<any>(),pdf=row?.pdf_json?JSON.parse(row.pdf_json):null
 if(!pdf)fail('NOT_FOUND','Usage terms PDF not found.',404)
 return new Response(Uint8Array.from(atob(pdf.contentBase64),c=>c.charCodeAt(0)),{headers:{'content-type':'application/pdf','content-disposition':`attachment; filename="${pdf.name}"`,'cache-control':'no-store','x-content-type-options':'nosniff'}})
}
