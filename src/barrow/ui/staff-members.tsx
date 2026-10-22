import { useEffect, useState } from 'react'
import { errorMessage, request } from './api'
import { Notice } from './primitives'
import { emptyStaffPolicy, StaffPolicyFields, staffPolicyForm, staffPolicyValue, staffReports, staffRoles, validStaffPolicy, type StaffPolicy } from './staff-policy-fields'
import { money, type Account, type RunCommand } from './types'

export type StaffMember = StaffPolicy & { userId: string; email: string; name: string; status: string; revision: string; state: string; effective:boolean; nativeVersion: number | string }
const revoked = (member: StaffMember) => ['revoked', 'removed'].includes(member.state)

export function StaffMembers({ accounts, version, run, busy }: { accounts: Account[]; version: unknown; run: RunCommand; busy: boolean }) {
  const [members, setMembers] = useState<StaffMember[] | null>(null), [error, setError] = useState(''), [refresh, setRefresh] = useState(0)
  const [editing, setEditing] = useState<StaffMember | null>(null), [form, setForm] = useState(emptyStaffPolicy)
  const [email, setEmail] = useState(''), [name, setName] = useState(''), [reason, setReason] = useState('')
  const [directory, setDirectory] = useState<Account[]>(accounts)
  useEffect(() => {
    let current = true
    setError('')
    void request<{ members: StaffMember[] }>('/api/barrow/staff/members').then(value => { if (current) setMembers(value.members) }).catch(cause => { if (current) { setMembers(null); setError(errorMessage(cause)) } })
    return () => { current = false }
  }, [version, refresh])
  useEffect(() => {
    let current = true
    const ids = [...new Set((members ?? []).flatMap(member => member.accounts === 'all' ? [] : member.accounts))]
    const missing = ids.filter(id => !accounts.some(account => account.id === id))
    void Promise.all(missing.map(id => request<Account>(`/api/barrow/accounts/by-id/${encodeURIComponent(id)}`))).then(rows => { if (current) setDirectory([...accounts, ...rows]) }).catch(cause => { if (current) { setDirectory(accounts); setError(errorMessage(cause)) } })
    return () => { current = false }
  }, [members, accounts])
  const reset = () => { setEditing(null); setForm(emptyStaffPolicy()); setName(''); setEmail(''); setReason('') }
  async function save() {
    if (!validStaffPolicy(form) || !reason.trim()) return
    const saved = await run(editing ? 'staff.update' : 'staff.invite', { ...(editing ? { userId: editing.userId, revision: editing.revision } : { email: email.trim(), name: name.trim() }), policy: staffPolicyValue(form), reason: reason.trim() })
    if (saved) { reset(); setRefresh(value => value + 1) }
  }
  const accountName = (id: string) => directory.find(account => account.id === id)?.value.name ?? id
  return <section className="br-stack" aria-labelledby="staff-team-title">
    <div className="br-card br-stack"><h2 id="staff-team-title">Team access</h2>
      <p>Only the owner can invite staff, change functional access or revoke a grant. Each invitation uses the person’s exact email and native sign-in. Staff access applies on their next request.</p>
      {error && <Notice error>{error}<div><button type="button" className="br-quiet" disabled={busy} onClick={() => setRefresh(value => value + 1)}>Refresh team</button></div></Notice>}
      {members === null && !error && <p role="status">Loading team access…</p>}
      {members && <><h3>Saved staff roster</h3>{!members.length && <p>No staff grants yet.</p>}
        {members.map(member => <article className="br-card br-stack" key={member.userId}>
          <h3>{member.name || member.email}</h3><p>{member.email} · <span className="br-badge">{staffRoles[member.role]}</span></p>
          <p>Native sign-in: {member.status} · Staff grant: {member.state}</p><p>Effective supplier access: {member.effective?'Yes':'No'}</p>
          <dl><dt>Accounts</dt><dd>{member.accounts === 'all' ? 'All trade accounts' : member.accounts.map(accountName).join(', ') || 'None'}</dd>
            <dt>Warehouses</dt><dd>{member.warehouses === 'all' ? 'All warehouses' : member.warehouses.join(', ') || 'None'}</dd>
            <dt>Applications</dt><dd>{member.entitlements?.map(right=>right==='applications'?'Review and documents':'Read-only documents').join(', ') || 'None'}</dd>
            <dt>Reports</dt><dd>{member.reports.map(report => staffReports[report]).join(', ') || 'None'}</dd>
            <dt>Discount approval allowance</dt><dd>{money(member.discountLimitCents)}</dd>
            <dt>Stock exception allowance</dt><dd>{money(member.stockExceptionLimitCents)}</dd>
            <dt>Fixed commission attribution</dt><dd>{member.commissionRep || 'None'}</dd>
          </dl>
          <details className="br-details"><summary>Saved revision</summary><p>Grant revision: {member.revision}</p><p>Native identity version: {member.nativeVersion}</p></details>
          {!revoked(member) && <div className="br-actions"><button type="button" className="br-secondary" disabled={busy} onClick={() => { setEditing(member); setForm(staffPolicyForm(member)); setReason('') }}>Edit access for {member.name || member.email}</button></div>}
        </article>)}
      </>}
    </div>
    {members && <form className="br-card br-stack" aria-label={editing ? 'Edit staff access' : 'Invite staff'} onSubmit={event => { event.preventDefault(); void save() }}>
      <h2>{editing ? `Edit ${editing.name || editing.email}` : 'Invite a team member'}</h2>
      {editing ? <><p>{editing.email}</p><p className="br-quiet-text">Editing saved revision {editing.revision}. A concurrent change requires reloading this person’s saved access.</p></> : <div className="br-form-grid">
        <label>Staff name<input required maxLength={120} autoComplete="name" value={name} onChange={event => setName(event.target.value)} /></label>
        <label>Exact staff email<input required type="email" maxLength={254} autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} /></label>
      </div>}
      <fieldset className="br-stack" disabled={busy} aria-label="Staff grant details"><StaffPolicyFields form={form} setForm={setForm} accounts={directory} />
        <label>Reason for this access change<textarea required maxLength={1000} rows={3} value={reason} onChange={event => setReason(event.target.value)} /></label>
      </fieldset>
      <div className="br-actions"><button disabled={busy || !validStaffPolicy(form) || !reason.trim()}>{editing ? 'Save staff access' : 'Send native staff invitation'}</button>
        {editing && <><button type="button" className="br-secondary" disabled={busy} onClick={reset}>Cancel edit</button>
          <button type="button" className="br-danger" disabled={busy || !reason.trim()} onClick={() => void run('staff.revoke', { userId: editing.userId, revision: editing.revision, reason: reason.trim() }).then(done => { if (done) { reset(); setRefresh(value => value + 1) } })}>Revoke staff access</button></>}
      </div>
      <p className="br-quiet-text">The invitation requests native membership with only the functional policy shown here. Native sign-in and grant status appear in the roster. Invitation delivery is not confirmed here. No installation or grant powers are included.</p>
    </form>}
  </section>
}
