import type { ReactNode } from 'react'
import type { Account } from './types'

export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return <div className="br-empty"><span className="br-empty-motif" aria-hidden="true" /><h3>{title}</h3><p>{children}</p></div>
}

export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <div className={`br-notice${error ? ' br-error' : ''}`} role={error ? 'alert' : 'status'}>{children}</div>
}

export function AccountPicker({ accounts, value, onChange }: { accounts: Account[]; value: string; onChange: (value: string) => void }) {
  return <label>Trade account<select value={value} onChange={event => onChange(event.target.value)}>
    <option value="">Choose an account</option>
    {accounts.map(account => <option key={account.id} value={account.id}>{account.value.name}</option>)}
  </select></label>
}

export function JsonDetail({ value, label = 'Details' }: { value: unknown; label?: string }) {
  if (value === undefined || value === null) return null
  return <details className="br-details"><summary>{label}</summary><pre>{JSON.stringify(value, null, 2)}</pre></details>
}
