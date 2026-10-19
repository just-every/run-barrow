import { useState } from 'react'
import type { RunCommand } from './types'

// STK-002: the merchant's stock freshness limit; a draft observed longer ago cannot be submitted without a refresh or exception.
export function FreshnessSetting({ minutes, busy, run }: { minutes: number | null; busy: boolean; run: RunCommand }) {
  const [value, setValue] = useState(minutes === null ? '' : String(minutes))
  return <form className="br-card br-stack" onSubmit={event => { event.preventDefault(); void run('settings.save', { stockFreshnessMinutes: value.trim() ? Number(value) : null }) }}>
    <h2>Stock freshness limit</h2>
    <p>{minutes === null ? 'No limit: a draft can be submitted however long ago its Pier stock was observed.' : `A draft whose Pier stock was observed more than ${minutes} minutes ago is refused at submission until it is prepared again or you record an exception.`} Approval always reserves against live Pier stock.</p>
    <label>Limit in minutes (empty for no limit)<input inputMode="numeric" value={value} disabled={busy} onChange={event => setValue(event.target.value)} /></label>
    <div className="br-actions"><button disabled={busy}>Save freshness limit</button></div>
  </form>
}
