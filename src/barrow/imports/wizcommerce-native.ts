import { fail, text } from '../model'
import { locationValue, type LocationKind, type LocationValue } from '../locations'
import { duplicateCompany } from '../account-profile'
import { canonicalJson, sha256 } from '../../modules/import-kit/src/d1/index'
import { stableId, validateAccountValue, type AccountValue } from './validation'
import type { WizInput } from './wizcommerce'

type Customer={sourceId:string;accountId:string;name:string;email:string;value?:AccountValue}
type Place={sourceId:string;accountId:string;kind:LocationKind;value:LocationValue}
export type WizActivation={customers:Customer[];places:Place[]}
type Row={fields:Record<string,string>;row:number}
const defaults={customers:{id:'Customer ID',name:'Name',email:'Email'},contacts:{id:'Contact ID',customerId:'Customer ID',name:'Name',email:'Email',phone:'Phone',role:'Role'},addresses:{id:'Address ID',customerId:'Customer ID',kind:'Kind',name:'Name',line1:'Line 1',line2:'Line 2',city:'City',state:'State',zip:'ZIP',deliveryInstructions:'Delivery Instructions'}}
export function parseWizEntities(input:WizInput,customers:Row[],contacts:Row[],addresses:Row[]) {
 const rejectedFields=new Set<string>(),missing:string[]=[]
 const read=(kind:keyof typeof defaults,row:Row)=>{
  const mapping={...defaults[kind],...input.entityColumns?.[kind]}
  for(const [key,column] of Object.entries(input.entityColumns?.[kind]??{}))if(!Object.hasOwn(defaults[kind],key)||!Object.hasOwn(row.fields,column))fail('IMPORT_COLUMNS',`Map ${kind} ${key} to a supplied source column.`,400)
  for(const field of Object.keys(row.fields))if(!Object.values(mapping).includes(field))rejectedFields.add(`${kind}: ${field} (retained in original only)`)
  return Object.fromEntries(Object.entries(mapping).map(([key,column])=>[key,row.fields[column]??'']))
 }
 const mapped=(id:string)=>{const accountId=input.authority.customers[id];if(!accountId)fail('IMPORT_MAPPING',`Unmapped entity customer ${id}.`,400);return stableId(accountId)}
 const value:WizActivation={customers:customers.map(row=>{const fields=read('customers',row),sourceId=text(fields.id,'Source customer ID',100),accountId=mapped(sourceId),proposal=input.nativeAccounts?.[accountId];return {sourceId,accountId,name:text(fields.name,'Source customer name',160),email:fields.email,...(proposal?{value:validateAccountValue(proposal)}:{})}}),places:[]}
 for(const kind of ['contacts','addresses'] as const)for(const row of kind==='contacts'?contacts:addresses){const fields=read(kind,row),sourceId=text(fields.id,`Source ${kind} ID`,100),accountId=mapped(fields.customerId),locationKind:LocationKind=kind==='contacts'?'contact':['bill-to','ship-to'].includes(fields.kind)?fields.kind as LocationKind:fail('IMPORT_LOCATION','Address Kind must be bill-to or ship-to.',400);const {id,customerId,kind:ignored,...raw}=fields;value.places.push({sourceId,accountId,kind:locationKind,value:locationValue(locationKind,raw)})}
 for(const rows of [value.customers,value.places])if(new Set(rows.map(row=>('kind' in row?(row.kind==='contact'?'contact':'address'):'customer')+':'+row.sourceId)).size!==rows.length)fail('IMPORT_DUPLICATE','Source entity IDs must be distinct within each kind.',400)
 if(new Set(value.customers.map(row=>row.accountId)).size!==value.customers.length)fail('IMPORT_MAPPING','Map distinct source customers to separate native accounts.',400)
 for(const id of Object.keys(input.nativeAccounts??{}))if(!value.customers.some(row=>row.accountId===id))fail('IMPORT_MAPPING',`Native account proposal ${id} has no source customer.`,400)
 for(const sourceId of new Set([...Object.keys(input.authority.customers)]))if(!value.customers.some(row=>row.sourceId===sourceId))missing.push(`Customer source entity ${sourceId} is absent; only its explicit existing-account mapping is available`)
 return {value,rejectedFields:[...rejectedFields].sort(),missing}
}
export function planWizNative(tenant:string,activation:WizActivation,native:{accounts:any[];locations:any[];imports:any[]},errors:string[]) {
 const hash=(v:unknown)=>sha256(canonicalJson(v as any)),accounts=new Map(native.accounts.map(row=>[row.id,row])),creates:Customer[]=[],places:Array<Place&{id:string;exists:boolean}>=[]
 const prior=native.imports.filter(row=>row.system==='wizcommerce'&&row.tenant===tenant)
 if(prior.some(row=>row.source_json==='{}'))errors.push('Source custody for this tenant was retired; do not reactivate erased entities')
 for(const imported of prior){const before=JSON.parse(imported.source_json).activation as WizActivation|undefined;if(!before)continue
  for(const customer of activation.customers){const previous=before.customers.find(row=>row.sourceId===customer.sourceId);if(previous&&previous.accountId!==customer.accountId)errors.push(`Source customer ${customer.sourceId} cannot be reassigned`)}
 }
 for(const customer of activation.customers){
  const existing=accounts.get(customer.accountId)
  if(existing){const original=prior.flatMap(row=>(JSON.parse(row.source_json).activation as WizActivation|undefined)?.customers??[]).find(row=>row.sourceId===customer.sourceId&&row.value);if(customer.value&&original&&hash(original.value)!==hash(customer.value))errors.push(`Source account ${customer.sourceId} settings changed after import; preserve its native settings`);if(customer.value&&!original&&canonicalJson(validateAccountValue(JSON.parse(existing.value_json)))!==canonicalJson(customer.value))errors.push(`Account ${customer.accountId} already exists with different settings; retain its native profile and omit the creation proposal`);continue}
  if(!customer.value){errors.push(`Missing native account settings for source customer ${customer.sourceId}`);continue}
  if(customer.value.name!==customer.name||customer.value.email!==customer.email)errors.push(`Account ${customer.accountId} name and email must match its reviewed source customer`)
  for(const other of [...native.accounts.map(row=>({id:row.id,value:JSON.parse(row.value_json)})),...creates.map(row=>({id:row.accountId,value:row.value!}))])if(other.value.email===customer.value.email||duplicateCompany(other.value,customer.value))errors.push(`Account ${customer.accountId} duplicates ${other.id}; review the native directory and resolve its source mapping`)
  creates.push(customer);accounts.set(customer.accountId,{id:customer.accountId,value_json:JSON.stringify(customer.value),revision:''})
 }
 for(const place of activation.places){
  const id=hash(['wizcommerce',tenant,place.kind==='contact'?'contact':'address',place.sourceId]).slice(0,60),existing=native.locations.find(row=>row.id===id)
  if(!accounts.has(place.accountId))errors.push(`Missing mapped account ${place.accountId} for ${place.sourceId}`)
  if(existing&&(existing.account_id!==place.accountId||existing.kind!==place.kind))errors.push(`Source location ${place.sourceId} cannot be reassigned`)
  for(const imported of prior){const previous=(JSON.parse(imported.source_json).activation as WizActivation|undefined)?.places.find(row=>row.sourceId===place.sourceId&&(row.kind==='contact')===(place.kind==='contact'));if(previous&&hash(previous)!==hash(place))errors.push(`Source location ${place.sourceId} changed after import; preserve native edits and review a distinct source ID`)}
  places.push({...place,id,exists:Boolean(existing)})
 }
 const counts={customers:activation.customers.length,contacts:activation.places.filter(p=>p.kind==='contact').length,addresses:activation.places.filter(p=>p.kind!=='contact').length}
 return {creates,places,accounts,report:{source:counts,planned:{...counts,customers:activation.customers.filter(row=>accounts.has(row.accountId)).length,contacts:places.filter(row=>row.kind==='contact'&&accounts.has(row.accountId)).length,addresses:places.filter(row=>row.kind!=='contact'&&accounts.has(row.accountId)).length,newCustomers:creates.length,newContacts:places.filter(p=>p.kind==='contact'&&!p.exists).length,newAddresses:places.filter(p=>p.kind!=='contact'&&!p.exists).length}}}
}
