import { staffScope,staffCanReadOrder } from './staff-access'
import type { Actor } from './model'
import { fail, supplier } from './model'
import { companyLocationAllowed, requireCompanyRight } from './company-policy'
/** Every former account-email query uses the same current native-member authority. */
export function companyAccountPredicate(column:string) {
 if(!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(column))throw new Error('Invalid account scope column')
 return `${column} IN (SELECT cm.account_id FROM bw_company_members cm JOIN oa_operators cp ON cp.id=cm.user_id WHERE cm.user_id=? AND cm.state='active' AND cm.erased_at IS NULL AND cp.role='member' AND cp.status='active')`
}
export function companyOrderScope(actor:Actor,column='account_id',valueColumn='value_json') {
 if(actor.staff){const scoped=staffScope(actor,column);return {...scoped,sql:scoped.sql+(actor.staff.role==='analyst'?' AND 0':actor.staff.role==='finance'?` AND (json_extract(${valueColumn},'$.invoice') IS NOT NULL OR json_extract(${valueColumn},'$.status') IN ('awaiting-company-approval','submitted','reserving','shortfall','approved','releasing'))`:'')}}
 if(supplier(actor))return {sql:'',values:[] as string[]}
 const rights=actor.company?.rights??[],purchasing=rights.some(r=>r==='purchaser'||r==='approver')
 // A member scoped to listed ship-tos sees only the orders shipping to them.
 const locations=actor.company&&actor.company.locations!=='all'?[JSON.stringify(actor.company.locations)]:[]
 return {sql:` AND ${companyAccountPredicate(column)}${purchasing?'':rights.includes('finance')?` AND json_extract(${valueColumn},'$.invoice') IS NOT NULL`:' AND 0'}${locations.length?` AND json_extract(${valueColumn},'$.shipTo.id') IN (SELECT value FROM json_each(?))`:''}`,values:[actor.id,...locations]}
}
export async function companyOrderRead(db:D1Database,actor:Actor,order:{accountId:string;invoice?:unknown;status?:string;shipTo?:{id:string}}) {
 if(actor.staff){if(!staffCanReadOrder(actor.staff,order))fail('NOT_FOUND','Order not found.',404);return}
 if(supplier(actor))return
 const member=actor.company
 if(!member||member.accountId!==order.accountId)fail('NOT_FOUND','Order not found.',404)
 if(!companyLocationAllowed(member,order.shipTo?.id))fail('FORBIDDEN','This order ships outside your company locations.',403)
 if(member.rights.some(right=>right==='purchaser'||right==='approver'))return
 if(member.rights.includes('finance')&&order.invoice)return
 fail('FORBIDDEN','Your company rights do not permit this order view.',403)
}
export async function companyFinance(db:D1Database,actor:Actor,accountId:string) {
 return requireCompanyRight(db,actor,accountId,'finance')
}
