import { useState } from 'react'
import type { Account, RunCommand } from './types'
import { money } from './types'
import { Empty } from './primitives'
import { AccountForm } from './account-form'

export function Accounts({ accounts, run, busy, onOrder }: { accounts: Account[]; run: RunCommand; busy: boolean; onOrder: (id: string) => void }) {
  const [editing, setEditing] = useState<Account | 'new' | null>(null)
  return <div className="br-stack">
    <div className="br-heading-row"><p>Agreed prices, minimums and payment terms for each customer.</p><button onClick={() => setEditing('new')} disabled={busy}>Add trade account</button></div>
    {editing && <div className="br-panel"><AccountForm key={editing === 'new' ? 'new' : editing.id} account={editing === 'new' ? undefined : editing} run={run} busy={busy} onClose={() => setEditing(null)} /></div>}
    {accounts.length === 0 ? <Empty title="Your first trade relationship starts here">Add a customer account, agree its prices and send an invitation. Or use Move in to import your existing accounts.</Empty> :
      <div className="br-account-grid">{accounts.map(account => <article className="br-panel br-account" key={account.id}>
        <div><span className="br-eyebrow">{account.id}</span><h2>{account.value.name}</h2><p className="br-email">{account.value.email}</p></div>
        <dl className="br-facts"><div><dt>Payment terms</dt><dd>{account.value.termsDays === 0 ? 'Due on receipt' : `${account.value.termsDays} days`}</dd></div><div><dt>Minimum order</dt><dd>{money(account.value.minimumCents)}</dd></div><div><dt>Agreed prices</dt><dd>{account.value.prices.length} SKUs</dd></div></dl>
        <div className="br-actions"><button onClick={() => onOrder(account.id)} disabled={busy}>Prepare order</button><button className="br-secondary" onClick={() => setEditing(account)} disabled={busy}>Edit account</button><button className="br-quiet" onClick={() => void run('account.invite', { accountId: account.id })} disabled={busy}>Send invitation</button></div>
      </article>)}</div>}
  </div>
}
