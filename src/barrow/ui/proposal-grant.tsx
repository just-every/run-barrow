import { useEffect, useRef, useState } from 'react'
import type { ProposalGrant as Grant } from '../proposal-grants'
import { errorMessage, request } from './api'
import { Notice } from './primitives'
import { money, when } from './types'

type Credential = { token: string; expiresAt: number; grant: Grant }
const expires = (value: number) => when(new Date(value).toISOString())
const wholeNonnegative = (value: string) => value.trim() !== '' && Number.isSafeInteger(Number(value)) && Number(value) >= 0

function GrantHistory({ grant, busy, revoke }: { grant: Grant; busy: boolean; revoke: (grant: Grant, reason: string) => Promise<void> }) {
  const [reason, setReason] = useState('')
  return <article className="br-card br-stack" style={{ overflowWrap: 'anywhere' }}>
    <h4>Proposal grant · {grant.state}{grant.state === 'active' && grant.expiresAt <= Date.now() ? ' · expired' : ''}</h4>
    <dl className="br-facts br-facts-wrap">
      <div><dt style={{whiteSpace:'normal'}}>Account</dt><dd>{grant.accountId}</dd></div>
      <div><dt style={{whiteSpace:'normal'}}>Reported external cost used / limit</dt><dd>{money(grant.spentCostCents)} / {money(grant.costLimitCents)}</dd></div>
      <div><dt style={{whiteSpace:'normal'}}>Contacts used / limit</dt><dd>{grant.spentContacts} / {grant.contactLimit}</dd></div>
      <div><dt style={{whiteSpace:'normal'}}>Expires</dt><dd>{expires(grant.expiresAt)}</dd></div>
    </dl>
    <p>Allowed replacements: {grant.allowedSubstitutes.map(scope => `${scope.fromSku} → ${scope.skus.join(', ')}`).join('; ')}.</p>
    <details className="br-details"><summary>Grant history</summary>
      <p>ID: {grant.id} · revision: {grant.revision} · account revision: {grant.accountRevision}</p>
      <p>Authorized by: {grant.authorizerId} · authority version {grant.authorizerVersion}.</p>
      <p>Created {when(grant.createdAt)}. Owner’s reason: {grant.reason}</p>
      {grant.revokedAt && <p>Revoked {when(grant.revokedAt)}. Reason: {grant.revocationReason}</p>}
    </details>
    {grant.state === 'active' && <form className="br-stack" onSubmit={event => {
      event.preventDefault()
      if (reason.trim()) void revoke(grant, reason.trim())
    }}>
      <label>Reason to revoke this grant<input required maxLength={1000} disabled={busy} value={reason} onChange={event => setReason(event.target.value)} /></label>
      <div className="br-actions"><button className="br-secondary" disabled={busy || !reason.trim()}>Revoke proposal grant</button></div>
    </form>}
  </article>
}

export function ProposalGrant({ accountId }: { accountId: string }) {
  const [cost, setCost] = useState(''), [contacts, setContacts] = useState('')
  const [fromSku, setFromSku] = useState(''), [substitutes, setSubstitutes] = useState(''), [reason, setReason] = useState('')
  const [consent, setConsent] = useState(false), [credential, setCredential] = useState<Credential | null>(null)
  const [grants, setGrants] = useState<Grant[] | null>(null), [reload, setReload] = useState(0)
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const lock = useRef(false), selectedAccount = useRef(accountId)
  selectedAccount.current = accountId
  const skus = [...new Set(substitutes.split(',').map(sku => sku.trim()).filter(Boolean))]
  const valid = Boolean(accountId && fromSku.trim() && skus.length && wholeNonnegative(cost) && wholeNonnegative(contacts) && reason.trim() && consent)

  useEffect(() => { setConsent(false) }, [accountId, cost, contacts, fromSku, substitutes])
  useEffect(() => {
    setCredential(null); setNotice(''); setError(''); setCost(''); setContacts(''); setFromSku(''); setSubstitutes(''); setReason('')
  }, [accountId])
  useEffect(() => {
    let current = true
    setGrants(null); setError('')
    if (!accountId) { setLoading(false); return }
    setLoading(true)
    void request<{ grants: Grant[] }>(`/api/barrow/proposal-grants?${new URLSearchParams({ accountId })}`)
      .then(result => { if (current) setGrants(result.grants) })
      .catch(cause => { if (current) setError(errorMessage(cause)) })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [accountId, reload])

  async function create() {
    if (lock.current || !valid) return
    const target = accountId
    lock.current = true; setBusy(true); setError(''); setNotice(''); setCredential(null)
    try {
      const result = await request<Credential>('/api/barrow/proposal-grants', {
        accountId: target, costLimitCents: Number(cost), contactLimit: Number(contacts),
        approvedSubstitutes: [{ fromSku: fromSku.trim(), skus }], consent: true, reason: reason.trim(),
      })
      if (selectedAccount.current === target) { setCredential(result); setConsent(false); setReload(value => value + 1) }
    } catch (cause) { if (selectedAccount.current === target) setError(errorMessage(cause)) }
    finally { lock.current = false; setBusy(false) }
  }
  async function revoke(grant: Grant, revocationReason: string) {
    if (lock.current) return
    const target = accountId
    lock.current = true; setBusy(true); setError(''); setNotice('')
    if (credential?.grant.id === grant.id) setCredential(null)
    try {
      await request('/api/barrow/proposal-grants/revoke', { grantId: grant.id, revision: grant.revision, reason: revocationReason })
      if (selectedAccount.current === target) { setNotice('Proposal grant revoked. Its credential can no longer submit proposals.'); setReload(value => value + 1) }
    } catch (cause) { if (selectedAccount.current === target) setError(errorMessage(cause)) }
    finally { lock.current = false; setBusy(false) }
  }

  return <section className="br-card br-stack" aria-label="External agent proposal grants">
    <h3>Let an external agent propose replacements</h3>
    <p>Choose one account and its allowed substitute SKUs. This credential permits proposal submission only. A signed-in manager reviews each exact basket before offering it; buyer acceptance and separate human execution are required.</p>
    <p className="br-quiet-text">Barrow makes no model calls and spends zero on model inference. External agents report their own costs. The reported-cost cap controls proposal admission in Barrow; it cannot control inference purchased independently by an external agent. Three contact allowances are reserved before an offer, including its potential confirmation emails; unused allowances are not refunded.</p>
    {!accountId && <p>Choose a trade account to review or create its proposal grants.</p>}
    {error && <Notice error>{error}</Notice>}{notice && <Notice>{notice}</Notice>}
    <form className="br-stack" onSubmit={event => { event.preventDefault(); void create() }}>
      <fieldset className="br-stack" disabled={busy || !accountId}>
        <legend>Account-scoped proposal permission</legend>
        <p style={{ overflowWrap: 'anywhere' }}>Account: {accountId || 'none selected'}</p>
        <div className="br-form-grid">
          <label>Original SKU<input required maxLength={160} value={fromSku} onChange={event => setFromSku(event.target.value)} /></label>
          <label>Allowed replacement SKUs, separated by commas<input required value={substitutes} onChange={event => setSubstitutes(event.target.value)} /></label>
          <label>Reported external cost limit (USD cents)<input required type="number" min="0" step="1" inputMode="numeric" value={cost} onChange={event => setCost(event.target.value)} /></label>
          <label>Buyer contact limit<input required type="number" min="0" step="1" inputMode="numeric" value={contacts} onChange={event => setContacts(event.target.value)} /></label>
        </div>
        <label>Owner’s reason for granting this permission<textarea required maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></label>
        <label><input type="checkbox" style={{width:20,minHeight:20,verticalAlign:"middle",marginRight:8}} checked={consent} onChange={event => setConsent(event.target.checked)} />I authorize external proposal submission for account {accountId || '(choose an account)'}, only {fromSku.trim() || '(original SKU)'} → {skus.join(', ') || '(replacement SKUs)'}, with a reported external cost cap of {wholeNonnegative(cost) ? money(Number(cost)) : '(set a cap)'} and {wholeNonnegative(contacts) ? contacts : '(set a limit)'} buyer contacts. Offers and execution remain separately reviewed human actions.</label>
        <div className="br-actions"><button disabled={!valid || busy}>Create private proposal credential</button></div>
      </fieldset>
    </form>
    {credential && credential.grant.accountId === accountId && <div className="br-stack">
      <Notice>Copy this private credential now and share it only with your external agent. It is displayed once and cleared when you hide it, change accounts or leave this page.</Notice>
      <label>Private proposal credential<input readOnly type="password" autoComplete="off" value={credential.token} onFocus={event => event.currentTarget.select()} /></label>
      <p>Expires {expires(credential.expiresAt)}.</p>
      <div className="br-actions"><button className="br-secondary" onClick={() => {
        void navigator.clipboard.writeText(credential.token).then(() => setNotice('Credential copied. Keep it private.')).catch(() => setError('Clipboard is unavailable. Select and copy the credential field.'))
      }}>Copy proposal credential</button><button className="br-quiet" onClick={() => setCredential(null)}>Hide credential</button></div>
    </div>}
    <h4>This account’s proposal grants</h4>
    <div className="br-actions"><button className="br-secondary" disabled={!accountId || busy || loading} onClick={() => setReload(value => value + 1)}>Refresh proposal grants</button></div>
    {loading && <p role="status">Loading private proposal grants…</p>}
    {grants?.length === 0 && <p>No proposal grants have been created for this account.</p>}
    {grants?.filter(grant => grant.accountId === accountId).map(grant => <GrantHistory key={`${grant.id}:${grant.revision}`} grant={grant} busy={busy || loading} revoke={revoke} />)}
  </section>
}
