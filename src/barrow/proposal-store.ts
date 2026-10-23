import type { Bindings } from '../auth.server'
import { account } from './accounts'
import { audit, changed, commit } from './access'
import { fail, requirePerson, requireSupplier, type Actor } from './model'
import type { AgentProposal } from './agent-proposal-model'
import { readProposalGrant, grantGuard } from './proposal-grants'

export async function readProposal(env: Bindings, actor: Actor, id: string, number?: number): Promise<AgentProposal> {
 const row=await env.DB.prepare(`SELECT value_json FROM bw_agent_proposals WHERE id=? ${number===undefined?'':'AND number=?'} ORDER BY number DESC LIMIT 1`).bind(...(number===undefined?[id]:[id,number])).first<{value_json:string}>()
 if (!row) fail('NOT_FOUND','Agent proposal not found.',404)
 const proposal=JSON.parse(row.value_json) as AgentProposal
 await account(env.DB,actor,proposal.accountId)
 if (actor.agent && proposal.grantId !== actor.grantId) fail('NOT_FOUND','Agent proposal not found.',404)
 return proposal
}
export function proposalGuard(env: Bindings, proposal: AgentProposal) {
 return env.DB.prepare('INSERT INTO bw_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_agent_proposals WHERE id=? AND number=? AND revision=?) THEN 1 ELSE 0 END').bind(proposal.id,proposal.number,proposal.revision)
}
export function proposalUpdate(env: Bindings, before: AgentProposal, after: AgentProposal) {
 return [env.DB.prepare('UPDATE bw_agent_proposals SET state=?,value_json=?,revision=? WHERE id=? AND number=? AND revision=? AND state=?').bind(after.state,JSON.stringify(after),after.revision,after.id,after.number,before.revision,before.state),changed(env.DB)]
}
export function proposalManager(actor: Actor, totalCents?: number, differenceCents=0) {
 requirePerson(actor);requireSupplier(actor)
 if (actor.staff && (actor.staff.role!=='sales-manager'||actor.staff.warehouses!=='all'||differenceCents>actor.staff.discountLimitCents||totalCents!==undefined&&(actor.staff.stockExceptionLimitCents===0||totalCents>actor.staff.stockExceptionLimitCents)))
  fail('FORBIDDEN','This proposal needs a sales manager with the account, all warehouse rights, and sufficient commercial and stock exception limits.',403)
}
export async function proposalGrant(env: Bindings, proposal: AgentProposal) {
 const grant=await readProposalGrant(env.DB,proposal.grantId)
 if (!grant || grant.accountId!==proposal.accountId || grant.accountRevision!==proposal.source.accountRevision) fail('PROPOSAL_REVOKED','The proposal grant no longer covers these source records. Obtain a new scoped grant and a newly reviewed proposal.')
 // Read and mutation paths share the same live scope/expiry/authorizer check.
 try { await env.DB.batch([grantGuard(env.DB,grant),env.DB.prepare('DELETE FROM bw_guard')]) }
 catch { fail('PROPOSAL_REVOKED','The proposal grant expired, was revoked, changed scope or exhausted its budget. Obtain a new scoped grant and a newly reviewed proposal.') }
 return grant
}
export async function proposalRefusal(env: Bindings, actor: Actor, proposal: AgentProposal, code: string) {
 const reasons:Record<string,string>={PROPOSAL_REVOKED:'Current account grant, budget or authorizer no longer permits execution.',PROPOSAL_STALE:'The reviewed inventory, commercial or delivery source changed; a newly reviewed revision is required.',PROPOSAL_APPROVAL:'The exact manager-reviewed basket lacks current buyer approval.',PROPOSAL_KEY:'The execution key does not name the approved revision.',PROPOSAL_PENDING:'An earlier execution remains pending; recover it before making another proposal.'}
 const reason=reasons[code]??'The proposed effect was refused by a current native business guard; no success is asserted.'
 await commit(env.DB,actor,[env.DB.prepare('INSERT INTO bw_agent_proposal_attempts VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),proposal.id,proposal.number,proposal.accountId,new Date().toISOString(),actor.id,code,reason),audit(env.DB,actor,proposal.id,'proposal.refused',{accountId:proposal.accountId,orderId:proposal.orderId,revision:proposal.revision,source:'proposal.command',reason:`${code}: ${reason}`})])
}
