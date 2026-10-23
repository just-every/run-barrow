import { useEffect, useRef, useState } from 'react'
import type { CutoverInput } from '../imports/cutover-source'
import { request, errorMessage } from './api'
import { Dialog } from './dialog'
import { JsonDetail, Notice } from './primitives'

type CutoverReport = Awaited<ReturnType<typeof import('../imports/cutover-service').previewCutover>>
interface HistoryRow {
  id: string; state: string; fingerprint: string; approved_by: string; approved_at: string; reason: string
  undone_by?: string; undone_at?: string
}
interface CutoverJournal extends HistoryRow { report: CutoverReport; source: unknown }
const maxBytes = 1024 * 1024
const checkboxStyle = { width: 20, minHeight: 20, verticalAlign: 'middle', marginRight: 8 }
const sourceKey = (source: CutoverReport['proposals'][number]['source']) => `${source.kind}:${source.id}`

function workbookBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read the workbook. Choose the file again.'))
    reader.onabort = () => reject(new Error('Workbook reading was interrupted. Choose the file again.'))
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const marker = result.indexOf(';base64,')
      if (marker < 0) reject(new Error('Could not encode the workbook. Choose the file again.'))
      else resolve(result.slice(marker + 8))
    }
    reader.readAsDataURL(file)
  })
}

function ComparisonTotals({ report }: { report: CutoverReport }) {
  return <div className="br-table-wrap"><table>
    <caption>Source and scoped native totals, separated by category and currency. Amounts are exact cents.</caption>
    <thead><tr><th scope="col">Category</th><th scope="col">Currency</th><th scope="col">Source count</th><th scope="col">Native count</th><th scope="col">Source cents</th><th scope="col">Native cents</th><th scope="col">Difference cents</th><th scope="col">Source quantity</th><th scope="col">Native quantity</th><th scope="col">Quantity difference</th></tr></thead>
    <tbody>{report.totals.map(total => <tr key={`${total.kind}:${total.currency}`}>
      <th scope="row">{total.kind}</th><td>{total.currency || 'Not applicable'}</td><td>{total.sourceCount}</td><td>{total.targetCount}</td><td>{total.sourceCents}</td><td>{total.targetCents}</td><td>{total.differenceCents}</td><td>{total.sourceQuantity}</td><td>{total.targetQuantity}</td><td>{total.sourceQuantity - total.targetQuantity}</td>
    </tr>)}</tbody>
  </table></div>
}

export function CutoverReview() {
  const [workbook, setWorkbook] = useState<CutoverInput['workbook'] | null>(null)
  const [ledger, setLedger] = useState<CutoverInput['ledger'] | null>(null)
  const [scopeText, setScopeText] = useState('')
  const [runId, setRunId] = useState('')
  const [consent, setConsent] = useState(false)
  const [report, setReport] = useState<CutoverReport | null>(null)
  const [mappings, setMappings] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState(false)
  const [sourceChanged, setSourceChanged] = useState(false)
  const [approveMappings, setApproveMappings] = useState(false)
  const [approveBalances, setApproveBalances] = useState(false)
  const [disposition, setDisposition] = useState('')
  const [imports, setImports] = useState<HistoryRow[]>([])
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [journal, setJournal] = useState<CutoverJournal | null>(null)
  const [activatedFingerprint, setActivatedFingerprint] = useState('')
  const [undoId, setUndoId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const lock = useRef(false)

  async function list() {
    const result = await request<{ imports: HistoryRow[] }>('/api/barrow/cutover')
    setImports(result.imports); setHistoryLoaded(true)
  }
  useEffect(() => { void list().catch(cause => setError(errorMessage(cause))) }, [])
  async function act(action: () => Promise<void>) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError(''); setNotice('')
    try { await action() } catch (cause) { setError(errorMessage(cause)) }
    finally { lock.current = false; setBusy(false) }
  }
  function clearSignoffs() { setApproveMappings(false); setApproveBalances(false); setDisposition(''); setNotice('') }
  function changeSource() {
    clearSignoffs(); setConsent(false); setDirty(true); setSourceChanged(true); setMappings({})
  }
  const scope = scopeText.split(',').map(id => id.trim())
  const validScope = scope.length <= 200 && scope.every(id => /^[-\w.:]{1,100}$/.test(id)) && new Set(scope).size === scope.length
  const validInput = !!workbook && !!ledger && validScope && /^[-\w.:]{1,100}$/.test(runId) && consent
  function input(): CutoverInput {
    if (!workbook || !ledger || !validInput) throw new Error('Choose both exports, enter a valid run ID and account scope, and authorize the read-only comparison.')
    return { workbook, ledger, scope, runId, consent, ...(sourceChanged ? {} : { mappings }) }
  }
  async function compare() {
    clearSignoffs(); setDirty(true)
    const next = await request<CutoverReport>('/api/barrow/cutover/preview', input())
    setReport(next); setMappings(next.mappings); setDirty(false); setSourceChanged(false)
  }
  function correctMapping(key: string, value: string) {
    if (!report) return
    const source = report.proposals.find(proposal => sourceKey(proposal.source) === key)?.source
    setMappings(current => {
      const next = { ...current, [key]: value }
      // An account correction invalidates its children's earlier company-specific targets.
      if (source?.kind === 'accounts') for (const proposal of report.proposals) {
        if (proposal.source.accountId === source.id) next[sourceKey(proposal.source)] = ''
      }
      return next
    })
    clearSignoffs(); setDirty(true)
  }
  const activated = !!report && activatedFingerprint === report.fingerprint
  const canApprove = !!report && !dirty && !busy && validInput && report.canApply && !activated
  async function apply() {
    if (!report || !canApprove || !approveMappings || !approveBalances || !disposition.trim()) return
    const next = await request<CutoverJournal>('/api/barrow/cutover/apply', {
      ...input(), mappings, fingerprint: report.fingerprint, approveMappings: true, approveBalances: true, disposition: disposition.trim(),
    })
    setJournal(next); setActivatedFingerprint(next.fingerprint)
    setNotice(`Cutover ${next.id} is ${next.state}. Approved source history is retained; no provider writes or ledger rewrite were performed.`)
    await list()
  }
  async function undo(id: string) {
    const next = await request<CutoverJournal>(`/api/barrow/cutover/${encodeURIComponent(id)}/undo`, {})
    setJournal(next); setUndoId('')
    setNotice(`Cutover ${next.id} is ${next.state}. Original evidence remains retained. Review the journal below.`)
    await list()
  }

  return <section className="br-stack" aria-label="Cutover review">
    <div><h2>Cutover review</h2><p>Compare an incumbent workbook and accounting ledger export with existing Barrow accounts. Correct identities and review balances before activating retained source history.</p></div>
    {error && <Notice error>{error}</Notice>}{notice && <Notice>{notice}</Notice>}
    <div className="br-card br-stack">
      <h3><span className="br-step-number">1.</span> Choose exports and scope</h3>
      <label>Incumbent workbook (XLSX, at most 1 MiB)<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={event => {
        const file = event.target.files?.[0]
        if (!file) return
        changeSource(); setWorkbook(null)
        void act(async () => {
          if (!/\.xlsx$/i.test(file.name) || !file.size || file.size > maxBytes) throw new Error('Choose a nonempty XLSX workbook of at most 1 MiB.')
          setWorkbook({ name: file.name, base64: await workbookBase64(file) })
        })
      }} />{workbook && <small>Ready: {workbook.name}</small>}</label>
      <label>Ledger export (CSV, at most 1 MiB)<input type="file" accept=".csv,text/csv" disabled={busy} onChange={event => {
        const file = event.target.files?.[0]
        if (!file) return
        changeSource(); setLedger(null)
        void act(async () => {
          if (!/\.csv$/i.test(file.name) || !file.size || file.size > maxBytes) throw new Error('Choose a nonempty ledger CSV of at most 1 MiB.')
          let csv: string
          try { csv = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()) }
          catch { throw new Error('The ledger CSV could not be read as UTF-8. Export it as UTF-8 and choose it again.') }
          setLedger({ name: file.name, csv })
        })
      }} />{ledger && <small>Ready: {ledger.name}</small>}</label>
      <label>Existing target account IDs, separated by commas<input value={scopeText} maxLength={20200} disabled={busy} onChange={event => { changeSource(); setScopeText(event.target.value) }} /><small>Choose 1–200 distinct Barrow account IDs. Import new accounts through the account CSV first.</small></label>
      {scopeText && !validScope && <p role="alert">Use distinct account IDs of at most 100 characters, with letters, digits, dash, underscore, dot or colon.</p>}
      <label>Mapping run ID<input value={runId} maxLength={100} disabled={busy} onChange={event => { changeSource(); setRunId(event.target.value) }} /><small>Enter a stable ID, at most 100 letters, digits, dashes, underscores, dots or colons. Keep it for this comparison run.</small></label>
      <label><input type="checkbox" style={checkboxStyle} checked={consent} disabled={busy} onChange={event => { clearSignoffs(); setConsent(event.target.checked) }} />I authorize native read-only tools to read these supplied exports, only the named Barrow accounts and their records, and their scoped Pier variants. Cost: 0 cents. Contacts: 0.</label>
      <div className="br-actions"><button type="button" disabled={busy || !validInput} onClick={() => void act(compare)}>{report && dirty && !sourceChanged ? 'Recompare corrected mappings' : 'Compare supplied exports'}</button></div>
    </div>
    <div className="br-card br-stack">
      <h3><span className="br-step-number">2.</span> Review mappings and reconciliation</h3>
      {!report && <p>Run a comparison to inspect source citations, candidate identities, quantities and balances.</p>}
      {report && <>
        {dirty && <Notice>The displayed comparison is stale. {sourceChanged ? 'Compare the changed exports and scope.' : 'Recompare corrected mappings.'} Both owner signoffs must be given again after the comparison succeeds.</Notice>}
        <ComparisonTotals report={report} />
        <p>{report.balanceNote}</p>
        <div className="br-table-wrap"><table>
          <caption>Source identity mappings. A blank selection is unresolved. Non-account records may be retained as history only.</caption>
          <thead><tr><th scope="col">Source</th><th scope="col">Source citation</th><th scope="col">Reviewed target</th><th scope="col">Mapping basis</th><th scope="col">Differences</th></tr></thead>
          <tbody>{report.proposals.map(proposal => {
            const { source } = proposal, key = sourceKey(source)
            const accountChanged = !!source.accountId && mappings[`accounts:${source.accountId}`] !== report.mappings[`accounts:${source.accountId}`]
            return <tr key={key}>
              <th scope="row">{key}{source.name && <small>{source.name}</small>}{source.accountId && <small>Source account: {source.accountId}</small>}<JsonDetail value={source} label={`Original source fields for ${key}`} /></th>
              <td>{source.citation.artifact}<small>{source.citation.sheet}, row {source.citation.row}</small><small style={{ overflowWrap: 'anywhere' }}>SHA-256: {source.citation.sha256}</small></td>
              <td><label>Target for {key}<select value={mappings[key] ?? ''} disabled={busy || sourceChanged || activated || accountChanged} onChange={event => correctMapping(key, event.target.value)}>
                <option value="">Unresolved — choose a target</option>
                {source.kind !== 'accounts' && <option value="retain-history">Retain source history only</option>}
                {proposal.candidates.map(candidate => <option key={String(candidate.id)} value={String(candidate.id)}>{[candidate.name, candidate.sku, candidate.id, candidate.accountId ? `account ${candidate.accountId}` : ''].filter(Boolean).join(' · ')}</option>)}
              </select></label>{accountChanged && <small>Recompare the corrected account to load its candidates.</small>}</td>
              <td>{dirty ? 'Recompare to confirm mapping basis' : proposal.basis}</td>
              <td>{proposal.differences.length ? <ul>{proposal.differences.map((difference, index) => <li key={index}>{difference}</li>)}</ul> : 'No row differences reported'}</td>
            </tr>
          })}</tbody>
        </table></div>
        {report.issues.length > 0 && <Notice><strong>Review issues</strong><ul>{report.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul></Notice>}
        {report.missing.length > 0 && <Notice error><strong>Missing source categories</strong><ul>{report.missing.map((missing, index) => <li key={index}>{missing}</li>)}</ul></Notice>}
        <JsonDetail value={report.unmatched} label={`Unmatched native records (${report.unmatched.length})`} />
        <JsonDetail value={report.fields} label="Source field coverage" />
        <JsonDetail value={report.provenance} label="Comparison tools, scope and provenance" />
        <label>Reviewed fingerprint<input value={report.fingerprint} readOnly className="br-mono" /></label>
        {!report.canApply && <p>Activation is blocked. Resolve the identities and provide missing source categories, then compare again. A disposition cannot bypass these requirements.</p>}
        <label><input type="checkbox" style={checkboxStyle} checked={approveMappings} disabled={!canApprove} onChange={event => setApproveMappings(event.target.checked)} />I approve every exact mapping in this fingerprint, including any source history retained without an operational target.</label>
        <label><input type="checkbox" style={checkboxStyle} checked={approveBalances} disabled={!canApprove} onChange={event => setApproveBalances(event.target.checked)} />I approve the per-currency counts, cents and quantities, and have reviewed all differences, unmatched records and missing releases.</label>
        <label>Owner disposition for differences and missing releases (required)<textarea value={disposition} maxLength={1000} rows={3} disabled={!canApprove} onChange={event => { setApproveBalances(false); setDisposition(event.target.value) }} /><small>Record why each difference or missing release is accepted. If none exist, explicitly state that. Maximum 1,000 characters.</small></label>
        <p>Activation retains approved source history only. The source accounting system remains ledger authority. It performs no provider writes, ledger rewrite, payment, reservation, invoice issue or outreach.</p>
        <div className="br-actions"><button type="button" disabled={!canApprove || !approveMappings || !approveBalances || !disposition.trim()} onClick={() => void act(apply)}>{activated ? 'Retained history activated' : 'Activate reviewed retained history'}</button></div>
      </>}
    </div>
    <div className="br-card br-stack">
      <div className="br-heading-row"><h3>Cutover history</h3><button type="button" className="br-secondary" disabled={busy} onClick={() => void act(list)}>Refresh cutover journal</button></div>
      {!historyLoaded ? <p>Cutover history has not loaded.</p> : !imports.length ? <p>No cutover activations recorded.</p> : <div className="br-table-wrap"><table>
        <caption>Retained cutover approvals and undo history</caption>
        <thead><tr><th scope="col">Import</th><th scope="col">State</th><th scope="col">Owner approval</th><th scope="col">Disposition</th><th scope="col">Journal</th></tr></thead>
        <tbody>{imports.map(row => <tr key={row.id}><th scope="row">{row.id}</th><td>{row.state}</td><td>{row.approved_by}<small>{row.approved_at}</small></td><td>{row.reason}</td><td><button type="button" className="br-secondary" disabled={busy} onClick={() => void act(async () => setJournal(await request<CutoverJournal>(`/api/barrow/cutover/${encodeURIComponent(row.id)}`)))}>View cutover</button></td></tr>)}</tbody>
      </table></div>}
      {journal && <div className="br-stack">
        <div className="br-heading-row"><h4>Cutover {journal.id}</h4><span className="br-badge">{journal.state}</span></div>
        <p>Approved by {journal.approved_by} at {journal.approved_at}. Disposition: {journal.reason}</p>
        {journal.undone_at && <p>Undone by {journal.undone_by} at {journal.undone_at}.</p>}
        <JsonDetail value={journal.source} label="Read retained originals and source custody" />
        <JsonDetail value={journal.report} label="Read approved comparison, mappings and provenance" />
        <JsonDetail value={{ ...journal, source: undefined, report: undefined }} label="Cutover approval journal" />
        {journal.state === 'active' && <><p>Undo withdraws activation and preserves original evidence. Later native changes cause undo to be refused and remain preserved.</p><div className="br-actions"><button type="button" className="br-danger" disabled={busy} onClick={() => setUndoId(journal.id)}>Review cutover undo</button></div></>}
      </div>}
    </div>
    {undoId && <Dialog title="Undo retained history activation?" busy={busy} onClose={() => setUndoId('')}>
      <p>Withdraw activation of cutover {undoId}. Original evidence remains retained. If native records changed after approval, undo is refused.</p>
      {error && <Notice error>{error}</Notice>}
      <div className="br-actions"><button type="button" autoFocus className="br-secondary" disabled={busy} onClick={() => setUndoId('')}>Cancel</button><button type="button" className="br-danger" disabled={busy} onClick={() => void act(() => undo(undoId))}>Undo cutover activation</button></div>
    </Dialog>}
  </section>
}
