import {qboComparisons} from './reconciliation'
import {xeroComparisons} from './xero-reconciliation'
export async function ledgerComparisons(db:D1Database,accountId:string,asOf:string,native:Map<string,number>){
 const [qbo,xero]=await Promise.all([qboComparisons(db,accountId,asOf,native),xeroComparisons(db,accountId,asOf,native)])
 return [...qbo.map(row=>({...row,ledger:'QuickBooks',tenant:row.realm})),...xero.map(row=>({...row,ledger:'Xero',realm:row.tenant}))]
}
