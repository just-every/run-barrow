import type { Bindings } from '../../auth.server'
import { audit, commit } from '../access'
import { companyCommand, companyInvitationCollision } from '../company-members'
import { fail, text, type Actor } from '../model'
import { platformOwner } from './platform-history'
import { parseNuorderCompanies, type CompanyInput } from './nuorder-companies'
import { canonicalJson, sha256 } from '../../modules/import-kit/src/d1/index'
import { validateAccountValue } from './validation'

const system='nuorder-companies'
const hash=(value:unknown)=>sha256(canonicalJson(value as any))
const policy={rights:['purchaser'],locations:'all',perOrderLimitCents:0,approvalLimitCents:0}
const queries={accounts:'SELECT * FROM bw_accounts ORDER BY id',locations:'SELECT * FROM bw_locations ORDER BY id',imports:'SELECT * FROM bw_platform_imports ORDER BY id',members:'SELECT * FROM bw_company_members ORDER BY id',invites:'SELECT * FROM bw_company_invites ORDER BY id',links:'SELECT * FROM bw_import_invitations ORDER BY source_key',people:'SELECT id,email,display_name,role,status,version FROM oa_operators ORDER BY id',staff:'SELECT * FROM bw_staff_members ORDER BY user_id',assignments:'SELECT * FROM bw_rep_assignments ORDER BY id',legacy:'SELECT * FROM bw_company_legacy_accounts ORDER BY account_id'}
type Native=Record<keyof typeof queries,any[]>
const snapshot=async(db:D1Database)=>Object.fromEntries(await Promise.all(Object.entries(queries).map(async([key,query])=>[key,(await db.prepare(query).all<any>()).results]))) as Promise<Native>
function guards(db:D1Database,native:Native) {
 return Object.entries(queries).map(([key,query])=>{
  const rows=native[key as keyof Native]
  // Empty tables need only a count fence. Nonempty tables fence every value.
  if(!rows.length)return db.prepare(`INSERT INTO bw_guard(value) SELECT CASE WHEN (SELECT count(*) FROM (${query}))=0 THEN 1 ELSE 0 END`)
  const columns=Object.keys(rows[0])
  return db.prepare(`INSERT INTO bw_guard(value) SELECT CASE WHEN (SELECT json_group_array(json_array(${columns.join(',')})) FROM (${query}))=? THEN 1 ELSE 0 END`).bind(JSON.stringify(rows.map(row=>columns.map(column=>row[column]))))
 })
}
async function prepare(env:Bindings,actor:Actor,input:CompanyInput) {
 platformOwner(actor)
 const source=await parseNuorderCompanies(input),native=await snapshot(env.DB),errors=[...source.errors],prior=native.imports.filter(row=>row.system===system&&row.tenant===source.tenant)
 if(prior.some(row=>row.source_json==='{}'))errors.push('Source custody was erased; this tenant cannot reactivate retired identities')
 const histories=prior.filter(row=>row.source_json!=='{}').map(row=>JSON.parse(row.source_json)),plannedCompanies:any[]=[],plannedPlaces:any[]=[],plannedReps:any[]=[]
 const accountMap=new Map(native.accounts.map(row=>[row.id,row]))
 for(const company of source.companies) {
  if(!company.accountId)continue
  const previous=histories.flatMap(row=>row.companies??[]).find(row=>row.code===company.code)
  if(previous&&hash(previous)!==hash(company))errors.push(`Customer ${company.code} changed after import; preserve native identity and review changes through Accounts`)
  const existing=accountMap.get(company.accountId),current=existing?JSON.parse(existing.value_json):undefined
  const book=native.accounts.find(row=>row.id===input.priceLists?.[company.priceList]),bookValue=book?JSON.parse(book.value_json):undefined
  const rep=native.people.find(row=>row.id===input.reps?.[company.rep]),grant=rep&&native.staff.find(row=>row.user_id===rep.id)
  if(!rep||rep.role!=='member'||rep.status!=='active'||!grant||grant.state!=='active'||grant.native_version!==rep.version||JSON.parse(grant.policy_json).role!=='rep')errors.push(`Rep ${company.rep} is not an active native rep`)
  if(bookValue?.priceRevisions?.length)errors.push(`Price list ${company.priceList} has dated revisions; select an explicitly reviewed current book without a schedule`)
  if(!previous&&current&&(current.priceRevisions?.length||current.prices.some((price:any)=>price.units?.length||price.pricing)))errors.push(`Customer ${company.code} has native dated pricing or configured selling rules; resolve the book through Accounts before replacing it`)
  if(!bookValue||bookValue.lifecycle==='closed'||(bookValue.currency??'USD')!==company.currency)errors.push(`Price list ${company.priceList} has no active native book in ${company.currency}`)
  if(current&&(current.email!==company.email||current.pierCustomerId!==company.pierCustomerId))errors.push(`Customer ${company.code} cannot reassign an existing email or Pier identity`)
  if(current?.lifecycle==='closed')errors.push(`Customer ${company.code} is closed; do not reactivate its source`)
  if(native.accounts.some(row=>row.id!==company.accountId&&JSON.parse(row.value_json).email===company.email))errors.push(`Company ${company.code} email belongs to another account`)
  const collision=await companyInvitationCollision(env.DB,company.accountId,company.email)
  if(collision.reason)errors.push(`Company ${company.code} email collision: ${collision.reason}`)
  const value=previous&&current?current:bookValue?validateAccountValue({...current,name:company.name,email:company.email,pierCustomerId:company.pierCustomerId,currency:company.currency,termsDays:company.termsDays,minimumCents:bookValue.minimumCents,prices:bookValue.prices,assignedRep:rep?.display_name??company.rep,catalogs:company.catalogs.map(label=>input.catalogs?.[label]??label),providerReferences:{...current?.providerReferences,nuorder:company.code}}):undefined
  if(value)plannedCompanies.push({...company,value,exists:Boolean(existing),preserved:Boolean(previous)})
  const assignmentId=hash([system,source.tenant,'rep',company.code]),assignment=native.assignments.find(row=>row.id===assignmentId)
  if(!assignment&&native.assignments.some(row=>!row.coverage&&row.state==='active'&&(row.ends_on===null||row.ends_on>=input.effectiveOn)&&(row.kind==='account'&&row.target===company.accountId||row.kind==='territory'&&row.target===current?.territory)))errors.push(`Company ${company.code} has an existing primary assignment; resolve it through Rep assignments`)
  if(rep)plannedReps.push({id:assignmentId,accountId:company.accountId,userId:rep.id,exists:Boolean(assignment)})
 }
 for(const place of source.locations) {
  const company=source.companies.find(company=>company.code===place.code)
  if(!company?.accountId)continue
  const id=hash([system,source.tenant,'location',place.code,place.sourceId]).slice(0,60),previous=histories.flatMap(row=>row.locations??[]).find(row=>row.code===place.code&&row.sourceId===place.sourceId),existing=native.locations.find(row=>row.id===id)
  if(previous&&hash(previous)!==hash(place))errors.push(`Location ${place.sourceId} changed after import; preserve native edits and use native location controls`)
  if(previous&&!existing)errors.push(`Location ${place.sourceId} was removed; do not resurrect retired source data`)
  plannedPlaces.push({...place,id,accountId:company.accountId,exists:Boolean(existing)})
 }
 const buyers=[]
 for(const buyer of source.buyers) {
  const company=source.companies.find(company=>company.code===buyer.code)
  if(!company?.accountId)continue
  const key=hash([system,source.tenant,company.code,buyer.email]),link=native.links.find(row=>row.source_key===key),invitation=link&&native.invites.find(row=>row.id===link.invitation_id)
  const collision=await companyInvitationCollision(env.DB,company.accountId,buyer.email)
  if(collision.reason&&!link)errors.push(`Buyer ${buyer.name} email collision: ${collision.reason}`)
  if(!link&&native.members.some(row=>row.email_key===buyer.email&&row.state!=='removed'))errors.push(`Buyer ${buyer.name} already has a native membership or invitation; resolve it before importing`)
  buyers.push({...buyer,accountId:company.accountId,key,status:invitation?.status??'pending review',policy})
 }
 const counts={companies:source.companies.length,buyers:source.buyers.length,locations:source.locations.length,repAssignments:source.companies.length,priceLists:source.companies.length,catalogAssignments:source.companies.reduce((n,c)=>n+c.catalogs.length,0)}
 const planned={companies:plannedCompanies.length,buyers:buyers.length,locations:plannedPlaces.length,repAssignments:plannedReps.length,priceLists:plannedCompanies.length,catalogAssignments:plannedCompanies.reduce((sum,company)=>sum+(company.value.catalogs??[]).length,0),newCompanies:plannedCompanies.filter(row=>!row.exists).length,newLocations:plannedPlaces.filter(row=>!row.exists).length,newInvitations:buyers.filter(row=>row.status==='pending review').length}
 for(const key of Object.keys(counts) as Array<keyof typeof counts>)if(counts[key]!==planned[key])errors.push(`Source ${key} count ${counts[key]} differs from planned ${planned[key]}; resolve the difference before apply`)
 const totals=(values:Array<{currency:string;value:any}>)=>[...new Set(values.map(row=>row.currency))].sort().map(currency=>{const rows=values.filter(row=>row.currency===currency);return {currency,companies:rows.length,priceRows:rows.reduce((sum,row)=>sum+row.value.prices.length,0),unitCents:rows.reduce((sum,row)=>sum+row.value.prices.reduce((n:number,p:any)=>n+p.unitCents,0),0),minimumCents:rows.reduce((sum,row)=>sum+row.value.minimumCents,0)}})
 const sourceTotals=totals(source.companies.flatMap(company=>{const row=native.accounts.find(row=>row.id===input.priceLists?.[company.priceList]);return row?[{currency:company.currency,value:JSON.parse(row.value_json)}]:[]})),plannedTotals=totals(plannedCompanies.map(company=>({currency:company.value.currency??'USD',value:company.value})))
 const missing=['Equivalent NuORDER API reads and credit-status activation remain unimplemented; supplied credit fields are retained only','No financial balances or orders supplied; totals compare reviewed referenced current books, never receivables',...source.companies.flatMap(company=>['bill-to','ship-to'].filter(kind=>!source.locations.some(place=>place.code===company.code&&place.kind===kind)).map(kind=>`Customer ${company.code} supplies no ${kind} location`))]
 const report={source:counts,planned,totals:sourceTotals,plannedTotals,matches:!errors.length&&hash(sourceTotals)===hash(plannedTotals),errors,rejectedFields:source.rejectedFields,missing,companies:plannedCompanies.map(({value,...company})=>({...company,termsDays:value.termsDays,currency:value.currency,prices:value.prices,catalogs:value.catalogs})),locations:plannedPlaces,buyers,label:'Owner-reviewed companies, locations, rep assignments and referenced current books. Apply also requests exactly the listed zero-limit purchaser invitations; no active membership, order or payment is imported.'}
 const fingerprint=hash({input,source,native,report})
 return {source,native,report,fingerprint,plannedCompanies,plannedPlaces,plannedReps,buyers}
}
export async function previewNuorderCompanies(env:Bindings,actor:Actor,input:CompanyInput) {const result=await prepare(env,actor,input);return {...result.report,fingerprint:result.fingerprint}}

export async function applyNuorderCompanies(request:Request,env:Bindings,actor:Actor,input:CompanyInput&{fingerprint:string;reason:string;approveInvitations:boolean}) {
 platformOwner(actor)
 const fingerprint=text(input.fingerprint,'Reviewed fingerprint',64),reason=text(input.reason,'Approval reason',1000)
 if(!/^[a-f0-9]{64}$/.test(fingerprint)||input.approveInvitations!==true)fail('IMPORT_APPROVAL','Approve the exact fingerprint and every listed pending purchaser invitation.',400)
 const {fingerprint:ignored,reason:ignoredReason,approveInvitations:ignoredInvitations,...manifest}=input
 const previous=await env.DB.prepare("SELECT * FROM bw_platform_imports WHERE system=? AND fingerprint=?").bind(system,fingerprint).first<any>()
 if(previous&&previous.actor_id!==actor.id)fail('IMPORT_RESTORED','This retained approval belongs to another native owner identity; preview and approve again after restore.')
 let saved=previous
 if(!saved) {
  const p=await prepare(env,actor,manifest)
  if(p.fingerprint!==fingerprint)fail('IMPORT_CHANGED','Source, mappings or native state changed; review a fresh fingerprint.')
  if(!p.report.matches)fail('IMPORT_UNRESOLVED','Resolve every review error and difference before applying.')
  const db=env.DB,id=crypto.randomUUID(),at=new Date().toISOString(),statements=guards(db,p.native)
  for(const company of p.plannedCompanies) {
   if(!company.preserved)statements.push(db.prepare('INSERT INTO bw_accounts VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET value_json=excluded.value_json,revision=excluded.revision').bind(company.accountId,JSON.stringify(company.value),fingerprint),audit(db,actor,company.accountId,'account.saved',{accountId:company.accountId,revision:fingerprint,source:system,reason}))
   statements.push(db.prepare('INSERT OR IGNORE INTO bw_company_legacy_accounts VALUES(?)').bind(company.accountId))
  }
  const defaults=new Set(p.native.locations.filter(row=>row.is_default&&!row.archived).map(row=>row.account_id+':'+row.kind))
  for(const place of p.plannedPlaces.filter(row=>!row.exists)) {
   const key=place.accountId+':'+place.kind,isDefault=!defaults.has(key);defaults.add(key)
   statements.push(db.prepare('INSERT INTO bw_locations(id,account_id,kind,value_json,revision,is_default) VALUES(?,?,?,?,?,?)').bind(place.id,place.accountId,place.kind,JSON.stringify(place.value),fingerprint,Number(isDefault)),audit(db,actor,place.id,'location.added',{accountId:place.accountId,revision:fingerprint,source:system,reason}))
  }
  for(const rep of p.plannedReps.filter(row=>!row.exists))statements.push(db.prepare("INSERT INTO bw_rep_assignments(id,user_id,kind,target,coverage,starts_on,state,revision,reason,created_by,created_at,updated_at) VALUES(?,?,'account',?,0,?,'active',?,?,?,?,?)").bind(rep.id,rep.userId,rep.accountId,manifest.effectiveOn,fingerprint,reason,actor.id,at,at),audit(db,actor,rep.id,'rep.assigned',{accountId:rep.accountId,revision:fingerprint,source:system,reason}))
  const sourceJson=JSON.stringify({...p.source,buyers:p.buyers,artifacts:{companies:manifest.companies,buyers:manifest.buyers,locations:manifest.locations},mappings:{accounts:manifest.accounts,reps:manifest.reps,priceLists:manifest.priceLists,catalogs:manifest.catalogs},manifestHash:hash(manifest)}),reportJson=JSON.stringify(p.report),scope=JSON.stringify(p.plannedCompanies.map(row=>row.accountId))
  statements.push(db.prepare('INSERT INTO bw_platform_imports VALUES(?,?,?,?,?,?,?,?,?)').bind(id,fingerprint,system,p.source.tenant,scope,sourceJson,reportJson,actor.id,at),audit(db,actor,id,'import.approved',{revision:fingerprint,source:system,reason:JSON.stringify({reason,fingerprint,source:p.report.source,planned:p.report.planned,totals:p.report.totals,plannedTotals:p.report.plannedTotals})}))
  try{await commit(db,actor,statements)}catch(error){if((error as Error).message.includes('CHECK constraint'))fail('IMPORT_CHANGED','Native state changed during apply; preview again.');throw error}
  saved={id,fingerprint,actor_id:actor.id,tenant:p.source.tenant,source_json:sourceJson,report_json:reportJson}
 }
 const source=JSON.parse(saved.source_json)
 if(source.manifestHash!==hash(manifest))fail('IMPORT_CHANGED','The reviewed source was changed or erased; replay refuses.')
 // Each invitation and its source link commit atomically. A lost response or
 // interrupted loop resumes only the remaining explicit approvals.
 for(const buyer of source.buyers)await companyCommand(request,env,actor,'company.invite',{accountId:buyer.accountId,email:buyer.email,name:buyer.name,policy:buyer.policy,reason},{key:buyer.key,jobId:saved.id,fingerprint,sourceJson:saved.source_json,rejectCollisions:true})
 const invitations=(await env.DB.prepare('SELECT i.id,i.account_id AS accountId,i.display_name AS name,i.email,i.status FROM bw_import_invitations link JOIN bw_company_invites i ON i.id=link.invitation_id WHERE link.source_key IN (SELECT value FROM json_each(?)) ORDER BY i.email').bind(JSON.stringify(source.buyers.map((buyer:any)=>buyer.key))).all<any>()).results
 return {id:saved.id,fingerprint,replayed:Boolean(previous),...JSON.parse(saved.report_json),invitations}
}
