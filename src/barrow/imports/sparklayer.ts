import { fail, text } from '../model'
import { platformCsv, sourceMoney, sourceQuantity } from './platform-csv'

export type SourceFile={name:string;csv:string;columns?:Record<string,string>}
export type SparkInput={tenant:string;activity:SourceFile&{mode:'summary'|'detailed'};lists?:Array<SourceFile&{id:string;name:string;customerId:string}>;authority:{system:'shopify'|'woocommerce'|'supplied';customers:Record<string,string>;products:Record<string,string>};scope:{from:string|null;to:string|null;filters:string[];fullTenant:boolean}}
export type HistoryLine={unit?:string;sku:string;quantity:number;unitCents:number;casePack?:number;increment?:number;original:Record<string,string>;row:number}
export type HistoryDocument={id:string;accountId:string;type:'order'|'quote';currency:string;totalCents:number;shippingCents:number;status:string;tracking:string;date:string;lines:HistoryLine[];sourceFacts?:Record<string,string|number>;originals:Array<{row:number;fields:Record<string,string>}>}
export type SourceList={id:string;accountId:string;name:string;lines:Array<{sku:string;quantity:string}>}
export type PlatformSource={system:'sparklayer'|'wizcommerce';tenant:string;documents:HistoryDocument[];lists:SourceList[];artifacts:Array<SourceFile|{name:string;base64:string}>;invitationCandidates?:Array<{accountId:string;email:string;name:string}>;relatedAccounts?:string[];entities?:{customers:Array<Record<string,string>>;addresses:Array<Record<string,string>>;users:Array<Record<string,string>>};scope:SparkInput['scope'];incomplete:boolean;missing:string[]}
const activityColumns={id:'ID',customerId:'Customer ID',type:'Type',currency:'Currency',total:'Total',shipping:'Shipping',status:'Status',tracking:'Tracking',date:'Date',productId:'Product ID',quantity:'Quantity',unitPrice:'Unit Price',casePack:'Case Pack',increment:'Increment'}
export function parseSparkLayer(input:SparkInput):PlatformSource {
 const tenant=text(input?.tenant,'Source tenant',100),authority=input?.authority,scope=input?.scope
 if(!authority||!['shopify','woocommerce','supplied'].includes(authority.system)||!authority.customers||!authority.products)fail('IMPORT_AUTHORITY','Select the backing store and supply explicit customer and product ID mappings.',400)
 if(!scope||!Array.isArray(scope.filters)||scope.filters.some(f=>typeof f!=='string'||f.length>200)||scope.filters.length>30||typeof scope.fullTenant!=='boolean')fail('IMPORT_SCOPE','Declare export dates, filters and whether the source covers the full tenant.',400)
 for(const date of [scope.from,scope.to])if(date!==null&&(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date))fail('IMPORT_SCOPE','Export dates must be ISO calendar dates or null.',400)
 if(scope.from&&scope.to&&scope.from>scope.to)fail('IMPORT_SCOPE','Export start must precede its end.',400)
 if(!input.activity||!['summary','detailed'].includes(input.activity.mode))fail('IMPORT_MODE','Select summary or detailed activity.',400)
 const columns={...activityColumns,...input.activity.columns},documents=new Map<string,HistoryDocument>()
 const resolve=(map:Record<string,string>,key:string,label:string)=>Object.hasOwn(map,key)&&typeof map[key]==='string'&&map[key]?map[key]:fail('IMPORT_MAPPING',`Unmapped ${label} ${key}; supply an explicit backing-store mapping.`,400)
 for(const {row,fields} of platformCsv(input.activity)) {
  for(const [key,column] of Object.entries(input.activity.columns??{}))if(!Object.hasOwn(activityColumns,key)||typeof column!=='string'||!Object.hasOwn(fields,column))fail('IMPORT_COLUMNS',`Explicit activity mapping ${key} requires an existing source header.`,400)
  const field=(key:keyof typeof columns,required=false)=>{const value=fields[columns[key]]??'';return required?text(value,`${input.activity.name} row ${row} ${columns[key]}`,200):value}
  const id=field('id',true),accountId=resolve(authority.customers,field('customerId',true),'customer'),rawType=field('type',true).toLowerCase()
  if(!['order','quote'].includes(rawType))fail('IMPORT_TYPE',`Row ${row}: select an order or quote; no purchase type is silently changed.`,400)
  const currency=field('currency',true)
  if(!/^[A-Z]{3}$/.test(currency))fail('IMPORT_CURRENCY','Supply an explicit three-letter source currency.',400)
  const date=field('date')
  if(date&&(!/^\d{4}-\d{2}-\d{2}/.test(date)||!Number.isFinite(Date.parse(date))||scope.from&&date.slice(0,10)<scope.from||scope.to&&date.slice(0,10)>scope.to))fail('IMPORT_SCOPE',`Row ${row} falls outside the declared export dates or has an invalid date.`,400)
  const header={id,accountId,type:rawType as 'order'|'quote',currency,totalCents:sourceMoney(field('total',true),'Document total'),shippingCents:sourceMoney(field('shipping')||'0','Shipping'),status:field('status'),tracking:field('tracking'),date}
  const key=`${rawType}:${id}`,previous=documents.get(key)
  if(previous&&JSON.stringify({...previous,lines:undefined,originals:undefined})!==JSON.stringify(header))fail('IMPORT_JOIN',`Conflicting repeated header ${id}.`,400)
  if(previous&&input.activity.mode==='summary')fail('IMPORT_DUPLICATE',`Summary repeats ${id}.`,400)
  const doc=previous??{...header,lines:[],originals:[]}
  if(input.activity.mode==='detailed') {
   const sku=resolve(authority.products,field('productId',true),'product'),quantity=sourceQuantity(field('quantity',true),'Activity quantity'),unitCents=sourceMoney(field('unitPrice',true),'Unit price')
   if(doc.lines.some(line=>line.sku===sku))fail('IMPORT_DUPLICATE',`Document ${id} repeats mapped SKU ${sku}; resolve duplicate source lines.`,400)
   const rules:Partial<HistoryLine>={}
   for(const key of ['casePack','increment'] as const)if(field(key))rules[key]=sourceQuantity(field(key),key)
   doc.lines.push({sku,quantity,unitCents,...rules,original:fields,row})
  }
  doc.originals.push({row,fields});documents.set(key,doc)
 }
 if(!documents.size)fail('IMPORT_EMPTY','Supply at least one activity document.',400)
 if(input.lists!==undefined&&(!Array.isArray(input.lists)||input.lists.length>20))fail('IMPORT_LIST','Supply at most twenty list files.',400)
 const listKeys=new Set<string>(),lists=(input.lists??[]).map(file=>{
  const id=text(file.id,'Source list ID',100)
  if(listKeys.has(id))fail('IMPORT_DUPLICATE','Source list IDs must be distinct.',400)
  listKeys.add(id)
  const accountId=resolve(authority.customers,file.customerId,'list customer'),columns={sku:'SKU',quantity:'Quantity',...file.columns}
  const rows=platformCsv(file),seen=new Set<string>()
  if(!rows.length||rows.length>100)fail('IMPORT_LIST','A list holds one to 100 lines.',400)
  const lines=rows.map(({fields})=>{
   for(const [key,column] of Object.entries(file.columns??{}))if(!['sku','quantity'].includes(key)||typeof column!=='string'||!Object.hasOwn(fields,column))fail('IMPORT_COLUMNS',`Explicit list mapping ${key} requires an existing source header.`,400)
   const sku=resolve(authority.products,fields[columns.sku],'list product')
   if(seen.has(sku))fail('IMPORT_DUPLICATE','Resolve duplicate SKUs in the source list.',400)
   seen.add(sku);return {sku,quantity:String(sourceQuantity(fields[columns.quantity],'List quantity'))}
  })
  return {id,accountId,name:text(file.name.replace(/\.csv$/i,''),'List name',80),lines}
 })
 const incomplete=!scope.fullTenant||Boolean(scope.from||scope.to||scope.filters.length)
 return {system:'sparklayer',tenant,documents:[...documents.values()],lists,artifacts:[input.activity,...input.lists??[]],scope,incomplete,missing:['Catalog and customer authority supplied by explicit backing-store mapping; not imported from activity','Balances, releases and provider approvals are not supplied by these exports',...(input.activity.mode==='summary'?['Activity has no detailed lines; quantities and product coverage are unavailable']:[]),...(incomplete?['Filtered export: omitted dates, customers or purchase types are outside this source; this is not a full tenant archive']:[])]}
}
