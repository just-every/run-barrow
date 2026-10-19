import { useRef, useState } from 'react'
import { request, errorMessage } from './api'
import { Notice } from './primitives'
import { when } from './types'

export function AgentCredential() {
  const [credential, setCredential] = useState<{ token: string; expiresAt: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  async function act(revoke: boolean) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError(''); setNotice(''); setCredential(null)
    try {
      if (revoke) { await request('/api/barrow/agent-token/revoke', {}); setNotice('Your agent credentials have been revoked.') }
      else setCredential(await request<{ token: string; expiresAt: number }>('/api/barrow/agent-token', {}))
    } catch (error) { setError(errorMessage(error)) }
    finally { lock.current = false; setBusy(false) }
  }
  return <div className="br-card br-stack"><h2>Let an agent prepare drafts</h2><p>A private agent credential can read supplier accounts and live catalogs, and prepare draft orders. A signed-in person must review and submit each draft; supplier approval reserves stock.</p><p className="br-quiet-text">Agent credentials cannot submit or approve orders, export, import or erase data. Credentials expire after seven days and act with your supplier access.</p>
    {error && <Notice error>{error}</Notice>}{notice && <Notice>{notice}</Notice>}
    <div className="br-actions br-agent-actions"><button disabled={busy} onClick={() => void act(false)}>Create private agent credential</button><button disabled={busy} className="br-secondary" onClick={() => void act(true)}>Revoke my agent credentials</button></div>
    {credential && <div className="br-stack"><Notice>Copy this credential now and share it only with your agent. It is displayed once and is cleared when you leave this page.</Notice><label>Private credential<input readOnly type="password" value={credential.token} autoComplete="off" onFocus={event => event.currentTarget.select()} /></label><p className="br-quiet-text">Expires: {when(new Date(credential.expiresAt).toISOString())}</p><div className="br-actions"><button className="br-secondary" onClick={() => {
      void navigator.clipboard.writeText(credential.token).then(() => setNotice('Credential copied. Keep it private.')).catch(() => setError('Clipboard is unavailable. Select and copy the credential field.'))
    }}>Copy credential</button><button className="br-quiet" onClick={() => setCredential(null)}>Hide credential</button></div></div>}
  </div>
}
