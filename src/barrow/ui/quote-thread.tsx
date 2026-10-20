import { useState, type FormEvent } from 'react'
import { when, type RunCommand } from './types'

export interface ThreadEntry { id: string; kind: 'message' | 'internal'; side: 'buyer' | 'supplier'; authorEmail: string; body: string; quoteRevision: number; at: string; attachment?: { name: string; size: number; path: string } }
export interface QuoteNotice { id: string; kind: string; summary: string; at: string }
export interface RevisionHistory { number: number; proposedByEmail?: string; proposedAt: string; changes?: string[] }

// ORD-005: who changed the commercial terms in each revision, and what changed against the one before.
export function RevisionHistoryList({ revisions }: { revisions: RevisionHistory[] }) {
  if (!revisions.length) return null
  return <details><summary>Revision history ({revisions.length})</summary>
    <ol className="br-stack">{revisions.map(revision => <li key={revision.number}><strong>Revision {revision.number}</strong> · {revision.proposedByEmail ?? 'Supplier'} · {when(revision.proposedAt)}
      {revision.changes?.length ? <ul>{revision.changes.map(change => <li key={change}>{change}</li>)}</ul> : <p className="br-quiet-text">No commercial terms changed.</p>}</li>)}</ol>
  </details>
}

// ORD-005: unread activity for this side; reading the quote clears it for everyone on the same side.
export function QuoteNotices({ quoteId, notices, busy, run }: { quoteId: string; notices: QuoteNotice[]; busy: boolean; run: RunCommand }) {
  if (!notices.length) return null
  return <div className="br-stack" role="status" aria-label={`${notices.length} new on ${quoteId}`}>
    <ul>{notices.map(notice => <li key={notice.id}>{notice.summary} <small>{when(notice.at)}</small></li>)}</ul>
    <div className="br-actions"><button type="button" className="br-secondary" disabled={busy} onClick={() => void run('quote.read', { quoteId })}>Mark read</button></div>
  </div>
}

// ORD-005: the quote conversation. Buyers see messages; supplier staff also see and write internal notes.
export function QuoteConversation({ quoteId, thread, supplier, busy, run }: { quoteId: string; thread: ThreadEntry[]; supplier: boolean; busy: boolean; run: RunCommand }) {
  const [body, setBody] = useState('')
  const [internal, setInternal] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  async function post(event: FormEvent) {
    event.preventDefault()
    let attachment: { name: string; contentBase64: string } | undefined
    if (file) {
      const bytes = new Uint8Array(await file.arrayBuffer())
      let binary = ''
      for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
      attachment = { name: file.name, contentBase64: btoa(binary) }
    }
    if (await run('quote.message', { quoteId, body, ...(internal ? { internal: true } : {}), ...(attachment ? { attachment } : {}) })) { setBody(''); setFile(null); setInternal(false) }
  }
  return <details><summary>Conversation ({thread.length})</summary>
    <ol className="br-stack">{thread.map(entry => <li key={entry.id}>
      <p><strong>{entry.kind === 'internal' ? 'Internal note · staff only' : entry.side === 'buyer' ? 'Buyer' : 'Supplier'}</strong> · {entry.authorEmail} · {when(entry.at)} · on revision {entry.quoteRevision || 'request'}</p>
      <p>{entry.body}</p>
      {entry.attachment && <a className="br-secondary" href={entry.attachment.path} download>{entry.attachment.name}</a>}
    </li>)}</ol>
    <form className="br-stack" aria-label={`Write on ${quoteId}`} onSubmit={event => void post(event)}>
      <label>{internal ? 'Internal note (supplier staff only)' : 'Message'}<textarea required maxLength={2000} value={body} disabled={busy} onChange={event => setBody(event.target.value)} /></label>
      <label>Attachment (PDF, PNG or JPEG, up to 1 MB)<input type="file" accept="application/pdf,image/png,image/jpeg" disabled={busy} onChange={event => setFile(event.target.files?.[0] ?? null)} /></label>
      {supplier && <label><input type="checkbox" checked={internal} disabled={busy} onChange={event => setInternal(event.target.checked)} /> Internal note: the buyer never sees it</label>}
      <div className="br-actions"><button disabled={busy || !body.trim()}>{internal ? 'Add internal note' : 'Send message'}</button></div>
    </form>
  </details>
}
