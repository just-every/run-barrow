import { nuorderTable, type NuorderTable } from './nuorder'
import { companyEmail } from '../company-policy'
import { locationValue, type LocationKind } from '../locations'
import { fail, text } from '../model'
import { stableId } from './validation'

export type CompanyInput = {
 tenant: string; companies: NuorderTable; buyers: NuorderTable; locations: NuorderTable
 accounts: Record<string, { id: string; pierCustomerId: string }>
 reps: Record<string, string>; priceLists: Record<string, string>; catalogs: Record<string, string>
 effectiveOn: string
}
const companyColumns = { code:'Customer Code', name:'Customer Name', email:'Company Email', currency:'Currency', terms:'Payment Terms', rep:'Sales Rep', priceList:'Price List', catalogs:'Catalogs' }
const buyerColumns = { code:'Customer Code', email:'Buyer Email', name:'Buyer Name' }
const locationColumns = { code:'Customer Code', id:'Location Code', kind:'Type', name:'Location Name', line1:'Address 1', line2:'Address 2', city:'City', state:'State', zip:'Postal Code', deliveryInstructions:'Delivery Instructions' }
const email = (value:string) => {
 const result = companyEmail(text(value,'Source email',254))
 if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) fail('IMPORT_EMAIL','Supply a valid exact source email.',400)
 return result
}
export async function parseNuorderCompanies(input: CompanyInput) {
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['tenant','companies','buyers','locations','accounts','reps','priceLists','catalogs','effectiveOn'].includes(key)))fail('IMPORT_SOURCE','Use the documented company manifest. Source lists and product pack rules require the NuORDER history importer; API and credit activation are not supported here.',400)
 const tenant = text(input?.tenant,'NuORDER tenant',100), rejectedFields = new Set<string>(), errors:string[] = []
 if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveOn) || !Number.isFinite(Date.parse(input.effectiveOn)) || new Date(input.effectiveOn).toISOString().slice(0,10)!==input.effectiveOn) fail('IMPORT_DATE','Supply the reviewed assignment effective date as YYYY-MM-DD.',400)
 const read = async (file:NuorderTable,defaults:Record<string,string>,kind:string) => {
  const rows = await nuorderTable(file), columns = {...defaults,...file.columns}
  if (!rows.length) fail('IMPORT_EMPTY',`Supply a populated ${kind} export.`,400)
  for (const [key,column] of Object.entries(file.columns??{})) if (!Object.hasOwn(defaults,key)||typeof column!=='string'||!Object.hasOwn(rows[0].fields,column)) fail('IMPORT_COLUMNS',`Map ${kind} ${key} to a supplied source column.`,400)
  for (const column of Object.values(defaults).filter(column=>!['Address 2','Delivery Instructions'].includes(column))) {
   const key=Object.keys(defaults).find(key=>defaults[key]===column)!
   if (!Object.hasOwn(rows[0].fields,columns[key])) fail('IMPORT_COLUMNS',`Missing ${kind} column ${columns[key]}.`,400)
  }
  for (const column of Object.keys(rows[0].fields)) if (/password|credential|secret|token|session/i.test(column)) fail('IMPORT_AUTHORITY','Remove authentication material from the supplied export.',400)
  for (const column of Object.keys(rows[0].fields)) if (!Object.values(columns).includes(column)) rejectedFields.add(`${kind}: ${column} retained only`)
  return rows.map(row=>({row:row.row,fields:Object.fromEntries(Object.entries(columns).map(([key,column])=>[key,row.fields[column]??'']))}))
 }
 const [companyRows,buyerRows,placeRows] = await Promise.all([read(input.companies,companyColumns,'companies'),read(input.buyers,buyerColumns,'buyers'),read(input.locations,locationColumns,'locations')])
 const companies=companyRows.map(({fields:f,row})=>{
  const code=text(f.code,'Customer code',100), target=input.accounts?.[code]
  if (!target) errors.push(`Customer ${code} needs an explicit native account and Pier customer mapping`)
  if (!['USD','CAD','EUR','GBP'].includes(f.currency)) fail('IMPORT_CURRENCY',`Company row ${row} needs an explicit supported ISO currency.`,400)
  const terms=/^(?:Net )?(\d{1,3})$/i.exec(f.terms)
  if (!terms||Number(terms[1])>365) fail('IMPORT_TERMS','Payment Terms must name Net 0 through Net 365; credit status is retained only.',400)
  const catalogs=f.catalogs.split(';').map(value=>value.trim()).filter(Boolean)
  if (new Set(catalogs).size!==catalogs.length) errors.push(`Customer ${code} repeats a catalog`)
  if (!input.reps?.[f.rep]) errors.push(`Unknown rep ${f.rep} for ${code}`)
  if (!input.priceLists?.[f.priceList]) errors.push(`Unknown price list ${f.priceList} for ${code}`)
  for (const catalog of catalogs) if (!input.catalogs?.[catalog]) errors.push(`Unknown catalog ${catalog} for ${code}`)
  return {code,name:text(f.name,'Customer name',160),email:email(f.email),currency:f.currency,termsDays:Number(terms[1]),rep:f.rep,priceList:f.priceList,catalogs,accountId:target?stableId(target.id):'',pierCustomerId:target?stableId(target.pierCustomerId,'Pier customer'):''}
 })
 for (const company of companies) {
  if (companies.filter(other=>other.code===company.code).length>1) errors.push(`Duplicate customer code ${company.code}; resolve the source rows before apply`)
  if (company.accountId&&companies.some(other=>other.code!==company.code&&other.accountId===company.accountId)) errors.push(`Distinct customer codes cannot share native account ${company.accountId}`)
  if (companies.some(other=>other.code!==company.code&&other.email===company.email)) errors.push(`Company email collision for ${company.code}`)
 }
 const buyers=buyerRows.map(({fields:f})=>({code:text(f.code,'Buyer customer code',100),email:email(f.email),name:text(f.name,'Buyer name',120)}))
 for (const buyer of buyers) {
  if (!companies.some(company=>company.code===buyer.code)) errors.push(`Buyer ${buyer.name} names unknown company ${buyer.code}`)
  if (companies.some(company=>company.code!==buyer.code&&company.email===buyer.email)) errors.push(`Buyer ${buyer.name} email collision: another incoming company contact`)
  if (buyers.filter(other=>other.email===buyer.email).length>1) errors.push(`Duplicate buyer email for ${buyer.name}; resolve the source rows before apply`)
 }
 const locations=placeRows.map(({fields:f})=>{
  if (!companies.some(company=>company.code===f.code)) errors.push(`Location ${f.id} names unknown company ${f.code}`)
  const kind:LocationKind=['bill-to','ship-to'].includes(f.kind)?f.kind as LocationKind:fail('IMPORT_LOCATION','Location Type must be bill-to or ship-to.',400)
  return {code:f.code,sourceId:text(f.id,'Location code',100),kind,value:locationValue(kind,f)}
 })
 for (const place of locations) if (locations.filter(other=>other.code===place.code&&other.sourceId===place.sourceId).length>1) errors.push(`Duplicate location ${place.sourceId} for ${place.code}`)
 return {tenant,companies,buyers,locations,rejectedFields:[...rejectedFields].sort(),errors}
}
