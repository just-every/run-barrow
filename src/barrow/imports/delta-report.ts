import { canonicalJson, sha256 } from './delta-store'
import type { CutoverRecord } from './cutover-source'
import { fail } from '../model'

const key = (row:CutoverRecord) => `${row.kind}:${row.id}`
function content(row:CutoverRecord) { const {citation,...value}=row; return value }
/** A full source export replaces only its isolated dataset. Identity is kind+source ID;
 * artifact hashes/citation movements alone are not commercial revisions. */
export function deltaChanges(previous:CutoverRecord[],next:CutoverRecord[]) {
 const before=new Map(previous.map(row=>[key(row),row])),after=new Map(next.map(row=>[key(row),row]))
 return [...new Set([...before.keys(),...after.keys()])].sort().flatMap(id=>{
  const old=before.get(id),current=after.get(id)
  if(old&&current&&canonicalJson(content(old))===canonicalJson(content(current)))return []
  const fields=[...new Set([...Object.keys(old??{}),...Object.keys(current??{})])].filter(field=>field!=='citation'&&canonicalJson(old?.[field]??null)!==canonicalJson(current?.[field]??null)).sort()
  return [{sourceKey:id,change:!old?'added':!current?'removed':'changed',fields,before:old??null,after:current??null,
   disposition:!current?'Absent from full delta export; prior source original retained':'Isolated source history only; no native or provider effect'}]
 })
}
export function deltaSourceIdentity(records:CutoverRecord[]) {
 return sha256(canonicalJson(records.map(row=>({key:key(row),value:content(row)})).sort((a,b)=>a.key.localeCompare(b.key))))
}

export function deltaTotals(previous:CutoverRecord[],next:CutoverRecord[]) {
 const groups=[...new Set([...previous,...next].map(row=>`${row.kind}\u0000${row.currency??''}`))].sort()
 const exact=(values:number[])=>{
  const value=values.reduce((total,item)=>total+BigInt(item),0n)
  if(value>BigInt(Number.MAX_SAFE_INTEGER)||value<BigInt(Number.MIN_SAFE_INTEGER))fail('DELTA_TOTAL','Source delta totals exceed the exact integer range.',400)
  return Number(value)
 }
 return groups.map(group=>{
  const [kind,currency]=group.split('\u0000'),before=previous.filter(row=>row.kind===kind&&(row.currency??'')===currency),after=next.filter(row=>row.kind===kind&&(row.currency??'')===currency)
  const beforeCents=exact(before.map(row=>row.amountCents??0)),afterCents=exact(after.map(row=>row.amountCents??0)),beforeQuantity=exact(before.map(row=>row.quantity??0)),afterQuantity=exact(after.map(row=>row.quantity??0))
  return {kind,currency,beforeCount:before.length,afterCount:after.length,beforeCents,afterCents,beforeQuantity,afterQuantity,
   differenceCents:exact([afterCents,-beforeCents]),quantityDifference:exact([afterQuantity,-beforeQuantity]),
   citations:after.map(row=>({sourceKey:key(row),...row.citation}))}
 })
}
