import {digest} from './digest'
import type { Bindings } from '../auth.server'
import type { Actor, Order } from './model'
import { fail, Problem } from './model'
import { proposalGrant, proposalRefusal, readProposal } from './proposal-store'
import { proposalFingerprint } from './proposal-sources'
export type ProposalLink={id:string;number:number}
export async function linkedProposal(env: Bindings, actor: Actor, link: ProposalLink, order: Order, executing=false) {
 const proposal=await readProposal(env,actor,link.id,link.number)
 try {
  await proposalGrant(env,proposal)
  if(proposal.orderId!==order.id || proposal.state!==(executing?'executing':'offered'))fail('PROPOSAL_APPROVAL','Only the exact reviewed proposal can authorize this effect.')
  if(!executing&&(await proposalFingerprint(env,actor,order)).fingerprint!==proposal.source.fingerprint)fail('PROPOSAL_STALE','The reviewed price, inventory, unit or delivery source changed. Review a new proposal.')
  return proposal
 } catch(error) {if(error instanceof Problem)await proposalRefusal(env,actor,proposal,error.code);throw error}
}
export async function linkedReplacementGuard(env: Bindings, actor: Actor, order: Order) {
 if(!order.agentProposal)return
 if(await env.DB.prepare('SELECT account_id FROM bw_terms_assignments WHERE account_id=?').bind(order.accountId).first())fail('PROPOSAL_TERMS','Assigned sales terms require a separately reviewed acceptance before any replacement handoff.')
 const proposal=await readProposal(env,actor,order.agentProposal.id,order.agentProposal.number)
 await proposalGrant(env,proposal)
 if(proposal.state!=='executing'||proposal.replacementId!==order.id)fail('PROPOSAL_APPROVAL','Execute this replacement through its exact approved proposal. Direct approval cannot bypass its source, grant or budget guards.')
}

/** Workflow revisions may record a company decision; the reviewed commercial
 * basket, document, destination and agreed values must not change with them. */
export async function proposalReplacementBasis(order:Order) {
 const fields=['accountId','accountRevision','customerName','reference','poRelease','requestedDate','cancelAfter','instructions','document','deliveryLocation','lines','totalCents','currency','termsDays','delivery','freightQuotes','billTo','shipTo','quote','lineSheet','season','termsAcceptance','priceDisplay','pierCustomerId','pierOrigin'] as const
 return digest(JSON.stringify(Object.fromEntries(fields.map(key=>[key,order[key]]))))
}
