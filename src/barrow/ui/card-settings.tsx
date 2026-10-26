import { CardConsent } from './card-consent'
import { useEffect, useState, type FormEvent } from 'react'
import { errorMessage, request } from './api'
import { Notice } from './primitives'

type Settings = { configured: boolean; mode: 'test' | 'live'; surchargeBps: number; allowedStates: string[]; revision: string | number }

export function CardSettings() {
  const [mode,setMode]=useState<'test'|'live'>('test')
  const [settings, setSettings] = useState<Settings | null>(null)
  const [secretKey, setSecretKey] = useState(''), [surchargeBps, setSurchargeBps] = useState('0'), [allowedStates, setAllowedStates] = useState('')
  const [reason, setReason] = useState(''), [disconnectReason, setDisconnectReason] = useState(''), [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')

  function apply(value: Settings) {
    setSettings(value); setMode(value.mode); setSurchargeBps(String(value.surchargeBps)); setAllowedStates(value.allowedStates.join(', '))
  }
  useEffect(() => {
    let current = true
    void request<Settings>('/api/barrow/card-settings').then(value => { if (current) apply(value) }).catch(cause => { if (current) setError(errorMessage(cause)) })
    return () => { current = false }
  }, [])

  const states = allowedStates.split(',').map(value => value.trim().toUpperCase()).filter(Boolean)
  const validStates = states.every(value => /^[A-Z]{2}$/.test(value)) && new Set(states).size === states.length
  const bps = Number(surchargeBps)
  const validSurcharge = surchargeBps.trim() !== '' && Number.isInteger(bps) && bps >= 0 && bps <= 300

  async function command(type: string, payload: Record<string, unknown>) {
    if (busy) return
    setBusy(true); setError(''); setMessage('')
    try {
      await request('/api/barrow/commands', { type, payload })
      setSecretKey(''); setConsent(false); setReason(''); setDisconnectReason('')
      setMessage(type === 'card.connect' ? 'Stripe connection saved. The secret key is masked and is not displayed.' : 'Stripe card connection disconnected.')
      try { apply(await request<Settings>('/api/barrow/card-settings')) }
      catch (cause) { setSettings(null); setError(`The change was accepted, but settings could not be reloaded. ${errorMessage(cause)}`) }
    } catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }
  async function connect(event: FormEvent) {
    event.preventDefault()
    if (!validStates || !validSurcharge || !consent || !secretKey.trim() || !reason.trim()) return
    await command('card.connect', { secretKey: secretKey.trim(), consent: true, reason: reason.trim(), mode, surchargeBps: bps, allowedStates: states })
  }
  async function reload() {
    setBusy(true); setError('')
    try { apply(await request<Settings>('/api/barrow/card-settings')); setConsent(false) }
    catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }

  return <section className="br-card br-stack" aria-label="Stripe card settings" aria-busy={busy}>
    <h2>Stripe card payments</h2>
    {error && <Notice error>{error}</Notice>}
    {message && <Notice>{message}</Notice>}
    {!settings && !error && <p role="status">Loading card settings…</p>}
    {settings && <>
      <p><strong>{settings.configured ? `Stripe connected · ${settings.mode} mode · secret key configured (masked)` : 'Stripe not connected'}</strong></p>
      <p>The selected mode must match your Stripe key. Stripe hosts card collection and holds card details. Barrow keeps payment references and masked card details. Connecting creates a Stripe webhook endpoint for verified payment updates.</p>
      <p className="br-quiet-text">Current surcharge: {settings.surchargeBps} basis points ({settings.surchargeBps / 100}%). Reviewed states: {settings.allowedStates.length ? settings.allowedStates.join(', ') : 'none'}. </p>
      {!settings.configured&&<form className="br-stack" onSubmit={event => void connect(event)}>
        <h3>{settings.configured ? 'Replace connection or update surcharge policy' : 'Connect Stripe account'}</h3>
        <label>Collection mode<select aria-label="Collection mode" value={mode} disabled={busy} onChange={event=>{setMode(event.target.value as 'test'|'live');setConsent(false)}}><option value="test">Test mode</option><option value="live">Live mode</option></select></label>
        <label>Stripe secret key<input type="password" autoComplete="new-password" required value={secretKey} maxLength={256} disabled={busy} onChange={event => { setSecretKey(event.target.value); setConsent(false) }} /></label>
        <p className="br-quiet-text">The server verifies the selected mode with Stripe before saving the connection.</p>
        <div className="br-form-grid">
          <label>Credit card surcharge (basis points)<input type="number" min="0" max="300" step="1" required value={surchargeBps} disabled={busy} onChange={event => { setSurchargeBps(event.target.value); setConsent(false) }} /></label>
          <label>Reviewed state allowlist<input value={allowedStates} placeholder="Two-letter state codes, separated by commas" maxLength={200} disabled={busy} onChange={event => { setAllowedStates(event.target.value); setConsent(false) }} /></label>
        </div>
        <p className="br-quiet-text">100 basis points equals 1%. The maximum is 300 basis points (3%). Only list states you have reviewed for this policy. An empty list permits no surcharge. Debit cards and states prohibited by Barrow’s payment policy cannot be surcharged, even if listed.</p>
        {!validStates && <p role="alert">Enter unique two-letter state codes separated by commas.</p>}
        <label>Connection or policy change reason<input required value={reason} maxLength={1000} disabled={busy} onChange={event => setReason(event.target.value)} /></label>
        <CardConsent checked={consent} disabled={busy} onChange={setConsent}>I authorize Barrow to store this Stripe secret key and create the payment webhook. I authorize Stripe to hold card and payment data, and I have reviewed the surcharge and state allowlist above.</CardConsent>
        <div className="br-actions"><button disabled={busy || !consent || !validStates || !validSurcharge || !secretKey.trim() || !reason.trim()}>Save Stripe connection</button></div>
      </form>}
      {settings.configured && <div className="br-stack">
        <h3>Disconnect Stripe</h3>
        <label>Disconnection reason<input value={disconnectReason} maxLength={1000} disabled={busy} onChange={event => setDisconnectReason(event.target.value)} /></label>
        <div className="br-actions"><button type="button" className="br-danger" disabled={busy || !disconnectReason.trim()} onClick={() => void command('card.disconnect', { reason: disconnectReason.trim() })}>Disconnect Stripe</button></div>
      </div>}
    </>}
    <div className="br-actions"><button type="button" className="br-secondary" disabled={busy} onClick={() => void reload()}>Reload card settings</button></div>
  </section>
}
