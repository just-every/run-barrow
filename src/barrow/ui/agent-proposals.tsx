import { useEffect, useRef, useState } from 'react'
import type { AgentProposal, ProposalCandidate } from '../agent-proposal-model'
import { errorMessage, request } from './api'
import { Notice } from './primitives'
import { day, money, when, type Order, type RunCommand } from './types'

const difference = (cents: number) => `${cents > 0 ? '+' : ''}${money(cents)}`
type BasketLine = Order['lines'][number]

function LineAmount({ line }: { line: BasketLine }) {
  return <span>{line.sku} · {line.quantity} {line.unit ?? 'units'}
    {line.baseQuantity && <> = {line.baseQuantity} {line.baseUnit ?? 'base units'}</>}
    {' · '}{money(line.unitCents)} per {line.unit ?? 'unit'}
    {' · '}{money(line.lineCents ?? line.quantity * line.unitCents)} line total
    {line.packContents && <> · {line.packContents}</>}
    {line.pricing && <> · {line.pricing.reason}</>}
  </span>
}

function CandidateBasket({ candidate, order }: { candidate: ProposalCandidate; order: Order }) {
  return <div className="br-stack">
    <ul className="br-stack">{candidate.lines.map((line, index) => {
      const original = order.lines[line.fromLine - 1]
      const matched = original?.sku === line.fromSku && original.unit === line.fromUnit
      return <li key={index} style={{ overflowWrap: 'anywhere' }}>
        <strong>Original line {line.fromLine}: </strong>{matched ? <LineAmount line={original} /> : <>{line.fromSku} ({line.fromUnit ?? 'units'}); original quantities and prices are unavailable for this recorded source.</>}
        <br /><strong>Replacement: </strong><LineAmount line={line} />
      </li>
    })}</ul>
    <dl className="br-facts br-facts-wrap">
      <div><dt style={{whiteSpace:'normal'}}>Original order total</dt><dd>{money(order.totalCents)}</dd></div>
      <div><dt style={{whiteSpace:'normal'}}>Replacement total, excluding tax</dt><dd>{money(candidate.totalCents)}</dd></div>
      <div><dt style={{whiteSpace:'normal'}}>Total difference, excluding tax</dt><dd>{difference(candidate.totalCents - order.totalCents)}{candidate.freightDifferenceCents === null && ' · freight difference unverified'}</dd></div>
      <div><dt style={{whiteSpace:'normal'}}>Merchandise difference</dt><dd>{difference(candidate.merchandiseDifferenceCents)}</dd></div>
      <div><dt style={{whiteSpace:'normal'}}>Freight difference</dt><dd>{candidate.freightDifferenceCents === null ? 'Unknown; no verified freight comparison' : difference(candidate.freightDifferenceCents)}</dd></div>
    </dl>
    {candidate.delivery ? <p>Delivery: {candidate.delivery.name} · {candidate.delivery.warehouse || 'warehouse not recorded'} · {candidate.delivery.totalCents === null ? 'charge unknown' : money(candidate.delivery.totalCents)} · {day(candidate.delivery.windowStart)}–{day(candidate.delivery.windowEnd)}.</p> : <p>Delivery method and charge are not recorded.</p>}
    <p>{candidate.taxNote} Tax difference is unknown.</p>
    {!!candidate.deliveryOptions.length && <details className="br-details"><summary>Delivery alternatives considered</summary><ul>{candidate.deliveryOptions.map(option => <li key={JSON.stringify([option.methodId, option.warehouse])}>{option.name} · {option.warehouse || 'warehouse not recorded'} · {option.totalCents === null ? 'charge unknown' : money(option.totalCents)} · {day(option.windowStart)}–{day(option.windowEnd)}{option.approvalRequired && ' · supplier approval required'}</li>)}</ul></details>}
  </div>
}

function ProposalReview({ proposal, order, latest, busy, act }: {
  proposal: AgentProposal; order: Order; latest: boolean; busy: boolean;
  act: (type: string, payload: Record<string, unknown>) => Promise<void>
}) {
  const [selected, setSelected] = useState<number | null>(null)
  const [reason, setReason] = useState(''), [reviewed, setReviewed] = useState(false)
  const [withdrawalReason, setWithdrawalReason] = useState('')
  const canOffer = latest && proposal.state === 'proposed'
  const canExecute = latest && ['offered','executing'].includes(proposal.state) && proposal.buyerApproval?.status === 'accepted' && proposal.grantActive === true && Boolean(proposal.executionKey)
  return <article className="br-card br-stack" style={{ overflowWrap: 'anywhere' }}>
    <h4>Proposal {proposal.number} · {proposal.state}{latest ? ' · latest revision' : ' · history'}</h4>
    <p>Received {when(proposal.createdAt)} · agent-reported model {proposal.model} · run {proposal.runId} · reported inference cost {money(proposal.reportedCostCents)}.</p>
    <p>Grant: {proposal.grantActive === true ? 'active' : proposal.grantActive === false ? 'inactive' : 'status not recorded'}. Buyer approval: {proposal.buyerApproval ? `${proposal.buyerApproval.status} · ${proposal.buyerApproval.by} · ${when(proposal.buyerApproval.at)}` : 'not recorded'}.</p>
    {proposal.managerApproval && <p>Manager approval: {proposal.managerApproval.by} · {when(proposal.managerApproval.at)} · candidate {proposal.managerApproval.candidate + 1}. Reason: {proposal.managerApproval.reason}</p>}
    {proposal.selected !== undefined && <p>Offered candidate: {proposal.selected + 1}{proposal.offerNumber !== undefined && ` · buyer offer ${proposal.offerNumber}`}.</p>}
    {proposal.replacementId && <p>Replacement order: {proposal.replacementId}{proposal.completedAt && ` · completed ${when(proposal.completedAt)}`}.</p>}
    <details className="br-details"><summary>Source evidence and permitted tools</summary>
      <dl className="br-facts br-facts-wrap">
        <div><dt style={{whiteSpace:'normal'}}>Proposal ID and revision</dt><dd>{proposal.id} · {proposal.revision}</dd></div>
        <div><dt style={{whiteSpace:'normal'}}>Source order revision</dt><dd>{proposal.source.orderRevision}</dd></div>
        <div><dt style={{whiteSpace:'normal'}}>Source account revision</dt><dd>{proposal.source.accountRevision}</dd></div>
        <div><dt style={{whiteSpace:'normal'}}>PO document SHA-256</dt><dd>{proposal.source.documentSha256 ?? 'No document hash recorded'}</dd></div>
        <div><dt style={{whiteSpace:'normal'}}>Source fingerprint</dt><dd>{proposal.source.fingerprint}</dd></div>
        <div><dt style={{whiteSpace:'normal'}}>Observed</dt><dd>{when(proposal.source.observedAt)}</dd></div>
        <div><dt style={{whiteSpace:'normal'}}>Tool permissions</dt><dd>{proposal.source.toolPermissions.join(', ') || 'None recorded'}</dd></div>
        <div><dt style={{whiteSpace:'normal'}}>Grant</dt><dd>{proposal.grantId}</dd></div>
        <div><dt style={{whiteSpace:'normal'}}>Execution key</dt><dd>{proposal.executionKey ?? 'Not assigned'}</dd></div>
      </dl>
      <p>Model, run and inference cost are reported by the external agent.</p>
    </details>
    <details className="br-details"><summary>Effects and refusals</summary>
      {proposal.effects.length ? <ul>{proposal.effects.map((effect, index) => <li key={index}>{effect}</li>)}</ul> : <p>No effects recorded.</p>}
      {proposal.attempts?.length ? <ul>{proposal.attempts.map(attempt => <li key={attempt.id}>{when(attempt.at)} · {attempt.actorId} · {attempt.code}: {attempt.reason}</li>)}</ul> : <p>No attempts or refusals recorded.</p>}
    </details>
    {proposal.candidates.map((candidate, index) => <details className="br-details" key={index} open={selected === index || proposal.selected === index}>
      <summary>Candidate {index + 1} · rank {candidate.rank} · {money(candidate.totalCents)} excluding tax</summary>
      <CandidateBasket candidate={candidate} order={order} />
      {canOffer && <div className="br-actions"><button type="button" className="br-secondary" disabled={busy} aria-pressed={selected === index} onClick={() => { setSelected(index); setReviewed(false) }}>Select candidate {index + 1} for buyer review</button></div>}
    </details>)}
    {canOffer && <form className="br-stack" onSubmit={event => {
      event.preventDefault()
      if (selected === null || !reviewed || !reason.trim()) return
      void act('proposal.offer', { id: proposal.id, number: proposal.number, revision: proposal.revision, candidate: selected, reason: reason.trim() })
    }}>
      <p>{selected === null ? 'Review a complete candidate basket and select it to prepare a buyer offer.' : `Selected: candidate ${selected + 1}, rank ${proposal.candidates[selected].rank}, ${money(proposal.candidates[selected].totalCents)} excluding tax.`}</p>
      <label>Manager’s reason for this exact offer<textarea required maxLength={240} disabled={busy} value={reason} onChange={event => setReason(event.target.value)} /></label>
      <label><input type="checkbox" style={{width:20,minHeight:20,verticalAlign:"middle",marginRight:8}} disabled={busy || selected === null} checked={reviewed} onChange={event => setReviewed(event.target.checked)} />I reviewed this selected basket’s quantities, selling units, prices, delivery and unknown tax difference. Record my signed-in approval and offer it to the buyer.</label>
      <div className="br-actions"><button disabled={busy || selected === null || !reviewed || !reason.trim() || proposal.grantActive !== true}>Offer selected candidate to buyer</button></div>
    </form>}
    {canExecute && <div className="br-stack"><p>The buyer accepted the offered basket. Execution releases the original reservation and creates the approved replacement using this recorded execution key.</p><div className="br-actions"><button disabled={busy} onClick={() => void act('proposal.execute', { id: proposal.id, number: proposal.number, revision: proposal.revision, idempotencyKey: proposal.executionKey })}>{proposal.state==='executing'?'Retry approved replacement':'Execute buyer-approved replacement'}</button></div></div>}
    {latest && proposal.state === 'offered' && !canExecute && <p className="br-quiet-text">Execution requires buyer acceptance, an active grant and a recorded execution key.</p>}
    {proposal.state === 'blocked' && <p className="br-quiet-text">This revision is blocked. Review the recorded refusal; the external agent must submit a revised proposal before another offer.</p>}
    {latest && ['proposed', 'offered', 'blocked'].includes(proposal.state) && <details className="br-details"><summary>Withdraw this unexecuted proposal</summary>
      <form className="br-stack" onSubmit={event => {
        event.preventDefault()
        if (withdrawalReason.trim()) void act('proposal.withdraw', { id: proposal.id, number: proposal.number, revision: proposal.revision, reason: withdrawalReason.trim() })
      }}>
        <p>Withdraw this revision before asking the external agent for a fresh proposal. Earlier approvals and effects remain in history.</p>
        <label>Manager’s withdrawal reason<textarea required maxLength={240} disabled={busy} value={withdrawalReason} onChange={event => setWithdrawalReason(event.target.value)} /></label>
        <div className="br-actions"><button className="br-secondary" disabled={busy || !withdrawalReason.trim()}>Withdraw proposal</button></div>
      </form>
    </details>}
  </article>
}

export function AgentProposals({ orderId, version, busy, run }: { orderId: string; version: string; busy: boolean; run: RunCommand }) {
  const [data, setData] = useState<{ order: Order; proposals: AgentProposal[] } | null>(null)
  const [error, setError] = useState(''), [loading, setLoading] = useState(false), [acting, setActing] = useState(false), [reload, setReload] = useState(0)
  const [commandError, setCommandError] = useState('')
  const lock = useRef(false)
  const visibleData = data?.order.id === orderId ? data : null
  useEffect(() => {
    let current = true
    setData(null); setError(''); setLoading(true)
    void Promise.all([
      request<{ proposals: AgentProposal[] }>(`/api/barrow/orders/${encodeURIComponent(orderId)}/agent-proposals`),
      request<Order>(`/api/barrow/orders/${encodeURIComponent(orderId)}`),
    ]).then(([result, order]) => { if (current) setData({ order, proposals: result.proposals }) })
      .catch(cause => { if (current) setError(errorMessage(cause)) })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [orderId, version, reload])
  async function act(type: string, payload: Record<string, unknown>) {
    if (lock.current || busy) return
    lock.current = true; setActing(true); setCommandError('')
    try {
      if (!await run(type, payload)) setCommandError('No change was confirmed. Review the order’s command message before trying again.')
    } catch (cause) { setCommandError(errorMessage(cause)) }
    finally { lock.current = false; setActing(false); setReload(value => value + 1) }
  }
  return <section className="br-stack" aria-label="Agent substitution proposals">
    <h3>Agent substitution proposals</h3>
    <p>External agents submit ranked replacement baskets within the owner’s account grant. A manager reviews the exact offer, the buyer accepts it, and a person executes it separately.</p>
    <div className="br-actions"><button className="br-secondary" disabled={busy || acting || loading} onClick={() => setReload(value => value + 1)}>Refresh agent proposals</button></div>
    {error && <Notice error>{error}</Notice>}
    {commandError && <Notice error>{commandError}</Notice>}
    {loading && <p role="status">Loading proposal history…</p>}
    {visibleData?.proposals.length === 0 && <p>No external agent proposals have been submitted for this order.</p>}
    {visibleData?.proposals.map((proposal, index) => <ProposalReview key={`${proposal.id}:${proposal.number}:${proposal.revision}`} proposal={proposal} order={visibleData.order} latest={index === visibleData.proposals.length - 1} busy={busy || acting || loading} act={act} />)}
  </section>
}
