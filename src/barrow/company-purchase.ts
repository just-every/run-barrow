import type { Bindings } from '../auth.server'
import { companyPurchaserLimit, companyRightsGuard, requireCompanyRight } from './company-policy'
import { fail, type Actor, type Order } from './model'
import { startRoute } from './company-routes'
/** All ways of accepting merchandise use one person/location limit, including quotes and replacements. */
export async function companySubmission(env:Bindings,actor:Actor,order:Order) {
 const member=await requireCompanyRight(env.DB,actor,order.accountId,'purchaser',order.shipTo?.id)
 if(!member)return {order,waiting:false,guard:companyRightsGuard(env.DB,null)}
 const limit=companyPurchaserLimit(member,order.shipTo?.id)
 // An unlimited legacy member needs no currency comparison; finite USD allowances do.
 if(limit!==null&&order.currency!=='USD')fail('COMPANY_CURRENCY','Finite company purchasing limits require an explicitly recorded USD order.')
 const requestedAt=new Date().toISOString()
 // ACC-007: a matching approval route also holds an order the purchaser's own limit would let through; USD thresholds apply to USD orders.
 const route=order.currency==='USD'?await startRoute(env.DB,order,requestedAt):null
 const waiting=limit!==null&&order.totalCents>limit||Boolean(route)
 return {waiting,guard:companyRightsGuard(env.DB,member),order:{...order,companyPreparedBy:actor.id,...(waiting?{status:'awaiting-company-approval' as const,companyRequestedAt:requestedAt,...(route?{approvalRoute:route}:{})}: {})}}
}
