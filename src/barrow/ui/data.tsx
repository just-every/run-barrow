import { useState } from 'react'
import type { Account, RunCommand } from './types'
import { AccountPicker, Notice } from './primitives'
import { Dialog } from './dialog'
import { AgentCredential } from './agent-credential'
import { DiagnosticsCard } from './diagnostics'
import { ExportLinks } from './export-links'
import { FreshnessSetting } from './freshness'
import { FulfillmentReport } from './fulfillment'
import { QuoteReport } from './quote-report'

export function DataTools({ accounts, freshness, busy, run }: { accounts: Account[]; freshness: number | null; busy: boolean; run: RunCommand }) {
  const [accountId, setAccountId] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const account = accounts.find(value => value.id === accountId)
  async function erase() {
    if (confirmation !== 'ERASE' || !account) return
    const erased = await run('account.erase', { accountId: account.id, confirm: confirmation })
    setConfirming(false)
    if (erased) { setConfirmation(''); setAccountId('') }
  }
  return <div className="br-stack">
    <div className="br-card br-stack"><h2>Your installation, your data</h2><p>Export the installation from its checkout with the RER command line. Keep the exported file private: it contains business and account data.</p><pre className="br-command">rer export --output exports/barrow.rer</pre><p className="br-quiet-text">Run this on the machine hosting this installation. The export is written to the path you choose. Use the installation’s RER import command to restore into an empty destination.</p></div>
    <ExportLinks supplier />
    <FreshnessSetting minutes={freshness} busy={busy} run={run} />
    <FulfillmentReport accounts={accounts} />
    <QuoteReport />
    <DiagnosticsCard />
    <AgentCredential />
    <div className="br-card br-stack"><h2>Erase an unused trade account</h2><p>Erasure removes this Barrow account and its retained import custody, and immediately removes the customer’s portal access. Accounts with orders cannot be erased because their commercial history must be preserved.</p>
      <Notice>Sign-in identity, records held in Pier, and previously exported files or backups remain. Handle these separately if they also need erasure.</Notice>
      <div className="br-erasure-controls"><AccountPicker accounts={accounts} value={accountId} onChange={setAccountId} />
      <div className="br-actions"><button className="br-danger" disabled={busy || !account} onClick={() => { setConfirmation(''); setConfirming(true) }}>Review account erasure</button></div></div>
    </div>
    {confirming && account && <Dialog title={`Erase ${account.value.name}?`} busy={busy} onClose={() => setConfirming(false)}>
      <p>This removes the unused account and its retained import custody. Customer portal access ends immediately. This action cannot be undone.</p>
      <p>Accounts with orders are protected. Pier records, sign-in identity and existing exports or backups remain.</p>
      <label>Type ERASE to confirm<input autoFocus value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy} autoComplete="off" /></label>
      <div className="br-actions"><button className="br-secondary" onClick={() => setConfirming(false)} disabled={busy}>Cancel</button><button className="br-danger" onClick={() => void erase()} disabled={busy || confirmation !== 'ERASE'}>{busy ? 'Erasing…' : 'Permanently erase account'}</button></div>
    </Dialog>}
  </div>
}
