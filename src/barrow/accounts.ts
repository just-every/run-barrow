import { operatorAuth, type Bindings } from '../auth.server'
import { fail, supplier, requireSupplier, type Account, type Actor } from './model'
import { validateAccountValue, retireAccountImportCustody } from './imports'
import { commit, changed, audit } from './access'
import { createPortability } from '@runeditrun/rer/modules/portability'
import { toD1Sql } from '@runeditrun/rer/modules/erasure/fence'
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
  const statement=prior ? env.DB.prepare('UPDATE bw_accounts SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify(value),revision,id,prior.revision) : env.DB.prepare('INSERT INTO bw_accounts VALUES(?,?,?)').bind(id,JSON.stringify(value),revision)
  await commit(env.DB,actor,[statement,changed(env.DB),audit(env.DB,actor,id,'account.saved')])
  return {id,value,revision}
 }
 const selected=await account(env.DB,actor,p.accountId)
 if(type==='account.invite') return operatorAuth(env).invite(request,{email:selected.value.email,displayName:selected.value.name,role:'member',returnTo:'/app'})
 if(type==='account.erase') {
  if(p.confirm!=='ERASE') fail('CONFIRM','Type ERASE to confirm removal of this unused account.',400)
  if(await env.DB.prepare('SELECT id FROM bw_orders WHERE account_id=? LIMIT 1').bind(selected.id).first()) fail('ORDERS_EXIST','This account has orders. Keep the commercial history; erasure is limited to unused accounts.')
  const portability=await createPortability({db:env.DB,policy:portabilityPolicy})
  const checkpoint=[...await portability.invalidateTransfersStatements(),...await portability.redactionStatements()].map(toD1Sql)
  return retireAccountImportCustody(env.DB,actor,{checkpoint,accountId:selected.id,email:selected.value.email,nativeStatements:[{sql:'DELETE FROM bw_accounts WHERE id=? AND revision=? AND NOT EXISTS(SELECT 1 FROM bw_orders WHERE account_id=?)',params:[selected.id,selected.revision,selected.id]},{sql:'INSERT INTO bw_guard(value) VALUES(changes())'},{sql:'DELETE FROM bw_guard'}]})
 }
 fail('NOT_FOUND','Unknown account command.',404)
}
