import type { Bindings } from '../auth.server'
import { companyPurchaserLimit, companyRightsGuard, requireCompanyRight } from './company-policy'
import { fail, type Actor, type Order } from './model'
/** All ways of accepting merchandise use one person/location limit, including quotes and replacements. */
export async function companySubmission(env:Bindings,actor:Actor,order:Order) {
 const member=await requireCompanyRight(env.DB,actor,order.accountId,'purchaser',order.shipTo?.id)
 if(!member)return {order,waiting:false,guard:companyRightsGuard(env.DB,null)}
 const limit=companyPurchaserLimit(member,order.shipTo?.id)
 // An unlimited legacy member needs no currency comparison; finite USD allowances do.
 if(limit!==null&&order.currency!=='USD')fail('COMPANY_CURRENCY','Finite company purchasing limits require an explicitly recorded USD order.')
 const waiting=limit!==null&&order.totalCents>limit
 return {waiting,guard:companyRightsGuard(env.DB,member),order:{...order,companyPreparedBy:actor.id,...(waiting?{status:'awaiting-company-approval' as const,companyRequestedAt:new Date().toISOString()}: {})}}
}
