import { resolveBuyingProfile } from './buying-profiles'
import type { Bindings } from '../auth.server'
import { accounts, account } from './accounts'
import { audit, commit, changed } from './access'
import { fail, integer, requirePerson, text, supplierDate, supplier, type Actor, type Account, type Order } from './model'
import { bootstrapLegacyCompanyMembers } from './company-members'
import { companyPurchasingRecipientSql } from './company-members'
import { readStaffGrant, staffGuard } from './staff-policy'
import { readList } from './lists'
import { catalogue } from './pier'
import { now } from './clock'
import { currentReps, supplierToday } from './rep-scope'
import { sheetDownload, sheetDocument, storedSheet, type Sheet } from './line-sheets'
import { operatorMail } from '../mail.server.mjs'
import { reportSuppressed } from './report-access'
import { observeMailConfiguration } from './quote-mail-config'

export const campaignMissing=()=>fail('NOT_FOUND','Campaign not found.',404)
export function campaignSeller(actor:Actor){requirePerson(actor);if(!supplier(actor)||actor.staff&&!['sales-manager','rep'].includes(actor.staff.role))fail('FORBIDDEN','Campaigns require current supplier selling rights.',403)}
const parse=(row:any)=>({...JSON.parse(row.value_json),id:row.id,revision:row.revision,createdBy:row.created_by,state:row.state,restored:row.restored,dueAt:row.due_at})
export async function campaignActor(env:Bindings,id:string):Promise<Actor|null>{
 const p=await env.DB.prepare("SELECT id,email,role,version FROM oa_operators WHERE id=? AND status='active'").bind(id).first<any>()
 if(!p)return null
 const actor:Actor={...p,agent:false};actor.staff=await readStaffGrant(env.DB,actor)
 try{campaignSeller(actor);return actor}catch{return null}
}
async function write(env:Bindings,actor:Actor,statements:D1PreparedStatement[]){
 if(actor.sessionId)return commit(env.DB,actor,statements)
 // A recorded schedule outlives a login session, never a native role or current grant.
 await env.DB.batch([env.DB.prepare("INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND role=? AND status='active') THEN 1 ELSE 0 END").bind(actor.id,actor.version,actor.role),...(actor.staff?[staffGuard(env.DB,actor.staff)]:[]),...statements,env.DB.prepare('DELETE FROM bw_guard')])
}
function filters(input:any){
 if(!input||typeof input!=='object'||Array.isArray(input))fail('INPUT','Choose segment filters.',400)
 const result:any={}
 for(const key of Object.keys(input)){
  if(['accountIds','buyerIds'].includes(key)){if(!Array.isArray(input[key])||input[key].length>1000||input[key].some((v:any)=>typeof v!=='string'))fail('INPUT','Use bounded exact identities.',400);result[key]=[...new Set(input[key])]}
  else if(['channel','territory','assignedRep','season','tag'].includes(key))result[key]=text(input[key],key,100)
  else if(key==='lastSeason'){
   const value=input[key];result[key]={season:text(value?.season,'Last season',80),currency:text(value?.currency,'Currency',3),minCents:integer(value?.minCents??0,'Minimum value'),maxCents:integer(value?.maxCents??1000000000,'Maximum value')}
   if(result[key].minCents>result[key].maxCents||!['USD','CAD','EUR','GBP'].includes(result[key].currency))fail('INPUT','Use an ordered value range and ISO currency.',400)
  }else fail('INPUT','Unknown segment filter.',400)
 }
 return result
}
async function segment(env:Bindings,actor:Actor,id:string){
 const row=await env.DB.prepare('SELECT * FROM bw_campaign_segments WHERE id=?').bind(id).first<any>()
 if(!row||row.created_by!==actor.id&&!['owner','admin'].includes(actor.role))campaignMissing()
 return parse(row)
}
async function audience(env:Bindings,actor:Actor,f:any){
 await bootstrapLegacyCompanyMembers(env.DB)
 const directory=await accounts(env.DB,actor),holders=await currentReps(env.DB,directory.map(a=>a.id),await supplierToday())
 const orders=(await env.DB.prepare('SELECT value_json FROM bw_orders').all<any>()).results.map(r=>JSON.parse(r.value_json) as Order)
 const placed=orders.filter(o=>o.submittedBy&&o.status!=='cancelled')
 const selected=directory.filter(a=>{
  if(f.accountIds&&!f.accountIds.includes(a.id))return false
  for(const key of ['channel','territory'] as const)if(f[key]&&a.value[key]!==f[key])return false
  if(f.tag&&!a.value.tags?.includes(f.tag))return false
  if(f.assignedRep&&!(holders.get(a.id)??[]).some(p=>p.userId===f.assignedRep||p.name===f.assignedRep)&&a.value.assignedRep!==f.assignedRep)return false
  if(f.season&&!placed.some(o=>o.accountId===a.id&&o.season===f.season))return false
  if(f.lastSeason){const value=placed.filter(o=>o.accountId===a.id&&o.season===f.lastSeason.season&&o.currency===f.lastSeason.currency).reduce((n,o)=>n+o.totalCents,0);if(value<f.lastSeason.minCents||value>f.lastSeason.maxCents)return false}
  return true
 })
 const excluded:any[]=[],recipients:any[]=[]
 for(const a of selected){
  const people=(await env.DB.prepare(`SELECT p.id,p.email,p.version FROM oa_operators p JOIN bw_accounts a ON a.id=? WHERE p.status='active' AND ${companyPurchasingRecipientSql('p','a.id')}`).bind(a.id).all<any>()).results.filter(p=>!f.buyerIds||f.buyerIds.includes(p.id))
  const reason=a.value.lifecycle==='closed'?'closed':a.value.lifecycle==='on-hold'?'held':!people.length?'pending or no approved purchaser':null
  if(reason){excluded.push({accountId:a.id,name:a.value.name,reason});continue}
  for(const p of people)recipients.push({account:a,person:p})
 }
 return {excluded,recipients}
}
async function source(env:Bindings,actor:Actor,p:any){
 if(p.source?.kind==='sheet'){
  const sheet=await storedSheet(env,actor,text(p.source.id,'Source sheet'))
  return {brandId:sheet.buyingProfile?.brandId,profileId:sheet.buyingProfile?.id,sourceAccountId:sheet.accountId,suggestions:sheet.suggestions,name:sheet.name,season:sheet.season,display:sheet.display,shipStart:sheet.shipStart,shipEnd:sheet.shipEnd,skus:sheet.items.map(i=>i.sku),packs:sheet.packs,presentation:sheet.presentation,imageRefs:sheet.imageRefs}
 }
 let rows:any[]=[],brandId:string|undefined,profileId:string|undefined,sourceAccountId:string|undefined
 if(p.source?.kind==='list')rows=(await readList(env.DB,actor,text(p.source.id,'Source list'))).lines
 else if(p.source?.kind==='order'){
  const row=await env.DB.prepare('SELECT account_id,value_json FROM bw_orders WHERE id=?').bind(text(p.source.id,'Source order')).first<any>();if(!row)campaignMissing();await account(env.DB,actor,row.account_id);const order=JSON.parse(row.value_json);brandId=order.buyingProfile?.brandId;profileId=order.buyingProfile?.id;sourceAccountId=order.accountId;rows=order.lines
 }else if(p.source?.kind==='products')rows=p.lines
 else fail('INPUT','Choose a published sheet, saved list, working order or explicit product list.',400)
 if(!Array.isArray(rows)||!rows.length||rows.length>100)fail('INPUT','Choose up to 100 source lines.',400)
 const shipStart=text(p.shipStart,'Ship start',10),shipEnd=text(p.shipEnd,'Ship end',10)
 if(!/^\d{4}-\d{2}-\d{2}$/.test(shipStart)||!/^\d{4}-\d{2}-\d{2}$/.test(shipEnd)||shipEnd<shipStart)fail('INPUT','Use an ordered ship window.',400)
 return {brandId,profileId,sourceAccountId,suggestions:rows.map(l=>({sku:l.sku,quantity:integer(Number(l.quantity),'Source quantity',1,1000000),...(l.unit?{unit:text(l.unit,'Source selling unit',32)}:{})})),name:text(p.name,'Campaign name',100),season:text(p.season,'Season',80),display:'wholesale' as const,shipStart,shipEnd,skus:[...new Set(rows.map(l=>text(l.sku,'SKU',100)))],packs:[]}
}
export async function storedCampaign(env:Bindings,actor:Actor,id:string){
 campaignSeller(actor)
 const row=await env.DB.prepare('SELECT * FROM bw_campaigns WHERE id=?').bind(id).first<any>();if(!row)campaignMissing()
 const campaign=parse(row)
 if(campaign.createdBy!==actor.id&&!['owner','admin'].includes(actor.role))campaignMissing()
 // A role losing any recipient account loses the whole campaign detail, never a trimmed private history.
 for(const delivery of (await env.DB.prepare('SELECT DISTINCT account_id FROM bw_campaign_deliveries WHERE campaign_id=?').bind(id).all<any>()).results)await account(env.DB,actor,delivery.account_id)
 return campaign
}
export async function campaignSummary(env:Bindings,actor:Actor,id:string){
 const campaign=await storedCampaign(env,actor,id)
 const deliveries=(await env.DB.prepare('SELECT d.*,p.display_name AS buyer_name FROM bw_campaign_deliveries d LEFT JOIN oa_operators p ON p.id=d.recipient_id WHERE campaign_id=? ORDER BY account_id,recipient_id').bind(id).all<any>()).results
 const events=(await env.DB.prepare('SELECT e.* FROM bw_sheet_events e JOIN bw_campaign_deliveries d ON d.sheet_id=e.sheet_id AND d.recipient_id=e.actor_id WHERE d.campaign_id=?').bind(id).all<any>()).results
 const orders=(await env.DB.prepare("SELECT value_json FROM bw_orders WHERE json_extract(value_json,'$.campaign.id')=?").bind(id).all<any>()).results.map(r=>JSON.parse(r.value_json) as Order).filter(o=>o.submittedBy&&o.status!=='cancelled')
 const count=(status:string)=>deliveries.filter(d=>d.status===status).length
 return {...campaign,deliveries:deliveries.map(d=>({...d,opens:events.filter(e=>e.sheet_id===d.sheet_id&&e.kind==='open').length,views:events.filter(e=>e.sheet_id===d.sheet_id&&e.kind==='view').length,orders:orders.filter(o=>o.campaign?.deliveryId===d.id).map(o=>({id:o.id,currency:o.currency,totalCents:o.totalCents}))})),counts:{delivered:count('delivered'),accepted:count('accepted'),bounced:count('bounced'),suppressed:count('suppressed'),opened:events.filter(e=>e.kind==='open').length,viewed:events.filter(e=>e.kind==='view').length,ordered:orders.length},orderValue:Object.fromEntries([...new Set(orders.map(o=>o.currency))].map(c=>[c,orders.filter(o=>o.currency===c).reduce((n,o)=>n+o.totalCents,0)]))}
}
export async function campaignWorkspace(env:Bindings,actor:Actor){
 campaignSeller(actor)
 const segments=(await env.DB.prepare('SELECT * FROM bw_campaign_segments WHERE created_by=? ORDER BY rowid DESC').bind(actor.id).all<any>()).results.map(parse)
 const campaigns=[]
 for(const row of (await env.DB.prepare('SELECT * FROM bw_campaigns WHERE created_by=? ORDER BY rowid DESC LIMIT 100').bind(actor.id).all<any>()).results){try{campaigns.push(await campaignSummary(env,actor,row.id))}catch{}}
 return {segments,campaigns}
}
export async function campaignCommand(env:Bindings,actor:Actor,type:string,p:any){
 campaignSeller(actor)
 if(type==='segment.save'){
  const id=p.id??crypto.randomUUID(),revision=crypto.randomUUID(),value={name:text(p.name,'Segment name',100),filters:filters(p.filters)}
  if(p.id){const prior=await segment(env,actor,id);if(prior.revision!==p.revision)fail('CHANGED','Refresh the saved segment.')}
  await commit(env.DB,actor,[env.DB.prepare('INSERT INTO bw_campaign_segments VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET value_json=excluded.value_json,revision=excluded.revision').bind(id,actor.id,JSON.stringify(value),revision),audit(env.DB,actor,id,'campaign.segment-saved',{revision,source:type,reason:'Saved explicit account attribute filters; recipients resolve at send time.'})]);return {id,revision,...value}
 }
 if(type==='campaign.save'){
  const prior=p.id?await storedCampaign(env,actor,p.id):null
  if(prior&&(prior.revision!==p.revision||prior.state!=='draft'||prior.restored))fail('CHANGED','Only a current native draft can be edited.')
  const template=await source(env,actor,p),saved=p.segmentId?await segment(env,actor,text(p.segmentId,'Segment')):null
  const lines=p.suggested===false?[]:(p.lines??template.suggestions??template.skus.map(sku=>({sku,quantity:1})))
  if(!Array.isArray(lines)||lines.length>100||lines.some(l=>!template.skus.includes(l.sku)))fail('INPUT','Suggested lines must be on the source.',400)
  const suggestions=lines.map(l=>({sku:l.sku,quantity:integer(l.quantity,'Suggested quantity',1,1000000),...(l.unit?{unit:text(l.unit,'Suggested selling unit',32)}:{})}))
  if(new Set(suggestions.map(l=>l.sku)).size!==suggestions.length)fail('INPUT','Use distinct suggested SKUs.',400)
  const profileByAccount:Record<string,string>={}
  if(p.profileByAccount!==undefined){if(!p.profileByAccount||typeof p.profileByAccount!=='object'||Array.isArray(p.profileByAccount)||Object.keys(p.profileByAccount).length>1000)fail('INPUT','Map exact account IDs to approved buying profiles.',400);for(const [key,value] of Object.entries(p.profileByAccount)){await account(env.DB,actor,key);profileByAccount[key]=text(value,'Buying profile',100)}}
  const id=prior?.id??crypto.randomUUID(),revision=crypto.randomUUID(),value={profileByAccount,source:{kind:p.source.kind,...(p.source.id?{id:text(p.source.id,'Source record')}: {})},name:text(p.name,'Campaign name',100),subject:text(p.subject,'Subject',200),message:text(p.message,'Message',10000),template,segmentId:saved?.id??null,filters:saved?.filters??filters(p.filters),suggestions,attachPdf:p.attachPdf!==false,attachmentFormat:p.attachmentFormat==='xlsx'?'xlsx':'pdf',excluded:[]}
  await commit(env.DB,actor,[env.DB.prepare('INSERT INTO bw_campaigns(id,created_by,value_json,revision) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET value_json=excluded.value_json,revision=excluded.revision WHERE bw_campaigns.revision=? AND bw_campaigns.state=\'draft\'').bind(id,actor.id,JSON.stringify(value),revision,prior?.revision??''),changed(env.DB),audit(env.DB,actor,id,'campaign.saved',{revision,source:type,reason:'Saved a reviewed campaign draft; no recipients contacted.'})]);return campaignSummary(env,actor,id)
 }
 const campaign=await storedCampaign(env,actor,text(p.id,'Campaign'))
 if(campaign.revision!==p.revision||campaign.restored)fail('CHANGED','Refresh this native campaign; restored campaigns cannot send.')
 if(type==='campaign.test'){
  const selected=await account(env.DB,actor,text(p.accountId,'Test price account'))
  const preview=await makeSheet(env,actor,campaign,selected)
  const result=await sendMessage(env,actor,campaign,{id:crypto.randomUUID(),sheet:preview,email:actor.email},true)
  await commit(env.DB,actor,[audit(env.DB,actor,campaign.id,'campaign.tested',{revision:campaign.revision,source:type,reason:'Self-only test outcome: '+result.status+'; campaign delivery totals unchanged.'})]);return {status:result.status}
 }
 if(type==='campaign.schedule'){
  if(campaign.state!=='draft')fail('CHANGED','Only a draft can be scheduled.')
  const due=text(p.dueAt,'Scheduled UTC time',30)
  if(!Number.isFinite(Date.parse(due))||Date.parse(due)<=(await now()).getTime())fail('INPUT','Choose a future scheduled time.',400)
  await commit(env.DB,actor,[env.DB.prepare("UPDATE bw_campaigns SET due_at=?,state='scheduled' WHERE id=? AND revision=? AND state='draft'").bind(new Date(due).toISOString(),campaign.id,campaign.revision),changed(env.DB),audit(env.DB,actor,campaign.id,'campaign.scheduled',{revision:campaign.revision,source:type,reason:'Sender explicitly authorized this future audience resolution and send.'})]);return campaignSummary(env,actor,campaign.id)
 }
 if(type==='campaign.send'){
  if(campaign.state==='scheduled'&&campaign.dueAt&&(await now()).toISOString()<campaign.dueAt)fail('SCHEDULED','This campaign is scheduled for later.')
  await freezeCampaign(env,actor,campaign)
  await dispatchCampaignDeliveries(env,campaign.id)
  return campaignSummary(env,actor,campaign.id)
 }
 fail('COMMAND','Unknown campaign action.',404)
}
async function campaignProfile(env:Bindings,actor:Actor,campaign:any,selected:Account){
 const template=campaign.template,id=campaign.profileByAccount?.[selected.id]??(template.sourceAccountId===selected.id?template.profileId:undefined)
 if(template.brandId&&!id)fail('PROFILE','Choose this account’s approved buying profile for the source brand.')
 const context=await resolveBuyingProfile(env.DB,actor,selected,id)
 if((context.selected.buyingProfile?.brandId??undefined)!==(template.brandId??undefined))fail('SELLER_MIX','Every recipient must keep the source brand and legal seller.')
 return context
}
async function makeSheet(env:Bindings,actor:Actor,campaign:any,selected:Account):Promise<Sheet>{
 const template=campaign.template,today=supplierDate(await now()),context=await campaignProfile(env,actor,campaign,selected)
 selected=context.selected
 const live=await catalogue(env,selected)
 if(template.skus.some((sku:string)=>!live.items.some(i=>i.sku===sku)))fail('ASSORTMENT','A source SKU is unavailable for this recipient; review their assortment before sending.')
 return {...template,...(selected.buyingProfile?{buyingProfile:selected.buyingProfile}:{}),id:crypto.randomUUID(),revision:crypto.randomUUID(),accountId:selected.id,state:'published',publishedAt:(await now()).toISOString(),publishedBy:actor.id,bookRevision:selected.revision,bookEffectiveFrom:selected.value.priceRevisions?.filter(r=>r.effectiveFrom<=today).at(-1)?.effectiveFrom,currency:live.currency,items:live.items.filter(i=>template.skus.includes(i.sku)),campaignId:campaign.id,suggestions:campaign.suggestions}
}
async function freezeCampaign(env:Bindings,actor:Actor,campaign:any){
 const f=campaign.segmentId?(await segment(env,actor,campaign.segmentId)).filters:campaign.filters
 const resolved=await audience(env,actor,f),stamp=(await now()).toISOString()
 const statements:D1PreparedStatement[]=[]
 for(const {account:selected,person} of resolved.recipients){
  if(await env.DB.prepare('SELECT id FROM bw_campaign_deliveries WHERE campaign_id=? AND recipient_id=?').bind(campaign.id,person.id).first())continue
  let recipientProfile:Awaited<ReturnType<typeof campaignProfile>>
  try{recipientProfile=await campaignProfile(env,{id:person.id,email:person.email,version:person.version,role:'member',agent:false},campaign,selected)}catch{resolved.excluded.push({accountId:selected.id,buyerId:person.id,name:selected.value.name,reason:'buying profile not approved or not mapped for this recipient'});continue}
  const sheet=await makeSheet(env,actor,campaign,selected),id=crypto.randomUUID()
  const suppressed=await campaignSuppressed(env,person.email)
  statements.push(recipientProfile.guard,env.DB.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_accounts WHERE id=? AND revision=?) THEN 1 ELSE 0 END').bind(selected.id,selected.revision),env.DB.prepare('INSERT INTO bw_line_sheets VALUES(?,?,?,?)').bind(sheet.id,selected.id,JSON.stringify(sheet),sheet.revision),env.DB.prepare('INSERT INTO bw_campaign_deliveries(id,campaign_id,account_id,recipient_id,recipient_version,sheet_id,status,reason,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,campaign.id,selected.id,person.id,person.version,sheet.id,suppressed?'suppressed':'queued',suppressed?'terminal address suppression':null,stamp))
 }
 const {id,revision,createdBy,state,restored,...value}=campaign
 statements.push(env.DB.prepare("UPDATE bw_campaigns SET value_json=?,state='sent' WHERE id=? AND revision=? AND restored=0").bind(JSON.stringify({...value,excluded:resolved.excluded}),id,revision),changed(env.DB),audit(env.DB,actor,id,'campaign.sent',{revision,source:'campaign.send',reason:'Resolved current approved buyers; existing recipient identities are never queued twice.'}))
 await write(env,actor,statements)
}
export async function campaignSuppressed(env:Bindings,email:string){return await reportSuppressed(env,email)||Boolean(await env.DB.prepare("SELECT 1 FROM bw_campaign_deliveries d JOIN oa_operators p ON p.id=d.recipient_id WHERE p.email=? AND d.status IN ('bounced','complained','rejected','suppressed')").bind(email).first())}
const escape=(v:string)=>v.replace(/[&<>"']/g,c=>`&#${c.charCodeAt(0)};`)
async function sendMessage(env:Bindings,actor:Actor,campaign:any,target:{id:string;sheet:Sheet;email:string},test=false){
 const config=await observeMailConfiguration(env)
 let origin:URL;try{origin=new URL(env.AUTH_ORIGIN)}catch{fail('MAIL','Configure a trusted HTTPS mail origin.')}
 if(!config.configured||origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash||!env.MAIL_FROM||env.RER_DEMO==='1')return {status:'not configured',providerMessageId:null}
 const link=test?`${origin.origin}/app?campaignPreview=${encodeURIComponent(campaign.id)}`:`${origin.origin}/app?campaignDelivery=${encodeURIComponent(target.id)}`
 // Test attachments use an unsaved preview; recipient attachments use the actual private sheet door.
 let attachment:Uint8Array|undefined
 if(campaign.attachPdf){const response=test?await sheetDocument(env,actor,target.sheet,campaign.attachmentFormat??'pdf'):await sheetDownload(env,actor,target.sheet.id,campaign.attachmentFormat??'pdf');attachment=new Uint8Array(await response.arrayBuffer())}
 try{const result=await operatorMail(env)?.send({deliveryId:target.id,from:env.MAIL_FROM,to:[target.email],subject:(test?'[Test] ':'')+campaign.subject,headers:{},text:`${test?'Test preview only.\n':''}${campaign.message}\n\nSign in with your own buyer identity:\n${link}`,html:`<p>${escape(campaign.message).replaceAll('\n','<br>')}</p><p><a href="${escape(link)}">${test?'Test preview':'Open your suggested order'}</a></p>`,...(attachment?{attachments:[{filename:'line-sheet.'+(campaign.attachmentFormat??'pdf'),contentType:campaign.attachmentFormat==='xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'application/pdf',content:attachment}]}:{})});return {status:result?.status==='development'?'not sent (development)':result?.status??'uncertain',providerMessageId:result?.providerMessageId??null}}catch{return {status:'uncertain',providerMessageId:null}}
}
export async function dispatchCampaignDeliveries(env:Bindings,campaignId?:string){
 const rows=(await env.DB.prepare("SELECT * FROM bw_campaign_deliveries WHERE status IN ('queued','not configured') AND (? IS NULL OR campaign_id=?) ORDER BY updated_at,id LIMIT 1000").bind(campaignId??null,campaignId??null).all<any>()).results
 for(const d of rows){
  const row=await env.DB.prepare('SELECT * FROM bw_campaigns WHERE id=? AND restored=0').bind(d.campaign_id).first<any>(),actor=row?await campaignActor(env,row.created_by):null
  let person:any,allowed=false
  try{if(actor){await account(env.DB,actor,d.account_id);person=await env.DB.prepare(`SELECT p.id,p.email,p.version FROM oa_operators p JOIN bw_accounts a ON a.id=? WHERE p.id=? AND p.status='active' AND p.version=? AND ${companyPurchasingRecipientSql('p','a.id')}`).bind(d.account_id,d.recipient_id,d.recipient_version).first();const a=await account(env.DB,actor,d.account_id);allowed=!!person&&(a.value.lifecycle??'active')==='active';await storedSheet(env,actor,d.sheet_id);if(person)await storedSheet(env,{id:person.id,email:person.email,version:person.version,role:'member',agent:false},d.sheet_id)}}catch{allowed=false}
  if(!allowed||!actor){await env.DB.prepare("UPDATE bw_campaign_deliveries SET status='withdrawn',reason='Current sender, recipient, account or share authority withdrawn' WHERE id=? AND first_attempt_at IS NULL").bind(d.id).run();continue}
  if(await campaignSuppressed(env,person.email)){await env.DB.prepare("UPDATE bw_campaign_deliveries SET status='suppressed',reason='terminal address suppression' WHERE id=?").bind(d.id).run();continue}
  const stamp=(await now()).toISOString(),claimed=await env.DB.prepare("UPDATE bw_campaign_deliveries SET status='uncertain',first_attempt_at=?,updated_at=? WHERE id=? AND first_attempt_at IS NULL AND status IN ('queued','not configured') RETURNING id").bind(stamp,stamp,d.id).first()
  if(!claimed)continue
  const sheet=await storedSheet(env,actor,d.sheet_id),result=await sendMessage(env,actor,parse(row),{id:d.id,sheet,email:person.email})
  await env.DB.prepare("UPDATE bw_campaign_deliveries SET status=?,provider_message_id=?,first_attempt_at=CASE WHEN ?='not configured' THEN NULL ELSE first_attempt_at END,reason=?,updated_at=? WHERE id=? AND status='uncertain'").bind(result.status,result.providerMessageId,result.status,result.status==='accepted'?'Provider accepted; delivery requires a signed receipt.':result.status,(await now()).toISOString(),d.id).run()
 }
}
export async function dispatchCampaigns(env:Bindings){
 const due=(await env.DB.prepare("SELECT * FROM bw_campaigns WHERE state='scheduled' AND restored=0 AND due_at<=? ORDER BY due_at LIMIT 25").bind((await now()).toISOString()).all<any>()).results
 for(const row of due){const actor=await campaignActor(env,row.created_by);if(!actor){await env.DB.prepare("UPDATE bw_campaigns SET state='withdrawn' WHERE id=?").bind(row.id).run();continue}try{await freezeCampaign(env,actor,parse(row))}catch{await env.DB.prepare("UPDATE bw_campaigns SET state='needs review' WHERE id=?").bind(row.id).run()}}
 await dispatchCampaignDeliveries(env)
}
export async function campaignRecipient(env:Bindings,actor:Actor,id:string){
 requirePerson(actor)
 const d=await env.DB.prepare('SELECT d.*,c.restored FROM bw_campaign_deliveries d JOIN bw_campaigns c ON c.id=d.campaign_id WHERE d.id=?').bind(id).first<any>()
 if(!d||d.recipient_id!==actor.id||d.recipient_version!==actor.version||d.restored||supplier(actor)||!['accepted','delivered','opened','clicked'].includes(d.status)||await campaignSuppressed(env,actor.email))campaignMissing()
 const a=await account(env.DB,actor,d.account_id);if((a.value.lifecycle??'active')!=='active')campaignMissing()
 await storedSheet(env,actor,d.sheet_id)
 return d
}
export async function campaignOrder(env:Bindings,actor:Actor,p:any){
 if(p.campaignDeliveryId===undefined)return undefined
 const d=await campaignRecipient(env,actor,text(p.campaignDeliveryId,'Campaign recipient'))
 if(p.lineSheetId!==d.sheet_id)campaignMissing()
 return {id:d.campaign_id,deliveryId:d.id}
}
