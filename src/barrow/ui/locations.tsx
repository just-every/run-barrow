import { useEffect, useState, type FormEvent } from 'react'
import { request } from './api'
import { AccountPicker } from './primitives'
import type { Account, RunCommand } from './types'
import type { Location, LocationKind } from '../locations'

const blank = { name: '', line1: '', line2: '', city: '', state: '', zip: '', deliveryInstructions: '', exemptionReference: '', email: '', phone: '', role: '' }

/** ACC-003: one account's active locations, refreshed whenever the workspace reloads. */
export function useLocations(accountId: string, version: unknown) {
  const [locations, setLocations] = useState<Location[]>([])
  useEffect(() => {
    let current = true
    if (!accountId) { setLocations([]); return }
    void request<{ locations: Location[] }>(`/api/barrow/locations?${new URLSearchParams({ accountId })}`).then(value => { if (current) setLocations(value.locations) }).catch(() => { if (current) setLocations([]) })
    return () => { current = false }
  }, [accountId, version])
  return locations
}

// ACC-003: bill-to, ship-to and contact records. Orders keep a copy of the addresses they used.
export function Locations({ accounts, busy, run, version }: { accounts: Account[]; busy: boolean; run: RunCommand; version: unknown }) {
  const [accountId, setAccountId] = useState(accounts.length === 1 ? accounts[0].id : '')
  const [kind, setKind] = useState<LocationKind>('ship-to'), [form, setForm] = useState(blank), [makeDefault, setMakeDefault] = useState(false)
  const locations = useLocations(accountId, version)
  const field = (name: keyof typeof blank, label: string, extra: Record<string, unknown> = {}) => <label>{label}<input value={form[name]} disabled={busy} onChange={event => setForm(value => ({ ...value, [name]: event.target.value }))} {...extra} /></label>
  async function save(event: FormEvent) {
    event.preventDefault()
    const value = kind === 'contact' ? { name: form.name, email: form.email, phone: form.phone, role: form.role }
      : { name: form.name, line1: form.line1, line2: form.line2, city: form.city, state: form.state, zip: form.zip, ...(kind === 'ship-to' ? { deliveryInstructions: form.deliveryInstructions, ...(form.exemptionReference.trim() ? { exemption: { reference: form.exemptionReference, state: form.state } } : {}) } : {}) }
    if (await run('location.save', { accountId, kind, value, makeDefault })) { setForm(blank); setMakeDefault(false) }
  }
  return <div className="br-card br-stack" aria-label="Locations"><h2>Billing and delivery locations</h2>
    {accounts.length > 0 && <AccountPicker accounts={accounts} value={accountId} onChange={setAccountId} />}
    {accountId && <>
      {locations.length === 0 && <p>No locations yet. Orders use a delivery label until you add a ship-to.</p>}
      <ul className="br-stack">{locations.filter(location => !location.archived).map(location => <li key={location.id}>
        <strong>{location.kind === 'bill-to' ? 'Bill-to' : location.kind === 'ship-to' ? 'Ship-to' : 'Contact'}{location.isDefault && ' · default'}</strong> · {location.value.name}
        {location.kind === 'contact' ? <> · {[location.value.role, location.value.email, location.value.phone].filter(Boolean).join(' · ')}</> : <> · {location.value.line1}{location.value.line2 && `, ${location.value.line2}`}, {location.value.city}, {location.value.state} {location.value.zip}</>}
        {location.value.deliveryInstructions && <p>Delivery: {location.value.deliveryInstructions}</p>}
        {location.kind === 'ship-to' && <p className="br-quiet-text">Tax jurisdiction: US-{location.value.state} (state only; no tax calculated){location.value.exemption && ` · exemption ${location.value.exemption.reference} (${location.value.exemption.state}), recorded, not validated`}</p>}
        <div className="br-actions">{location.kind !== 'contact' && !location.isDefault && <button type="button" className="br-secondary" disabled={busy} onClick={() => void run('location.save', { accountId, id: location.id, revision: location.revision, value: location.value, makeDefault: true })}>Make default</button>}
          <button type="button" className="br-secondary" disabled={busy} onClick={() => void run('location.archive', { accountId, id: location.id, revision: location.revision })}>Archive</button></div>
      </li>)}</ul>
      <form className="br-stack" aria-label="Add a location" onSubmit={event => void save(event)}>
        <label>Kind<select value={kind} disabled={busy} onChange={event => setKind(event.target.value as LocationKind)}><option value="ship-to">Ship-to</option><option value="bill-to">Bill-to</option><option value="contact">Contact</option></select></label>
        <div className="br-form-grid">{field('name', kind === 'contact' ? 'Contact name' : 'Location name', { required: true })}
          {kind === 'contact' ? <>{field('role', 'Role')}{field('email', 'Email', { type: 'email' })}{field('phone', 'Phone')}</>
            : <>{field('line1', 'Address line 1', { required: true })}{field('line2', 'Address line 2')}{field('city', 'City', { required: true })}{field('state', 'State (two letters)', { required: true, maxLength: 2 })}{field('zip', 'ZIP code', { required: true })}
              {kind === 'ship-to' && <>{field('deliveryInstructions', 'Default delivery instructions')}{field('exemptionReference', 'Tax exemption reference (this state)')}</>}</>}</div>
        {kind !== 'contact' && <><label><input type="checkbox" checked={makeDefault} disabled={busy} onChange={event => setMakeDefault(event.target.checked)} /> Make this the default {kind}</label>
          <p className="br-quiet-text">Barrow checks the address format, state code and ZIP range; it does not verify the address with USPS or a carrier.</p></>}
        <div className="br-actions"><button disabled={busy}>Add {kind}</button></div>
      </form>
    </>}
    {!accountId && accounts.length > 1 && <p className="br-quiet-text">Choose a trade account to see its locations.</p>}
  </div>
}
