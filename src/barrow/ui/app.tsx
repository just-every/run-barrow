import { DeltaCutoverReview } from './delta-cutover'
import { ConfirmationSettings } from './confirmation-settings'
import { LineSheets } from './line-sheets'
import { AccountErasure } from './account-erasure'
import {RepPerformance} from './rep-performance'
import {CommissionSettings} from './commission-settings'
import {StaffMembers} from './staff-members'
import {RepAssignments} from './rep-assignments'
import {StaffWorkspace} from './staff-workspace'
import {Followups} from './followups'
import { CompanyUsers, CompanyInvitation } from './company-members'
import { CompanyRoutes } from './company-routes'
import { ApplicationRetention } from './application-retention'
import { applicationAccess } from '../application-access'
import { Applications } from './applications'
import { ApplicationRules } from './application-rules'
import { ApprovalNotices } from './approval-notices'
import { Visits } from './visits'
import { UsageAcceptance, UsagePublisher } from './usage-terms'
import { useCallback, useEffect, useRef, useState } from 'react'
import { HydrationUnit } from '../../base/hydration/unit'
import { request, errorMessage } from './api'
import { Accounts } from './accounts'
import { SalesTerms } from './sales-terms'
import { DraftWorkspace } from './draft-workspace'
import { Orders } from './orders'
import { MoveIn } from './move-in'
import { WizCommerceMoveIn } from './wizcommerce'
import { CutoverReview } from './cutover'
import { CommercialAudit } from './commercial-audit'
import { DataTools } from './data'
import { ExportLinks } from './export-links'
import { StatementCard } from './statement'
import { Quotes } from './quotes'
import { Locations } from './locations'
import { Empty, Notice } from './primitives'
import { CurrentRep } from './current-rep'
import type { Account, BarrowState, Order } from './types'

export function BarrowApp() {
  const [state, setState] = useState<BarrowState | null>(null)
  const [error, setError] = useState('')
  const [usageRequired,setUsageRequired]=useState(false)
  const [invitation,setInvitation]=useState<{id:string;token:string}|null>(null)
  const [invitationMessages,setInvitationMessages]=useState<string[]>([])
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const lock = useRef(false)
  const loaded = useRef(false)
  const [tab, setTab] = useState('')
  const [accountId, setAccountId] = useState('')
  const [draftId, setDraftId] = useState('')
  const legacySupplier=state?.actor.role==='owner'||state?.actor.role==='admin',staff=state?.actor.staff,staffSelling=staff?.role==='sales-manager'||staff?.role==='rep'
  const supplier = legacySupplier||Boolean(staff)
  const rights=state?.actor.company?.rights??[]
  const purchasing=supplier||rights.some(r=>r==='purchaser'||r==='approver'),finance=legacySupplier||staff?.role==='finance'||rights.includes('finance'),companyAdmin=legacySupplier||!staff&&rights.includes('administrator')
  const pad = supplier ? 'Order pad' : 'Catalog'
  const applicationRight = state ? applicationAccess(state.actor) : null
  const tabs = staff?[...(staffSelling?[pad,'Line sheets']:[]),...(staff.role==='sales-manager'?['Accounts']:applicationRight?['Applications']:[]),...(staff.role!=='analyst'?['Orders','Follow-ups']:[]),'Reports','Audit']:legacySupplier ? [pad, 'Line sheets', 'Accounts', 'Orders', 'Move in', 'Data', 'Audit',...(state?.actor.role==='owner'?['Team']:[])] : [...(purchasing?[pad,'Line sheets']:[]),'Orders',...(companyAdmin?['Company']:[])]
  const activeTab = tabs.includes(tab) ? tab : tabs[0]
  const [selectedAccount,setSelected] = useState<Account | null>(null),[accountLoading,setAccountLoading]=useState(false)
  const selected=selectedAccount?.id===accountId?selectedAccount:null
  useEffect(()=>{
    let current=true;setAccountLoading(Boolean(accountId))
    if(accountId&&(!staff||staffSelling))void request<Account>(`/api/barrow/accounts/by-id/${encodeURIComponent(accountId)}`).then(value=>{if(current)setSelected(value)}).catch(cause=>{if(current){setSelected(null);setError(errorMessage(cause))}}).finally(()=>{if(current)setAccountLoading(false)})
    return ()=>{current=false}
  },[accountId,state,staff,staffSelling])
  const reload = useCallback(async () => {
    const first = !loaded.current
    loaded.current = true
    const invitations=await request<any>('/api/barrow/company/invitations');setInvitationMessages(invitations.invitations.filter((v:any)=>v.status!=='invitation requested').map((v:any)=>v.status))
    const usage=await request<any>('/api/barrow/usage-terms')
    setUsageRequired(usage.required)
    if(usage.required)return
    const next = await request<BarrowState>('/api/barrow/state', undefined, first)
    setState(next)
    const open = first ? next.waitingDraft : undefined
    setAccountId(current => current || open?.accountId || next.accounts[0]?.id || '')
    setDraftId(current => open?.id ?? current)
  }, [])
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { await reload() } catch (error) { setError(errorMessage(error)) }
    finally { setLoading(false) }
  }, [reload])
  useEffect(() => {
    const invitationQuery=new URLSearchParams(window.location.search);if(invitationQuery.has('companyInvitation')&&invitationQuery.has('companyToken'))setInvitation({id:invitationQuery.get('companyInvitation')!,token:invitationQuery.get('companyToken')!})
    if ((new URLSearchParams(window.location.search).get('task') ?? '').startsWith('quote-mail:')) setTab('Data')
    if (new URLSearchParams(window.location.search).has('reportRun')) setTab('Data')
    if (new URLSearchParams(window.location.search).has('application') && (!staff || applicationRight==='review')) setTab('Accounts')
    if (/^Q-\d{1,9}$/.test(new URLSearchParams(window.location.search).get('quote') ?? '')) setTab('Orders')
    void load()
  }, [load])

  async function run(type: string, payload: Record<string, unknown>) {
    if (lock.current) return false
    lock.current = true; setBusy(true); setError(''); setNotice('')
    try {
      const response=await request<{result?:{status?:string;order?:{status?:string}}}>('/api/barrow/commands', { type, payload })
      if(type==='account.erase'&&payload.accountId===accountId)setAccountId('')
      try { await reload() } catch (error) {
        setError(`The action completed, but the latest records could not be loaded. Refresh before taking another action. ${errorMessage(error)}`)
        return true
      }
      const messages: Record<string, string> = {
        'account.save': 'Trade account saved.', 'account.invite': 'Invitation requested. Check the account email for the sign-in message.',
        'account.erase': 'Account erasure completed.', 'order.prepare': 'Draft prepared. Review it in Orders before submitting.',
        'order.submit': 'Order submitted for supplier review.', 'terms.publish': 'Sales terms version published.', 'terms.assign': 'Sales terms assignment saved.', 'order.approve': 'Reservation requested. See the order for its current stock status.',
        'order.refresh': 'Order stock status refreshed.', 'order.cancel': 'Order cancelled. Pier confirmed the stock release.', 'order.attach': 'PO document attached to the draft.', 'order.reorder': 'Reorder draft prepared. Review it in Orders before submitting.',
        'quote.request': 'Quote requested. Your supplier will propose prices and terms in Orders.', 'quote.propose': 'Quote revision saved.', 'quote.approve': 'Discount approved. The buyer can now accept this revision.', 'quote.accept': 'Quote accepted. The order is submitted for supplier review.',
      }
      setNotice(response.result?.status==='awaiting-company-approval'||response.result?.order?.status==='awaiting-company-approval'?'Order awaits company approval. A different authorized approver must release it before supplier review.':type==='order.company-approve'?'Company purchase approved and submitted for supplier review.':messages[type] ?? 'Action completed.')
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
        {notice && <Notice>{notice}</Notice>}{invitationMessages.map(message=><Notice key={message}>{message}</Notice>)}
        {!state && loading && <p role="status" className="br-loading">Loading your wholesale workspace…</p>}
        {invitation&&<CompanyInvitation {...invitation} onAccepted={()=>{setInvitation(null);void load()}}/>}
        {usageRequired&&!invitation&&<UsageAcceptance onAccepted={()=>void load()}/>}
        {state&&!usageRequired&&!invitation && <>
          {!state.connection.configured && <Notice>Live stock and reservations need a Pier connection. {supplier ? 'Configure Pier in the installation settings before taking orders.' : 'Contact your supplier to enable ordering.'}</Notice>}
          {activeTab !== pad && <div className="br-page-title"><div><p className="br-eyebrow">{supplier ? 'Supplier workspace' : selected?.value.name ?? 'Your trade account'}</p><h1>{activeTab}</h1>{!supplier&&<CurrentRep reps={state.currentReps?.[accountId]}/>}</div>
            <span className={`br-chip br-connection${state.connection.configured ? ' br-connected' : ''}`}>{state.connection.configured ? 'Pier connected' : 'Pier connection required'}</span>
          </div>}
          {activeTab === pad && !supplier && <CurrentRep reps={state.currentReps?.[accountId]}/>}
          {activeTab === pad && (selected
            ? <DraftWorkspace canPurchase={legacySupplier||staffSelling||rights.includes('purchaser')} key={`draft:${selected.id}`} account={selected} accounts={state.accounts} supplier={supplier} draftId={draftId} version={state} draftCount={state.orderPage.counts.draft ?? 0} run={run} busy={busy} commandError={error}
                onAccount={id => openPad(id)} onDraft={setDraftId} onPrepared={() => { setDraftId(''); setTab('Orders') }} />
            : accountId ? <p role="status">{accountLoading?'Loading selected trade account…':'The selected trade account could not be loaded. Refresh records to try again.'}</p> : <div className="br-page-empty">{staff?<Empty title="No assigned trade accounts">The owner must explicitly assign accounts before you can sell.</Empty>:legacySupplier
              ? <Empty title="Your first trade relationship starts here" actions={<><button onClick={() => go('Accounts')}>Add trade account</button><button className="br-secondary" onClick={() => go('Move in')}>Move in accounts</button></>}>Add a trade account with its agreed prices, then write its orders here, styles down and sizes across.</Empty>
              : <Empty title="Your account is not linked yet">Ask your supplier to connect this email to your trade account.</Empty>}</div>)}
          {activeTab === 'Line sheets' && <LineSheets accounts={state.accounts} merchant={Boolean(legacySupplier||staff?.role==='sales-manager')} version={state} onPrepared={()=>{void reload();setTab('Orders')}}/>}
          {activeTab === 'Line sheets' && legacySupplier && <ConfirmationSettings />}
          {activeTab === 'Accounts' && <Accounts canCreate={!staff||staff.accounts==='all'} canInvite={legacySupplier} version={state} run={run} busy={busy} onOrder={id => openPad(id)} />}
          {activeTab === 'Accounts' && (legacySupplier||staff?.role==='sales-manager'&&staff.accounts==='all') && <RepAssignments version={state} run={run} busy={busy}/>}
          {activeTab === 'Accounts' && legacySupplier && state.accounts.length > 0 && <Locations accounts={state.accounts} busy={busy} run={run} version={state.accounts} />}
          {(activeTab === 'Accounts' && applicationRight==='review' || activeTab === 'Applications' && applicationRight==='documents') && <Applications version={state} busy={busy} run={run}/>}
          {activeTab === 'Accounts' && legacySupplier && <ApplicationRules version={state} busy={busy} run={run}/>}
          {activeTab === 'Accounts' && legacySupplier && <UsagePublisher busy={busy} run={run}/>}
          {activeTab === 'Accounts' && legacySupplier && <SalesTerms accounts={state.accounts} busy={busy} run={run} />}
          {activeTab === 'Team'&&state.actor.role==='owner'&&<StaffMembers accounts={state.accounts} version={state} run={run} busy={busy}/>}
          {activeTab === 'Reports'&&staff?.role==='sales-manager'&&staff.accounts==='all'&&<CommissionSettings onSaved={()=>void reload()}/>}
          {activeTab === 'Reports'&&staff?.role==='rep'&&<RepAssignments version={state} run={run} busy={busy}/>}
          {activeTab === 'Reports'&&staff&&<StaffWorkspace actor={state.actor} accounts={state.accounts} orders={state.orders} people={state.people} run={run} busy={busy} version={state} onOpen={order=>openPad(order.accountId,order.id)}/>}
          {activeTab === 'Reports' && staff?.reports.includes('commissions') && (staff.role==='rep'||staff.role==='sales-manager'&&staff.accounts==='all') && <RepPerformance version={state} busy={busy} run={run}/>}
          {activeTab === 'Follow-ups'&&staff&&<Followups/>}
          {activeTab === 'Company' && companyAdmin && <CompanyUsers accounts={state.accounts} version={state} busy={busy} run={run} supplier={false}/>}
          {activeTab === 'Company' && companyAdmin && <CompanyRoutes accounts={state.accounts} version={state} busy={busy} run={run}/>}
          {activeTab === 'Accounts' && legacySupplier && <CompanyUsers accounts={state.accounts} version={state} busy={busy} run={run} supplier/>}
          {activeTab === 'Accounts' && legacySupplier && <CompanyRoutes accounts={state.accounts} version={state} busy={busy} run={run}/>}
          {activeTab === pad && selected && (legacySupplier || staffSelling) && <Visits key={`visits:${selected.id}`} accountId={selected.id} version={state} canSell canHandOff={legacySupplier || staff?.role === 'sales-manager' && staff.warehouses === 'all'} busy={busy} run={run} />}
          {activeTab === 'Orders' && staff?.role === 'operations' && staff.warehouses === 'all' && <Visits version={state} canSell={false} canHandOff busy={busy} run={run} />}
          {activeTab === 'Orders' && !supplier && rights.includes('approver') && <ApprovalNotices version={state} />}
          {activeTab === 'Orders' && <Orders orders={state.orders} accounts={state.accounts} people={state.people} viewer={state.actor.id} supplier={supplier} canOperate={legacySupplier||Boolean(staff&&['sales-manager','operations'].includes(staff.role)&&staff.warehouses==='all')} stockExceptionLimitCents={staff?.stockExceptionLimitCents} canExcept={legacySupplier||staff?.role==='sales-manager'&&staff.stockExceptionLimitCents>0} canQuote={legacySupplier||staff?.role==='sales-manager'} companyApprover={legacySupplier||rights.includes('approver')} companyManager={!staff&&rights.includes('administrator')} canPurchase={legacySupplier||staffSelling||rights.includes('purchaser')} finance={finance} busy={busy} run={run} onOpen={order => openPad(order.accountId, order.id)} />}
          {activeTab === 'Orders' && (legacySupplier||staffSelling||!staff&&purchasing) && <Quotes canApproveDiscount={legacySupplier||staff?.role==='sales-manager'} discountLimitCents={staff?.discountLimitCents} canQuoteDelivery={legacySupplier||staff?.role==='sales-manager'} canPurchase={legacySupplier||staffSelling||Boolean(state.actor.company?.rights.includes('purchaser'))} supplier={supplier} busy={busy} run={run} version={state.orders} />}
          {activeTab === 'Orders' && finance && <StatementCard accounts={state.accounts} />}
          {activeTab === 'Orders' && !supplier && companyAdmin && state.accounts.length > 0 && <Locations accounts={state.accounts} busy={busy} run={run} version={state.orders} />}
          {activeTab === 'Orders' && !supplier && finance && <ExportLinks supplier={false} />}
          {activeTab === 'Move in' && supplier && <>{state.actor.role==='owner'&&<><WizCommerceMoveIn reload={reload} /><CutoverReview /><DeltaCutoverReview /></>}<MoveIn reload={reload} /></>}
          {activeTab === 'Audit' && supplier && <CommercialAudit />}
          {activeTab === 'Data' && state.actor.role==='owner' && <AccountErasure accounts={state.accounts} run={run} version={state} busy={busy}/>}
          {activeTab === 'Data' && state.actor.role==='owner' && <ApplicationRetention run={run} version={state} busy={busy}/>}
          {activeTab === 'Data' && supplier && <DataTools owner={state.actor.role==='owner'} accounts={state.accounts} freshness={state.settings.stockFreshnessMinutes} busy={busy} run={run} />}
        </>}
      </section></HydrationUnit>
    </main>
    <HydrationUnit><footer className="br-footer"><span>Barrow · Price books and orders retain their ISO currency</span><a href="/setup">Installation settings</a></footer></HydrationUnit>
  </div>
}
