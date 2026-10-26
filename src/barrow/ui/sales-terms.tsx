import { useEffect, useRef, useState, type FormEvent } from 'react'
import { request, errorMessage } from './api'
import { AccountPicker } from './primitives'
import type { Account, RunCommand } from './types'
import { when } from './types'

type Version = { series: string; version: number; title: string; contentSha256: string; createdAt: string; hasText: boolean; pdf?: { name: string; size: number; sha256: string } }
type Current = Version & { body: string }
type Admin = { series: { series: string; versions: Version[]; current: Current }[]; assignments: { accountId: string; series: string; requireAcceptance: boolean }[] }
export type TermsChoice = { required: boolean; payload?: Record<string, unknown> }
const pdfLink = (version: Version) => version.pdf && <a href={`/api/barrow/sales-terms/${encodeURIComponent(version.series)}/${version.version}/document`} download>Download the PDF ({version.pdf.name})</a>

// ORD-015, supplier side: publish versions of sales terms as text or a PDF and assign a series to each account.
export function SalesTerms({ accounts, busy, run }: { accounts: Account[]; busy: boolean; run: RunCommand }) {
  const [data, setData] = useState<Admin | null>(null), [error, setError] = useState(''), [tick, setTick] = useState(0)
  const [form, setForm] = useState({ series: '', title: '', body: '' }), [file, setFile] = useState<File | null>(null)
  const [accountId, setAccountId] = useState(''), [series, setSeries] = useState(''), [required, setRequired] = useState(true)
  useEffect(() => {
    let current = true
    void request<Admin>('/api/barrow/sales-terms').then(value => { if (current) { setData(value); setError('') } }).catch(cause => { if (current) setError(errorMessage(cause)) })
    return () => { current = false }
  }, [tick])
  async function publish(event: FormEvent) {
    event.preventDefault()
    let pdf: { name: string; contentBase64: string } | undefined
    if (file) {
      const bytes = new Uint8Array(await file.arrayBuffer()); let binary = ''
      for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
      pdf = { name: file.name, contentBase64: btoa(binary) }
    }
    if (await run('terms.publish', { series: form.series, title: form.title, ...(form.body.trim() ? { body: form.body } : {}), ...(pdf ? { pdf } : {}) })) { setForm(value => ({ ...value, title: '', body: '' })); setFile(null); setTick(value => value + 1) }
  }
  const assigned = (id: string) => data?.assignments.find(row => row.accountId === id)
  async function assign(next: string | null) {
    if (await run('terms.assign', { accountId, series: next, ...(next === null ? {} : { requireAcceptance: required }) })) setTick(value => value + 1)
  }
  return <div className="br-card br-stack" aria-label="Sales terms"><h2>Sales terms</h2>
    <p>Publish versions of your sales terms (cancellation, returns, chargebacks, minimums and deposits) as text or a PDF. A published version never changes; a new version applies to each assigned account’s next order. Where an account must accept terms, it cannot submit an order until the buyer accepts the current version, or you capture the buyer’s signature and printed name for a rep order.</p>
    {error && <p role="alert">{error}</p>}
    {data?.series.map(entry => <div key={entry.series}><strong>{entry.series}</strong> · current version {entry.current.version}: {entry.current.title} · {pdfLink(entry.current)}
      <ul>{entry.versions.map(version => <li key={version.version}>Version {version.version} · {version.title} · published {when(version.createdAt)}</li>)}</ul></div>)}
    <form className="br-stack" onSubmit={event => void publish(event)}><h3>Publish a version</h3>
      <label>Series<input list="br-terms-series" value={form.series} maxLength={80} required disabled={busy} onChange={event => setForm(value => ({ ...value, series: event.target.value }))} /></label>
      <datalist id="br-terms-series">{data?.series.map(entry => <option key={entry.series} value={entry.series} />)}</datalist>
      <label>Title<input value={form.title} maxLength={160} required disabled={busy} onChange={event => setForm(value => ({ ...value, title: event.target.value }))} /></label>
      <label>Terms text<textarea value={form.body} maxLength={20000} rows={6} disabled={busy} onChange={event => setForm(value => ({ ...value, body: event.target.value }))} /></label>
      <label>Terms PDF (optional, up to 1 MB)<input type="file" accept="application/pdf" disabled={busy} onChange={event => setFile(event.target.files?.[0] ?? null)} /></label>
      <button disabled={busy || !form.series.trim() || !form.title.trim() || (!form.body.trim() && !file)}>Publish new version</button></form>
    {data && data.series.length > 0 && accounts.length > 0 && <div className="br-stack"><h3>Assign terms to an account</h3>
      <AccountPicker accounts={accounts} value={accountId} onChange={id => { setAccountId(id); const row = assigned(id); setSeries(row?.series ?? ''); setRequired(row?.requireAcceptance ?? true) }} />
      {accountId && <>
        <p>{assigned(accountId) ? `Assigned: ${assigned(accountId)!.series}${assigned(accountId)!.requireAcceptance ? ' (acceptance required)' : ' (acceptance optional)'}` : 'No sales terms assigned.'}</p>
        <label>Series<select value={series} disabled={busy} onChange={event => setSeries(event.target.value)}><option value="">Choose a series</option>{data.series.map(entry => <option key={entry.series} value={entry.series}>{entry.series}</option>)}</select></label>
        <label><input type="checkbox" checked={required} disabled={busy} onChange={event => setRequired(event.target.checked)} />Require acceptance before an order is submitted</label>
        <div className="br-actions"><button type="button" disabled={busy || !series} onClick={() => void assign(series)}>Assign terms</button>{assigned(accountId) && <button type="button" className="br-secondary" disabled={busy} onClick={() => void assign(null)}>Remove terms</button>}</div></>}
    </div>}
  </div>
}

// A canvas the buyer signs with a finger or pointer; the PNG is sent only with the order submission.
function SignaturePad({ onChange }: { onChange: (png: string | null) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null), drawing = useRef(false), inked = useRef(false)
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => { const box = event.currentTarget.getBoundingClientRect(); return [(event.clientX - box.left) * event.currentTarget.width / box.width, (event.clientY - box.top) * event.currentTarget.height / box.height] as const }
  const clear = () => { const element = canvas.current!; element.getContext('2d')!.clearRect(0, 0, element.width, element.height); inked.current = false; onChange(null) }
  return <div className="br-stack"><canvas ref={canvas} width={360} height={140} role="img" aria-label="Signature area: sign with a finger or mouse" style={{ border: '1px solid currentColor', touchAction: 'none', maxWidth: '100%' }}
    onPointerDown={event => { const [x, y] = point(event), context = event.currentTarget.getContext('2d')!; event.currentTarget.setPointerCapture(event.pointerId); drawing.current = true; context.lineWidth = 2; context.lineCap = 'round'; context.beginPath(); context.moveTo(x, y) }}
    onPointerMove={event => { if (!drawing.current) return; const [x, y] = point(event), context = event.currentTarget.getContext('2d')!; context.lineTo(x, y); context.stroke(); inked.current = true }}
    onPointerUp={event => { drawing.current = false; if (inked.current) onChange(event.currentTarget.toDataURL('image/png').split(',')[1]) }} />
    <button type="button" className="br-secondary" onClick={clear}>Clear signature</button></div>
}

// ORD-015, submission side: show the account's current terms and collect the buyer's acceptance (buyer) or signature and printed name (supplier staff acting for a rep).
export function OrderTerms({ accountId, profileId, supplier, onChange }: { profileId?:string; accountId: string; supplier: boolean; onChange: (choice: TermsChoice) => void }) {
  const [terms, setTerms] = useState<{ requireAcceptance: boolean; current: Current } | null>(null), [error, setError] = useState('')
  const [accepted, setAccepted] = useState(false), [name, setName] = useState(''), [png, setPng] = useState<string | null>(null)
  useEffect(() => {
    let current = true
    void request<{ assignment: { requireAcceptance: boolean; current: Current } | null }>(`/api/barrow/sales-terms?${new URLSearchParams({ accountId,...(profileId?{profileId}:{}) })}`).then(value => { if (current) { setTerms(value.assignment); onChange({ required: value.assignment?.requireAcceptance ?? false }) } }).catch(cause => { if (current) setError(errorMessage(cause)) })
    return () => { current = false }
  }, [accountId,profileId])
  useEffect(() => {
    if (!terms) return
    const base = { version: terms.current.version }
    onChange({ required: terms.requireAcceptance, ...(supplier ? (name.trim() && png ? { payload: { ...base, printedName: name.trim(), signaturePngBase64: png } } : {}) : accepted ? { payload: { ...base, accepted: true, ...(name.trim() ? { printedName: name.trim() } : {}) } } : {}) })
  }, [terms, accepted, name, png, supplier])
  if (error) return <p role="alert">{error}</p>
  if (!terms) return null
  const { current } = terms, label = `${current.title}, version ${current.version}`
  return <details className="br-details" open={terms.requireAcceptance}><summary>Sales terms: {label}{terms.requireAcceptance ? ' · acceptance required' : ''}</summary>
    {current.body && <p style={{ whiteSpace: 'pre-wrap' }}>{current.body}</p>}{pdfLink(current)}
    {supplier ? <div className="br-stack"><p>Capture the buyer’s on-device signature and printed name. They are recorded as entered; Barrow does not verify identity or certify the signature.</p>
      <label>Buyer’s printed name<input value={name} maxLength={120} onChange={event => setName(event.target.value)} /></label><SignaturePad onChange={setPng} /></div>
      : <div className="br-stack"><label><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} />I accept {label}.</label>
        <label>Printed name (optional)<input value={name} maxLength={120} onChange={event => setName(event.target.value)} /></label></div>}
  </details>
}
