import { faireState, faireConfigure, fairePoll, faireMatch } from './faire'
import { promotionAdmin, promotionSettings, savePromotions, promotionPreview } from './promotions'
import { allocateCard,applyCredit,issueCredit,readCredit,readCredits } from './credit-notes'
import { readRefund,refundCommand } from './credit-refunds'
import { savedCardCommand,readSavedCards } from './saved-cards'
import { catalogMaintenanceResponse } from './catalog-maintenance-http'
import { stockSyncState, stockSyncCommand } from './stock-sync'
import { stockWatchCommand, readStockWatches } from './stock-watch'
import { cardCommand,readCard,readCards,publicCard } from './card-payments'
import { cardSettings,cardConfiguration } from './card-settings'
import { cardWebhook } from './card-webhook'
import { buyingProfileCommand, readBuyingProfiles, resolveBuyingProfile } from './buying-profiles'
import { accountFollowupCommand } from './account-followup'
import { refreshCatalogIndex, searchCatalog } from './catalog-search'
import {inviteWizUser} from './imports/wizcommerce-invitations'
import {previewPlatform,applyPlatform,readPlatform} from './imports/platform-history'
import {createDelta,compareDelta,signoffDelta,readDelta,listDeltas,rollbackDelta} from './imports/delta-session'
import {runDeltaFeed} from './feeds/session'
import {agentProposalCommand,listAgentProposals} from './agent-proposals'
import {createProposalGrant,readProposalGrant,revokeProposalGrant,grantGuard} from './proposal-grants'
import { readWebhooks,webhookCommand,webhookHistory } from './webhooks'
import { importPriceBook, priceBookCsv } from './price-books'
import { listSheets, readSheet, sheetDownload, sheetCommand } from './line-sheets'
import { requestLimit } from './request-limits'
import { erasureRestoreResponse, requireArchiveJournal, exportIndependentJournal, attachIndependentJournal, initializeIndependentJournal } from './erasure-journal'
import { previewAccountErasure, executeAccountErasure } from './account-erasure'
import { repPerformance, repPerformanceCsv } from './rep-performance'
import { saveRepTarget } from './rep-targets'
import { readStaffGrant,readStaffMembers,staffCommand } from './staff-members'
import { readRepAssignments,repAssignmentCommand } from './rep-assignments'
import { readCompanyRoutes,companyRouteCommand } from './company-routes'
import { readApplicationRules,saveApplicationRules } from './application-rules'
import { withApprovalStatus } from './company-approval'
import { staffRequestGate,staffCommandGate } from './staff-access'
import { bootstrapLegacyCompanyMembers, companyMembership, companyCommand, readCompanyMembers, readCompanyCollisions, ownCompanyInvitations, requireCompanyRight } from './company-members'
import { applicationResponse, applicationCommand } from './applications'
import { readUsageTerms, requireUsageTerms, usageTermsCommand, usageDocument } from './usage-terms'
import { readReportSchedules, reportScheduleCommand, reportDownload } from './report-schedules'
import { runSavedReport } from './report-runs'
import { dispatchReports } from './report-delivery'
import { reportMailWebhook } from './report-mail-events'
import { workspaceOrders, waitingDraft } from './workspace-orders'
import { searchOrders } from './order-search'
import { readCommissionRules, saveCommissionRules } from './commission-rules'
import { commissionReport, commissionCsv } from './commission-report'
import { readConfirmationLayouts, saveConfirmationLayout } from './confirmation-layouts'
import { confirmationChoices, bulkConfirmationResponse } from './bulk-confirmations'
import { readSalesTerms, salesTermsCommand, termsDocumentResponse, termsSignatureResponse } from './sales-terms'
import { quoteMailWebhook } from './quote-mail-events'
import { quoteMailCommand, dispatchQuoteMail } from './quote-mail'
import { readRetention, retentionCommand } from './retention'
import { readConfirmations, confirmationResponse } from './confirmations'
import { confirmationEmails } from './confirmation-mail'
import { readSellerIdentity, saveSellerIdentity } from './seller-identity'
import { readVariantAttributes, saveVariantAttributes, saveVariantImage } from './variant-attributes'
import { substitutionCommand } from './substitutions'
import { listCommercialAudit,exportCommercialAudit } from './commercial-audit'
import { runtimeBindings, type Bindings } from '../auth.server'
import { createPortabilityHandler, boundedJson } from '@runeditrun/rer/modules/portability/http'
import { portabilityPolicy } from './portability-policy.mjs'
import { current,digest,commit,audit } from './access'
import { account,accountCommand } from './accounts'
import { accountPage, duplicateAccountPage } from './account-directory'
import { orderCommand,readOrder } from './orders'
import { cartCommand } from './cart-import'
import { listCommand, readLists } from './lists'
import { deliveryOptions, quoteShippingContext, saveShipping, shippingResponse, shippingSettings } from './shipping'
import { quoteReport } from './quote-report'
import { salesCsv, salesReport } from './sales-report'
import { financeCsv, financeReport } from './finance-report'
import { followupCommand, readFollowups } from './followups'
import { readApprovalNotices } from './approval-notices'
import { approvalEscalationCommand } from './approval-escalation'
import { readVisits, visitCommand } from './visits'
import { locationCommand, readLocations } from './locations'
import { quoteAttachment, quoteCommand, quoteResponse, readQuotes } from './quotes'
import { statementResponse } from './statements'
import { exportKinds, exportResponse } from './export'
import { freshnessLimit, saveFreshness } from './freshness'
import { documentResponse } from './documents'
import { orderTimeline } from './timeline'
import { diagnostics } from './diagnostics'
import { saveReportZone } from './report-zone'
import { fulfillmentReport } from './fulfillment'
import { catalogue, pierConfigured, pierState } from './pier'
import { invoiceCsv } from './invoice'
import { Problem,fail,requireSupplier,supplier,text } from './model'
import { dryRunAccountImport,applyAccountImport,listAccountImports,getAccountImport,undoAccountImport,type PierSkus } from './imports'
import { previewCutover,applyCutover,listCutovers,readCutover,undoCutover } from './imports/cutover-service'
import { probeSftp } from './feeds/probe'
/** MOVE-007: read-only SKU check of the connected Pier catalog; null when Pier cannot be read. */
async function pierSkus(env:Bindings):Promise<PierSkus> {
 try { const state=await pierState(env); return Array.isArray(state?.items)?new Set(state.items.filter((item:any)=>!item.archived).map((item:any)=>String(item.sku))):null }
 catch(error) { if(error instanceof Problem) return null; throw error }
}
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}})
export async function barrowResponse(request:Request,original:Bindings):Promise<Response|null> {
 const url=new URL(request.url),path=url.pathname
 if(!path.startsWith('/api/barrow/')) return null
 try {
  const env=runtimeBindings(original)
  const limited=await requestLimit(request,env);if(limited)return limited
  if(path==='/api/barrow/erasure-journal') {
   const actor=await current(request,env)
   if(actor.agent||actor.role!=='owner')fail('FORBIDDEN','Only the signed-in owner may handle the independent erasure journal.',403)
   if(request.method==='GET'){const bundle=await exportIndependentJournal(env);return new Response(JSON.stringify(bundle),{headers:{'content-type':'application/json','content-disposition':'attachment; filename="barrow-erasure-journal.json"','cache-control':'no-store'}})}
   if(request.method!=='POST')return json({error:'Use GET or POST'},405)
   if(request.headers.get('origin')!==env.AUTH_ORIGIN)fail('ORIGIN','Use this installation’s own origin.',403)
   const input=await boundedJson(request,1500000) as any
   if(input?.confirm!=='JOURNAL')fail('CONFIRM','Type JOURNAL to attest this is the source installation’s complete current journal.',400)
   const reason=text(input.reason,'Journal handling reason',1000)
   const result=input.initialize===true?await initializeIndependentJournal(env,actor,reason):await attachIndependentJournal(env,input.bundle)
   await commit(env.DB,actor,[env.DB.prepare('INSERT INTO oa_auth_audit VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),actor.id,'retention.journal-attached',JSON.stringify({sourceIdentity:result.sourceIdentity,reason}),Date.now())])
   return json(result)
  }
  const fenced=await erasureRestoreResponse(env);if(fenced)return fenced
  const application=await applicationResponse(request,env)
  if(application)return application
  if(path==='/api/barrow/report-mail/webhook')return await reportMailWebhook(request,env)
  if(path==='/api/barrow/quote-mail/webhook')return await quoteMailWebhook(request,env)
  if(path==='/api/barrow/card-webhook')return await cardWebhook(request,env)
  const actor=await current(request,env).catch(error=>{
   if(path.startsWith('/api/barrow/report-runs/') && error instanceof Problem && error.status===401) fail('FORBIDDEN','Use the exact recipient’s active, entitled sign-in to download this report.',403)
   throw error
  })
  const proposalScope=actor.agent&&actor.grantId?await readProposalGrant(env.DB,actor.grantId):null
  if(actor.agentScope==='proposal'&&!proposalScope)fail('AUTH','The scoped proposal grant is unavailable. A new explicit owner grant is required.',401)
  if(proposalScope) {
   try{await env.DB.batch([grantGuard(env.DB,proposalScope),env.DB.prepare('DELETE FROM bw_guard')])}catch{fail('AUTH','This account-scoped proposal grant is no longer current.',401)}
   const scopedOrder=/^\/api\/barrow\/orders\/([-a-zA-Z0-9_]+)$/.exec(path)
   if(request.method==='GET'&&path==='/api/barrow/catalogue') {if(url.searchParams.get('accountId')!==proposalScope.accountId)fail('FORBIDDEN','This credential covers one account only.',403)}
   else if(request.method==='GET'&&scopedOrder) {if((await readOrder(env.DB,actor,scopedOrder[1])).accountId!==proposalScope.accountId)fail('NOT_FOUND','Order not found.',404)}
   else if(!(request.method==='POST'&&path==='/api/barrow/commands'))fail('FORBIDDEN','This credential may read its account catalogue/orders and submit structured proposals only.',403)
  }
  actor.staff=await readStaffGrant(env.DB,actor)
  await staffRequestGate(env,actor,path,request.method)
  await bootstrapLegacyCompanyMembers(env.DB)
  actor.company=await companyMembership(env.DB,actor)
  const catalogMaintenance=await catalogMaintenanceResponse(request,env,actor);if(catalogMaintenance)return catalogMaintenance
  if(path==='/api/barrow/stock-sync'&&request.method==='GET')return json(await stockSyncState(env,actor))
  if(path==='/api/barrow/stock-watches'&&request.method==='GET')return json(await readStockWatches(env,actor,url.searchParams.get('accountId')??''))
  if(path==='/api/barrow/credits'&&request.method==='GET')return json(await readCredits(env,actor,url.searchParams.get('orderId')??''))
  const creditPath=/^\/api\/barrow\/credits\/([-a-zA-Z0-9_]+)$/.exec(path),refundPath=/^\/api\/barrow\/refunds\/([-a-zA-Z0-9_]+)$/.exec(path)
  if(creditPath&&request.method==='GET')return json(await readCredit(env,actor,creditPath[1]))
  if(refundPath&&request.method==='GET')return json(await readRefund(env,actor,refundPath[1]))
  if(path==='/api/barrow/saved-cards'&&request.method==='GET')return json(await readSavedCards(env,actor,url.searchParams.get('orderId')??''))
  if(path==='/api/barrow/card-settings'&&request.method==='GET')return json(await cardSettings(env,actor))
  if(path==='/api/barrow/payments'&&request.method==='GET')return json(await readCards(env,actor,url.searchParams.get('orderId')??''))
  const cardPath=/^\/api\/barrow\/payments\/([-a-zA-Z0-9_]+)$/.exec(path)
  if(cardPath&&request.method==='GET')return json(await readCard(env,actor,cardPath[1]))
  if(path==='/api/barrow/staff/members'&&request.method==='GET')return json({members:await readStaffMembers(env.DB,actor)})
  if(path==='/api/barrow/company/invitations'&&request.method==='GET')return json({invitations:await ownCompanyInvitations(env.DB,actor)})
  if(path==='/api/barrow/company/collisions'&&request.method==='GET')return json({collisions:await readCompanyCollisions(env.DB,actor)})
  if(path==='/api/barrow/application-rules'&&request.method==='GET')return json(await readApplicationRules(env.DB,actor))
  if(path==='/api/barrow/company/routes'&&request.method==='GET')return json(await readCompanyRoutes(env.DB,actor,url.searchParams.get('accountId')??''))
  if(path==='/api/barrow/company/members'&&request.method==='GET')return json(await readCompanyMembers(env.DB,actor,url.searchParams.get('accountId')??''))
  if(!['GET','HEAD'].includes(request.method) && !actor.agent && request.headers.get('origin')!==env.AUTH_ORIGIN) fail('ORIGIN','Use this installation’s own page to change records.',403)
  if(path==='/api/barrow/usage-terms'&&request.method==='GET')return json(await readUsageTerms(env,actor))
  const usagePdf=/^\/api\/barrow\/usage-terms\/([1-9]\d*)\/document$/.exec(path)
  if(usagePdf&&request.method==='GET')return await usageDocument(env,actor,Number(usagePdf[1]))
  if(path!=='/api/barrow/commands')await requireUsageTerms(env,actor,url.searchParams.get('accountId')??undefined)
  if(path==='/api/barrow/faire'&&request.method==='GET')return json(await faireState(env,actor))
  if(path==='/api/barrow/faire/configure'&&request.method==='POST')return json(await faireConfigure(env,actor,await boundedJson(request,20000)))
  if(path==='/api/barrow/faire/poll'&&request.method==='POST')return json(await fairePoll(env,actor,await boundedJson(request,20000)))
  if(path==='/api/barrow/faire/match'&&request.method==='POST')return json(await faireMatch(env,actor,await boundedJson(request,200000)))
  if(path.startsWith('/api/barrow/portability/')) {
   requireSupplier(actor)
   if(actor.role!=='owner') fail('FORBIDDEN','Only the owner may export or restore the full installation.',403)
   if(path==='/api/barrow/portability/imports'&&request.method==='POST') {
    const input=await boundedJson(request.clone() as any,1500000) as any
    try{await requireArchiveJournal(env,input?.manifest?.sourceIdentity)}catch{fail('ERASURE_JOURNAL_REQUIRED','Attach the source installation’s complete independent R2 erasure journal before importing an archive.',400)}
   }
   return (await createPortabilityHandler({db:env.DB,policy:portabilityPolicy,appOrigin:env.AUTH_ORIGIN,basePath:'/api/barrow/portability',authorize:async()=>actor.id}))(request)
  }
  if(path==='/api/barrow/proposal-grants') {
   if(actor.agent||actor.role!=='owner')fail('FORBIDDEN','Only the signed-in owner manages scoped proposal grants.',403)
   if(request.method==='POST')return json(await createProposalGrant(env,actor,await boundedJson(request,50000) as any))
   if(request.method==='GET'){
    const id=url.searchParams.get('accountId')??'';await account(env.DB,actor,id)
    const rows=(await env.DB.prepare('SELECT id FROM bw_agent_proposal_grants WHERE account_id=? ORDER BY created_at DESC').bind(id).all<{id:string}>()).results
    return json({grants:await Promise.all(rows.map(row=>readProposalGrant(env.DB,row.id)))})
   }
  }
  if(path==='/api/barrow/proposal-grants/revoke'&&request.method==='POST')return json(await revokeProposalGrant(env,actor,await boundedJson(request,10000) as any))
  const proposalHistory=/^\/api\/barrow\/orders\/([-a-zA-Z0-9_]+)\/agent-proposals$/.exec(path)
  if(proposalHistory&&request.method==='GET')return json(await listAgentProposals(env,actor,proposalHistory[1]))
  if(path==='/api/barrow/rep-assignments'&&request.method==='GET')return json(await readRepAssignments(env,actor))
  if(path==='/api/barrow/report-schedules' && request.method==='GET')return json(await readReportSchedules(env,actor))
  const reportRun=/^\/api\/barrow\/report-runs\/([a-zA-Z0-9_-]+)\.json$/.exec(path)
  if(reportRun && request.method==='GET')return await reportDownload(env,actor,reportRun[1])
  if(path==='/api/barrow/commissions' && request.method==='GET')return json(await readCommissionRules(env.DB,actor))
  if(path==='/api/barrow/reports/rep-performance' && request.method==='GET')return json(await repPerformance(env,actor,url.searchParams))
  if(path==='/api/barrow/reports/rep-performance.csv' && request.method==='GET')return await repPerformanceCsv(env,actor,url.searchParams)
  if(path==='/api/barrow/reports/commissions' && request.method==='GET')return json(await commissionReport(env,actor,url.searchParams))
  if(path==='/api/barrow/reports/commissions.csv' && request.method==='GET')return await commissionCsv(env,actor,url.searchParams)
  if(path==='/api/barrow/confirmation-layouts' && request.method==='GET')return json(await readConfirmationLayouts(env.DB,actor))
  if(path==='/api/barrow/seller-identity' && request.method==='GET')return json(await readSellerIdentity(env.DB,actor))
  if(path==='/api/barrow/variant-attributes' && request.method==='GET')return json(await readVariantAttributes(env.DB,actor))
  if(path==='/api/barrow/confirmations/selection' && request.method==='POST')return json(await confirmationChoices(env.DB,actor,await boundedJson(request,20000)))
  if(path==='/api/barrow/confirmations/export.csv' && request.method==='POST')return await bulkConfirmationResponse(env.DB,actor,await boundedJson(request,20000))
  if(path==='/api/barrow/retention' && request.method==='GET') return json(await readRetention(env,actor))
  if(path==='/api/barrow/sales-terms' && request.method==='GET') return json(await readSalesTerms(env,actor,url.searchParams.get('accountId'),url.searchParams.get('profileId')))
  const termsDocument=/^\/api\/barrow\/sales-terms\/([^/]+)\/([1-9]\d{0,8})\/document$/.exec(path)
  if(termsDocument && request.method==='GET') return await termsDocumentResponse(env,actor,decodeURIComponent(termsDocument[1]),Number(termsDocument[2]))
  const termsSignature=/^\/api\/barrow\/orders\/([-a-zA-Z0-9_]+)\/terms-signature$/.exec(path)
  if(termsSignature && request.method==='GET') return await termsSignatureResponse(env,actor,await readOrder(env.DB,actor,termsSignature[1]))
  if(path==='/api/barrow/line-sheets'&&request.method==='GET')return json(await listSheets(env,actor,url.searchParams.get('accountId')??''))
  if(path==='/api/barrow/price-book.csv'&&request.method==='GET')return await priceBookCsv(env,actor,url.searchParams.get('accountId')??'')
  const sheetRoute=/^\/api\/barrow\/line-sheets\/([a-f0-9-]+)(?:\.(pdf|csv))?$/.exec(path)
  if(sheetRoute&&request.method==='GET')return sheetRoute[2]?await sheetDownload(env,actor,sheetRoute[1],sheetRoute[2] as 'pdf'|'csv'):json(await readSheet(env,actor,sheetRoute[1]))
  if(path==='/api/barrow/state' && request.method==='GET') {
   const directory=await accountPage(env.DB,actor,new URLSearchParams())
   const [page,initialDraft]=await Promise.all([workspaceOrders(env,actor,url.searchParams,true),waitingDraft(env.DB,actor)])
   const {orders,people,...orderPage}=page
   if(actor.staff&&actor.staff.role==='analyst'){orders.splice(0);directory.accounts.splice(0)}
   else if(actor.staff&&!['sales-manager','rep'].includes(actor.staff.role))directory.accounts=directory.accounts.map(a=>({...a,value:{...a.value,prices:[]}}))
   return json({actor:{id:actor.id,email:actor.email,role:actor.role,agent:actor.agent,company:actor.company,staff:actor.staff},accounts:directory.accounts,currentReps:directory.currentReps,accountPage:{page:directory.page,pageSize:directory.pageSize,hasNext:directory.hasNext},orders,people,orderPage,waitingDraft:initialDraft,connection:{configured:await pierConfigured(env)},settings:{stockFreshnessMinutes:await freshnessLimit(env.DB)??null}})
  }
  if(path==='/api/barrow/shipping/settings' && request.method==='GET') {requireSupplier(actor);return json(await shippingSettings(env.DB))}
  if(path==='/api/barrow/shipping/options' && request.method==='GET') {
   if(url.searchParams.has('quoteId')) {if(actor.agent)fail('PERSON_REQUIRED','A person must review delivery.',403);return json(await deliveryOptions(env,await quoteShippingContext(env,actor,url.searchParams.get('quoteId')!)))}
   return json(await shippingResponse(env,actor,url.searchParams.get('orderId')??''))
  }
  if(path==='/api/barrow/reports/fulfillment' && request.method==='GET') return json(await fulfillmentReport(env,actor,url.searchParams))
  if(path==='/api/barrow/reports/finance' && request.method==='GET') return json(await financeReport(env,actor,url.searchParams))
  if(path==='/api/barrow/reports/finance.csv' && request.method==='GET') return await financeCsv(env,actor,url.searchParams)
  if(path==='/api/barrow/reports/sales' && request.method==='GET') return json(await salesReport(env,actor,url.searchParams))
  if(path==='/api/barrow/reports/sales.csv' && request.method==='GET') return await salesCsv(env,actor,url.searchParams)
  if(path==='/api/barrow/reports/quotes' && request.method==='GET') return json(await quoteReport(env,actor,url.searchParams))
  if(path==='/api/barrow/buying-profiles' && request.method==='GET') return json(await readBuyingProfiles(env.DB,actor,url.searchParams.get('accountId')??''))
  if(path==='/api/barrow/followups' && request.method==='GET') return json(await readFollowups(env,actor,url.searchParams))
  if(path==='/api/barrow/approval-notices' && request.method==='GET') return json(await readApprovalNotices(env.DB,actor))
  if(path==='/api/barrow/visits' && request.method==='GET') return json(await readVisits(env,actor,url.searchParams))
  if(path==='/api/barrow/webhooks.json' && request.method==='GET')return new Response(JSON.stringify(await webhookHistory(env,actor)),{headers:{'content-type':'application/json','content-disposition':'attachment; filename="barrow-webhooks.json"','cache-control':'no-store','x-content-type-options':'nosniff'}})
  if(path==='/api/barrow/webhooks' && request.method==='GET')return json(await readWebhooks(env,actor))
  if(path==='/api/barrow/diagnostics' && request.method==='GET') return json(await diagnostics(env,actor))
  if(path==='/api/barrow/diagnostics.json' && request.method==='GET') return new Response(JSON.stringify(await diagnostics(env,actor),null,2),{headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','content-disposition':'attachment; filename="barrow-diagnostics.json"'}})
  if(path==='/api/barrow/audit' && request.method==='GET') return json(await listCommercialAudit(env.DB,actor,url.searchParams))
  if(path==='/api/barrow/audit.csv' && request.method==='GET') return await exportCommercialAudit(env.DB,actor,url.searchParams)
  if(path==='/api/barrow/export.json' && request.method==='GET') return await exportResponse(env,actor,'json')
  const exported=/^\/api\/barrow\/export\/([a-z]+)\.csv$/.exec(path)
  if(exported && request.method==='GET' && (exportKinds as readonly string[]).includes(exported[1])) return await exportResponse(env,actor,exported[1] as (typeof exportKinds)[number])
  if(path==='/api/barrow/accounts' && request.method==='GET'){const page=await accountPage(env.DB,actor,url.searchParams);if(actor.staff&&!['sales-manager','rep'].includes(actor.staff.role))page.accounts=page.accounts.map(a=>({...a,value:{...a.value,prices:[]}}));return json(page)}
  if(path==='/api/barrow/accounts/duplicates' && request.method==='GET')return json(await duplicateAccountPage(env.DB,actor,url.searchParams))
  const accountRead=/^\/api\/barrow\/accounts\/by-id\/([^/]+)$/.exec(path)
  if(accountRead && request.method==='GET'){const value=await account(env.DB,actor,decodeURIComponent(accountRead[1]));return json(actor.staff&&!['sales-manager','rep'].includes(actor.staff.role)?{...value,value:{...value.value,prices:[]}}:value)}
  if(path==='/api/barrow/orders/search' && request.method==='GET') return json(await searchOrders(env,actor,url.searchParams))
  if(path==='/api/barrow/orders/history' && request.method==='GET') return json(await workspaceOrders(env,actor,url.searchParams))
  if(path==='/api/barrow/locations' && request.method==='GET') return json({locations:await readLocations(env.DB,actor,url.searchParams.get('accountId')??'')})
  if(path==='/api/barrow/lists' && request.method==='GET') return json({lists:await readLists(env.DB,actor,url.searchParams.get('accountId')??'')})
  if(path==='/api/barrow/quotes' && request.method==='GET') return json({quotes:await readQuotes(env.DB,actor,url.searchParams.get('accountId'))})
  const quote=/^\/api\/barrow\/quotes\/(Q-\d{1,9})$/.exec(path)
  if(quote && request.method==='GET') return json(await quoteResponse(env.DB,actor,quote[1]))
  const attachment=/^\/api\/barrow\/quotes\/(Q-\d{1,9})\/attachments\/([-a-f0-9]{36})$/.exec(path)
  if(attachment && request.method==='GET') return await quoteAttachment(env,actor,attachment[1],attachment[2])
  if(path==='/api/barrow/catalogue/search' && request.method==='GET') {const id=url.searchParams.get('accountId')??'';await requireCompanyRight(env.DB,actor,id,'purchasing');return json(await searchCatalog(env,actor,url.searchParams))}
  if(path==='/api/barrow/catalogue' && request.method==='GET') {const id=url.searchParams.get('accountId')??'';await requireCompanyRight(env.DB,actor,id,'purchasing');return json(await catalogue(env,(await resolveBuyingProfile(env.DB,actor,await account(env.DB,actor,id),url.searchParams.get('profileId'))).selected))}
  const statement=/^\/api\/barrow\/statements\/([-a-zA-Z0-9._:]+?)(?:\.(csv|pdf))?$/.exec(path)
  if(statement && request.method==='GET') return await statementResponse(env.DB,actor,statement[1],(statement[2]??'json') as 'json'|'csv'|'pdf',url.searchParams)
  const invoice=/^\/api\/barrow\/invoices\/([-a-zA-Z0-9_]+)\.csv$/.exec(path)
  if(invoice && request.method==='GET') {
   if(actor.agent) fail('FORBIDDEN','A person must download invoice exports.',403)
   const order=await readOrder(env.DB,actor,invoice[1]);await requireCompanyRight(env.DB,actor,order.accountId,'finance')
   return new Response(invoiceCsv(order,!!await env.DB.prepare('SELECT 1 FROM bw_credit_notes WHERE order_id=? LIMIT 1').bind(order.id).first()),{headers:{'content-type':'text/csv; charset=utf-8','cache-control':'no-store','content-disposition':`attachment; filename="barrow-${order.id}.csv"`}})
  }
  const confirmation=/^\/api\/barrow\/orders\/([-a-zA-Z0-9_]+)\/confirmations(?:\/([1-9]\d*)\.(csv|pdf))?$/.exec(path)
  if(confirmation && request.method==='GET') {
   if(actor.agent) fail('FORBIDDEN','A person must download order confirmations.',403)
   const order=await readOrder(env.DB,actor,confirmation[1])
   if(url.searchParams.has('layout'))requireSupplier(actor)
   return confirmation[2] ? await confirmationResponse(env.DB,order,Number(confirmation[2]),confirmation[3] as 'csv'|'pdf',url.searchParams.get('layout')??undefined) : json({confirmations:await readConfirmations(env.DB,order.id),emails:await confirmationEmails(env.DB,order.id)})
  }
  const document=/^\/api\/barrow\/orders\/([-a-zA-Z0-9_]+)\/document$/.exec(path)
  if(document && request.method==='GET') return await documentResponse(env,actor,await readOrder(env.DB,actor,document[1]))
  // RPT-001 drill-down: one order as its reader may see it.
  const one=/^\/api\/barrow\/orders\/([-a-zA-Z0-9_]+)$/.exec(path)
  if(one && one[1]!=='history' && request.method==='GET') return json((await withApprovalStatus(env.DB,actor,[await readOrder(env.DB,actor,one[1])]))[0])
  const timeline=/^\/api\/barrow\/orders\/([-a-zA-Z0-9_]+)\/timeline$/.exec(path)
  if(timeline && request.method==='GET') return json(await orderTimeline(env,await readOrder(env.DB,actor,timeline[1])))
  if(path==='/api/barrow/feeds/probe'&&request.method==='POST')return json(await probeSftp(env,actor,await boundedJson(request,10000)))
  if(path==='/api/barrow/cutover/deltas') {
   if(request.method==='GET')return json(await listDeltas(env,actor))
   if(request.method==='POST')return json(await createDelta(env,actor,await boundedJson(request,3000000)))
  }
  const delta=/^\/api\/barrow\/cutover\/deltas\/([a-f0-9-]+)(?:\/(compare|signoff|rollback|feed\/(?:rehearse|run)))?$/.exec(path)
  if(delta) {
   if(request.method==='GET'&&!delta[2])return json(await readDelta(env,actor,delta[1]))
   if(request.method==='POST') {
    const input=await boundedJson(request,3000000)
    if(delta[2]==='compare')return json(await compareDelta(env,actor,delta[1],input))
    if(delta[2]==='signoff')return json(await signoffDelta(env,actor,delta[1],input))
    if(delta[2]==='rollback')return json(await rollbackDelta(env,actor,delta[1],input))
    if(delta[2]?.startsWith('feed/'))return json(await runDeltaFeed(env,actor,delta[1],delta[2]==='feed/rehearse'?'rehearse':'run',input))
   }
  }
  if(path.startsWith('/api/barrow/cutover')) {
   if(path==='/api/barrow/cutover'&&request.method==='GET')return json(await listCutovers(env,actor))
   if(path==='/api/barrow/cutover/preview'&&request.method==='POST')return json(await previewCutover(env,actor,await boundedJson(request,3000000)))
   if(path==='/api/barrow/cutover/apply'&&request.method==='POST')return json(await applyCutover(env,actor,await boundedJson(request,3000000)))
   const match=/^\/api\/barrow\/cutover\/([a-f0-9-]+)(\/undo)?$/.exec(path)
   if(match&&request.method==='GET'&&!match[2])return json(await readCutover(env,actor,match[1]))
   if(match&&request.method==='POST'&&match[2])return json(await undoCutover(env,actor,match[1]))
  }
  if(path==='/api/barrow/imports/wizcommerce/invite'&&request.method==='POST')return json(await inviteWizUser(request,env,actor,await boundedJson(request,10000)))
  if(path==='/api/barrow/imports/wizcommerce'&&request.method==='GET')return json(await readPlatform(env,actor))
  if(path==='/api/barrow/imports/wizcommerce/preview'&&request.method==='POST')return json(await previewPlatform(env,actor,await boundedJson(request,2000000),'wizcommerce'))
  if(path==='/api/barrow/imports/wizcommerce/apply'&&request.method==='POST')return json(await applyPlatform(env,actor,await boundedJson(request,2000000),'wizcommerce'))
  if(path==='/api/barrow/imports/sparklayer'&&request.method==='GET')return json(await readPlatform(env,actor))
  if(path==='/api/barrow/imports/sparklayer/preview'&&request.method==='POST')return json(await previewPlatform(env,actor,await boundedJson(request,2000000)))
  if(path==='/api/barrow/imports/sparklayer/apply'&&request.method==='POST')return json(await applyPlatform(env,actor,await boundedJson(request,2000000)))
  if(path.startsWith('/api/barrow/imports')) {
   requireSupplier(actor)
   if(path==='/api/barrow/imports'&&request.method==='GET') return json({jobs:await listAccountImports(env.DB,actor)})
   if(path==='/api/barrow/imports/preview'&&request.method==='POST') return json(await dryRunAccountImport(env.DB,actor,await boundedJson(request,1000000),await pierSkus(env)))
   if(path==='/api/barrow/imports/apply'&&request.method==='POST') return json(await applyAccountImport(env.DB,actor,await boundedJson(request,1000000),await pierSkus(env)))
   const match=/^\/api\/barrow\/imports\/([^/]+)(\/undo)?$/.exec(path)
   if(match && match[2] && request.method==='POST') return json(await undoAccountImport(env.DB,actor,match[1]))
   if(match && !match[2] && request.method==='GET') return json(await getAccountImport(env.DB,actor,match[1]))
  }
  if(path==='/api/barrow/agent-token' && request.method==='POST') {
   requireSupplier(actor)
   const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join(''),id=crypto.randomUUID(),expiresAt=Date.now()+7*86400000
   await commit(env.DB,actor,[env.DB.prepare('INSERT INTO bw_agent_tokens(id,digest,actor_id,actor_version,expires_at) VALUES(?,?,?,?,?)').bind(id,await digest(token),actor.id,actor.version,expiresAt),audit(env.DB,actor,id,'agent.granted',{revision:id,source:'agent-token.create',reason:'Supplier granted seven-day catalog-read and draft-only agent authority.'})])
   return json({token,expiresAt})
  }
  if(path==='/api/barrow/agent-token/revoke'&&request.method==='POST') {
   requireSupplier(actor)
   await commit(env.DB,actor,[env.DB.prepare('DELETE FROM bw_agent_tokens WHERE actor_id=?').bind(actor.id),audit(env.DB,actor,actor.id,'agent.revoked',{revision:`operator:${actor.version}`,source:'agent-token.revoke',reason:'Supplier revoked every agent grant issued under this identity.'})])
   return json({revoked:true})
  }
  if(path==='/api/barrow/promotions' && request.method==='GET'){promotionAdmin(actor);return json(await promotionSettings(env.DB))}
  if(path==='/api/barrow/commands' && request.method==='POST') {
   // A command carries at most one 1 MB PO document as base64.
   const body=await boundedJson(request,1500000) as any
   if(typeof body?.type!=='string'||!body.payload||typeof body.payload!=='object') fail('INPUT','A command has a type and payload.',400)
   if(proposalScope&&body.type!=='proposal.submit')fail('PERSON_REQUIRED','This scoped credential can submit proposals only; people approve every effect.',403)
   if(actor.agent && !['order.prepare','cart.preview','cart.form','proposal.submit'].includes(body.type)) fail('PERSON_REQUIRED','Agents may prepare drafts only. A person must submit and approve.',403)
   if(!['usage.publish','usage.accept','company.accept'].includes(body.type))await requireUsageTerms(env,actor,body.payload.accountId)
   await staffCommandGate(env,actor,body.type,body.payload)
   let result
   if(body.type==='promotion.save')return json({result:await savePromotions(env,actor,body.payload)})
   if(body.type==='promotion.preview')return json({result:await promotionPreview(env,actor,body.payload)})
   if(['stock.sync','stock.sync-settings','stock.sync-resolve','stock.sync-reset','stock.window'].includes(body.type))return json({result:await stockSyncCommand(env,actor,body.type,body.payload)})
   if(['stock.watch','stock.unwatch'].includes(body.type))return json({result:await stockWatchCommand(env,actor,body.type,body.payload)})
   if(body.type==='card.allocate')return json({result:await allocateCard(env,actor,body.payload)})
   if(body.type==='credit.issue')return json({result:await issueCredit(env,actor,body.payload)})
   if(body.type==='credit.apply')return json({result:await applyCredit(env,actor,body.payload)})
   if(['refund.request','refund.refresh'].includes(body.type))return json({result:await refundCommand(env,actor,body.type,body.payload)})
   if(['saved-card.save','saved-card.revoke','saved-card.prepare'].includes(body.type)){const result=await savedCardCommand(env,actor,body.type,body.payload);return json({result:body.type==='saved-card.prepare'?publicCard(result as import('./card-model').CardPayment):result})}
   if(['card.connect','card.disconnect'].includes(body.type))return json({result:await cardConfiguration(env,actor,body.type,body.payload)})
   if(['card.prepare','card.refresh','card.authorize','card.capture','card.cancel'].includes(body.type))return json({result:await cardCommand(env,actor,body.type,body.payload)})
   if(body.type.startsWith('proposal.'))return json({result:await agentProposalCommand(env,actor,body.type,body.payload)})
   if(['webhook.subscribe','webhook.rotate','webhook.revoke','webhook.replay','webhook.dispatch'].includes(body.type))return json({result:await webhookCommand(env,actor,body.type,body.payload)})
   if(body.type==='catalog.refresh')return json({result:await refreshCatalogIndex(env,actor,body.payload)})
   if(body.type==='price-book.import')return json({result:await importPriceBook(env,actor,body.payload)})
   if(['sheet.publish','sheet.revoke','sheet.view','sheet.preview'].includes(body.type))return json({result:await sheetCommand(env,actor,body.type,body.payload)})
   if(body.type==='rep.target.save')return json({result:await saveRepTarget(env,actor,body.payload)})
   if(['staff.invite','staff.update','staff.revoke'].includes(body.type))return json({result:await staffCommand(request,env,actor,body.type,body.payload)})
   if(['rep.assign','rep.cover','rep.end','rep.transfer'].includes(body.type))return json({result:await repAssignmentCommand(env,actor,body.type,body.payload)})
   if(['company.route.save','company.delegate','company.undelegate'].includes(body.type))return json({result:await companyRouteCommand(env,actor,body.type,body.payload)})
   if(['company.invite','company.accept','company.update','company.remove','company.erase'].includes(body.type))return json({result:await companyCommand(request,env,actor,body.type,body.payload)})
   if(['usage.publish','usage.accept'].includes(body.type))return json({result:await usageTermsCommand(env,actor,body.type,body.payload)})
   if(body.type==='application.rules.save')return json({result:await saveApplicationRules(env.DB,actor,body.payload)})
   if(['application.approve','application.decline','application.request-information'].includes(body.type))return json({result:await applicationCommand(request,env,actor,body.type,body.payload)})
   if(['report.save','report.remove-recipient'].includes(body.type))result=await reportScheduleCommand(env,actor,body.type,body.payload)
   else if(body.type==='report.run'){ result=await runSavedReport(env,actor,body.payload);await dispatchReports(env) }
   else if(body.type==='report.dispatch'){requireSupplier(actor);await dispatchReports(env);result={dispatched:true}}
   else if(body.type==='commission.settings')result=await saveCommissionRules(env.DB,actor,body.payload)
   else if(body.type==='retention.preview')result=await previewAccountErasure(env,actor,body.payload)
   else if(body.type==='retention.erase-account'||body.type==='retention.revoke-access')result=await executeAccountErasure(env,actor,body.payload,body.type==='retention.revoke-access'?'revoke':'erase')
   else if(['retention.settings','retention.request','retention.erase-document','retention.erase-application'].includes(body.type)) result=await retentionCommand(env,actor,body.type,body.payload)
   else if(['confirmation-layout.save','confirmation-layout.default'].includes(body.type))result=await saveConfirmationLayout(env.DB,actor,body.type,body.payload)
   else if(['brand.save','profile.save','profile.grant'].includes(body.type))result=await buyingProfileCommand(env,actor,body.type,body.payload)
   else if(body.type==='seller.identity')result=await saveSellerIdentity(env.DB,actor,body.payload)
   else if(body.type==='variant.attributes')result=await saveVariantAttributes(env.DB,actor,body.payload)
   else if(body.type==='variant.image')result=await saveVariantImage(env.DB,actor,body.payload)
   else if(['terms.publish','terms.assign'].includes(body.type)) result=await salesTermsCommand(env,actor,body.type,body.payload)
   else if(['account.save','account.invite','account.erase'].includes(body.type)) result=await accountCommand(request,env,actor,body.type,body.payload)
   else if(['order.prepare','order.company-approve','order.submit','order.approve','order.refresh','order.cancel','order.attach','order.reorder-preview','order.reorder','order.stock-exception','order.withdraw','order.revise'].includes(body.type)) result=await orderCommand(env,actor,body.type,body.payload)
   else if(['substitution.preview','substitution.propose','substitution.accept','substitution.decline','substitution.execute'].includes(body.type)) result=await substitutionCommand(env,actor,body.type,body.payload)
   else if(body.type==='shipping.settings') result=await saveShipping(env,actor,body.payload)
   else if(['shipping.select','shipping.quote'].includes(body.type)) result=await orderCommand(env,actor,body.type,body.payload)
   else if(['followup.plan','followup.decide','followup.send'].includes(body.type)) result=await accountFollowupCommand(env,actor,body.type,body.payload)
   else if(['followup.refresh','followup.update'].includes(body.type)) result=await followupCommand(env,actor,body.type,body.payload)
   else if(body.type==='settings.timezone') result=await saveReportZone(env.DB,actor,body.payload)
   else if(body.type==='settings.save') result=await saveFreshness(env.DB,actor,body.payload)
   else if(['cart.preview','cart.form'].includes(body.type)) result=await cartCommand(env,actor,body.type,body.payload)
   else if(['location.save','location.archive'].includes(body.type)) result=await locationCommand(env.DB,actor,body.type,body.payload)
   else if(['list.save','list.duplicate','list.delete'].includes(body.type)) result=await listCommand(env.DB,actor,body.type,body.payload)
   else if(body.type==='quote-mail.dispatch') result=await quoteMailCommand(env,actor,body.type,body.payload)
   else if(body.type==='approval.escalate') result=await approvalEscalationCommand(env,actor)
   else if(['visit.schedule','visit.record','visit.samples','visit.basket','visit.handoff'].includes(body.type)) result=await visitCommand(env,actor,body.type,body.payload)
   else if(['quote.request','quote.propose','quote.approve','quote.accept','quote.message','quote.read'].includes(body.type)) result=await quoteCommand(env,actor,body.type,body.payload)
   else fail('COMMAND','Unknown command.',404)
   if(body.type==='followup.send' || body.type.startsWith('quote.') && body.type!=='quote.read') await dispatchQuoteMail(env)
   return json({result})
  }
  return json({error:{code:'NOT_FOUND',message:'Unknown endpoint.'}},404)
 } catch(error:any) {
  if(String(error?.message).includes('DELTA_IO_HELD'))return json({error:{code:'CUTOVER_IO_BUSY',message:'A cutover destination run is using this exact order snapshot. Retry after it completes.'}},409)
  if(error?.message==='NATIVE_EDIT_CONFLICT') return json({error:{code:'NATIVE_EDIT_CONFLICT',message:'A native account edit was made after import. Undo stopped and preserved that edit.'}},409)
  if(error instanceof Problem) return json({error:{code:error.code,message:error.message}},error.status)
  // Import diagnostics contain product-authored messages; database/provider errors never escape.
  if(typeof error?.code==='string' && /^(ACCOUNT_|IMPORT_|CSV_|FORBIDDEN|NATIVE_EDIT_CONFLICT)/.test(error.code)) return json({error:{code:error.code,message:error.message}},error.code==='FORBIDDEN'?403:409)
  return json({error:{code:'CONFLICT',message:'This change could not be saved. Refresh the current record and check for a duplicate account email or changed permissions.'}},409)
 }
}
