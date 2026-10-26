import { useEffect, useState } from 'react'
import { request, errorMessage } from './api'
import { AccountPicker, Notice } from './primitives'
import { money } from './types'
import type { Account } from './types'

type StatementEntry = { orderId: string; orderPath: string; date: string; amountCents: number } & ({ kind: 'invoice'; number: string; dueAt: string; reference: string; invoicePath: string } | { kind: 'card-payment' | 'card-surcharge'; id: string; paymentPath: string })
interface Statement { customer: string; from: string | null; to: string; dates: string; note: string; sections: { currency: 'USD' | 'AUD' | 'CAD'; openingCents: number; closingCents: number; entries: StatementEntry[] }[] }

// PAY-007 / PAY-001: invoice, surcharge and unapplied card receipt figures match the CSV and PDF downloads.
export function StatementCard({ accounts }: { accounts: Account[] }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [value, setValue] = useState<Statement | null>(null)
  const [error, setError] = useState('')
  const query = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString()
  const path = (suffix: string) => `/api/barrow/statements/${encodeURIComponent(accountId)}${suffix}${query ? `?${query}` : ''}`
  useEffect(() => {
    if (!accountId) return
    let current = true
    setError('')
    void request<Statement>(path('')).then(data => { if (current) setValue(data) }).catch(failure => { if (current) { setValue(null); setError(errorMessage(failure)) } })
    return () => { current = false }
  }, [accountId, from, to])
  if (!accounts.length) return null
  return <section className="br-card br-stack" aria-label="Account statement"><h2>Account statement</h2>
    <div className="br-actions">
      {accounts.length > 0 && <AccountPicker accounts={accounts} value={accountId} onChange={setAccountId} />}
      <label>From<input type="date" value={from} onChange={event => setFrom(event.target.value)} /></label>
      <label>To<input type="date" value={to} min={from || undefined} onChange={event => setTo(event.target.value)} /></label>
    </div>
    {error && <Notice error>{error}</Notice>}
    {value && <>
      <p>{value.customer} · {value.from ?? 'all activity'} to {value.to}. {value.dates}</p>
      {value.sections.length === 0 && <p>No recorded activity in this period.</p>}
      {value.sections.map(section => <div key={section.currency} className="br-table-wrap"><table><caption>{section.currency} statement</caption>
        <thead><tr><th scope="col">Entry</th><th scope="col">Date</th><th scope="col">Due</th><th scope="col">Order</th><th scope="col">PO</th><th scope="col">Amount</th></tr></thead>
        <tbody>
          <tr><th scope="row">Opening balance</th><td colSpan={4} /><td>{money(section.openingCents, section.currency)}</td></tr>
          {section.entries.map(line => <tr key={`${line.kind}:${line.kind === 'invoice' ? line.number : line.id}`}><th scope="row">{line.kind === 'invoice' ? <a href={line.invoicePath} download>{line.number}</a> : <a href={line.paymentPath}>{line.kind === 'card-surcharge' ? 'Card surcharge' : 'Unapplied card receipt'} {line.id}</a>}</th><td>{line.date}</td><td>{line.kind === 'invoice' ? line.dueAt : ''}</td><td><a href={line.orderPath}>{line.orderId}</a></td><td>{line.kind === 'invoice' ? line.reference : ''}</td><td>{money(line.amountCents, section.currency)}</td></tr>)}
          <tr><th scope="row">Closing balance</th><td colSpan={4} /><td>{money(section.closingCents, section.currency)}</td></tr>
        </tbody></table></div>)}
      <Notice>{value.note}</Notice>
      <div className="br-actions"><a className="br-secondary" href={path('.pdf')} download>Statement (PDF)</a><a className="br-secondary" href={path('.csv')} download>Statement (CSV)</a></div>
    </>}
  </section>
}
