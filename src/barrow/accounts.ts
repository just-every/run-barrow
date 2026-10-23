import { cutoverErasure } from './imports/cutover-custody'
import { prepareLegacyErasure } from './legacy-erasure-journal'
import { staffAccountAllowed } from './staff-policy'
import { companyAccountIds, companyMembership } from './company-policy'
import { applicationAccountErasure } from './application-custody'
import { quoteMailErasureStatements } from './quote-mail-custody'
import { commercialAuditEvent } from './audit-event'
import { operatorAuth, type Bindings } from '../auth.server'
import { fail, supplier, requireSupplier, type Account, type Actor, text } from './model'
import { validateAccountValue, retireAccountImportCustody } from './imports'
import { commit, changed, audit } from './access'
import { createPortability } from '@runeditrun/rer/modules/portability'
import { toD1Sql } from '@runeditrun/rer/modules/erasure/fence'
import { accountDirectorySnapshot, directoryPredicate, companyIdentityChanged, duplicateCompany, duplicateReviewAction, validateDuplicateReviews } from './account-profile'
import { portabilityPolicy } from './portability-policy.mjs'
export async function accounts(db:D1Database,actor:Actor):Promise<Account[]> {
 const ids=await companyAccountIds(db,actor)
 const rows=await db.prepare('SELECT * FROM bw_accounts'+(ids===null?'':' WHERE id IN (SELECT value FROM json_each(?))')+' ORDER BY id').bind(...(ids===null?[]:[JSON.stringify(ids)])).all<any>()
 return rows.results.map(row=>({id:row.id,value:JSON.parse(row.value_json),revision:row.revision}))
}
export async function account(db:D1Database,actor:Actor,id:string):Promise<Account> {
 const row=await db.prepare('SELECT * FROM bw_accounts WHERE id=?').bind(id).first<any>()
 if(!row || (actor.staff&&!staffAccountAllowed(actor.staff,id)) || (!supplier(actor) && !await companyMembership(db,actor,id))) fail('NOT_FOUND','Trade account not found.',404)
 return {id:row.id,value:JSON.parse(row.value_json),revision:row.revision}
}
// A new account without a chosen ID takes one from its name ("Palmetto & Pine" → palmetto-pine, then palmetto-pine-2).
async function freeId(db:D1Database,name:string) {
 const base=name.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60).replace(/-+$/,'')||'account'
 const taken=new Set((await db.prepare('SELECT id FROM bw_accounts WHERE id=? OR id LIKE ?').bind(base,base+'-%').all<{id:string}>()).results.map(row=>row.id))
 let id=base
 for(let n=2;taken.has(id);n++) id=`${base}-${n}`
 return id
}
export async function prepareAccountSave(env:Bindings,actor:Actor,p:any) {
 requireSupplier(actor)
  const value=validateAccountValue(p.value),id=p.id??await freeId(env.DB,value.name),revision=crypto.randomUUID()
  if(typeof id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(id)) fail('INPUT','Use a stable account ID with letters, digits, dash or underscore.',400)
  const prior=await env.DB.prepare('SELECT * FROM bw_accounts WHERE id=?').bind(id).first<any>()
  if(prior && p.revision!==prior.revision) fail('CHANGED','This account changed. Refresh it before saving.')
  if(prior && JSON.parse(prior.value_json).email!==value.email) fail('ACCOUNT_EMAIL','Create a separate account to change the customer email; existing order access cannot be reassigned.')
  const directory=await accounts(env.DB,actor)
  if(directory.some(row=>row.id!==id&&row.value.email===value.email)) fail('ACCOUNT_EMAIL_DUPLICATE','That email already belongs to another trade account.')
  const reviewing=companyIdentityChanged(prior?JSON.parse(prior.value_json):undefined,value)
  const candidates=reviewing?directory.filter(row=>row.id!==id&&duplicateCompany(row.value,value)):[]
  const reviews=validateDuplicateReviews(p.duplicateReviews,candidates)
  const snapshot=accountDirectorySnapshot(directory)
  // Identity changes need the reviewed directory; price/profile-only edits fence this account.
  // A scoped manager's directory is intentionally incomplete and cannot stand in for the whole table.
  const guard=reviewing?env.DB.prepare(`INSERT INTO bw_guard(value) SELECT CASE WHEN (${directoryPredicate}) THEN 1 ELSE 0 END`).bind(JSON.stringify(snapshot),snapshot.length):env.DB.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_accounts WHERE id=? AND revision=?) THEN 1 ELSE 0 END').bind(id,prior.revision)
  const statement=prior ? env.DB.prepare('UPDATE bw_accounts SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify(value),revision,id,prior.revision) : env.DB.prepare('INSERT INTO bw_accounts VALUES(?,?,?)').bind(id,JSON.stringify(value),revision)
  const reason=p.reason===undefined?'Supplier saved the trade account profile and commercial terms.':text(p.reason,'Change reason',240)
  const context={accountId:id,revision,source:'account.save',reason}
  const previousPrices=prior?JSON.parse(prior.value_json).prices:[]
  const priceEvents=value.prices.filter(price=>JSON.stringify(previousPrices.find((before:any)=>before.sku===price.sku))!==JSON.stringify(price)).map(price=>audit(env.DB,actor,`${id}:${price.sku}`,'price.approved',{...context,reason:p.reason!==undefined?reason:price.pricing?.override?.reason??`Supplier approved the agreed price and rules for ${price.sku}.`}))
  const removed=previousPrices.filter((price:any)=>!value.prices.some(current=>current.sku===price.sku)).map((price:any)=>audit(env.DB,actor,`${id}:${price.sku}`,'price.removed',{...context,reason:p.reason!==undefined?reason:`Supplier removed ${price.sku} from the agreed assortment.`}))
  const statements=[guard,statement,changed(env.DB),audit(env.DB,actor,id,'account.saved',context),...priceEvents,...removed,...(reviews.length?[audit(env.DB,actor,id,duplicateReviewAction(reviews),{...context,reason:'Supplier reviewed possible duplicates as separate companies without merging identities.'})]:[])]
  return {record:{id,value,revision},statements}

}
export async function accountCommand(request:Request,env:Bindings,actor:Actor,type:string,p:any) {
 requireSupplier(actor)
 if(type==='account.save') {
  const saved=await prepareAccountSave(env,actor,p)
  await commit(env.DB,actor,saved.statements)
  return saved.record
 }
 const selected=await account(env.DB,actor,p.accountId)
 if(type==='account.invite') {
  const restored=await env.DB.prepare("SELECT 1 FROM bw_company_members m WHERE m.account_id=? AND NOT EXISTS(SELECT 1 FROM bw_company_members active JOIN oa_operators p ON p.id=active.user_id WHERE active.account_id=m.account_id AND active.state='active' AND p.status='active' AND p.role='member')").bind(selected.id).first()
  if(restored){const {companyCommand,unlimitedCompanyPolicy}=await import('./company-members');return companyCommand(request,env,actor,'company.invite',{accountId:selected.id,email:selected.value.email,name:selected.value.name,policy:unlimitedCompanyPolicy,reason:'Supplier explicitly reauthorized the first buyer after account restoration or removal.'})}
  await commit(env.DB,actor,[audit(env.DB,actor,selected.id,'account.invitation-requested',{accountId:selected.id,revision:selected.revision,source:'account.invite',reason:'Supplier requested a native buyer invitation; this records a request, not mail delivery.'})])
  return operatorAuth(env).invite(request,{email:selected.value.email,displayName:selected.value.name,role:'member',returnTo:'/app'})
 }
 if(type==='account.erase') {
  if(actor.role!=='owner')fail('FORBIDDEN','Only the signed-in owner may erase an account.',403)
  if(await env.DB.prepare('SELECT id FROM bw_retention_requests WHERE account_id=? AND held=1').bind(selected.id).first()) fail('LEGAL_HOLD','This account has a held erasure request. Preserve its records pending attributed owner review.')
  if(p.confirm!=='ERASE') fail('CONFIRM','Type ERASE to confirm removal of this unused account.',400)
  if(await env.DB.prepare('SELECT id FROM bw_orders WHERE account_id=? LIMIT 1').bind(selected.id).first()) fail('ORDERS_EXIST','This account has orders. Keep the commercial history; erasure is limited to unused accounts.')
  if(await env.DB.prepare('SELECT id FROM bw_quotes WHERE account_id=? LIMIT 1').bind(selected.id).first()) fail('QUOTES_EXIST','This account has quotes. Keep the commercial history; erasure is limited to unused accounts.')
  const portability=await createPortability({db:env.DB,policy:portabilityPolicy})
  const checkpoint=[...await portability.invalidateTransfersStatements(),...await portability.redactionStatements()].map(toD1Sql)
  const erased=commercialAuditEvent(actor.id,selected.id,'account.erased',{accountId:selected.id,revision:selected.revision,source:'account.erase',reason:'Supplier confirmed erasure of an unused account and retirement of import custody.'})
  const journal=await prepareLegacyErasure(env,actor,'unused-account',selected.id,{email:selected.value.email,reason:'Owner confirmed erasure of an unused account.'},{id:crypto.randomUUID(),accountId:selected.id,erasedAt:new Date().toISOString(),erasedBy:actor.id,kind:'unused-account'})
  return journal.run(()=>retireAccountImportCustody(env.DB,actor,{checkpoint,accountId:selected.id,email:selected.value.email,nativeStatements:[cutoverErasure(selected.id),journal.statement,{sql:'DELETE FROM bw_agent_tokens WHERE id IN (SELECT token_id FROM bw_agent_proposal_grants WHERE account_id=?)',params:[selected.id]},...['bw_agent_proposals','bw_agent_proposal_attempts','bw_agent_proposal_grants'].map(table=>({sql:`DELETE FROM ${table} WHERE account_id=?`,params:[selected.id]})),{sql:'INSERT INTO bw_guard(value) SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM bw_retention_requests WHERE account_id=? AND held=1) THEN 1 ELSE 0 END',params:[selected.id]},{sql:'DELETE FROM bw_retention_requests WHERE account_id=?',params:[selected.id]},{sql:'DELETE FROM bw_company_invites WHERE account_id=?',params:[selected.id]},{sql:"DELETE FROM bw_rep_assignments WHERE kind='account' AND target=?",params:[selected.id]},{sql:'DELETE FROM bw_company_delegations WHERE account_id=?',params:[selected.id]},{sql:'DELETE FROM bw_approval_notices WHERE account_id=?',params:[selected.id]},{sql:'DELETE FROM bw_visits WHERE account_id=?',params:[selected.id]},{sql:'DELETE FROM bw_company_route_versions WHERE account_id=?',params:[selected.id]},{sql:'DELETE FROM bw_company_routes WHERE account_id=?',params:[selected.id]},{sql:'DELETE FROM bw_company_members WHERE account_id=?',params:[selected.id]},{sql:'DELETE FROM bw_company_legacy_accounts WHERE account_id=?',params:[selected.id]},{sql:'DELETE FROM bw_accounts WHERE id=? AND revision=? AND NOT EXISTS(SELECT 1 FROM bw_orders WHERE account_id=?) AND NOT EXISTS(SELECT 1 FROM bw_quotes WHERE account_id=?)',params:[selected.id,selected.revision,selected.id,selected.id]},{sql:'INSERT INTO bw_guard(value) VALUES(changes())'},{sql:'DELETE FROM bw_guard'},{sql:'DELETE FROM bw_line_sheets WHERE account_id=?',params:[selected.id]},{sql:'DELETE FROM bw_sheet_events WHERE account_id=?',params:[selected.id]},{sql:'DELETE FROM bw_lists WHERE account_id=?',params:[selected.id]},{sql:'DELETE FROM bw_locations WHERE account_id=?',params:[selected.id]},{sql:'DELETE FROM bw_terms_assignments WHERE account_id=?',params:[selected.id]},...applicationAccountErasure(selected.id),...quoteMailErasureStatements(selected.id),{sql:'DELETE FROM bw_followups WHERE account_id=?',params:[selected.id]},erased]}))
 }
 fail('NOT_FOUND','Unknown account command.',404)
}
