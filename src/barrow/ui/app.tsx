import { useCallback, useEffect, useRef, useState } from 'react'
import { HydrationUnit } from '../../base/hydration/unit'
import { request, errorMessage } from './api'
import { Accounts } from './accounts'
import { CatalogueView } from './catalogue'
import { Orders } from './orders'
import { MoveIn } from './move-in'
import { DataTools } from './data'
import { AccountPicker, Empty, Notice } from './primitives'
import type { BarrowState } from './types'

export function BarrowApp() {
  const [state, setState] = useState<BarrowState | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const lock = useRef(false)
  const loaded = useRef(false)
  const [tab, setTab] = useState('')
  const [accountId, setAccountId] = useState('')
  const [preparing, setPreparing] = useState(false)
  const supplier = state?.actor.role === 'owner' || state?.actor.role === 'admin'
  const tabs = supplier ? ['Accounts', 'Orders', 'Move in', 'Data'] : ['Catalogue', 'Orders']
  const activeTab = tabs.includes(tab) ? tab : tabs[0]
  const selected = state?.accounts.find(account => account.id === accountId)
  const reload = useCallback(async () => {
    const first = !loaded.current
    loaded.current = true
    const next = await request<BarrowState>('/api/barrow/state', undefined, first)
    setState(next)
    setAccountId(current => next.accounts.some(account => account.id === current) ? current : next.accounts[0]?.id ?? '')
  }, [])
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { await reload() } catch (error) { setError(errorMessage(error)) }
    finally { setLoading(false) }
  }, [reload])
  useEffect(() => { void load() }, [load])

  async function run(type: string, payload: Record<string, unknown>) {
    if (lock.current) return false
    lock.current = true; setBusy(true); setError(''); setNotice('')
    try {
      await request('/api/barrow/commands', { type, payload })
      try { await reload() } catch (error) {
        setError(`The action completed, but the latest records could not be loaded. Refresh before taking another action. ${errorMessage(error)}`)
        return true
      }
      const messages: Record<string, string> = {
        'account.save': 'Trade account saved.', 'account.invite': 'Invitation requested. Check the account email for the sign-in message.',
        'account.erase': 'Account erasure completed.', 'order.prepare': 'Draft prepared. Review it in Orders before submitting.',
        'order.submit': 'Order submitted for supplier review.', 'order.approve': 'Reservation requested. See the order for its current stock status.',
        'order.refresh': 'Order stock status refreshed.',
      }
      setNotice(messages[type] ?? 'Action completed.')
      return true
    } catch (error) { setError(errorMessage(error)); return false }
    finally { lock.current = false; setBusy(false) }
  }

  async function signOut() {
    setSigningOut(true); setError('')
    try {
      const response = await fetch('/auth/signout', { method: 'POST', credentials: 'same-origin' })
      if (!response.ok) throw new Error('Sign out could not be completed. Please try again.')
      window.location.assign('/')
    } catch (error) { setError(errorMessage(error)); setSigningOut(false) }
  }

  return <div className="barrow">
    <div className="br-chrome"><HydrationUnit><header className="br-header">
      <a href="/app" className="br-brand"><span className="br-mark" aria-hidden="true" /><span><span data-rer-name>Barrow</span><small>Wholesale, together.</small></span></a>
      <div className="br-session">{state && <><span className="br-email">{state.actor.email}</span><span className="br-badge">{supplier ? 'Supplier' : 'Trade customer'}</span></>}
        <form method="post" action="/auth/signout" onSubmit={event => { event.preventDefault(); void signOut() }}><button className="br-quiet" disabled={signingOut || busy}>{signingOut ? 'Signing out…' : 'Sign out'}</button></form>
      </div>
    </header></HydrationUnit>
    <HydrationUnit><nav className="br-nav" aria-label="Barrow pages">{state && tabs.map(item => <button key={item} aria-current={activeTab === item ? 'page' : undefined} onClick={() => { setTab(item); setNotice('') }}>{item}</button>)}</nav></HydrationUnit></div>
    <div className="br-awning" aria-hidden="true" />
    <main id="main-content" className="br-main" aria-busy={loading || busy}>
      <HydrationUnit><section>
        {error && <Notice error>{error}<div><button className="br-quiet" onClick={() => void load()} disabled={busy || loading}>Refresh records</button></div></Notice>}
        {notice && <Notice>{notice}</Notice>}
        {!state && loading && <p role="status">Loading your wholesale workspace…</p>}
        {state && <>
          <div className="br-page-title"><div><p className="br-eyebrow">{supplier ? 'Supplier workspace' : selected?.value.name ?? 'Your trade account'}</p><h1>{activeTab}</h1></div>
            <span className={`br-connection${state.connection.configured ? ' br-connected' : ''}`}>{state.connection.configured ? 'Pier connected' : 'Pier connection required'}</span>
          </div>
          {!state.connection.configured && <Notice>Live stock and reservations need a Pier connection. {supplier ? 'Configure Pier in the installation settings before taking orders.' : 'Contact your supplier to enable ordering.'}</Notice>}
          {activeTab === 'Accounts' && <Accounts accounts={state.accounts} run={run} busy={busy} onOrder={id => { setAccountId(id); setPreparing(true); setTab('Orders') }} />}
          {activeTab === 'Catalogue' && (selected ? <CatalogueView key={selected.id} account={selected} run={run} busy={busy} onPrepared={() => setTab('Orders')} /> : <Empty title="Your account is not linked yet">Ask your supplier to connect this email to your trade account.</Empty>)}
          {activeTab === 'Orders' && <>
            {supplier && <details className="br-panel br-prepare" open={preparing} onToggle={event => setPreparing(event.currentTarget.open)}><summary>Prepare an order</summary><p>Choose a trade account to use its agreed prices and terms.</p><AccountPicker accounts={state.accounts} value={accountId} onChange={setAccountId} />{selected && <CatalogueView key={selected.id} account={selected} run={run} busy={busy} onPrepared={() => { setPreparing(false); setTab('Orders') }} />}</details>}
            <Orders orders={state.orders} supplier={supplier} busy={busy} run={run} />
          </>}
          {activeTab === 'Move in' && supplier && <MoveIn reload={reload} />}
          {activeTab === 'Data' && supplier && <DataTools accounts={state.accounts} busy={busy} run={run} />}
        </>}
      </section></HydrationUnit>
    </main>
    <HydrationUnit><footer className="br-footer"><span>Barrow · Amounts in AUD</span><a href="/setup">Installation settings</a></footer></HydrationUnit>
  </div>
}
