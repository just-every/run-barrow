import { Buffer } from 'node:buffer'
import readExcelFile from 'read-excel-file/universal'
import { inspectWorkbook } from './cutover-xlsx'
import { csvText } from '../cart-csv'
import { fail, text } from '../model'
import { platformCsv, sourceMoney } from './platform-csv'
import { parseSparkLayer, type SourceFile, type SparkInput, type PlatformSource } from './sparklayer'

export type WizInput={tenant:string;workbook?:{name:string;base64:string;layout:'split'|'master'};ftp?:{headers:SourceFile;items:SourceFile;customers?:SourceFile};websiteUsers?:SourceFile;userColumns?:{email?:string;name?:string;customerId?:string};authority:SparkInput['authority'];scope:SparkInput['scope'];columns?:Record<string,string>}
const defaults={id:'Document System ID',reference:'Document ID',customerId:'Customer ID',type:'Type',currency:'Currency',total:'Total Order Value',shipping:'Shipping',status:'Status',tracking:'Tracking',date:'Date',productId:'Product ID',quantity:'Quantity',unitPrice:'Unit Price',casePack:'Case Pack',increment:'Increment',unit:'Unit',paymentStatus:'Payment Status',paid:'Paid Amount'}
type Row={row:number;fields:Record<string,string>}
function sheetRows(name:string,rows:unknown[][]):Row[] {
 if(rows.length>501)fail('IMPORT_ROWS','Supply at most 500 rows in each workbook sheet.',400)
 const headers=rows[0]?.map(cell=>typeof cell==='string'?cell:'')
 if(!headers?.length||headers.some(h=>!h)||new Set(headers).size!==headers.length||headers.length>100)fail('IMPORT_COLUMNS',`${name} requires distinct textual headers.`,400)
 return rows.slice(1).filter(cells=>cells.some(cell=>cell!==null&&cell!=='')).map((cells,index)=>{
  if(cells.length>headers.length||cells.some(cell=>cell!==null&&(typeof cell!=='string'||cell.length>8000)))fail('IMPORT_CELL',`${name} contains an unsupported cell.`,400)
  return {row:index+2,fields:Object.fromEntries(headers.map((header,i)=>[header,(cells[i]??'') as string]))}
 })
}
export async function parseWizCommerce(input:WizInput):Promise<PlatformSource> {
 if(Boolean(input?.workbook)===Boolean(input?.ftp))fail('IMPORT_SOURCE','Choose exactly one workbook or FTP CSV batch.',400)
 const columns={...defaults,...input.columns},artifacts:PlatformSource['artifacts']=[],customers:Row[]=[],addresses:Row[]=[],users:Row[]=[]
 let headers:Row[]=[],items:Row[]=[],master=false
 if(input.workbook) {
  const file=input.workbook,name=text(file.name,'Workbook name',200)
  if(!/\.xlsx$/i.test(name)||/[\\/]/.test(name)||typeof file.base64!=='string'||file.base64.length>1398104||!/^[A-Za-z0-9+/]*={0,2}$/.test(file.base64))fail('IMPORT_WORKBOOK','Supply a plain XLSX filename and canonical base64 of at most 1 MiB.',400)
  const bytes=Buffer.from(file.base64,'base64')
  if(bytes.length>1048576||bytes.toString('base64')!==file.base64)fail('IMPORT_WORKBOOK','Workbook encoding is invalid or too large.',400)
  const data=inspectWorkbook(bytes)
  let sheets:Awaited<ReturnType<typeof readExcelFile<string>>>
  try{sheets=await readExcelFile(data,{trim:false,parseNumber:value=>value})}catch{fail('IMPORT_WORKBOOK','The XLSX export could not be read.',400)}
  const get=(name:string,required=false)=>{const matches=sheets.filter(sheet=>sheet.sheet===name);if(matches.length>1||required&&!matches.length)fail('IMPORT_SHEET',`Expected one ${name} sheet.`,400);return matches.length?sheetRows(name,matches[0].data):[]}
  if(!['split','master'].includes(file.layout))fail('IMPORT_LAYOUT','Select split or master workbook layout.',400)
  master=file.layout==='master'
  headers=get(master?'Order'+'/'+'Quote Master Sheet':'Order'+'/'+'Quote',true)
  items=master?headers:get('Order'+'/'+'Quotes Items',true)
  customers.push(...get('Customers'));addresses.push(...get('Addresses'));users.push(...get('Website Users'))
  artifacts.push({name,base64:file.base64})
 }else if(input.ftp) {
  headers=platformCsv(input.ftp.headers);items=platformCsv(input.ftp.items)
  artifacts.push(input.ftp.headers,input.ftp.items)
  if(input.ftp.customers){customers.push(...platformCsv(input.ftp.customers));artifacts.push(input.ftp.customers)}
 }
 if(input.websiteUsers){users.push(...platformCsv(input.websiteUsers));artifacts.push(input.websiteUsers)}
 if(!headers.length||!items.length)fail('IMPORT_EMPTY','Supply nonempty document headers and line items.',400)
 for(const [key,column] of Object.entries(input.columns??{}))if(!Object.hasOwn(defaults,key)||typeof column!=='string'||![...headers,...items].some(row=>Object.hasOwn(row.fields,column)))fail('IMPORT_COLUMNS',`Explicit WizCommerce mapping ${key} requires an existing header.`,400)
 const value=(row:Row,key:keyof typeof columns,required=false)=>{const result=row.fields[columns[key]]??'';return required?text(result,`${key} at source row ${row.row}`,200):result}
 const byId=new Map<string,Row>(),references=new Map<string,string>(),originalHeaders=new Map<string,Row[]>()
 for(const row of headers) {
  const id=value(row,'id',true),reference=value(row,'reference',true),prior=byId.get(id)
  if(prior&&!master)fail('IMPORT_DUPLICATE',`Repeated header UUID ${id}.`,400)
  if(prior)for(const key of ['reference','customerId','type','currency','total','shipping','status','tracking','date','paymentStatus','paid'] as const)if(value(prior,key)!==value(row,key))fail('IMPORT_JOIN',`Master rows disagree on header ${id}.`,400)
  const other=references.get(reference);if(other&&other!==id)fail('IMPORT_JOIN',`Reference ${reference} ambiguously names two source UUIDs.`,400)
  byId.set(id,row);references.set(reference,id);originalHeaders.set(id,[...originalHeaders.get(id)??[],row])
 }
 const joined:Record<string,string>[]=[],lineRows=new Map<string,Row[]>(),seenCustomers=new Set<string>()
 for(const row of customers){const id=value(row,'customerId',true);if(seenCustomers.has(id))fail('IMPORT_DUPLICATE',`Duplicate customer ${id}.`,400);seenCustomers.add(id);if(!Object.hasOwn(input.authority?.customers??{},id))fail('IMPORT_MAPPING',`Unmapped customer ${id}.`,400)}
 for(const row of items) {
  const uuid=value(row,'id'),reference=value(row,'reference'),id=uuid||references.get(reference),header=id?byId.get(id):undefined
  if(!header||reference&&references.get(reference)!==id)fail('IMPORT_JOIN',`Line row ${row.row} has an absent UUID or conflicting reference.`,400)
  const customerId=value(header,'customerId',true)
  if(value(row,'customerId')&&value(row,'customerId')!==customerId)fail('IMPORT_JOIN',`Line row ${row.row} names another customer.`,400)
  if(customers.length&&!seenCustomers.has(customerId))fail('IMPORT_JOIN',`Customer export omits ${customerId}.`,400)
  const productId=value(row,'productId',true)
  joined.push({ID:id!,'Customer ID':customerId,Type:value(header,'type',true),Currency:value(header,'currency',true),Total:value(header,'total',true),Shipping:value(header,'shipping'),Status:value(header,'status'),Tracking:value(header,'tracking'),Date:value(header,'date'),'Product ID':productId,Quantity:value(row,'quantity',true),'Unit Price':value(row,'unitPrice',true),'Case Pack':value(row,'casePack'),Increment:value(row,'increment')})
  lineRows.set(id!,[...lineRows.get(id!)??[],row])
 }
 for(const id of byId.keys())if(!lineRows.has(id))fail('IMPORT_JOIN',`Document ${id} has no line items.`,400)
 const fields=Object.keys(joined[0]),csv=csvText([fields,...joined.map(row=>fields.map(field=>row[field]))])
 const source=parseSparkLayer({tenant:input.tenant,activity:{name:'joined-wizcommerce.csv',mode:'detailed',csv},authority:input.authority,scope:input.scope})
 const relatedAccounts=new Set<string>()
 for(const row of [...customers,...addresses]){const customerId=value(row,'customerId',true),mapped=input.authority.customers[customerId];if(typeof mapped!=='string'||!mapped)fail('IMPORT_MAPPING',`Unmapped entity customer ${customerId}.`,400);relatedAccounts.add(mapped)}
 source.invitationCandidates=users.map(row=>{const columns={email:'Email',name:'Name',customerId:'Customer ID',...input.userColumns},email=text(row.fields[columns.email],'Website user email',254).normalize('NFKC').toLowerCase(),name=text(row.fields[columns.name],'Website user name',120),accountId=input.authority.customers[row.fields[columns.customerId]];if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!accountId)fail('IMPORT_USER','Map each website user to an exact email, name and source customer.',400);relatedAccounts.add(accountId);return {accountId,email,name}})
 if(new Set(source.invitationCandidates.map(user=>user.email)).size!==source.invitationCandidates.length)fail('IMPORT_DUPLICATE','Review duplicate website-user emails before import.',400)
 source.relatedAccounts=[...relatedAccounts].sort()
 source.system='wizcommerce';source.artifacts=artifacts;source.entities={customers:customers.map(row=>row.fields),addresses:addresses.map(row=>row.fields),users:users.map(row=>row.fields)}
 source.missing=['Customer, contact, address and website-user source rows remain retained history; native customer, contact and address creation is not implemented; website users require a separate explicit native invitation review','No releases, receivable balances, provider approvals or source login authority are activated',...source.incomplete?['Filtered export: omitted source scope remains incomplete']:[]]
 for(const doc of source.documents) {
  const header=byId.get(doc.id)!,rows=lineRows.get(doc.id)!
  const paid=value(header,'paid')
  doc.sourceFacts={reference:value(header,'reference'),paymentStatus:value(header,'paymentStatus'),...(paid?{paidCents:sourceMoney(paid,'Source paid amount')}:{})}
  doc.originals=originalHeaders.get(doc.id)!
  doc.lines.forEach((line,index)=>{line.original=rows[index].fields;line.row=rows[index].row;const unit=value(rows[index],'unit');if(unit)line.unit=unit})
 }
 return source
}
