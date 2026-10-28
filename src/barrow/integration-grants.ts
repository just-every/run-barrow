import type { Bindings } from '../auth.server'
import { audit, changed, commit, digest } from './access'
import { account } from './accounts'
import { activeAccountGuard, requireActiveAccount } from './account-profile'
import { now } from './clock'
import { fail, text, type Actor } from './model'

export const integrationScopes = ['catalog:read','order:prepare','products:prepare','variants:prepare','accounts:prepare','locations:prepare','price-books:prepare','quotes:prepare'] as const
export type IntegrationScope = typeof integrationScopes[number]
export type IntegrationGrant = { id:string; accountId:string; issuerId:string; issuerVersion:number; scopes:IntegrationScope[]; expiresAt:number; revision:string; state:'active'|'revoked'; reason:string }
const owner=(actor:Actor)=>{if(actor.agent||actor.role!=='owner')fail('FORBIDDEN','Only the signed-in owner manages integration grants.',403)}
export function integrationId(value:unknown,label='Entity ID') {
 if(typeof value!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(value))fail('INPUT',`Use an exact stable ${label.toLowerCase()}.`,400)
 return value
}
function grant(row:any):IntegrationGrant {
 return {id:row.id,accountId:row.account_id,issuerId:row.issuer_id,issuerVersion:row.issuer_version,scopes:JSON.parse(row.scopes_json),expiresAt:row.expires_at,revision:row.revision,state:row.state,reason:row.reason}
}
export async function integrationCredential(env:Bindings,token:string):Promise<Actor|null> {
 return integrationActor(env,'g.digest',await digest(token))
}
/** Internal lookup for a person's review; never an authentication door. */
export async function integrationGrantActor(env:Bindings,id:string):Promise<Actor|null> {
 return integrationActor(env,'g.id',integrationId(id,'Grant ID'))
}
async function integrationActor(env:Bindings,column:'g.id'|'g.digest',value:string):Promise<Actor|null> {
 const at=(await now()).getTime()
 const row=await env.DB.prepare(`SELECT g.*,o.email,o.role,o.version FROM bw_integration_grants g JOIN oa_operators o ON o.id=g.issuer_id JOIN bw_accounts a ON a.id=g.account_id
  WHERE ${column}=? AND g.state='active' AND g.expires_at>? AND o.status='active' AND o.role='owner' AND o.version=g.issuer_version
  AND COALESCE(json_extract(a.value_json,'$.lifecycle'),'active')='active'`).bind(value,at).first<any>()
 return row?{id:row.issuer_id,email:row.email,role:row.role,version:row.version,agent:true,grantId:row.id,agentScope:'integration',integration:grant(row),integrationAt:at}:null
}
/** Called again by the shared commit admission, in the draft's atomic batch. */
export function integrationAdmission(db:D1Database,actor:Actor) {
 const g=actor.integration!
 return db.prepare(`INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(
  SELECT 1 FROM bw_integration_grants g JOIN oa_operators o ON o.id=g.issuer_id JOIN bw_accounts a ON a.id=g.account_id
  WHERE g.id=? AND g.revision=? AND g.account_id=? AND g.state='active' AND g.expires_at>?
  AND o.id=? AND o.status='active' AND o.role='owner' AND o.version=g.issuer_version AND o.version=?
  AND COALESCE(json_extract(a.value_json,'$.lifecycle'),'active')='active') THEN 1 ELSE 0 END`)
  .bind(g.id,g.revision,g.accountId,actor.integrationAt!,actor.id,actor.version)
}
export async function integrationGrants(env:Bindings,actor:Actor,accountId:string) {
 owner(actor);await account(env.DB,actor,integrationId(accountId,'Account ID'))
 return {grants:(await env.DB.prepare('SELECT * FROM bw_integration_grants WHERE account_id=? ORDER BY id').bind(accountId).all<any>()).results.map(grant)}
}
export async function createIntegrationGrant(env:Bindings,actor:Actor,p:any) {
 owner(actor)
 if(!p||p.consent!==true||Object.keys(p).some(key=>!['accountId','scopes','expiresAt','consent','reason'].includes(key)))fail('CONSENT','Explicitly consent to the exact account, scopes and expiry.',400)
 const selected=await account(env.DB,actor,integrationId(p.accountId,'Account ID'));requireActiveAccount(selected)
 if(!Array.isArray(p.scopes)||!p.scopes.length||p.scopes.length>integrationScopes.length||new Set(p.scopes).size!==p.scopes.length||p.scopes.some((s:unknown)=>!integrationScopes.includes(s as IntegrationScope)))fail('SCOPE','Choose explicit catalog read or entity preparation scopes. A person must apply every entity change.',400)
 const at=(await now()).getTime(),expiresAt=p.expiresAt
 if(!Number.isSafeInteger(expiresAt)||expiresAt<=at||expiresAt>at+7*86400000)fail('EXPIRY','Choose an expiry within the next seven days.',400)
 const reason=text(p.reason,'Consent reason',1000),id=crypto.randomUUID(),revision=crypto.randomUUID()
 const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('')
 await commit(env.DB,actor,[activeAccountGuard(env.DB,selected),env.DB.prepare("INSERT INTO bw_integration_grants(id,digest,account_id,issuer_id,issuer_version,scopes_json,expires_at,revision,state,reason) VALUES(?,?,?,?,?,?,?,?,'active',?)").bind(id,await digest(token),selected.id,actor.id,actor.version,JSON.stringify([...p.scopes].sort()),expiresAt,revision,reason),audit(env.DB,actor,id,'integration.granted',{accountId:selected.id,revision,source:'integration.grant',reason})])
 return {token,grant:{id,accountId:selected.id,issuerId:actor.id,issuerVersion:actor.version,scopes:[...p.scopes].sort(),expiresAt,revision,state:'active',reason}}
}
export async function revokeIntegrationGrant(env:Bindings,actor:Actor,p:any) {
 owner(actor)
 const id=integrationId(p?.grantId,'Grant ID'),revision=text(p.revision,'Current grant revision',100),reason=text(p.reason,'Revocation reason',1000)
 const row=await env.DB.prepare('SELECT * FROM bw_integration_grants WHERE id=?').bind(id).first<any>()
 if(!row)fail('NOT_FOUND','Integration grant not found.',404)
 if(row.state!=='active'||row.revision!==revision)fail('CHANGED','Refresh the active grant before revoking it.')
 const next=crypto.randomUUID()
 await commit(env.DB,actor,[env.DB.prepare("UPDATE bw_integration_grants SET state='revoked',revision=?,reason=? WHERE id=? AND revision=? AND state='active'").bind(next,reason,id,revision),changed(env.DB),audit(env.DB,actor,id,'integration.revoked',{accountId:row.account_id,revision:next,source:'integration.revoke',reason})])
 return {grant:grant({...row,state:'revoked',revision:next,reason})}
}
