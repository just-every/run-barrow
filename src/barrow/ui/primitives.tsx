import { useEffect, useRef, useState, type ReactNode } from 'react'
import { request, errorMessage } from './api'
import { AccountPages, useAccountPage } from './account-pages'
import type { Account } from './types'

// A small size matrix, one cell filled: the pad's own motif for a place with nothing in it yet.
export function Empty({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return <div className="br-empty"><svg className="br-empty-motif" viewBox="0 0 92 52" aria-hidden="true">{[0, 1, 2, 3].flatMap(column => [0, 1].map(row => <rect key={`${column}-${row}`} x={2 + column * 23} y={2 + row * 25} width="19" height="21" rx="4" className={column === 1 && row === 0 ? 'br-empty-filled' : undefined} />))}</svg><h3>{title}</h3><p>{children}</p>{actions && <div className="br-actions br-empty-actions">{actions}</div>}</div>
}

export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <div className={`br-notice${error ? ' br-error' : ''}`} role={error ? 'alert' : 'status'}>{children}</div>
}

export function AccountPicker({ accounts, value, onChange, empty='Choose an account' }: { accounts: Account[]; value: string; onChange: (value: string) => void; empty?:string }) {
  const directory=useAccountPage(),[selected,setSelected]=useState<Account|null>(null),[error,setError]=useState('')
  useEffect(()=>{
    let current=true;setError('');setSelected(null)
    if(value)void request<Account>(`/api/barrow/accounts/by-id/${encodeURIComponent(value)}`).then(row=>{if(current)setSelected(row)}).catch(cause=>{if(current)setError(errorMessage(cause))})
    return ()=>{current=false}
  },[value,accounts])
  const rows=directory.result?.accounts??[],chosen=selected??accounts.find(row=>row.id===value)
  const options=chosen&&!rows.some(row=>row.id===value)?[chosen,...rows]:rows
  return <div className="br-stack" role="group" aria-label="Trade account selection">
    <AccountPages directory={directory}/>
    {error&&<p role="alert">{error}</p>}
    <label>Trade account<select aria-label="Trade account" value={value} disabled={directory.loading} onChange={event=>onChange(event.target.value)}>
      <option value="">{empty}</option>
      {options.map(account=><option key={account.id} value={account.id}>{account.value.name}</option>)}
    </select></label>
  </div>
}

export function JsonDetail({ value, label = 'Details' }: { value: unknown; label?: string }) {
  if (value === undefined || value === null) return null
  return <details className="br-details"><summary>{label}</summary><pre>{JSON.stringify(value, null, 2)}</pre></details>
}

export interface FieldProblem { id: string; label: string; message: string }

/** Keep typing in the field; move to the summary only after an explicit validation attempt. */
export function ErrorSummary({ problems, attempt = 0, className = '' }: { problems: FieldProblem[]; attempt?: number; className?: string }) {
  const summary = useRef<HTMLDivElement>(null)
  useEffect(() => { if (attempt) summary.current?.focus() }, [attempt])
  if (!problems.length) return null
  return <div ref={summary} tabIndex={-1} className={`br-notice br-error br-error-summary ${className}`} role="region" aria-label="Review these problems">
    <strong>Review these problems</strong>
    <ul>{problems.map(problem => <li key={problem.id}><a href={`#${encodeURIComponent(problem.id)}`} onClick={event => {
      event.preventDefault()
      const field = document.getElementById(problem.id)
      for (let parent = field?.parentElement; parent; parent = parent.parentElement) if (parent instanceof HTMLDetailsElement) parent.open = true
      field?.focus()
      field?.scrollIntoView({ block: 'center' })
    }}>{problem.label}: {problem.message}</a></li>)}</ul>
  </div>
}
