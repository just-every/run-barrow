import { confirmationColumns, confirmationLayouts, matrixKeyColumns, type ConfirmationLayout } from '../confirmation-layouts'
import { fail } from '../model'
import { boundedText, stableId } from '../imports/validation'
import type { SftpConfig } from './types'

export type FeedKind = 'products' | 'customers' | 'ats'
export type FeedMapping = {
 products: {sku:string;name:string;unit:string;casePack:string;increment:string}
 customers: {accountId:string;name?:string}
 ats: {sku:string;warehouse:string;available:string;observedAt:string}
}
/** Native Barrow CSV columns, without any claim to an incumbent provider's format. */
export const nativeFeedMapping: FeedMapping = {
 products:{sku:'sku',name:'name',unit:'unit',casePack:'casePack',increment:'increment'},
 customers:{accountId:'accountId',name:'name'},
 ats:{sku:'sku',warehouse:'warehouse',available:'available',observedAt:'observedAt'},
}
export type FeedLayout = ConfirmationLayout & {revision:string|null}
export type FeedConfiguration = {connection:SftpConfig;accountIds:string[];mapping:FeedMapping;layoutId:string;layout?:FeedLayout}
export type ProductRow = {sku:string;name:string;unit:string;casePack:number;increment:number}
export type AtsRow = {sku:string;warehouse:string;available:number;observedAt:string;incomingDate:null}
export type CustomerRow = {accountId:string;name?:string}
export type FeedError = {row:number;code:string;message:string;owner:string}
export type FeedFile = {id:string;sha256:string;kind:FeedKind;name:string;bytesBase64:string;receivedAt:string;owner:string;mappingHash:string;rowsAccepted:number;errors:FeedError[]}
export type FeedDelivery = {
 id:string;destination:string;orderId:string;orderRevision:string;confirmationRevision:string;confirmation:number
 layout:FeedLayout;filename:string;bytesBase64:string;sha256:string;preparedAt:string
 state:'pending'|'sent'|'processed';sentAt?:string;processedAt?:string;error?:string
}
export type FeedSnapshot = {
 consent:boolean;config:FeedConfiguration
 rehearsal:{products:number;ats:number;customers:number;files:FeedFile[];unresolvedErrors:number;productRows:ProductRow[];atsRows:AtsRow[];customerRows:CustomerRow[]}
 deliveries:FeedDelivery[]
 moreOrders?:boolean
}
export async function captureFeedLayout(db:D1Database,id:string):Promise<FeedLayout> {
 const settings=await confirmationLayouts(db),layout=settings.layouts.find(row=>row.id===id)
 if(!layout)fail('FEED_LAYOUT','Select a saved confirmation CSV layout.',400)
 return {...layout,columns:[...layout.columns],revision:settings.revision}
}
export function validateFeedConfig(config:FeedConfiguration):FeedConfiguration {
 if(!config||!config.connection||!Array.isArray(config.accountIds)||!config.accountIds.length||config.accountIds.length>200)fail('FEED_CONFIG','Select a bounded account scope and SFTP connection.',400)
 const connectionKeys=['host','port','username','secretId','hostKey','importDirectory','exportDirectory','ackDirectory']
 if(Object.keys(config.connection).some(key=>!connectionKeys.includes(key))||connectionKeys.some(key=>!(key in config.connection)))fail('FEED_CONFIG','Use only SFTP settings and a server-held credential reference.',400)
 if(Object.keys(config).some(key=>!['connection','accountIds','mapping','layoutId','layout'].includes(key)))fail('FEED_CONFIG','Use only the documented feed settings.',400)
 config.accountIds.forEach(id=>stableId(id))
 if(new Set(config.accountIds).size!==config.accountIds.length)fail('FEED_CONFIG','Select distinct account IDs.',400)
 boundedText(config.layoutId,'layout ID',100)
 for(const kind of ['products','customers','ats'] as const) {
  const map=config.mapping?.[kind],fields=Object.keys(nativeFeedMapping[kind])
  if(!map||Object.keys(map).some(key=>!fields.includes(key)))fail('FEED_MAPPING','Map the documented native CSV fields.',400)
  for(const key of fields) {
   const column=(map as Record<string,string>)[key]
   if(kind==='customers'&&key==='name'&&column===undefined)continue
   boundedText(column,'source column',100)
  }
  if(new Set(Object.values(map)).size!==Object.values(map).length)fail('FEED_MAPPING','Map each native field to a distinct source column.',400)
 }
 if(config.layout) {
  const layout=config.layout
  if(layout.id!==config.layoutId||Object.keys(layout).some(key=>!['id','name','columns','shape','revision'].includes(key))
   ||!Array.isArray(layout.columns)||!layout.columns.length||layout.columns.some(column=>!confirmationColumns.includes(column))
   ||new Set(layout.columns).size!==layout.columns.length||!['per-line','matrix'].includes(layout.shape)
   ||(layout.revision!==null&&typeof layout.revision!=='string')
   ||(layout.shape==='matrix'&&(!layout.columns.includes('style')||layout.columns.some(column=>!matrixKeyColumns.includes(column)))))fail('FEED_LAYOUT','Use the exact captured saved confirmation layout.',400)
  boundedText(layout.name,'layout name',80)
 }
 return structuredClone(config)
}

export const FEED_MAX_BYTES=128*1024
/** Strict RFC4180 quoting, bounded UTF-8, rows, cells and columns; no permissive repair. */
export function feedCsv(bytes:Uint8Array):string[][] {
 if(bytes.byteLength>FEED_MAX_BYTES)fail('FEED_SIZE','Each native feed CSV is at most 128 KiB.',400)
 let input:string
 try{input=new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{fail('FEED_UTF8','Feed CSV must be valid UTF-8.',400)}
 if(input.includes('\0'))fail('FEED_CSV','CSV cannot contain NUL bytes.',400)
 const rows:string[][]=[]
 let row:string[]=[],cell='',quoted=false,closed=false
 const finishCell=()=>{row.push(cell);cell='';closed=false;if(row.length>32)fail('FEED_COLUMNS','CSV has at most 32 columns.',400)}
 const finishRow=()=>{finishCell();rows.push(row);row=[];if(rows.length>1001)fail('FEED_ROWS','CSV has at most 1000 data rows.',400)}
 for(let n=input.startsWith('\uFEFF')?1:0;n<input.length;n++) {
  const ch=input[n]
  if(quoted) {
   if(ch==='"'&&input[n+1]==='"'){cell+='"';n++}
   else if(ch==='"'){quoted=false;closed=true}
   else cell+=ch
  } else if(ch===',')finishCell()
  else if(ch==='\r'||ch==='\n'){if(ch==='\r'&&input[n+1]==='\n')n++;finishRow()}
  else if(ch==='"'&&!cell&&!closed)quoted=true
  else if(ch==='"'||closed)fail('FEED_QUOTES','Quoted CSV fields must end at a separator or line ending.',400)
  else cell+=ch
  if(cell.length>4096)fail('FEED_CELL','CSV cells have at most 4096 characters.',400)
 }
 if(quoted)fail('FEED_QUOTES','CSV contains an unclosed quoted field.',400)
 if(cell||row.length||closed)finishRow()
 const header=rows[0]
 if(!header?.length||header.some(name=>!name||name!==name.trim())||new Set(header).size!==header.length)fail('FEED_HEADERS','CSV requires distinct nonempty trimmed column headers.',400)
 return rows
}

export function feedPath(directory:string,name:string):string {
 if(!name||/[\\/\0]/.test(name)||name==='.'||name==='..')fail('FEED_PATH','Use a single safe feed filename.',400)
 return `${directory.replace(/\/$/,'')}/${name}`
}
