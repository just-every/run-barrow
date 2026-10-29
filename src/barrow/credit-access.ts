import { fail,requirePerson,type Actor } from './model'
import { staffAccountAllowed } from './staff-policy'
export function creditAuthority(actor:Actor,accountId:string,amountCents:number,currency:string,kind:'credit'|'refund'='credit') {
 requirePerson(actor)
 if(actor.staff) {
  const limit=kind==='refund'?actor.staff.refundLimitCents:actor.staff.creditLimitCents
  if(actor.staff.role!=='finance'||!staffAccountAllowed(actor.staff,accountId)||currency!=='USD'||!limit||amountCents>limit)fail('FORBIDDEN','This financial decision exceeds your current account scope or explicit USD allowance.',403)
  return
 }
 if(!['owner','admin'].includes(actor.role))fail('FORBIDDEN','A supplier owner, admin or explicitly authorized finance operator must approve this financial decision.',403)
}
