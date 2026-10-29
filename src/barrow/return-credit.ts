import type { Bindings } from '../auth.server'
import { fail, type Order } from './model'
import type { creditBasis } from './credit-basis'
import type { ReturnClaim } from './return-claims'
import { returnInspection } from './return-inspection'

/** Every credit door observes the same authorization for receipts allocated to an RMA. */
export async function returnCreditAdmission(env:Bindings,order:Order,p:any,basis:Awaited<ReturnType<typeof creditBasis>>) {
 if(basis.kind!=='return')return {guards:[],authorization:undefined}
 const epoch=await env.DB.prepare('SELECT revision FROM bw_return_claim_epoch WHERE id=1').first<{revision:number}>()
 const rows=await env.DB.prepare('SELECT value_json,revision FROM bw_return_claims WHERE order_id=? ORDER BY id').bind(order.id).all<{value_json:string;revision:string}>()
 const claims=rows.results.map(row=>({...JSON.parse(row.value_json),revision:row.revision}) as ReturnClaim)
 const allocated=claims.filter(claim=>claim.receipts.some(receipt=>receipt.returnId===basis.sourceId))
 const guards=[env.DB.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN (SELECT revision FROM bw_return_claim_epoch WHERE id=1)=? THEN 1 ELSE 0 END').bind(epoch!.revision)]
 if(!allocated.length&&!p.claimId)return {guards,authorization:undefined}
 const claim=allocated.find(claim=>claim.id===p.claimId)
 if(!claim || allocated.length!==1 || claim.restored || !claim.decision?.quantity)fail('RETURN_APPROVAL','Choose the current approved return case. A receipt shared between cases needs one separately reconciled financial review.',409)
 if(p.claimRevision!==claim.revision)fail('REVISION','The return authorization changed. Reload before issuing credit.',409)
 const receipt=claim.receipts.find(receipt=>receipt.returnId===basis.sourceId)!
 const inspection=returnInspection(basis.received)
 if(!inspection || p.inspectionVersion!==inspection.version)fail('RETURN_INSPECTION','Review the current attributed inspection in connected Pier before issuing credit.',409)
 if(claim.pierOrigin!==order.pierOrigin || claim.pierOrderId!==order.pierOrderId || claim.accountId!==order.accountId
  || claim.receipts.reduce((sum,row)=>sum+row.quantity,0)!==claim.decision.quantity
  || basis.lines.length!==1 || basis.lines[0].line!==claim.line || basis.lines[0].quantity!==receipt.quantity
  || basis.freightCents!==0 || basis.taxCents!==0 || p.expectedCents!==basis.amountCents)fail('RETURN_APPROVAL','Credit must match the approved, received selling units and the reviewed original-price proposal exactly.',409)
 return {guards,authorization:{claimId:claim.id,claimRevision:claim.revision,requestRevision:claim.decision.requestRevision,approvedBy:claim.decision.by,approvedQuantity:claim.decision.quantity,inspection}}
}
