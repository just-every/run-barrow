import type { Bindings } from '../../auth.server'
import { companyCommand } from '../company-members'
import { fail, text, type Actor } from '../model'
import { canonicalJson, sha256 } from '../../modules/import-kit/src/d1/index'
import { platformOwner } from './platform-history'

/** A separate, explicit owner action uses ACC-002's existing invitation authority and consent. */
export async function inviteWizUser(request:Request,env:Bindings,actor:Actor,input:any) {
 platformOwner(actor)
 if(input?.confirm!==true)fail('IMPORT_INVITATION','Explicitly approve this native invitation and its selected purchasing rights.',400)
 const row=await env.DB.prepare("SELECT * FROM bw_platform_imports WHERE id=? AND fingerprint=? AND system='wizcommerce'").bind(text(input.importId,'Import'),text(input.fingerprint,'Import fingerprint',64)).first<any>()
 if(!row)fail('NOT_FOUND','Reviewed source import not found.',404)
 const source=JSON.parse(row.source_json),email=text(input.email,'Reviewed source email',254).normalize('NFKC').toLowerCase()
 const candidate=source.invitationCandidates?.find((user:any)=>user.email===email)
 if(!candidate)fail('IMPORT_INVITATION','This source has no retained invitation candidate with that exact email.',400)
 const key=sha256(canonicalJson(['wizcommerce',row.tenant,candidate.accountId,candidate.email]))
 try{return await companyCommand(request,env,actor,'company.invite',{accountId:candidate.accountId,email:candidate.email,name:candidate.name,policy:input.policy,reason:text(input.reason,'Invitation review reason',1000)},{key,jobId:row.id,fingerprint:row.fingerprint,sourceJson:row.source_json})}
 catch(error){
  if((error as Error).message.includes('UNIQUE constraint')&&await env.DB.prepare('SELECT invitation_id FROM bw_import_invitations WHERE source_key=?').bind(key).first())return {status:'invitation requested'}
  throw error
 }
}
