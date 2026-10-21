import type { Bindings } from '../auth.server'
import { audit } from './access'
import type { Actor } from './model'
export function applicationLocationStatements(env:Bindings,actor:Actor,accountId:string,locations:any[],at:string) {
 return locations.flatMap((value,index)=>{
  const id=crypto.randomUUID(),revision=crypto.randomUUID()
  return [env.DB.prepare("INSERT INTO bw_locations(id,account_id,kind,value_json,revision,is_default) VALUES(?,?,'ship-to',?,?,?)").bind(id,accountId,JSON.stringify(value),revision,index===0?1:0),audit(env.DB,actor,id,'location.added',{accountId,revision,source:'application.approve',reason:`Approved requested ship-to ${value.name}; ${at}.`})]
 })
}
