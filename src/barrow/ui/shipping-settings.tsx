import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { ShippingMethod } from '../shipping-rules'
import { request, errorMessage } from './api'
import { Notice } from './primitives'
import { money } from './types'

type Settings = { revision: string | null; methods: ShippingMethod[] }
const empty = {
  id: '', name: '', kind: 'parcel' as ShippingMethod['kind'], accountIds: '', states: '', warehouses: '',
  minCents: '0', maxCents: '', baseCents: '0', handlingCents: '0', freeOverCents: '',
  transitMinDays: '0', transitMaxDays: '0', quoteRequired: false,
}
type MethodForm = typeof empty
const separated = (value: string) => [...new Set(value.split(',').map(part => part.trim()).filter(Boolean))]
const kindNames: Record<ShippingMethod['kind'], string> = { pickup: 'Pickup', parcel: 'Parcel', freight: 'Freight', 'own-carrier': 'Buyer’s own carrier' }

export function ShippingSettings() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [methods, setMethods] = useState<ShippingMethod[]>([])
  const [form, setForm] = useState<MethodForm>(empty)
  const [editing, setEditing] = useState<string | null>(null)
  const [open, setOpen] = useState(false), [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [reload, setReload] = useState(0)
  const lock = useRef(false)
  useEffect(() => {
    let current = true
    setError('')
    void request<Settings>('/api/barrow/shipping/settings').then(value => {
      if (current) { setSettings(value); setMethods(value.methods); setDirty(false) }
    }).catch(error => { if (current) setError(errorMessage(error)) })
    return () => { current = false }
  }, [reload])

  function edit(method: ShippingMethod) {
    setEditing(method.id); setOpen(true); setNotice(''); setError('')
    setForm({ ...method, accountIds: method.accountIds.join(', '), states: method.states.join(', '), warehouses: method.warehouses.join(', '),
      minCents: String(method.minCents), maxCents: method.maxCents === null ? '' : String(method.maxCents), baseCents: String(method.baseCents),
      handlingCents: String(method.handlingCents), freeOverCents: method.freeOverCents === null ? '' : String(method.freeOverCents),
      transitMinDays: String(method.transitMinDays), transitMaxDays: String(method.transitMaxDays) })
  }
  function stage(event: FormEvent) {
    event.preventDefault(); setError(''); setNotice('')
    const method: ShippingMethod = { ...form, id: form.id.trim(), name: form.name.trim(), accountIds: separated(form.accountIds),
      states: separated(form.states).map(state => state.toUpperCase()), warehouses: separated(form.warehouses),
      minCents: Number(form.minCents), maxCents: form.maxCents === '' ? null : Number(form.maxCents),
      baseCents: Number(form.baseCents), handlingCents: Number(form.handlingCents), freeOverCents: form.freeOverCents === '' ? null : Number(form.freeOverCents),
      transitMinDays: Number(form.transitMinDays), transitMaxDays: Number(form.transitMaxDays) }
    if (methods.some(item => item.id === method.id && item.id !== editing)) { setError('Use a different delivery method ID; that ID already exists.'); return }
    if (method.maxCents !== null && method.maxCents < method.minCents) { setError('The maximum order amount must be at least the minimum.'); return }
    if (method.transitMaxDays < method.transitMinDays) { setError('The latest delivery day must be at least the earliest day.'); return }
    setMethods(current => editing ? current.map(item => item.id === editing ? method : item) : [...current, method])
    setDirty(true); setOpen(false); setEditing(null); setForm(empty)
  }
  async function save() {
    if (!settings || lock.current) return
    lock.current = true; setBusy(true); setError(''); setNotice('')
    try {
      await request('/api/barrow/commands', { type: 'shipping.settings', payload: { revision: settings.revision, methods } })
      const value = await request<Settings>('/api/barrow/shipping/settings')
      setSettings(value); setMethods(value.methods); setDirty(false); setNotice('Delivery settings saved.')
    } catch (error) { setError(errorMessage(error)) }
    finally { lock.current = false; setBusy(false) }
  }
  const field = (key: Exclude<keyof MethodForm, 'kind' | 'quoteRequired'>, label: string, numeric = false, optional = false) =>
    <label>{label}<input value={form[key]} type={numeric ? 'number' : 'text'} min={numeric ? 0 : undefined} step={numeric ? 1 : undefined}
      required={!optional} disabled={busy || (key === 'id' && editing !== null)} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))} /></label>

  return <section className="br-card br-stack" aria-label="Delivery settings"><h2>Delivery settings</h2>
    <p>Configure pickup, parcel, freight and buyer-carrier options. Amounts are whole USD cents; 1500 means USD 15.00. Windows use calendar days.</p>
    {error && <Notice error>{error}</Notice>}{notice && <Notice>{notice}</Notice>}
    {!settings && !error && <p role="status">Loading delivery settings…</p>}
    {!settings && error && <div className="br-actions"><button type="button" className="br-secondary" onClick={() => setReload(value => value + 1)}>Reload delivery settings</button></div>}
    {settings && <>
      {!methods.length && <p>No delivery methods configured.</p>}
      <ul className="br-stack">{methods.map(method => <li key={method.id}>
        <strong>{method.name}</strong> · {kindNames[method.kind]} · {method.quoteRequired ? 'Supplier quote required' : `${money(method.baseCents)} delivery`} · {money(method.handlingCents)} handling
        <p className="br-quiet-text">{method.transitMinDays}–{method.transitMaxDays} calendar days · accounts: {method.accountIds.join(', ') || 'all'} · states: {method.states.join(', ') || 'all'} · warehouses: {method.warehouses.join(', ') || 'all'}</p>
        <p className="br-quiet-text">Orders from {money(method.minCents)}{method.maxCents === null ? ', no maximum' : ` to ${money(method.maxCents)}`}{method.freeOverCents !== null && ` · free delivery threshold ${money(method.freeOverCents)}`}</p>
        <div className="br-actions"><button type="button" className="br-secondary" disabled={busy || open} onClick={() => edit(method)}>Edit {method.name}</button>
          <button type="button" className="br-quiet" disabled={busy || open} onClick={() => { setMethods(current => current.filter(item => item.id !== method.id)); setDirty(true); setNotice('') }}>Remove {method.name}</button></div>
      </li>)}</ul>
      {!open && <div className="br-actions"><button type="button" className="br-secondary" disabled={busy} onClick={() => { setForm(empty); setEditing(null); setOpen(true); setNotice('') }}>Add delivery method</button></div>}
      {open && <form className="br-stack" aria-label={editing ? 'Edit delivery method' : 'Add delivery method'} onSubmit={stage}>
        <h3>{editing ? 'Edit delivery method' : 'Add delivery method'}</h3>
        <div className="br-form-grid">{field('id', 'Method ID')}{field('name', 'Buyer-facing name')}
          <label>Delivery kind<select value={form.kind} disabled={busy} onChange={event => setForm(current => ({ ...current, kind: event.target.value as ShippingMethod['kind'] }))}>
            {Object.entries(kindNames).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select></label>
          {field('accountIds', 'Account IDs (comma-separated; blank for all)', false, true)}
          {field('states', 'State codes (comma-separated; blank for all)', false, true)}
          {field('warehouses', 'Warehouses (comma-separated; blank for all)', false, true)}
          {field('minCents', 'Minimum order (USD cents)', true)}{field('maxCents', 'Maximum order (USD cents; blank for none)', true, true)}
          {field('baseCents', 'Delivery charge (USD cents)', true)}{field('handlingCents', 'Handling charge (USD cents)', true)}
          {field('freeOverCents', 'Free delivery threshold (USD cents; blank for none)', true, true)}
          {field('transitMinDays', 'Earliest delivery (calendar days)', true)}{field('transitMaxDays', 'Latest delivery (calendar days)', true)}</div>
        <label><input type="checkbox" checked={form.quoteRequired} disabled={busy} onChange={event => setForm(current => ({ ...current, quoteRequired: event.target.checked }))} /> Require a supplier quote before buyer acceptance</label>
        <div className="br-actions"><button disabled={busy}>{editing ? 'Apply method changes' : 'Add method to settings'}</button><button type="button" className="br-secondary" disabled={busy} onClick={() => { setOpen(false); setEditing(null); setForm(empty) }}>Cancel method edit</button></div>
      </form>}
      {dirty && <p role="status">Delivery settings have unsaved changes.</p>}
      <div className="br-actions"><button type="button" disabled={busy || !dirty || open} onClick={() => void save()}>{busy ? 'Saving delivery settings…' : 'Save delivery settings'}</button></div>
    </>}
  </section>
}
