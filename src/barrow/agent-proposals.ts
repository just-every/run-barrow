import {proposalReplacementBasis} from './proposal-approval'
import type { Bindings } from '../auth.server'
import { audit, changed, commit } from './access'
import { account } from './accounts'
import { readStaffGrant } from './staff-members'
import { requireCompanyRight } from './company-policy'
import { now } from './clock'
import { readOrder } from './orders'
import { substitutionCommand } from './substitutions'
import { fail, integer, Problem, requirePerson, text, type Actor, type Order } from './model'
import { grantSpendStatements, readProposalGrant } from './proposal-grants'
import { proposalCandidates, proposalFingerprint, proposalInput } from './proposal-sources'
import { proposalGrant, proposalGuard, proposalManager, proposalRefusal, proposalUpdate, readProposal } from './proposal-store'
import type { AgentProposal } from './agent-proposal-model'

export async function listAgentProposals(env: Bindings, actor: Actor, orderId: string) {
 proposalManager(actor)
 await readOrder(env.DB,actor,orderId)
 const rows=(await env.DB.prepare('SELECT value_json FROM bw_agent_proposals WHERE order_id=? ORDER BY rowid').bind(orderId).all<{value_json:string}>()).results
 return {proposals:await Promise.all(rows.map(async row=>{
  const proposal=JSON.parse(row.value_json) as AgentProposal,order=await readOrder(env.DB,actor,orderId)
  const offer=order.substitutions?.find(offer=>offer.number===proposal.offerNumber&&offer.agentProposal?.id===proposal.id&&offer.agentProposal.number===proposal.number)
  let grantActive=true;try {await proposalGrant(env,proposal)}catch {grantActive=false}
  const attempts=(await env.DB.prepare('SELECT id,at,actor_id AS actorId,code,reason FROM bw_agent_proposal_attempts WHERE proposal_id=? AND proposal_number=? ORDER BY rowid').bind(proposal.id,proposal.number).all<any>()).results
  return {...proposal,attempts,grantActive,...(offer?.decidedBy?{buyerApproval:{by:offer.decidedBy,at:offer.decidedAt!,status:offer.status}}:{})}
 }))}
}
async function submit(env: Bindings, actor: Actor, p: any) {
 if (!actor.agent || !actor.grantId) fail('PROPOSAL_AGENT','Use an explicit account-scoped proposal credential.',403)
 const input=proposalInput(p),grant=await readProposalGrant(env.DB,actor.grantId)
 if (!grant) fail('PROPOSAL_AGENT','This draft credential has no account-scoped proposal authority.',403)
 const order=await readOrder(env.DB,actor,text(p.orderId,'Order'))
 if (order.accountId!==grant.accountId) fail('NOT_FOUND','Order not found.',404)
 if (order.lines.some(line=>line.quote)||order.termsAcceptance) fail('PROPOSAL_TERMS','Quoted and signed sales-term orders need a separately reviewed quote or terms revision; this proposal door cannot replace their acceptance.')
 const previous=p.id?await readProposal(env,{...actor,agent:false},text(p.id,'Proposal')):null
 if (previous && (previous.orderId!==order.id||previous.accountId!==grant.accountId||previous.number!==p.number||previous.revision!==p.revision||previous.state!=='superseded'))
  fail('PROPOSAL_PENDING','A manager must explicitly withdraw the previous unexecuted proposal before an agent submits a new revision.')
 const source=await proposalFingerprint(env,actor,order),candidates=await proposalCandidates(env,actor,order,grant,input.candidates)
 if ((await proposalFingerprint(env,actor,order)).fingerprint!==source.fingerprint) fail('PROPOSAL_STALE','Inventory changed during proposal preparation. Read the sources again.')
 const id=previous?.id??crypto.randomUUID(),number=(previous?.number??0)+1,revision=crypto.randomUUID()
 const proposal:AgentProposal={id,number,revision,accountId:order.accountId,orderId:order.id,grantId:grant.id,state:'proposed',...input,candidates,
  createdAt:(await now()).toISOString(),source:{...source,orderRevision:order.revision,documentSha256:order.document?.sha256??null,toolPermissions:['proposal.submit:one-account','catalogue:account-read','orders:account-read','document-bytes:never','stock-and-contact:human-approved-only']},
  effects:['A manager reviews one exact complete basket.','The account buyer accepts that exact offer.','One existing Pier release and one replacement reservation use their durable native identities.','At most three buyer contacts are reserved; two are the existing confirmation emails.','No paid model call, payment, tax calculation or direct agent outreach is performed.']}
 await commit(env.DB,actor,[...grantSpendStatements(env.DB,grant,input.reportedCostCents,0),...(previous?[proposalGuard(env,previous)]:[]),env.DB.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_orders WHERE id=? AND revision=?) THEN 1 ELSE 0 END').bind(order.id,order.revision),env.DB.prepare('INSERT INTO bw_agent_proposals VALUES(?,?,?,?,?,?,?,?)').bind(id,number,order.accountId,order.id,grant.id,proposal.state,JSON.stringify(proposal),revision),audit(env.DB,actor,id,'proposal.submitted',{accountId:order.accountId,orderId:order.id,revision,source:'proposal.submit',reason:`Structured substitution proposal ${number}; model/run identifiers and external cost are self-reported. Native sources and owner-approved SKU mappings were validated; document bytes were not read.`})])
 return proposal
}
/** Manager-reviewed offer/execute transitions are atomic with their proposal
 * ledger. Untrusted bearer callers never gain a human stock or contact door. */
export async function agentProposalCommand(env: Bindings, actor: Actor, type: string, p: any) {
 if (type==='proposal.submit') {
  try{return await submit(env,actor,p)}catch(error){
   const grant=actor.agent&&actor.grantId?await readProposalGrant(env.DB,actor.grantId):null
   let refusal=error
   if(!(error instanceof Problem)&&grant&&Number.isSafeInteger(p.reportedCostCents)&&grant.spentCostCents>grant.costLimitCents-p.reportedCostCents)refusal=new Problem('PROPOSAL_BUDGET','The account’s reported-cost allowance cannot admit this proposal.')
   if(grant&&refusal instanceof Problem)await commit(env.DB,actor,[audit(env.DB,actor,grant.id,'proposal.input-refused',{accountId:grant.accountId,revision:grant.revision,source:'proposal.submit',reason:`${refusal.code}: structured proposal admission refused; no document instructions, stock effect or outreach were admitted.`})])
   throw refusal
  }
 }
 requirePerson(actor);proposalManager(actor)
 const proposal=await readProposal(env,actor,text(p.id,'Proposal'),integer(p.number,'Proposal number',1))
 if (p.revision!==proposal.revision) fail('PROPOSAL_STALE','Refresh the exact proposal revision before deciding it.')
 try {
  if (type==='proposal.withdraw') return withdraw(env,actor,proposal,text(p.reason,'Withdrawal reason',240))
  if (type!=='proposal.offer'&&type!=='proposal.execute') fail('COMMAND','Unknown proposal command.',404)
  const grant=await proposalGrant(env,proposal),order=await readOrder(env.DB,actor,proposal.orderId)
  if (type==='proposal.offer') {
   if(grant.spentContacts>grant.contactLimit-3)fail('PROPOSAL_BUDGET','The account contact allowance cannot admit this complete reviewed offer and its potential confirmation emails.')
   if (proposal.state!=='proposed'||proposal.source.orderRevision!==order.revision) fail('PROPOSAL_STALE','The original order or proposal changed. Withdraw it and review a new revision.')
   const candidate=integer(p.candidate,'Candidate',0,proposal.candidates.length-1),basket=proposal.candidates[candidate]
   proposalManager(actor,basket.totalCents,Math.abs(Math.min(0,basket.merchandiseDifferenceCents)))
   if ((await proposalFingerprint(env,actor,order)).fingerprint!==proposal.source.fingerprint) fail('PROPOSAL_STALE','The reviewed inventory, price, units or delivery source changed.')
   const at=(await now()).toISOString(),reason=text(p.reason,'Manager approval reason',240)
   const updated:AgentProposal={...proposal,state:'offered',selected:candidate,managerApproval:{by:actor.id,version:actor.version,staffRevision:actor.staff?.revision,at,reason,candidate},executionKey:`proposal-${proposal.id}-${proposal.number}`,offerNumber:(order.substitutions?.at(-1)?.number??0)+1}
   await substitutionCommand(env,actor,'substitution.propose',{orderId:order.id,orderRevision:order.revision,lines:basket.lines,delivery:basket.delivery,reason},
    {proposal:updated,statements:[...grantSpendStatements(env.DB,grant,0,3),...proposalUpdate(env,proposal,updated)]})
   return updated
  }
  if (p.idempotencyKey!==proposal.executionKey||!proposal.executionKey) fail('PROPOSAL_KEY','Use the execution key belonging to the exact approved revision.')
  if (proposal.state==='completed') return proposal
  if (!['offered','executing'].includes(proposal.state)||proposal.selected===undefined) fail('PROPOSAL_APPROVAL','This proposal has no approved basket to execute.')
  const offer=order.substitutions?.at(-1),basket=proposal.candidates[proposal.selected]
  proposalManager(actor,basket.totalCents,Math.abs(Math.min(0,basket.merchandiseDifferenceCents)))
  if (!offer||offer.number!==proposal.offerNumber||offer.agentProposal?.id!==proposal.id||offer.agentProposal.number!==proposal.number||offer.status!=='accepted'||!offer.decidedBy||!offer.replacementId)
   fail('PROPOSAL_APPROVAL','The account buyer must accept this exact manager-reviewed offer.')
  const replacementOrder=await readOrder(env.DB,actor,offer.replacementId)
  if(!offer.replacementBasis||await proposalReplacementBasis(replacementOrder)!==offer.replacementBasis)fail('PROPOSAL_STALE','The replacement’s reviewed commercial basket changed after acceptance. Withdraw it and review a new proposal before releasing any stock.')
  if(proposal.state==='offered'&&replacementOrder.status!=='submitted')fail('PROPOSAL_APPROVAL','Complete the replacement’s company purchase approval before releasing the original stock reservation.')
  const manager=proposal.managerApproval&&await env.DB.prepare("SELECT id,email,role,version FROM oa_operators WHERE id=? AND status='active'").bind(proposal.managerApproval.by).first<any>()
  if(!proposal.managerApproval||!manager||manager.version!==proposal.managerApproval.version)fail('PROPOSAL_APPROVAL','The recorded manager approval is no longer current.')
  const managerActor={...manager,agent:false,staff:await readStaffGrant(env.DB,{...manager,agent:false})}
  proposalManager(managerActor,basket.totalCents,Math.abs(Math.min(0,basket.merchandiseDifferenceCents)))
  if(managerActor.staff?.revision!==proposal.managerApproval.staffRevision)fail('PROPOSAL_APPROVAL','The manager grant changed; a new review is required.')
  const purchaser=await env.DB.prepare("SELECT id,email,role,version FROM oa_operators WHERE id=? AND status='active'").bind(offer.decidedBy).first<any>()
  if(!purchaser||purchaser.version!==offer.decidedVersion)fail('PROPOSAL_APPROVAL','The recorded buyer approval is no longer current.')
  await requireCompanyRight(env.DB,{...purchaser,agent:false},order.accountId,'purchaser',order.shipTo?.id)
  if (proposal.state==='offered') {
   if ((await proposalFingerprint(env,actor,order)).fingerprint!==proposal.source.fingerprint) fail('PROPOSAL_STALE','The reviewed inventory, price, units or delivery source changed.')
   const updated:AgentProposal={...proposal,state:'executing',replacementId:offer.replacementId}
   await commit(env.DB,actor,[...grantSpendStatements(env.DB,grant,0,0),...proposalUpdate(env,proposal,updated),audit(env.DB,actor,proposal.id,'proposal.execution-started',{accountId:proposal.accountId,orderId:proposal.orderId,revision:proposal.revision,source:'proposal.execute',reason:'Exact manager and buyer approvals bound to one proposal execution key; native release/reservation identities are retained.'})])
  } else {
   const selected=await account(env.DB,actor,proposal.accountId)
   if (selected.revision!==proposal.source.accountRevision) fail('PROPOSAL_STALE','The account changed during recovery. Preserve the pending handoff for owner review.')
  }
  const replacement=await substitutionCommand(env,actor,'substitution.execute',{orderId:order.id,number:offer.number},{proposal}) as Order
  const current=await readProposal(env,actor,proposal.id,proposal.number),updated:AgentProposal={...current,state:'completed',replacementId:replacement.id,completedAt:(await now()).toISOString()}
  await commit(env.DB,actor,[...proposalUpdate(env,current,updated),audit(env.DB,actor,proposal.id,'proposal.completed',{accountId:proposal.accountId,orderId:proposal.orderId,revision:proposal.revision,source:'proposal.execute',reason:`Acknowledged replacement ${replacement.id}; one original release and one replacement reservation, without a second earning or contact on replay.`})])
  return updated
 } catch (error) {
  if (error instanceof Problem) await proposalRefusal(env,actor,proposal,error.code)
  throw error
 }
}

async function withdraw(env: Bindings, actor: Actor, proposal: AgentProposal, reason: string) {
 if (!['proposed','offered','blocked'].includes(proposal.state)) fail('PROPOSAL_PENDING','A started or completed external handoff cannot be withdrawn. Recover its exact execution key.')
 const order=await readOrder(env.DB,actor,proposal.orderId),offer=order.substitutions?.find(item=>item.number===proposal.offerNumber&&item.agentProposal?.id===proposal.id&&item.agentProposal.number===proposal.number)
 const statements:D1PreparedStatement[]=[]
 if (offer) {
  if (offer!==order.substitutions?.at(-1)) fail('PROPOSAL_PENDING','A newer native offer exists; inspect it before withdrawing this proposal.')
  if (offer.replacementId) {
   const replacement=await readOrder(env.DB,actor,offer.replacementId)
   if (replacement.approvedAt||replacement.pierOrderId||!['submitted','awaiting-company-approval'].includes(replacement.status)) fail('PROPOSAL_PENDING','The replacement already started; preserve and recover its handoff.')
   const revision=crypto.randomUUID()
   statements.push(env.DB.prepare('UPDATE bw_orders SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify({...replacement,status:'superseded',revision}),revision,replacement.id,replacement.revision),changed(env.DB))
  }
  const revision=crypto.randomUUID(),updated={...order,revision,substitutions:order.substitutions!.map(item=>item.number===offer.number?{...item,status:'withdrawn',withdrawnBy:actor.id,withdrawnAt:new Date().toISOString(),withdrawalReason:reason}:item)}
  statements.push(env.DB.prepare('UPDATE bw_orders SET value_json=?,revision=? WHERE id=? AND revision=?').bind(JSON.stringify(updated),revision,order.id,order.revision),changed(env.DB))
 }
 const updated:AgentProposal={...proposal,state:'superseded'}
 await commit(env.DB,actor,[...statements,...proposalUpdate(env,proposal,updated),audit(env.DB,actor,proposal.id,'proposal.withdrawn',{accountId:proposal.accountId,orderId:proposal.orderId,revision:proposal.revision,source:'proposal.withdraw',reason})])
 return updated
}
