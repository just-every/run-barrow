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
 const rows=await db.prepare('SELECT * FROM bw_accounts'+(supplier(actor)?'':" WHERE json_extract(value_json,'$.email')=?")+' ORDER BY id').bind(...(supplier(actor)?[]:[actor.email])).all<any>()
 return rows.results.map(row=>({id:row.id,value:JSON.parse(row.value_json),revision:row.revision}))
}
export async function account(db:D1Database,actor:Actor,id:string):Promise<Account> {
 const row=await db.prepare('SELECT * FROM bw_accounts WHERE id=?').bind(id).first<any>()
 if(!row || (!supplier(actor) && JSON.parse(row.value_json).email!==actor.email)) fail('NOT_FOUND','Trade account not found.',404)
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
export async function accountCommand(request:Request,env:Bindings,actor:Actor,type:string,p:any) {
 requireSupplier(actor)
 if(type==='account.save') {
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
  const guard=env.DB.prepare(`INSERT INTO bw_guard(value) SELECT CASE WHEN (${directoryPredicate}) THEN 1 ELSE 0 END`).bind(JSON.stringify(snapshot),snapshot.length)
  const statement=prior ? env.DB.prepare('UPDATE bw_accounts SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify(value),revision,id,prior.revision) : env.DB.prepare('INSERT INTO bw_accounts VALUES(?,?,?)').bind(id,JSON.stringify(value),revision)
  const reason=p.reason===undefined?'Supplier saved the trade account profile and commercial terms.':text(p.reason,'Change reason',240)
  const context={accountId:id,revision,source:'account.save',reason}
  const previousPrices=prior?JSON.parse(prior.value_json).prices:[]
  const priceEvents=value.prices.filter(price=>JSON.stringify(previousPrices.find((before:any)=>before.sku===price.sku))!==JSON.stringify(price)).map(price=>audit(env.DB,actor,`${id}:${price.sku}`,'price.approved',{...context,reason:p.reason!==undefined?reason:price.pricing?.override?.reason??`Supplier approved the agreed price and rules for ${price.sku}.`}))
  const removed=previousPrices.filter((price:any)=>!value.prices.some(current=>current.sku===price.sku)).map((price:any)=>audit(env.DB,actor,`${id}:${price.sku}`,'price.removed',{...context,reason:p.reason!==undefined?reason:`Supplier removed ${price.sku} from the agreed assortment.`}))
  await commit(env.DB,actor,[guard,statement,changed(env.DB),audit(env.DB,actor,id,'account.saved',context),...priceEvents,...removed,...(reviews.length?[audit(env.DB,actor,id,duplicateReviewAction(reviews),{...context,reason:'Supplier reviewed possible duplicates as separate companies without merging identities.'})]:[])])
  return {id,value,revision}
 }
 const selected=await account(env.DB,actor,p.accountId)
 if(type==='account.invite') {
  await commit(env.DB,actor,[audit(env.DB,actor,selected.id,'account.invitation-requested',{accountId:selected.id,revision:selected.revision,source:'account.invite',reason:'Supplier requested a native buyer invitation; this records a request, not mail delivery.'})])
  return operatorAuth(env).invite(request,{email:selected.value.email,displayName:selected.value.name,role:'member',returnTo:'/app'})
 }
 if(type==='account.erase') {
  if(await env.DB.prepare('SELECT id FROM bw_retention_requests WHERE account_id=? AND held=1').bind(selected.id).first()) fail('LEGAL_HOLD','This account has a held erasure request. Preserve its records pending attributed owner review.')
  if(p.confirm!=='ERASE') fail('CONFIRM','Type ERASE to confirm removal of this unused account.',400)
  if(await env.DB.prepare('SELECT id FROM bw_orders WHERE account_id=? LIMIT 1').bind(selected.id).first()) fail('ORDERS_EXIST','This account has orders. Keep the commercial history; erasure is limited to unused accounts.')
  if(await env.DB.prepare('SELECT id FROM bw_quotes WHERE account_id=? LIMIT 1').bind(selected.id).first()) fail('QUOTES_EXIST','This account has quotes. Keep the commercial history; erasure is limited to unused accounts.')
  const portability=await createPortability({db:env.DB,policy:portabilityPolicy})
  const checkpoint=[...await portability.invalidateTransfersStatements(),...await portability.redactionStatements()].map(toD1Sql)
  const erased=commercialAuditEvent(actor.id,selected.id,'account.erased',{accountId:selected.id,revision:selected.revision,source:'account.erase',reason:'Supplier confirmed erasure of an unused account and retirement of import custody.'})
  return retireAccountImportCustody(env.DB,actor,{checkpoint,accountId:selected.id,email:selected.value.email,nativeStatements:[{sql:'INSERT INTO bw_guard(value) SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM bw_retention_requests WHERE account_id=? AND held=1) THEN 1 ELSE 0 END',params:[selected.id]},{sql:'DELETE FROM bw_retention_requests WHERE account_id=?',params:[selected.id]},{sql:'DELETE FROM bw_accounts WHERE id=? AND revision=? AND NOT EXISTS(SELECT 1 FROM bw_orders WHERE account_id=?) AND NOT EXISTS(SELECT 1 FROM bw_quotes WHERE account_id=?)',params:[selected.id,selected.revision,selected.id,selected.id]},{sql:'INSERT INTO bw_guard(value) VALUES(changes())'},{sql:'DELETE FROM bw_guard'},{sql:'DELETE FROM bw_lists WHERE account_id=?',params:[selected.id]},{sql:'DELETE FROM bw_locations WHERE account_id=?',params:[selected.id]},{sql:'DELETE FROM bw_followups WHERE account_id=?',params:[selected.id]},erased]})
 }
 fail('NOT_FOUND','Unknown account command.',404)
}
