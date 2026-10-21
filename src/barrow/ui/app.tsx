import { useCallback, useEffect, useRef, useState } from 'react'
import { HydrationUnit } from '../../base/hydration/unit'
import { request, errorMessage } from './api'
import { Accounts } from './accounts'
import { DraftWorkspace } from './draft-workspace'
import { Orders } from './orders'
import { MoveIn } from './move-in'
import { CommercialAudit } from './commercial-audit'
import { DataTools } from './data'
import { ExportLinks } from './export-links'
import { StatementCard } from './statement'
import { Quotes } from './quotes'
import { Locations } from './locations'
import { Empty, Notice } from './primitives'
import type { BarrowState, Order } from './types'

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
  const [draftId, setDraftId] = useState('')
  const supplier = state?.actor.role === 'owner' || state?.actor.role === 'admin'
  const pad = supplier ? 'Order pad' : 'Catalog'
  const tabs = supplier ? [pad, 'Accounts', 'Orders', 'Move in', 'Data', 'Audit'] : [pad, 'Orders']
  const activeTab = tabs.includes(tab) ? tab : tabs[0]
  const selected = state?.accounts.find(account => account.id === accountId)
  const reload = useCallback(async () => {
    const first = !loaded.current
    loaded.current = true
    const next = await request<BarrowState>('/api/barrow/state', undefined, first)
    setState(next)
    const open = first ? next.waitingDraft : undefined
    setAccountId(current => next.accounts.some(account => account.id === current) ? current : open?.accountId ?? next.accounts[0]?.id ?? '')
    setDraftId(current => open?.id ?? current)
  }, [])
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { await reload() } catch (error) { setError(errorMessage(error)) }
    finally { setLoading(false) }
  }, [reload])
  useEffect(() => {
    if ((new URLSearchParams(window.location.search).get('task') ?? '').startsWith('quote-mail:')) setTab('Data')
    if (/^Q-\d{1,9}$/.test(new URLSearchParams(window.location.search).get('quote') ?? '')) setTab('Orders')
    void load()
  }, [load])

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
        'order.refresh': 'Order stock status refreshed.', 'order.cancel': 'Order cancelled. Pier confirmed the stock release.', 'order.attach': 'PO document attached to the draft.', 'order.reorder': 'Reorder draft prepared. Review it in Orders before submitting.',
        'quote.request': 'Quote requested. Your supplier will propose prices and terms in Orders.', 'quote.propose': 'Quote revision saved.', 'quote.approve': 'Discount approved. The buyer can now accept this revision.', 'quote.accept': 'Quote accepted. The order is submitted for supplier review.',
      }
      setNotice(messages[type] ?? 'Action completed.')
      return true
    } catch (error) {
      setError(errorMessage(error))
      // A failed provider step may still have recorded a pending state (reserving, releasing): show it.
      try { await reload() } catch {}
      return false
    }
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
  const go = (next: string) => { setTab(next); setNotice('') }
  const openPad = (id: string, draft = '') => { setAccountId(id); setDraftId(draft); go(pad) }

  return <div className="barrow">
    <HydrationUnit><header className="br-top">
      <a href="/app" className="br-brand"><img className="br-mark" src="/brand/mark.svg" alt="" width="26" height="26" /><span data-rer-name>Barrow</span></a>
      <nav className="br-nav" aria-label="Barrow pages">{state && tabs.map(item => <button key={item} aria-current={activeTab === item ? 'page' : undefined} onClick={() => go(item)}>{item}</button>)}</nav>
      <div className="br-session">{state && <><span className="br-email">{state.actor.email}</span><span className="br-badge">{supplier ? 'Supplier' : 'Trade customer'}</span></>}
        <form method="post" action="/auth/signout" onSubmit={event => { event.preventDefault(); void signOut() }}><button className="br-quiet" disabled={signingOut || busy}>{signingOut ? 'Signing out…' : 'Sign out'}</button></form>
      </div>
    </header></HydrationUnit>
    <main id="main-content" className={`br-main${activeTab === pad && selected ? ' br-main-pad' : ''}`} aria-busy={loading || busy}>
      <HydrationUnit><section>
        {error && <Notice error>{error}<div><button className="br-quiet" onClick={() => void load()} disabled={busy || loading}>Refresh records</button></div></Notice>}
        {notice && <Notice>{notice}</Notice>}
        {!state && loading && <p role="status" className="br-loading">Loading your wholesale workspace…</p>}
        {state && <>
          {!state.connection.configured && <Notice>Live stock and reservations need a Pier connection. {supplier ? 'Configure Pier in the installation settings before taking orders.' : 'Contact your supplier to enable ordering.'}</Notice>}
          {activeTab !== pad && <div className="br-page-title"><div><p className="br-eyebrow">{supplier ? 'Supplier workspace' : selected?.value.name ?? 'Your trade account'}</p><h1>{activeTab}</h1></div>
            <span className={`br-chip br-connection${state.connection.configured ? ' br-connected' : ''}`}>{state.connection.configured ? 'Pier connected' : 'Pier connection required'}</span>
          </div>}
          {activeTab === pad && (selected
            ? <DraftWorkspace key={selected.id} account={selected} accounts={state.accounts} supplier={supplier} draftId={draftId} version={state} draftCount={state.orderPage.counts.draft ?? 0} run={run} busy={busy} commandError={error}
                onAccount={id => openPad(id)} onDraft={setDraftId} onPrepared={() => { setDraftId(''); setTab('Orders') }} />
            : <div className="br-page-empty">{supplier
              ? <Empty title="Your first trade relationship starts here" actions={<><button onClick={() => go('Accounts')}>Add trade account</button><button className="br-secondary" onClick={() => go('Move in')}>Move in accounts</button></>}>Add a trade account with its agreed prices, then write its orders here, styles down and sizes across.</Empty>
              : <Empty title="Your account is not linked yet">Ask your supplier to connect this email to your trade account.</Empty>}</div>)}
          {activeTab === 'Accounts' && <Accounts accounts={state.accounts} run={run} busy={busy} onOrder={id => openPad(id)} />}
          {activeTab === 'Accounts' && supplier && state.accounts.length > 0 && <Locations accounts={state.accounts} busy={busy} run={run} version={state.accounts} />}
          {activeTab === 'Orders' && <Orders orders={state.orders} accounts={state.accounts} people={state.people} viewer={state.actor.id} supplier={supplier} busy={busy} run={run} onOpen={order => openPad(order.accountId, order.id)} />}
          {activeTab === 'Orders' && <Quotes supplier={supplier} busy={busy} run={run} version={state.orders} />}
          {activeTab === 'Orders' && <StatementCard accounts={state.accounts} />}
          {activeTab === 'Orders' && !supplier && state.accounts.length > 0 && <Locations accounts={state.accounts} busy={busy} run={run} version={state.orders} />}
          {activeTab === 'Orders' && !supplier && <ExportLinks supplier={false} />}
          {activeTab === 'Move in' && supplier && <MoveIn reload={reload} />}
          {activeTab === 'Audit' && supplier && <CommercialAudit />}
          {activeTab === 'Data' && supplier && <DataTools accounts={state.accounts} freshness={state.settings.stockFreshnessMinutes} busy={busy} run={run} />}
        </>}
      </section></HydrationUnit>
    </main>
    <HydrationUnit><footer className="br-footer"><span>Barrow · Current prices in USD · Orders retain their recorded currency</span><a href="/setup">Installation settings</a></footer></HydrationUnit>
  </div>
}
