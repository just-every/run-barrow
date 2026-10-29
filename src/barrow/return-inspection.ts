/** Only the connected warehouse's attributed inspection establishes disposition. */
export function returnInspection(receipt: any) {
 const statuses:Record<string,string>={quarantine:'quarantine',restock:'restocked',writeoff:'writtenoff'}
 if(!receipt || !Number.isSafeInteger(receipt.version) || !receipt.inspectedBy || !receipt.inspectedAt
  || !statuses[receipt.requestedDisposition] || !['sellable','damaged'].includes(receipt.condition) || statuses[receipt.requestedDisposition]!==receipt.status
  || receipt.requestedDisposition==='restock'&&receipt.condition!=='sellable'
  || receipt.requestedDisposition==='writeoff'&&receipt.condition!=='damaged')return null
 return {returnId:receipt.id,version:receipt.version,condition:receipt.condition as string,disposition:receipt.requestedDisposition as string,status:receipt.status as string,inspectedBy:receipt.inspectedBy as string,inspectedAt:receipt.inspectedAt as string}
}
