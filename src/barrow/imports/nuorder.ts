import type { SourceReceivable } from './nuorder-receivables'
import { csvText } from '../cart-csv'
import { fail, text } from '../model'
import { platformCsv, sourceMoney, sourceQuantity } from './platform-csv'
import { parseSparkLayer, type PlatformSource, type SourceFile, type SparkInput } from './sparklayer'
import { workbookSheets } from './wizcommerce'
import { binaryWorkbook } from './nuorder-xls'
import { nuorderMedia, type NuorderMediaInput, type HeldNuorderImage } from './nuorder-media'

type Table = SourceFile | {name:string;base64:string;sheet:string;columns?:Record<string,string>}
export type NuorderInput = {
 tenant:string; products:Table; orders:Table; authority:SparkInput['authority']; scope:SparkInput['scope']
 lists?:SparkInput['lists']; images?:NuorderMediaInput[]; imageRule?:string; imageHosts?:string[]; retrieveImages?:boolean
 receivables?:{file:Table;mappings:Record<string,string>;dispositions?:Record<string,string>}
 priceBooks?:Array<{customerId:string;file:Table}>
}
export type NuorderProduct = {id:string;sku:string;style:string;color:string;size:string;upc:string;season:string;archived:boolean;casePack?:number;increment?:number;original:Record<string,string>}
export type NuorderCatalog = {products:NuorderProduct[];receivables:SourceReceivable[];priceBooks:Array<{accountId:string;currency:'USD'|'CAD';prices:Array<{sku:string;unitCents:number;minQty:number}>}>;images:Array<HeldNuorderImage&{sku:string;slot:number}>;heldImages:HeldNuorderImage[];imageRule:string;missingImages:Array<{style:string;name:string;reason:string}>;columns:{products:string[];orders:string[]}}
const productColumns = {id:'Product ID',style:'Style Number',color:'Color',size:'Size',upc:'UPC',season:'Season',archived:'Archived',casePack:'Case Pack',increment:'Increment'}
const orderColumns = {type:'Type',id:'Order Number',customerId:'Company Code',currency:'Currency',total:'Order Total',shipping:'Shipping',status:'Status',date:'Order Date',productId:'Product ID',quantity:'Quantity',unitPrice:'Wholesale Price',openQuantity:'Open Quantity',po:'Customer PO',shipStart:'Ship Start',shipEnd:'Ship End'}
async function table(file:Table) {
 if (!file || typeof file !== 'object') fail('IMPORT_SOURCE','Supply product and order exports.',400)
 if ('csv' in file) return platformCsv(file)
 const sheets=/\.xls$/i.test(file.name)?binaryWorkbook(file):await workbookSheets(file),sheet=sheets.find(sheet=>sheet.sheet===file.sheet)
 if (!sheet) fail('IMPORT_SHEET','Select an existing source sheet by its exact name.',400)
 const rows=sheet.data as unknown[][],headers=rows[0]
 if (!headers?.length || headers.some(value=>typeof value!=='string')) fail('IMPORT_COLUMNS','Workbook headers must be text.',400)
 if (rows.some(row=>row.length>headers.length||row.some(value=>value!==null&&typeof value!=='string'))) fail('IMPORT_CELL','Unsupported source cell.',400)
 return platformCsv({name:file.name.replace(/\.xlsx?$/i,'.csv'),csv:csvText([headers as string[],...rows.slice(1).map(row=>headers.map((_,i)=>String(row[i]??'')))])})
}
function mapping(defaults:Record<string,string>,file:Table,rows:Array<{fields:Record<string,string>}>) {
 for (const [key,column] of Object.entries(file.columns??{})) if (!Object.hasOwn(defaults,key)||typeof column!=='string'||!rows.some(row=>Object.hasOwn(row.fields,column))) fail('IMPORT_COLUMNS',`Map ${key} to an existing source column.`,400)
 return {...defaults,...file.columns}
}
export async function parseNuorder(input:NuorderInput,held:HeldNuorderImage[]=[]):Promise<PlatformSource> {
 const [productRows,orderRows]=await Promise.all([table(input?.products),table(input?.orders)])
 if (!productRows.length||!orderRows.length) fail('IMPORT_EMPTY','Supply nonempty product and order exports.',400)
 const pc=mapping(productColumns,input.products,productRows),oc=mapping(orderColumns,input.orders,orderRows)
 const resolve=(map:Record<string,string>|undefined,id:string)=>map&&Object.hasOwn(map,id)?text(map[id],'Mapped SKU',100):fail('IMPORT_MAPPING',`Unmapped product ${id}.`,400)
 const seen=new Set<string>(),skus=new Set<string>(),rejectedFields:string[]=[]
 const products=productRows.map(({fields,row})=>{
  const get=(key:string,required=false)=>required?text(fields[pc[key]],`Product row ${row} ${pc[key]}`,100):fields[pc[key]]??''
  const id=get('id',true),sku=resolve(input.authority?.products,id)
  if (seen.has(id)||skus.has(sku)) fail('IMPORT_DUPLICATE','Product IDs and mapped SKUs must be distinct.',400)
  seen.add(id);skus.add(sku)
  const archived=get('archived')
  if (!['true','false'].includes(archived)) fail('IMPORT_FIELD','Archived must explicitly be true or false.',400)
  const product:NuorderProduct={id,sku,style:get('style',true),color:get('color',true),size:get('size',true),upc:get('upc'),season:get('season'),archived:archived==='true',original:fields}
  for (const key of ['casePack','increment'] as const) if (get(key)) product[key]=sourceQuantity(get(key),key)
  return product
 })
 const joined:Record<string,string>[]=[]
 for (const {fields,row} of orderRows) {
  const get=(key:string,required=false)=>required?text(fields[oc[key]],`Order row ${row} ${oc[key]}`,200):fields[oc[key]]??''
  if (get('type')&&get('type').toLowerCase()!=='order') fail('IMPORT_TYPE','Only order exports may enter this door; retain quotes separately.',400)
  const date=get('date');if(date&&(!/^\d{4}-\d{2}-\d{2}/.test(date)||!Number.isFinite(Date.parse(date.slice(0,10)))||new Date(date.slice(0,10)).toISOString().slice(0,10)!==date.slice(0,10)))fail('IMPORT_DATE','Order dates must name a valid ISO calendar day.',400)
  const productId=get('productId',true),product=products.find(p=>p.id===productId)
  if (!product) fail('IMPORT_MAPPING',`Order row ${row} references absent product ${productId}.`,400)
  const quantity=sourceQuantity(get('quantity',true),'Order quantity'),remaining=get('openQuantity',true)
  if (!/^(0|[1-9]\d*)$/.test(remaining)||!Number.isSafeInteger(Number(remaining))||Number(remaining)>quantity) fail('IMPORT_QUANTITY','Open quantity must be between zero and ordered quantity.',400)
  for (const key of ['shipStart','shipEnd'] as const) if (get(key)&&(!/^\d{4}-\d{2}-\d{2}$/.test(get(key))||!Number.isFinite(Date.parse(get(key)))||new Date(get(key)).toISOString().slice(0,10)!==get(key))) fail('IMPORT_DATE','Ship windows require ISO calendar dates.',400)
  if (get('shipStart')&&get('shipEnd')&&get('shipStart')>get('shipEnd')) fail('IMPORT_DATE','Ship window end precedes its start.',400)
  joined.push({ID:get('id',true),'Customer ID':get('customerId',true),Type:'Order',Currency:get('currency',true),Total:get('total',true),Shipping:get('shipping')||'0',Status:get('status',true),Date:get('date'), 'Product ID':productId,Quantity:String(quantity),'Unit Price':get('unitPrice',true),'Case Pack':String(product.casePack??''),Increment:String(product.increment??'')})
 }
 const sourceIdentity=(row:typeof orderRows[number],key:'id'|'productId')=>text(row.fields[oc[key]],`Order row ${row.row} ${oc[key]}`,200)
 const headers=Object.keys(joined[0]),source=parseSparkLayer({tenant:input.tenant,activity:{name:'nuorder-joined.csv',mode:'detailed',csv:csvText([headers,...joined.map(row=>headers.map(h=>row[h]))])},authority:input.authority,scope:input.scope,lists:input.lists})
 const priceBooks:NuorderCatalog['priceBooks']=[]
 if(input.priceBooks!==undefined&&(!Array.isArray(input.priceBooks)||input.priceBooks.length>20))fail('IMPORT_PRICES','Supply at most twenty explicitly mapped price books.',400)
 for(const book of input.priceBooks??[]) {
  const accountId=Object.hasOwn(input.authority.customers,book.customerId)?text(input.authority.customers[book.customerId],'Mapped price-book account',100):fail('IMPORT_MAPPING',`Unmapped price-book customer ${book.customerId}.`,400)
  if(priceBooks.some(prior=>prior.accountId===accountId))fail('IMPORT_PRICES','Supply one current price book per mapped account.',400)
  const rows=await table(book.file),defaults={productId:'Product ID',currency:'Currency',unitPrice:'Wholesale Price',minQty:'Minimum Quantity'},columns=mapping(defaults,book.file,rows)
  if(!rows.length||rows.length>200)fail('IMPORT_PRICES','Supply one to two hundred price rows per account.',400)
  const currencies=new Set(rows.map(row=>row.fields[columns.currency])),currency=rows[0].fields[columns.currency]
  if(currencies.size!==1||!['USD','CAD'].includes(currency))fail('IMPORT_PRICES','Each current price book needs one explicit USD or CAD currency.',400)
  const prices=rows.map(({fields})=>{
   const product=products.find(product=>product.id===fields[columns.productId])
   if(!product||product.archived)fail('IMPORT_PRICES','Current books must map to supplied active products.',400)
   return {sku:product.sku,unitCents:sourceMoney(fields[columns.unitPrice],'Current wholesale price'),minQty:sourceQuantity(fields[columns.minQty],'Minimum quantity')}
  })
  if(new Set(prices.map(price=>price.sku)).size!==prices.length)fail('IMPORT_PRICES','Resolve repeated mapped products in the current price book.',400)
  for(const field of Object.keys(rows[0].fields))if(!Object.values(columns).includes(field))rejectedFields.push(`price book ${book.customerId}: ${field} retained only`)
  priceBooks.push({accountId,currency:currency as 'USD'|'CAD',prices})
 }
 source.system='nuorder';source.artifacts=[input.products,input.orders,...input.lists??[],...(input.priceBooks??[]).map(book=>book.file)];source.relatedAccounts=priceBooks.map(book=>book.accountId)
 for (const doc of source.documents) {
  const rows=orderRows.filter(row=>sourceIdentity(row,'id')===doc.id)
  doc.originals=rows
  doc.lines.forEach(line=>{const original=rows.find(row=>input.authority.products[sourceIdentity(row,'productId')]===line.sku)!;line.original=original.fields;line.row=original.row;line.openQuantity=Number(original.fields[oc.openQuantity])})
  doc.sourceFacts={po:rows[0].fields[oc.po]??'',shipStart:rows[0].fields[oc.shipStart]??'',shipEnd:rows[0].fields[oc.shipEnd]??''}
  for (const row of rows) for (const key of ['po','shipStart','shipEnd']) if ((row.fields[oc[key]]??'')!==doc.sourceFacts[key]) fail('IMPORT_JOIN',`Repeated header ${doc.id} disagrees on ${key}.`,400)
 }
 const receivables:SourceReceivable[]=[]
 if(input.receivables){
  const ledger=input.receivables,rows=await table(ledger.file),defaults={id:'Invoice ID',orderId:'Order Number',customerId:'Company Code',currency:'Currency',balance:'Balance'},columns=mapping(defaults,ledger.file,rows)
  if(!rows.length)fail('IMPORT_RECEIVABLES','Supply a populated source ledger or omit the absent export explicitly.',400)
  if(!ledger.mappings||typeof ledger.mappings!=='object'||Array.isArray(ledger.mappings))fail('IMPORT_RECEIVABLES','Supply explicit invoice mappings or retained-history dispositions.',400)
  for(const {fields,row} of rows){
   const get=(key:string)=>text(fields[columns[key]],`Ledger row ${row} ${columns[key]}`,200),id=get('id'),orderId=get('orderId'),customerId=get('customerId'),currency=get('currency'),doc=source.documents.find(doc=>doc.id===orderId)
   if(receivables.some(prior=>prior.id===id))fail('IMPORT_RECEIVABLES',`Repeated source invoice ${id}.`,400)
   const accountId=Object.hasOwn(input.authority.customers,customerId)?text(input.authority.customers[customerId],'Mapped ledger account',100):fail('IMPORT_MAPPING',`Unmapped ledger customer ${customerId}.`,400)
   if(!doc||doc.accountId!==accountId||doc.currency!==currency)fail('IMPORT_RECEIVABLES',`Ledger invoice ${id} names a missing source order or a different account or currency.`,400)
   const target=Object.hasOwn(ledger.mappings,id)?text(ledger.mappings[id],'Invoice target',200):'',disposition=ledger.dispositions?.[id]===undefined?'':text(ledger.dispositions[id],'Balance disposition',1000)
   if(target==='retain-history'&&!disposition)fail('IMPORT_RECEIVABLES',`Name the retained-history disposition for invoice ${id}.`,400)
   receivables.push({id,orderId,accountId,currency,balanceCents:sourceMoney(fields[columns.balance],'Source receivable balance'),target,disposition,row,original:fields})
  }
  if(Object.keys(ledger.mappings).some(id=>!receivables.some(row=>row.id===id))||Object.keys(ledger.dispositions??{}).some(id=>!receivables.some(row=>row.id===id)))fail('IMPORT_RECEIVABLES','A mapping or disposition names an absent source invoice.',400)
  for(const field of Object.keys(rows[0].fields))if(!Object.values(columns).includes(field))rejectedFields.push(`receivables: ${field} retained only`)
  source.artifacts.push(ledger.file)
 }
 const media=await nuorderMedia(input,products,held)
 const columns={products:Object.keys(productRows[0].fields),orders:Object.keys(orderRows[0].fields)}
 for (const [kind,actual,mapped] of [['products',columns.products,pc],['orders',columns.orders,oc]] as const) for (const field of actual) if (!Object.values(mapped).includes(field)) rejectedFields.push(`${kind}: ${field} retained only`)
 source.catalog={products,priceBooks,receivables,...media,columns}
 source.rejectedFields=rejectedFields
 source.missing=['NuORDER retailer-network orders stop arriving at cutover; open orders remain labeled source history, never submitted to Pier','Companies, buyers and locations require MOVE-009; historical order prices never activate a current book',...(!priceBooks.length?['No separately supplied current price book; existing native books are unchanged']:[]),...(receivables.length?['Supplied receivables are compared and retained only; source ledger remains authoritative; no native financial authority is activated']:['Releases, invoices and balances not supplied; no financial authority is activated']),'Only sanitized JPEGs are accepted; no malware verdict or public image download door','Rebuild recipient line sheets and presentations from imported SKUs through native publishing; private incumbent layouts do not transfer; richer CAT-004 video and editorial media remain separate',...source.incomplete?['Filtered source scope remains incomplete']:[]]
 return source
}

export { table as nuorderTable }
export type { Table as NuorderTable }
