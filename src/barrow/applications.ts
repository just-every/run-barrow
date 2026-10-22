import { companyCommand, unlimitedCompanyPolicy } from './company-members'
import { requireApplicationAccess } from './application-access'
import { readStaffGrant } from './staff-policy'
import { staffRequestGate } from './staff-access'
import { boundedJson } from '@runeditrun/rer/modules/portability/http'
import type { Bindings } from '../auth.server'
import { current, audit, changed, commit } from './access'
import { accountCommand, prepareAccountSave } from './accounts'
import { applicationLocationStatements } from './application-locations'
import { readDocument } from './documents'
import { fail, Problem, text, type Actor } from './model'
import { applicationRow, applicationValue, applicationView, applicationEvent, applicationDuplicates, purgeUnverified, type ApplicationRow } from './application-records'
import { applicationTaskStatements } from './application-followup'
import { sendApplicationStatus } from './application-mail'
import { formToken, spamCheck, applicationsOpen, sendApplicationCode, applicant, verifyApplication } from './application-auth'
const json=(value:unknown,headers:Record<string,string>={})=>Response.json(value,{headers:{'cache-control':'no-store','x-content-type-options':'nosniff',...headers}})
const docStatement=(env:Bindings,id:string,doc:Awaited<ReturnType<typeof readDocument>>,at:string)=>env.DB.prepare('INSERT INTO bw_application_documents VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),id,doc.name,doc.type,doc.size,doc.sha256,doc.contentBase64,at)
const rowGuard=(env:Bindings,row:ApplicationRow)=>env.DB.prepare('UPDATE bw_applications SET revision=revision WHERE id=? AND revision=? AND state=?').bind(row.id,row.revision,row.state)
async function applicationActor(request: Request, env: Bindings) {
 const actor = await current(request, env).catch(error => {
  if (error instanceof Problem && error.status === 401 && !request.headers.has('authorization')) return null
  throw error
 })
 if (actor) {
  actor.staff = await readStaffGrant(env.DB, actor)
  await staffRequestGate(env, actor, new URL(request.url).pathname, request.method)
  requireApplicationAccess(actor)
 }
 return actor
}
export async function applicationResponse(request:Request,env:Bindings):Promise<Response|null> {
 const path=new URL(request.url).pathname
 if(!path.startsWith('/api/barrow/applications'))return null
 await purgeUnverified(env)
 if(!['GET','HEAD'].includes(request.method)&&request.headers.get('origin')!==env.AUTH_ORIGIN)fail('ORIGIN','Use this installation’s application page.',403)
 if(path==='/api/barrow/applications/form'&&request.method==='GET')return json({open:applicationsOpen(env),formToken:await formToken(env),supplier:'the supplier',captchaSiteKey:env.TURNSTILE_SECRET?env.TURNSTILE_SITE_KEY??null:null,mail:env.MAIL_PROVIDER==='development'?'development, not delivered':'Verification email required'})
 if(path==='/api/barrow/applications'&&request.method==='POST') {
  if(!applicationsOpen(env))fail('APPLICATIONS_CLOSED','Applications are closed: verification mail is not configured.',503)
  const p=await boundedJson(request,7500000) as any,rate=await spamCheck(request,env,p),value=applicationValue(p)
  if(p.documents!==undefined&&(!Array.isArray(p.documents)||p.documents.length>5))fail('DOCUMENT','Attach at most five application documents.',400)
  const documents=await Promise.all((p.documents??[]).map((doc:any)=>readDocument(doc,'An application document','application document')))
  const id=crypto.randomUUID(),revision=crypto.randomUUID(),at=new Date().toISOString()
  await env.DB.batch([rate,env.DB.prepare("INSERT INTO bw_application_intake VALUES(?,?,?,'unverified',NULL,?,?)").bind(id,JSON.stringify({...value,documents}),revision,at,at)])
  return json({id,state:'unverified',delivery:await sendApplicationCode(env,id,value.email)})
 }
 if(path==='/api/barrow/applications/code'&&request.method==='POST') {
  if(!applicationsOpen(env))fail('APPLICATIONS_CLOSED','Applications are closed: verification mail is not configured.',503)
  const p=await boundedJson(request,10000) as any
  // No address lookup is exposed. A caller supplies the opaque application ID and exact original email.
  const row=await applicationRow(env.DB,text(p.id,'Application ID')),value=JSON.parse(row.value_json)
  if(String(p.email??'').normalize('NFKC').trim().toLowerCase()!==value.email)fail('APPLICATION_AUTH','Use the original contact email.',401)
  const recent=await env.DB.prepare('SELECT expires_at FROM bw_application_codes WHERE application_id=?').bind(row.id).first<{expires_at:number}>()
  if(recent&&recent.expires_at>Date.now()+540000)fail('SPAM_CHECK','Wait one minute before requesting a new code.',429)
  return json({id:row.id,delivery:await sendApplicationCode(env,row.id,value.email)})
 }
 if(path==='/api/barrow/applications/verify'&&request.method==='POST') {
  const p=await boundedJson(request,10000) as any,cookie=await verifyApplication(env,text(p.id,'Application ID'),p.code)
  return json({verified:true},{'set-cookie':cookie})
 }
 if(path==='/api/barrow/applications/mine'&&request.method==='GET')return json(await applicationView(env.DB,await applicant(request,env)))
 const document=/^\/api\/barrow\/applications\/([^/]+)\/documents\/([^/]+)$/.exec(path)
 if(document&&request.method==='GET') {
  // Only a missing native session may use the application's own session; a permission refusal never falls through.
  const actor = await applicationActor(request, env)
  if (!actor) await applicant(request,env,document[1])
  const doc=await env.DB.prepare('SELECT * FROM bw_application_documents WHERE application_id=? AND id=?').bind(document[1],document[2]).first<any>()
  if(!doc)fail('NOT_FOUND','Application document not found.',404)
  const row=await applicationRow(env.DB,document[1]);if(row.state==='unverified')fail('NOT_FOUND','Application document not found.',404)
  if (actor) await commit(env.DB, actor, [audit(env.DB, actor, row.id, 'application.document-downloaded', {revision: row.revision, source: 'application.document', reason: `Downloaded application document ${doc.id} (${doc.sha256}).`})])
  return new Response(Uint8Array.from(atob(doc.content_base64),c=>c.charCodeAt(0)),{headers:{'content-type':doc.type,'content-disposition':`attachment; filename="${doc.name}"`,'x-content-type-options':'nosniff','cache-control':'no-store','content-security-policy':"sandbox; default-src 'none'"}})
 }
 if(path==='/api/barrow/applications/respond'&&request.method==='POST') {
  const p=await boundedJson(request,1500000) as any,row=await applicant(request,env),revision=crypto.randomUUID(),at=new Date().toISOString()
  if(row.revision!==p.revision)fail('CHANGED','Refresh this application before responding.')
  if(!['submitted','information requested'].includes(row.state))fail('APPLICATION_STATE','This application already has a decision.')
  const withdraw=p.action==='withdraw',doc=withdraw?null:row.state==='information requested'?await readDocument(p.document,'An application document','application document'):fail('APPLICATION_STATE','There is no open document request.')
  const state=withdraw?'withdrawn':'submitted',reason=withdraw?'Applicant withdrew the application.':'Applicant answered the information request.'
  const task=await applicationTaskStatements(env.DB,row,withdraw?'withdrawn':'answered',at,'applicant')
  await env.DB.batch([rowGuard(env,row),changed(env.DB),env.DB.prepare('UPDATE bw_applications SET state=?,revision=?,updated_at=? WHERE id=?').bind(state,revision,at,row.id),...(doc?[docStatement(env,row.id,doc,at)]:[]),...task,applicationEvent(env.DB,row.id,state,reason,'applicant',at),env.DB.prepare('INSERT INTO bw_audit VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),row.id,'applicant',doc?'application.document-added':'application.withdrawn',at,JSON.stringify({revision,source:'application.respond',reason})),env.DB.prepare('DELETE FROM bw_guard')])
  return json(await applicationView(env.DB,await applicationRow(env.DB,row.id)))
 }
 const actor=await applicationActor(request,env)
 if (!actor) fail('AUTH', 'Sign in to review applications.', 401)
 if(path==='/api/barrow/applications'&&request.method==='GET') {
  const rows=(await env.DB.prepare("SELECT * FROM bw_applications WHERE state<>'unverified' ORDER BY created_at,id").all<ApplicationRow>()).results
  const access = requireApplicationAccess(actor)
  const applications = await Promise.all(rows.map(row=>applicationView(env.DB,row,access==='review')))
  return json({access, applications: access==='review' ? applications : applications.map(row=>({id:row.id, value:{name:row.value.name}, documents:row.documents, documentLabels:row.documentLabels}))})
 }
 return null
}
export async function applicationCommand(request:Request,env:Bindings,actor:Actor,type:string,p:any) {
 requireApplicationAccess(actor, true)
 const row=await applicationRow(env.DB,text(p.id,'Application ID')),value=JSON.parse(row.value_json)
 if(row.revision!==p.revision)fail('CHANGED','Refresh this application before reviewing it.')
 if(!['submitted','information requested'].includes(row.state))fail('APPLICATION_STATE','Only verified open applications may be reviewed.')
 const reason=text(p.reason,'Decision reason',1000),matches=await applicationDuplicates(env.DB,row)
 if(JSON.stringify(p.duplicateReviews??[])!==JSON.stringify(matches.map(({id,kind,revision})=>({id,kind,revision}))))fail('DUPLICATE_REVIEW','Review all current account and application matches as separate companies or decline; refresh stale matches.')
 const revision=crypto.randomUUID(),at=new Date().toISOString(),state=type==='application.request-information'?'information requested':type==='application.approve'?'approved':type==='application.decline'?'declined':fail('COMMAND','Unknown application decision.',404)
 // Bind every matching ID/revision and the full directory, including concurrently arriving applications.
 const snapshot=(await env.DB.prepare("SELECT id,revision FROM bw_applications WHERE state IN ('submitted','information requested') ORDER BY id").all<any>()).results
 const accounts=(await env.DB.prepare('SELECT id,revision FROM bw_accounts ORDER BY id').all<any>()).results
 const guard=(table:string,rows:any[])=>env.DB.prepare(`INSERT INTO bw_guard SELECT CASE WHEN (SELECT json_group_array(json_object('id',id,'revision',revision)) FROM (SELECT id,revision FROM ${table} ${table==='bw_applications'?"WHERE state IN ('submitted','information requested')":''} ORDER BY id))=? THEN 1 ELSE 0 END`).bind(JSON.stringify(rows))
 let accountId:string|null=null,creation:D1PreparedStatement[]=[]
 if(state==='approved') {
  const saved=await prepareAccountSave(env,actor,{id:p.accountId,value:{...p.account,name:value.name,email:value.email},duplicateReviews:p.accountDuplicateReviews??[],reason})
  accountId=saved.record.id
  creation=[...saved.statements,...applicationLocationStatements(env,actor,accountId,value.locations,at)]
 }
 const task=await applicationTaskStatements(env.DB,row,state==='approved'?'approved':state==='declined'?'declined':'information-requested',at,actor.id)
 await commit(env.DB,actor,[rowGuard(env,row),changed(env.DB),guard('bw_accounts',accounts),guard('bw_applications',snapshot),...creation,...task,audit(env.DB,actor,row.id,`application.duplicates-reviewed:${JSON.stringify(matches.map(({id,kind,revision})=>({id,kind,revision})))}`,{revision,source:type,reason:'Supplier reviewed these exact matches without merging or reassigning any identity.'}),env.DB.prepare('UPDATE bw_applications SET state=?,account_id=?,revision=?,updated_at=? WHERE id=?').bind(state,accountId,revision,at,row.id),applicationEvent(env.DB,row.id,state,reason,actor.id,at),audit(env.DB,actor,row.id,`application.${state.replaceAll(' ','-')}`,{...(accountId?{accountId}:{}),revision,source:type,reason})])
 // AUTO-001: one generic status email per staff decision (state and link only) after the decision is recorded; it never ends review work.
 const statusEmail=await sendApplicationStatus(env,{id:row.id,email:value.email},state)
 if(accountId) {
  if(actor.staff) await companyCommand(request,env,actor,'company.invite',{accountId,email:value.email,name:value.name,policy:unlimitedCompanyPolicy,reason:'Application reviewer approved the first buyer; exact-email company invitation requires native sign-in and explicit acceptance.'})
  else await accountCommand(request,env,actor,'account.invite',{accountId})
 }
 return {...await applicationView(env.DB,await applicationRow(env.DB,row.id),true),statusEmail,...(state==='approved'?{invitationRequestedTo:value.email,invitationRequestedAt:at}: {})}
}
