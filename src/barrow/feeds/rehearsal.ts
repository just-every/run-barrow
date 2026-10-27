import { Buffer } from 'node:buffer'
import { digest } from '../digest'
import { fail, Problem } from '../model'
import { boundedText, nonnegativeInteger, stableId } from '../imports/validation'
import { openSftp } from './transport'
import { FEED_MAX_BYTES, feedCsv, feedPath, validateFeedConfig, type AtsRow, type CustomerRow, type FeedConfiguration, type FeedError, type FeedKind, type FeedSnapshot, type ProductRow } from './layout'

const kinds:FeedKind[]=['products','customers','ats']
function integer(value:string,field:string,minimum=0,maximum=1_000_000_000) {
 if(!/^(0|[1-9]\d*)$/.test(value))fail('FEED_NUMBER',`${field} must be a whole nonnegative number.`,400)
 const result=nonnegativeInteger(Number(value),field,minimum)
 if(result>maximum)fail('FEED_NUMBER',`${field} exceeds the native feed limit.`,400)
 return result
}
function rowError(error:unknown,row:number,owner:string):FeedError {
 if(error instanceof Problem)return {row,owner,code:error.code,message:error.message}
 const known=error as {code?:unknown;message?:unknown}
 return typeof known?.code==='string'&&known.code.startsWith('ACCOUNT_')&&typeof known.message==='string'
  ?{row,owner,code:known.code,message:known.message}
  :{row,owner,code:'FEED_ROW',message:'This row could not be validated against the native feed layout.'}
}
function product(get:(field:string)=>string):ProductRow {
 const unit=boundedText(get('unit'),'unit',32)
 if(!/^[A-Za-z0-9_-]+$/.test(unit))fail('FEED_UNIT','Unit codes use letters, digits, dash or underscore.',400)
 return {sku:boundedText(get('sku'),'sku',100),name:boundedText(get('name'),'name',160),unit,
  casePack:integer(get('casePack'),'casePack',1,10000),increment:integer(get('increment'),'increment',1,10000)}
}
function ats(get:(field:string)=>string,products:ProductRow[]):AtsRow {
 const sku=boundedText(get('sku'),'sku',100),observedAt=get('observedAt')
 if(!products.some(row=>row.sku===sku))fail('FEED_SKU','ATS must reference a product in this isolated rehearsal.',400)
 if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(observedAt)||!Number.isFinite(Date.parse(observedAt)))fail('FEED_OBSERVED','observedAt must be an ISO timestamp with a timezone.',400)
 return {sku,warehouse:stableId(get('warehouse'),'warehouse'),available:integer(get('available'),'available'),observedAt:new Date(observedAt).toISOString(),incomingDate:null}
}
function customer(get:(field:string)=>string,config:FeedConfiguration):CustomerRow {
 const accountId=stableId(get('accountId'))
 if(!config.accountIds.includes(accountId))fail('FEED_SCOPE','The customer is outside the signed-off account scope.',400)
 const name=get('name')
 return {accountId,...(name?{name:boundedText(name,'name',160)}:{})}
}
/** Computes isolated rehearsal data and source custody; it never writes native entities or orders. */
export async function runRehearsal(config:FeedConfiguration,secrets:string|undefined,snapshot:FeedSnapshot,owner:string,at:string):Promise<FeedSnapshot> {
 config=validateFeedConfig(config)
 if(snapshot.consent!==true)fail('FEED_CONSENT','The owner must authorize this merchant feed destination.',400)
 boundedText(owner,'report owner',100)
 if(!Number.isFinite(Date.parse(at)))fail('FEED_TIME','Record a valid receipt timestamp.',400)
 const result=structuredClone(snapshot)
 result.config=config
 result.rehearsal??={products:0,ats:0,customers:0,files:[],unresolvedErrors:0,productRows:[],atsRows:[],customerRows:[]}
 result.deliveries??=[]
 const connection=await openSftp(config.connection,secrets)
 try {
  const available=await connection.list(config.connection.importDirectory)
  for(const kind of kinds) {
   const name=`${kind}.csv`,entry=available.find(file=>file.name===name&&!file.directory)
   if(!entry) {
    if(kind==='customers')continue
    fail('FEED_MISSING',`The scheduled ${name} file is missing from the import directory.`,409)
   }
   const bytes=await connection.read(feedPath(config.connection.importDirectory,name),FEED_MAX_BYTES)
   const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',Uint8Array.from(bytes)))].map(value=>value.toString(16).padStart(2,'0')).join('')
   const id=await digest(`${kind}\0${sha256}`)
   const mappingHash=await digest(JSON.stringify([Object.entries(config.mapping[kind]).sort(([a],[b])=>a.localeCompare(b)),kind==='ats'?result.rehearsal.productRows:kind==='customers'?[...config.accountIds].sort():null]))
   const prior=result.rehearsal.files.find(file=>file.id===id)
   if(prior?.mappingHash===mappingHash&&[...result.rehearsal.files].reverse().find(file=>file.kind===kind)?.id===id)continue
   if(!prior&&result.rehearsal.files.reduce((sum,file)=>sum+Buffer.from(file.bytesBase64,'base64').byteLength,bytes.byteLength)>768*1024)fail('FEED_CUSTODY_LIMIT','This rehearsal has reached its retained source-byte limit. Start a new isolated rehearsal.',409)
   const errors:FeedError[]=[],accepted:Array<ProductRow|AtsRow|CustomerRow>=[],seen=new Set<string>()
   try {
    const [header,...rows]=feedCsv(bytes),mapping=config.mapping[kind] as Record<string,string>
    const missing=Object.entries(mapping).filter(([field,column])=>!(kind==='customers'&&field==='name')&&!header.includes(column))
    if(missing.length)fail('FEED_HEADERS','CSV is missing a required mapped source column.',400)
    for(const [index,cells] of rows.entries()) {
     try {
      if(cells.length!==header.length)fail('FEED_COLUMNS','Row column count must match its CSV header.',400)
      const get=(field:string)=>cells[header.indexOf(mapping[field])]??''
      const row=kind==='products'?product(get):kind==='ats'?ats(get,result.rehearsal.productRows):customer(get,config)
      const key='warehouse' in row?`${row.sku}\0${row.warehouse}`:'sku' in row?row.sku:row.accountId
      if(seen.has(key))fail('FEED_DUPLICATE','The same native identity appears twice in this file.',400)
      seen.add(key);accepted.push(row)
     }catch(error){errors.push(rowError(error,index+2,owner))}
    }
   }catch(error){errors.push(rowError(error,1,owner))}
   const record={id,sha256,kind,name,bytesBase64:Buffer.from(bytes).toString('base64'),receivedAt:prior?.receivedAt??at,owner:prior?.owner??owner,mappingHash,rowsAccepted:accepted.length,errors}
   result.rehearsal.files=[...result.rehearsal.files.filter(file=>file.id!==id),record]
   if(kind==='products')result.rehearsal.productRows=accepted as ProductRow[]
   if(kind==='ats')result.rehearsal.atsRows=accepted as AtsRow[]
   if(kind==='customers')result.rehearsal.customerRows=accepted as CustomerRow[]
  }
  const r=result.rehearsal
  r.products=r.productRows.length;r.ats=r.atsRows.length;r.customers=r.customerRows.length
  r.unresolvedErrors=kinds.reduce((sum,kind)=>sum+([...r.files].reverse().find(file=>file.kind===kind)?.errors.length??0),0)
  if(new TextEncoder().encode(JSON.stringify(result)).byteLength>1_800_000)fail('FEED_CUSTODY_LIMIT','The retained rehearsal exceeds the session storage limit.',409)
  return result
 }finally{await connection.close()}
}
