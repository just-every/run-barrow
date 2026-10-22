import { useState } from 'react'
import { AccountPicker } from './primitives'
import type { Account } from './types'

export const staffRoles = { 'sales-manager': 'Sales manager', rep: 'Sales rep', operations: 'Operations', finance: 'Finance', analyst: 'Analyst' } as const
export const staffReports = { sales: 'Sales', finance: 'Invoice aging', quotes: 'Quote conversion', fulfillment: 'Fulfillment', commissions: 'Commissions' } as const
export type StaffPolicy = {
  role: keyof typeof staffRoles
  accounts: 'all' | string[]
  warehouses: 'all' | string[]
  entitlements?: ('applications' | 'application-documents')[]
  reports: (keyof typeof staffReports)[]
  discountLimitCents: number
  stockExceptionLimitCents: number
  commissionRep?: string
}
export type StaffPolicyForm = Omit<StaffPolicy, 'role' | 'discountLimitCents' | 'stockExceptionLimitCents'> & {
  role: StaffPolicy['role'] | ''; discountLimitCents: string; stockExceptionLimitCents: string
}
export const emptyStaffPolicy = (): StaffPolicyForm => ({ role: '', accounts: [], warehouses: [], reports: [], discountLimitCents: '0', stockExceptionLimitCents: '0', commissionRep: '' })
export const staffPolicyForm = (policy: StaffPolicy): StaffPolicyForm => ({ ...policy, discountLimitCents: String(policy.discountLimitCents), stockExceptionLimitCents: String(policy.stockExceptionLimitCents) })
export const staffPolicyValue = (form: StaffPolicyForm): StaffPolicy => ({
  ...(form.entitlements?.length ? {entitlements:form.entitlements} : {}),
  role: form.role as StaffPolicy['role'], accounts: form.accounts, warehouses: form.warehouses, reports: form.reports,
  discountLimitCents: Number(form.discountLimitCents), stockExceptionLimitCents: Number(form.stockExceptionLimitCents),
  ...(form.commissionRep?.trim() ? { commissionRep: form.commissionRep.trim() } : {}),
})
export const validStaffPolicy = (form: StaffPolicyForm) => Boolean(form.role) && [form.discountLimitCents, form.stockExceptionLimitCents].every(value => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)))

export function StaffPolicyFields({ form, setForm, accounts }: { form: StaffPolicyForm; setForm: (form: StaffPolicyForm) => void; accounts: Account[] }) {
  const [accountId, setAccountId] = useState(''), [warehouse, setWarehouse] = useState('')
  const change = (patch: Partial<StaffPolicyForm>) => setForm({ ...form, ...patch })
  const warehouses = [...new Set(accounts.flatMap(account => account.value.warehouses ?? []))].sort()
  return <fieldset className="br-stack"><legend>Functional staff access</legend>
    <p>Choose every scope explicitly. No selection means no access; zero allowances permit no exception. Functional roles do not grant installation settings or authority to grant access.</p>
    <label>Functional role<select aria-label="Functional role" required value={form.role} onChange={event => change({ role: event.target.value as StaffPolicyForm['role'], entitlements: [] })}>
      <option value="">Choose a functional role</option>{Object.entries(staffRoles).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
    </select></label>
    <fieldset className="br-stack"><legend>Trade accounts</legend>
      <label><input type="checkbox" checked={form.accounts === 'all'} onChange={event => change({ accounts: event.target.checked ? 'all' : [], entitlements: [] })} />All trade accounts, including future accounts</label>
      {form.accounts !== 'all' && <>
        <AccountPicker accounts={accounts} value={accountId} onChange={setAccountId} />
        <div className="br-actions"><button type="button" className="br-secondary" disabled={!accountId || form.accounts.includes(accountId)} onClick={() => { if (form.accounts !== 'all') change({ accounts: [...form.accounts, accountId] }); setAccountId('') }}>Add scoped account</button></div>
        {!form.accounts.length && <p className="br-quiet-text">No trade accounts granted.</p>}
        <ul>{form.accounts.map(id => <li key={id}>{accounts.find(account => account.id === id)?.value.name ?? id} <button type="button" className="br-quiet" aria-label={`Remove account ${accounts.find(account => account.id === id)?.value.name ?? id}`} onClick={() => change({ accounts: (form.accounts as string[]).filter(value => value !== id) })}>Remove</button></li>)}</ul>
      </>}
    </fieldset>
    <fieldset className="br-stack"><legend>Warehouses</legend>
      <label><input type="checkbox" checked={form.warehouses === 'all'} onChange={event => change({ warehouses: event.target.checked ? 'all' : [] })} />All warehouses, including future warehouses</label>
      {form.warehouses !== 'all' && <>
        <label>Exact warehouse name<input value={warehouse} maxLength={160} list="staff-warehouse-names" onChange={event => setWarehouse(event.target.value)} /></label>
        <datalist id="staff-warehouse-names">{warehouses.map(name => <option key={name} value={name} />)}</datalist>
        <div className="br-actions"><button type="button" className="br-secondary" disabled={!warehouse.trim() || form.warehouses.includes(warehouse.trim())} onClick={() => { if (form.warehouses !== 'all') change({ warehouses: [...form.warehouses, warehouse.trim()] }); setWarehouse('') }}>Add scoped warehouse</button></div>
        {!form.warehouses.length && <p className="br-quiet-text">No warehouses granted.</p>}
        <ul>{form.warehouses.map(name => <li key={name}>{name} <button type="button" className="br-quiet" aria-label={`Remove warehouse ${name}`} onClick={() => change({ warehouses: (form.warehouses as string[]).filter(value => value !== name) })}>Remove</button></li>)}</ul>
      </>}
    </fieldset>
    <fieldset className="br-stack"><legend>Application entitlements</legend>
      {form.role === 'sales-manager' && form.accounts === 'all' ? <label><input type="checkbox" checked={form.entitlements?.includes('applications') ?? false} onChange={event => change({entitlements:event.target.checked?['applications']:[]})}/>Review trade applications and download their documents</label>
      : form.role === 'finance' ? <label><input type="checkbox" checked={form.entitlements?.includes('application-documents') ?? false} onChange={event => change({entitlements:event.target.checked?['application-documents']:[]})}/>Read application documents for certificate review</label>
      : <p>Application review requires a sales manager covering all accounts. Finance may receive read-only document access.</p>}
    </fieldset>
    <fieldset className="br-stack"><legend>Direct report entitlements</legend>{Object.entries(staffReports).map(([key, name]) => {
      const report = key as StaffPolicy['reports'][number]
      return <label key={key}><input type="checkbox" checked={form.reports.includes(report)} onChange={event => change({ reports: event.target.checked ? [...form.reports, report] : form.reports.filter(value => value !== report) })} />{name}</label>
    })}</fieldset>
    <div className="br-form-grid">
      <label>Discount approval allowance (USD cents)<input required type="number" min={0} step={1} value={form.discountLimitCents} onChange={event => change({ discountLimitCents: event.target.value })} /></label>
      <label>Stock exception allowance (USD cents)<input required type="number" min={0} step={1} value={form.stockExceptionLimitCents} onChange={event => change({ stockExceptionLimitCents: event.target.value })} /></label>
      <label>Fixed commission rep label (optional)<input maxLength={160} value={form.commissionRep ?? ''} onChange={event => change({ commissionRep: event.target.value })} /></label>
    </div>
    <p className="br-quiet-text">A commission label fixes attribution for this sign-in; it does not expand account or report access. Staff do not receive automatic outreach authority.</p>
  </fieldset>
}
