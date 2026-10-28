import { useRef, useState } from 'react'
import { errorMessage, request } from './api'
import { JsonDetail, Notice } from './primitives'

type Counts = { documents: number; lines: number; lists: number; listLines: number }
type Entities = { customers: number; contacts: number; addresses: number }
type CurrencyTotal = { currency: string; orders: number; quotes: number; totalCents: number; shippingCents: number; quantity: number; openQuantity?:number }
type Preview = {
  fingerprint: string
  source: Counts
  planned: Counts & { newDocuments: number; newLists: number }
  catalog?: unknown
  priceBooks?: Array<{accountId:string;currency:string;sourceRows:number;plannedRows:number;sourceUnitCents:number;plannedUnitCents:number}>
  nativeEntities?: { source: Entities; planned: Entities & { newCustomers: number; newContacts: number; newAddresses: number } }
  totals: CurrencyTotal[]
  plannedTotals: CurrencyTotal[]
  rejectedFields: string[]
  missing: string[]
  errors: string[]
  matches: boolean
  incomplete: boolean
  label: string
  invitationCandidates: Array<{ accountId: string; email: string; name: string }>
}
type Review = { input: Record<string, unknown>; report: Preview }
type Applied = { id?: string; fingerprint: string; replayed?: boolean }

function SourceReview({ report, name }: { report: Preview; name:string }) {
  const native = report.nativeEntities
  return <div className="br-stack">
    <div className="br-table-wrap"><table>
      <caption>{name} source and planned records</caption>
      <thead><tr><th scope="col">Records</th><th scope="col">Source</th><th scope="col">Planned</th></tr></thead>
      <tbody>{([['documents', 'Documents'], ['lines', 'Document lines'], ['lists', 'Lists'], ['listLines', 'List lines']] as const).map(([key, label]) => <tr key={key}><th scope="row">{label}</th><td>{report.source[key]}</td><td>{report.planned[key]}</td></tr>)}</tbody>
    </table></div>
    {Boolean(report.priceBooks?.length) && <div className="br-table-wrap"><table><caption>Supplied current price books, in exact currency cents</caption><thead><tr><th scope="col">Account</th><th scope="col">Currency</th><th scope="col">Source rows</th><th scope="col">Planned rows</th><th scope="col">Source unit cents</th><th scope="col">Planned unit cents</th></tr></thead><tbody>{report.priceBooks!.map(book=><tr key={book.accountId}><th scope="row">{book.accountId}</th><td>{book.currency}</td><td>{book.sourceRows}</td><td>{book.plannedRows}</td><td>{book.sourceUnitCents}</td><td>{book.plannedUnitCents}</td></tr>)}</tbody></table></div>}
    <p>New retained documents: {report.planned.newDocuments}. New lists: {report.planned.newLists}.</p>
    {native && <div className="br-table-wrap"><table>
      <caption>Native customer, contact and address reconciliation</caption>
      <thead><tr><th scope="col">Records</th><th scope="col">Source</th><th scope="col">Planned</th><th scope="col">New native records</th></tr></thead>
      <tbody>{([['customers', 'newCustomers', 'Customers'], ['contacts', 'newContacts', 'Contacts'], ['addresses', 'newAddresses', 'Addresses']] as const).map(([key, newKey, label]) => <tr key={key}><th scope="row">{label}</th><td>{native.source[key]}</td><td>{native.planned[key]}</td><td>{native.planned[newKey]}</td></tr>)}</tbody>
    </table></div>}
    <div className="br-table-wrap"><table>
      <caption>Currency totals and quantities, in exact currency cents</caption>
      <thead><tr><th scope="col">Currency</th><th scope="col">Stage</th><th scope="col">Orders</th><th scope="col">Quotes</th><th scope="col">Quantity</th>{report.catalog ? <th scope="col">Open quantity</th> : null}<th scope="col">Total cents</th><th scope="col">Shipping cents</th></tr></thead>
      <tbody>{([['Source', report.totals], ['Planned', report.plannedTotals]] as const).flatMap(([stage, totals]) => totals.map(total => <tr key={`${stage}:${total.currency}`}><th scope="row">{total.currency}</th><td>{stage}</td><td>{total.orders}</td><td>{total.quotes}</td><td>{total.quantity}</td>{report.catalog ? <td>{total.openQuantity}</td> : null}<td>{total.totalCents}</td><td>{total.shippingCents}</td></tr>))}</tbody>
    </table></div>
    <p>{report.matches ? 'Source and planned totals match.' : 'Source and planned totals do not match. Resolve the differences before applying.'} {report.incomplete ? 'This export is incomplete; review the missing source scope.' : 'The declared source scope is complete.'}</p>
    <div><h4>Rejected fields</h4>{report.rejectedFields.length ? <ul>{report.rejectedFields.map((field, index) => <li key={index}>{field}</li>)}</ul> : <p>No rejected fields reported.</p>}</div>
    <div><h4>Missing source entities and limitations</h4>{report.missing.length ? <ul>{report.missing.map((message, index) => <li key={index}>{message}</li>)}</ul> : <p>No missing source entities reported.</p>}</div>
    <div><h4>Errors to resolve</h4>{report.errors.length ? <Notice error><ul>{report.errors.map((message, index) => <li key={index}>{message}</li>)}</ul></Notice> : <p>No unresolved errors reported.</p>}</div>
    <div><h4>Invitation candidates</h4><p>Website users require a separate explicit native invitation review. Applying this import does not send invitations.</p>
      {(report.invitationCandidates??[]).length ? <div className="br-table-wrap"><table><caption>Website users retained for invitation review</caption><thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Account</th></tr></thead><tbody>{report.invitationCandidates.map(candidate => <tr key={candidate.email}><th scope="row">{candidate.name}</th><td>{candidate.email}</td><td>{candidate.accountId}</td></tr>)}</tbody></table></div> : <p>No invitation candidates supplied.</p>}
    </div>
    {Boolean(report.catalog) && <JsonDetail value={report.catalog} label="Review product coverage and image slots" />}
    <JsonDetail value={report} label={`Review complete ${name} preview`} />
  </div>
}

export function WizCommerceMoveIn({ reload }: { reload: () => Promise<void> }) {
  const [system,setSystem] = useState('wizcommerce')
  const name=system==='nuorder'?'NuORDER':'WizCommerce'
  const [source, setSource] = useState('')
  const [review, setReview] = useState<Review | null>(null)
  const [reviewed, setReviewed] = useState(false)
  const [reason, setReason] = useState('')
  const [applied, setApplied] = useState<Applied | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)

  function changeSource(value: string) {
    setSource(value); setReview(null); setReviewed(false); setReason(''); setApplied(null); setError('')
  }
  async function act(action: () => Promise<void>) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try { await action() } catch (cause) { setError(errorMessage(cause)) }
    finally { lock.current = false; setBusy(false) }
  }
  async function preview() {
    setReview(null); setReviewed(false); setApplied(null)
    let input: unknown
    try { input = JSON.parse(source) } catch { throw new Error(`Supply valid JSON in ${name} source.`) }
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(`The ${name} source must be a JSON manifest object.`)
    const manifest = input as Record<string, unknown>
    const report = await request<Preview>(`/api/barrow/imports/${system}/preview`, manifest)
    setReview({ input: manifest, report })
  }
  const canApply = review && reviewed && reason.trim() && review.report.matches && review.report.errors.length === 0
  async function apply() {
    if (!review || !canApply) return
    const result = await request<Applied>(`/api/barrow/imports/${system}/apply`, { ...review.input, fingerprint: review.report.fingerprint, reason: reason.trim() })
    setApplied(result)
    try { await reload() } catch (cause) { throw new Error(`${name} import completed, but the latest records could not be loaded. Refresh records before continuing. ${errorMessage(cause)}`) }
  }
  return <section className="br-card br-stack" aria-label={`${name} move-in`} aria-busy={busy}>
    <h2>{name} move-in</h2>
    <label>Source system<select aria-label="Source system" value={system} disabled={busy} onChange={event=>{setSystem(event.target.value);changeSource('')}}><option value="wizcommerce">WizCommerce</option><option value="nuorder">NuORDER</option></select></label>
    <p>Upload or paste a JSON manifest containing your real CSV exports or an XLSX workbook encoded as base64, source scope and explicit customer and product mappings. Preview and review the exact source before applying.</p>
    <label>Choose {name} manifest<input type="file" accept=".json,application/json" disabled={busy} onChange={event => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (file) { changeSource(''); void act(async () => changeSource(await file.text())) }
    }} /></label>
    <label>{name} source<textarea aria-label={`${name} source`} value={source} rows={9} spellCheck={false} disabled={busy} onChange={event => changeSource(event.target.value)} /></label>
    <div className="br-actions"><button type="button" disabled={busy || !source.trim()} onClick={() => void act(preview)}>Preview {name} import</button></div>
    {error && <Notice error>{error}</Notice>}
    {applied && <Notice>{name} import completed.{applied.replayed ? ' Replay confirmed; this approval was already applied.' : ''}{applied.id ? ` Import reference: ${applied.id}.` : ''} {system==='nuorder'?'Review retained history, image slots, held files and retrieval failures; document rebuilding remains pending.':'Review native customers, contacts and addresses in Accounts.'} Keep this exact source and reviewed fingerprint: replaying the same approval does not create duplicate records.</Notice>}
    {review && <div className="br-stack" role="region" aria-label={`${name} preview`}>
      <h3>Review {name} import</h3>
      <p>{review.report.label}</p>
      <SourceReview report={review.report} name={name} />
      <label>{name} reviewed fingerprint<input value={review.report.fingerprint} readOnly className="br-mono" /></label>
      <label>{name} approval reason<textarea value={reason} rows={3} maxLength={1000} disabled={busy || !!applied} onChange={event => { setReason(event.target.value); setReviewed(false) }} /></label>
      <label><input type="checkbox" style={{ width: 'auto', marginRight: 8 }} checked={reviewed} disabled={busy || !review.report.matches || review.report.errors.length > 0} onChange={event => setReviewed(event.target.checked)} />I reviewed this {name} source, native entities, mappings, totals, missing fields and exact fingerprint.</label>
      <p>Applying creates only the native entities named in this preview and retains source history. Review invitations separately. Any source edit requires a fresh preview and approval.</p>
      <div className="br-actions"><button type="button" disabled={busy || !canApply} onClick={() => void act(apply)}>{applied ? `Replay reviewed ${name} import` : `Apply reviewed ${name} import`}</button></div>
    </div>}
  </section>
}
