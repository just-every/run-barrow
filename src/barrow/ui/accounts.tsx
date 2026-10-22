import { useState } from 'react'
import type { Account, RunCommand } from './types'
import { money, town } from './types'
import { Empty } from './primitives'
import { AccountForm } from './account-form'
import { AccountPages, useAccountPage } from './account-pages'

export function Accounts({ version, run, busy, onOrder, canCreate=true,canInvite=true }: { canCreate?:boolean;canInvite?:boolean;version: unknown; run: RunCommand; busy: boolean; onOrder: (id: string) => void }) {
  const directory=useAccountPage(version),accounts=directory.result?.accounts??[]
  const [editing, setEditing] = useState<Account | 'new' | null>(null)
  return <section className="br-stack" aria-label="Trade account directory">
    <div className="br-heading-row br-accounts-intro"><p>Agreed prices, minimums and payment terms for each customer.</p>{canCreate&&<button onClick={() => setEditing('new')} disabled={busy}>Add trade account</button>}</div>
    <AccountPages directory={directory} sort/>
    {editing && <div className="br-card"><AccountForm key={editing === 'new' ? 'new' : editing.id} account={editing === 'new' ? undefined : editing} run={run} busy={busy} onClose={() => setEditing(null)} /></div>}
    {!directory.result ? null : accounts.length === 0 && (directory.query.q || directory.query.page>1) ? <p>No matching trade accounts on this page.</p> : accounts.length === 0 ? <Empty title="Your first trade relationship starts here">Add a customer account, agree its prices and send an invitation. Or use Move in to import your existing accounts.</Empty> :
      <div className="br-account-grid">{accounts.map(account => <article className="br-card br-account" key={account.id}>
        <div>{(town(account.value) || !/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(account.id)) && <span className={`br-eyebrow${town(account.value) ? ' br-town' : ''}`}>{town(account.value) || account.id}</span>}<h2>{account.value.name}</h2><p className="br-email">{account.value.email}</p><p className="br-quiet-text">Account state: {account.value.lifecycle === 'on-hold' ? 'On hold' : account.value.lifecycle === 'closed' ? 'Closed' : 'Active'}</p></div>
        <dl className="br-facts"><div><dt>Payment terms</dt><dd>{account.value.termsDays === 0 ? 'Due on receipt' : `${account.value.termsDays} days`}</dd></div><div><dt>Minimum order</dt><dd>{money(account.value.minimumCents,account.value.currency??'USD')}</dd></div><div><dt>Agreed prices</dt><dd>{account.value.prices.length} SKUs</dd></div></dl>
        <div className="br-actions"><button onClick={() => onOrder(account.id)} disabled={busy || (!!account.value.lifecycle && account.value.lifecycle !== 'active')}>Prepare order</button><button className="br-secondary" onClick={() => setEditing(account)} disabled={busy}>Edit account</button>{canInvite&&<button className="br-quiet" onClick={() => void run('account.invite', { accountId: account.id })} disabled={busy}>Send invitation</button>}</div>
      </article>)}</div>}
  </section>
}
