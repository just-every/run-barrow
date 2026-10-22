import { useEffect, useState } from 'react'
import { request, errorMessage } from './api'
import { Notice } from './primitives'
import { money } from './types'
import type { readApprovalNotices } from '../approval-notices'

type Data = Awaited<ReturnType<typeof readApprovalNotices>>
type Item = Data['notices'][number]
const roleLabel = (notice: Item) => notice.role === 'delegate' ? `As delegate for ${notice.standingInFor}` : notice.role === 'escalation' ? 'Escalated to you' : 'Your approval step'

/** AUTO-002: the approval steps waiting for this company approver, as named approver, delegate or escalation approver. */
export function ApprovalNotices({ version }: { version: unknown }) {
  const [data, setData] = useState<Data | null>(null), [error, setError] = useState('')
  useEffect(() => {
    let live = true
    void request<Data>('/api/barrow/approval-notices').then(value => { if (live) setData(value) }).catch(cause => { if (live) setError(errorMessage(cause)) })
    return () => { live = false }
  }, [version])
  if (error) return <Notice error>{error}</Notice>
  if (!data) return null
  return <section className="br-card br-stack" aria-label="Approvals waiting for you">
    <h2>Approvals waiting for you</h2>
    {data.notices.length ? <ul className="br-stack">{data.notices.map(notice => <li key={notice.id}><strong>{notice.reference || notice.orderId}</strong> · {money(notice.totalCents)} · {roleLabel(notice)}<br />{notice.cause}</li>)}</ul> : <p>No approval steps are waiting for you.</p>}
    <p className="br-quiet-text">{data.note}</p>
  </section>
}
