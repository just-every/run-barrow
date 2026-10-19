import type { ReactNode } from 'react'
import type { Account } from './types'

// A small size matrix, one cell filled: the pad's own motif for a place with nothing in it yet.
export function Empty({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return <div className="br-empty"><svg className="br-empty-motif" viewBox="0 0 92 52" aria-hidden="true">{[0, 1, 2, 3].flatMap(column => [0, 1].map(row => <rect key={`${column}-${row}`} x={2 + column * 23} y={2 + row * 25} width="19" height="21" rx="4" className={column === 1 && row === 0 ? 'br-empty-filled' : undefined} />))}</svg><h3>{title}</h3><p>{children}</p>{actions && <div className="br-actions br-empty-actions">{actions}</div>}</div>
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
