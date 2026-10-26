import { buyingOrderGuards } from './buying-profiles'
import {deltaEntryGuard} from './imports/delta-entry'
import {linkedProposal,proposalReplacementBasis} from './proposal-approval'
import type {AgentProposal} from './agent-proposal-model'
import { companySubmission } from './company-purchase'
import { requireCompanyRight } from './company-policy'
import { confirmationStatements } from './confirmations'
import { emailLatestConfirmation } from './confirmation-mail'
import type { Bindings } from '../auth.server'
import { audit, changed, commit } from './access'
import { activeAccountGuard } from './account-profile'
import { readOrder, nextNumber, orderCommand } from './orders'
import { fail, requirePerson, requireSupplier, text, type Actor, type Order } from './model'
import { now } from './clock'
import { acceptDelivery, shippingGuard } from './shipping'
import { carryDocument } from './documents'
import { previewSubstitution, revalidateSubstitution, type Substitution } from './substitution-preview'
async function store(env:Bindings,actor:Actor,order:Order,offers:Substitution[],action:string,reason:string,extra:D1PreparedStatement[]=[]) {
 const revision=crypto.randomUUID(),updated={...order,revision,substitutions:offers}
 await commit(env.DB,actor,[env.DB.prepare('UPDATE bw_orders SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify(updated),revision,order.id,order.revision),changed(env.DB),...extra,audit(env.DB,actor,order.id,action,{accountId:order.accountId,orderId:order.id,revision,source:'substitution.command',reason})])
 return updated
}
export async function substitutionCommand(env:Bindings,actor:Actor,type:string,p:any,context?:{proposal:AgentProposal;statements?:D1PreparedStatement[]}) {
 requirePerson(actor)
 const order=await readOrder(env.DB,actor,text(p.orderId,'Original order'))
 const offers=order.substitutions??[],latest=offers.at(-1)
 if(type==='substitution.preview'||type==='substitution.propose') {
  requireSupplier(actor)
  if(latest?.status==='accepted')fail('SUBSTITUTION_ACCEPTED','This order already has an accepted substitution. Follow its replacement order.')
  const preview=await previewSubstitution(env,actor,order,p)
  if(type==='substitution.preview')return {lines:preview.lines,deliveryOptions:preview.deliveryOptions,totalCents:preview.totalCents,taxNote:preview.taxNote}
  if(p.orderRevision!==order.revision)fail('SUBSTITUTION_CHANGED','Refresh the original order before proposing a revision.')
  if(preview.deliveryOptions.required&&!preview.delivery)fail('SHIPPING_REQUIRED','Select a replacement delivery method before offering it.')
  const offer:Substitution={...(context?{agentProposal:{id:context.proposal.id,number:context.proposal.number}}:{}),number:(latest?.number??0)+1,status:'offered',reason:text(p.reason,'Substitution reason',240),proposedBy:actor.id,proposedAt:(await now()).toISOString(),accountRevision:preview.selected.revision,lines:preview.lines,totalCents:preview.totalCents,delivery:preview.delivery,freightQuotes:preview.freightQuotes,taxNote:preview.taxNote}
  return store(env,actor,order,[...offers,offer],'substitution.offered',`Offer ${offer.number}: ${offer.reason}`,[activeAccountGuard(env.DB,preview.selected),shippingGuard(env.DB,preview.delivery),...(context?.statements??[])])
 }
 if(!latest||latest.number!==p.number)fail('SUBSTITUTION_CHANGED','Review the latest numbered offer.')
 if(type==='substitution.execute') {
  requireSupplier(actor)
  if(latest.agentProposal){if(!context||context.proposal.id!==latest.agentProposal.id||context.proposal.number!==latest.agentProposal.number)fail('PROPOSAL_APPROVAL','Execute this offer through its exact approved proposal.');await linkedProposal(env,actor,latest.agentProposal,order,true)}
  if(latest.status!=='accepted'||!latest.replacementId)fail('SUBSTITUTION_ACCEPTANCE','The buyer must accept this exact offer before stock changes.')
  const replacement=await readOrder(env.DB,actor,latest.replacementId)
  if(['approved','shortfall'].includes(replacement.status))return replacement
  // Once release has started, its exact request is always recoverable, even after an account edit.
  if(!['releasing','cancelled'].includes(order.status))await revalidateSubstitution(env,actor,order,latest,true)
  await orderCommand(env,actor,'order.cancel',{orderId:order.id,reason:`Accepted substitution ${latest.number}: ${latest.reason}`})
  return orderCommand(env,actor,'order.approve',{orderId:replacement.id})
 }
 const selected=(await import('./accounts')).account
 const buyer=await selected(env.DB,actor,order.accountId)
 await requireCompanyRight(env.DB,actor,buyer.id,'purchaser',order.shipTo?.id)
 if(['owner','admin'].includes(actor.role))fail('BUYER_REQUIRED','Only a company purchaser can accept or decline a substitution.',403)
 if(type==='substitution.accept'&&latest.status==='accepted')return order
 if(latest.status!=='offered')fail('SUBSTITUTION_CHANGED','This offer has already been decided.')
 if(type==='substitution.decline')return store(env,actor,order,[...offers.slice(0,-1),{...latest,status:'declined',decidedBy:actor.id,decidedAt:(await now()).toISOString(),declineReason:text(p.reason,'Decline reason',240)}],'substitution.declined',`Declined offer ${latest.number}: ${text(p.reason,'Decline reason',240)}`)
 if(type!=='substitution.accept')fail('COMMAND','Unknown substitution command.',404)
 if(latest.agentProposal)await linkedProposal(env,actor,latest.agentProposal,order)
 if(p.acknowledged!==true)fail('SUBSTITUTION_ACCEPTANCE','Explicitly acknowledge the exact lines, units, prices, delivery and unverified tax difference.')
 const current=await revalidateSubstitution(env,actor,order,latest),at=(await now()).toISOString()
 const delivery=await acceptDelivery(env,actor,current.context,latest.delivery,true)
 const id=await nextNumber(env.DB),revision=crypto.randomUUID()
 let replacement:Order={...(order.buyingProfile?{buyingProfile:order.buyingProfile}:{}),...(latest.agentProposal?{agentProposal:latest.agentProposal}:{}),id,revision,accountId:order.accountId,accountRevision:current.selected.revision,customerName:current.selected.value.name,pierCustomerId:current.selected.value.pierCustomerId,pierOrigin:order.pierOrigin,reference:order.reference,requestedDate:order.requestedDate,cancelAfter:order.cancelAfter,instructions:order.instructions,deliveryLocation:order.deliveryLocation,billTo:order.billTo,shipTo:order.shipTo,document:order.document,lines:latest.lines.map(({fromSku,fromUnit,fromLine,...line})=>({...line,substitutedFrom:{orderId:order.id,line:fromLine,sku:fromSku,unit:fromUnit}})),totalCents:latest.totalCents,currency:'USD',termsDays:current.selected.value.termsDays,delivery,freightQuotes:latest.freightQuotes,preparedBy:latest.proposedBy,preparedAt:latest.proposedAt,submittedBy:actor.id,status:'submitted',fromSubstitution:{orderId:order.id,number:latest.number}}
 const submission=await companySubmission(env,actor,replacement);replacement=submission.order
 const accepted:Substitution={...latest,...(latest.agentProposal?{replacementBasis:await proposalReplacementBasis(replacement)}:{}),status:'accepted',decidedBy:actor.id,decidedVersion:actor.version,decidedAt:at,replacementId:id}
 const stored=await store(env,actor,order,[...offers.slice(0,-1),accepted],'substitution.accepted',`Buyer accepted exact offer ${latest.number}; replacement ${id}; original stock must be released first.`,[...await buyingOrderGuards(env.DB,actor,replacement),await deltaEntryGuard(env.DB,order.accountId),submission.guard,activeAccountGuard(env.DB,current.selected),shippingGuard(env.DB,delivery),env.DB.prepare('INSERT INTO bw_orders VALUES(?,?,?,?)').bind(id,order.accountId,JSON.stringify(replacement),revision),...(submission.waiting?[]:await confirmationStatements(env.DB,actor,replacement,'submitted')),...(order.document?[carryDocument(env,order.id,id)]:[]),audit(env.DB,actor,id,'substitution.replacement',{accountId:order.accountId,orderId:id,revision,source:'substitution.accept',reason:`Replacement for ${order.id}, exact accepted offer ${latest.number}; no stock effect yet.`})])
 if(!submission.waiting)await emailLatestConfirmation(env,id)
 return stored
}
