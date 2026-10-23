import { canonicalJson, sha256 } from '../../modules/import-kit/src/d1/index'
import { fail } from '../model'
import { cutoverKinds, type CutoverTarget } from './cutover-targets'
import type { CutoverInput, CutoverRecord } from './cutover-source'

export function reconcileCutover(source:{records:CutoverRecord[];fields:unknown;missing:string[];artifacts:{name:string;sha256:string}[]},targets:CutoverTarget[],input:CutoverInput,nativeFingerprint:string) {
 const mappings:Record<string,string>={},issues:string[]=[],seen=new Set<string>()
 const key=(row:CutoverRecord|CutoverTarget)=>`${row.kind}:${row.id}`
 if(input.mappings!==undefined&&(!input.mappings||typeof input.mappings!=='object'||Array.isArray(input.mappings)||Object.values(input.mappings).some(value=>typeof value!=='string'||value.length>240)))fail('CUTOVER_MAPPING','Mappings must assign source keys to target IDs or an explicit retained-history disposition.',400)
 if(input.mappings&&Object.keys(input.mappings).some(id=>!source.records.some(row=>key(row)===id)))fail('CUTOVER_MAPPING','A mapping names a source record that is not in these exports.',400)
 const match=(row:CutoverRecord) => {
  const accountId=row.accountId?mappings[`accounts:${row.accountId}`]:undefined,orderId=row.orderId?mappings[`orders:${row.orderId}`]:undefined
  let candidates=targets.filter(target=>target.kind===row.kind&&(!accountId||accountId==='retain-history'||target.accountId===accountId))
  if(row.accountId&&(!accountId||accountId==='retain-history'))return []
  const exact=candidates.filter(target=>target.id===row.id)
  if(exact.length)return exact
  if(row.kind==='variants'||row.kind==='prices')return candidates.filter(target=>target.sku===row.sku)
  if(row.kind==='receivables')return candidates.filter(target=>orderId&&target.orderId===orderId)
  if(row.kind==='releases')return candidates.filter(target=>orderId&&target.orderId===orderId&&target.releaseNumber===row.releaseNumber)
  const sourceName=row.name??(typeof row.poNumber==='string'?row.poNumber:'')
  return candidates.filter(target=>sourceName&&target.name?.normalize('NFKC').trim().toLowerCase()===sourceName.normalize('NFKC').trim().toLowerCase())
 }
 const proposals: {source:CutoverRecord;targetId:string;candidates:CutoverTarget[];basis:string;differences:string[]}[]=[]
 for(const kind of cutoverKinds)for(const row of source.records.filter(row=>row.kind===kind)) {
  const candidates=match(row),explicit=input.mappings?.[key(row)],targetId=explicit??(candidates.length===1?candidates[0].id:'')
  const target=targets.find(target=>target.kind===kind&&target.id===targetId)
  if(targetId&&targetId!=='retain-history'&&!target)fail('CUTOVER_MAPPING',`Unknown or out-of-scope target for ${key(row)}.`,400)
  const parent=row.accountId?mappings[`accounts:${row.accountId}`]:undefined
  if(target?.accountId&&target.accountId!==parent)fail('CUTOVER_MAPPING',`Target belongs to another company: ${key(row)}.`,400)
  if(target?.orderId&&row.orderId&&target.orderId!==mappings[`orders:${row.orderId}`])fail('CUTOVER_MAPPING',`Target belongs to another mapped order: ${key(row)}.`,400)
  if(kind==='accounts'&&targetId==='retain-history')fail('CUTOVER_MAPPING','Map each source company to a scoped Barrow account; import new accounts first.',400)
  mappings[key(row)]=targetId
  if(!targetId)issues.push(`Resolve ${key(row)}: ${candidates.length>1?'ambiguous identity':'no target match'}.`)
  if(target&&seen.has(key(target)))issues.push(`More than one source record maps to ${key(target)}.`)
  if(target)seen.add(key(target))
  const differences:string[]=[]
  if(targetId==='retain-history')differences.push('Retained source history only; no operational target or provider effect')
  if(target)for(const field of ['currency','amountCents','quantity'] as const)if(row[field]!==undefined&&row[field]!==target[field])differences.push(`${field}: source ${row[field]}, target ${target[field]??'unknown'}`)
  proposals.push({source:row,targetId,candidates:targets.filter(target=>target.kind===kind&&(!target.accountId||target.accountId===parent)),basis:explicit?'Owner corrected mapping':candidates.length===1?'Exact source ID, SKU or unique company/reference match':'Owner review required',differences})
 }
 for(const row of source.records.filter(row=>row.kind==='orders')) {
  const actual=source.records.filter(release=>release.kind==='releases'&&release.orderId===row.id).length
  if(typeof row.releaseCount==='number'&&actual!==row.releaseCount)issues.push(`Missing release coverage: orders:${row.id} declares ${row.releaseCount}, export supplies ${actual} (${row.citation.artifact}, ${row.citation.sheet} row ${row.citation.row}).`)
 }
 const totals=cutoverKinds.flatMap(kind=>{
  const before=source.records.filter(row=>row.kind===kind),after=targets.filter(row=>row.kind===kind),currencies=[...new Set([...before,...after].map(row=>row.currency??''))].sort()
  return currencies.map(currency=>{
   const s=before.filter(row=>(row.currency??'')===currency),t=after.filter(row=>(row.currency??'')===currency)
   const sum=(values:number[])=>{const value=values.reduce((n,v)=>n+BigInt(v),0n);if(value>BigInt(Number.MAX_SAFE_INTEGER)||value<BigInt(Number.MIN_SAFE_INTEGER))fail('CUTOVER_TOTAL','Reconciled totals exceed the exact integer range.',400);return Number(value)}
   const sourceCents=sum(s.map(row=>row.amountCents??0)),targetCents=sum(t.map(row=>row.amountCents??0))
   return {kind,currency,sourceCount:s.length,targetCount:t.length,sourceCents,targetCents,differenceCents:sum([sourceCents,-targetCents]),sourceQuantity:sum(s.map(row=>row.quantity??0)),targetQuantity:sum(t.map(row=>row.quantity??0))}
  })
 })
 const unmatched=targets.filter(row=>!seen.has(key(row)))
 const unresolved=issues.filter(issue=>!issue.startsWith('Missing release coverage:'))
 return {fingerprint:sha256(canonicalJson({model:'barrow-native-mapping-rules-v1',artifacts:source.artifacts.map(({name,sha256})=>({name,sha256})),mappings,scope:[...input.scope].sort(),runId:input.runId,nativeFingerprint})),nativeFingerprint,mappings,proposals,totals,unmatched,issues,missing:source.missing,fields:source.fields,
  canApply:unresolved.length===0&&source.missing.length===0,
  provenance:{model:'barrow-native-mapping-rules-v1',runId:input.runId,tools:['read supplied exports','read explicitly scoped native records','read scoped Pier variants'],costCents:0,contactCount:0,effects:['retain approved cutover history'],authority:'Source accounting system remains ledger authority'},
  balanceNote:'Ledger balances are supplied source history. Barrow amounts are invoiced totals, not verified unpaid receivables. Differences and missing releases require explicit owner disposition; no payment, reservation, invoice issue or outreach is performed.'}
}
