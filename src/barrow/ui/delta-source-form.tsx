import type { CutoverInput } from '../imports/cutover-source'

export type DeltaSourceFields = {
  scopeText: string
  runId: string
  sourceSystem: string
  reason: string
  consent: boolean
  freeze: boolean
}
export type DeltaSourceFileKind = 'workbook' | 'ledger'
const checkStyle = { width: 20, minHeight: 20, marginRight: 8, verticalAlign: 'middle' }

export async function readDeltaSourceFile(file: File, kind: DeltaSourceFileKind): Promise<string> {
  const extension = kind === 'workbook' ? /\.xlsx$/i : /\.csv$/i
  if (!file.size || file.size > 1024 * 1024 || !extension.test(file.name)) {
    throw new Error(`Choose a nonempty ${kind === 'workbook' ? 'XLSX workbook' : 'UTF-8 CSV ledger'} of at most 1 MiB.`)
  }
  if (kind === 'ledger') return new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read the workbook.'))
    reader.onabort = () => reject(new Error('Workbook reading was interrupted.'))
    reader.onload = () => {
      const data = String(reader.result), marker = data.indexOf(';base64,')
      if (marker < 0) reject(new Error('Could not encode the workbook.'))
      else resolve(data.slice(marker + 8))
    }
    reader.readAsDataURL(file)
  })
}

export function DeltaSourceForm({
  session, value, workbook, ledger, busy, dirty, canCreate, canCompare, onChange, onUpload, onCreate, onCompare,
}: {
  session: { id: string; state: string; revision: string } | null
  value: DeltaSourceFields
  workbook: CutoverInput['workbook'] | null
  ledger: CutoverInput['ledger'] | null
  busy: boolean
  dirty: boolean
  canCreate: boolean
  canCompare: boolean
  onChange: (patch: Partial<DeltaSourceFields>) => void
  onUpload: (file: File, kind: DeltaSourceFileKind) => void
  onCreate: () => void
  onCompare: () => void
}) {
  const rehearsal = session?.state === 'rehearsal'
  return <div className="br-card br-stack">
    <h3>{session ? 'Full source delta and owner disposition' : 'Baseline and account scope'}</h3>
    {session && <p>Session {session.id} · {session.state}. Revision: {session.revision}. {rehearsal ? 'New order entry is paused for these accounts.' : ''}</p>}
    <fieldset className="br-stack" disabled={busy || !!session && !rehearsal}>
      <legend>Source exports</legend>
      <label>{session ? 'Delta' : 'Baseline'} workbook (XLSX, maximum 1 MiB)
        <input type="file" accept=".xlsx" onChange={event => {
          const file = event.target.files?.[0]
          if (file) onUpload(file, 'workbook')
        }} />
        {workbook && <small>Retained selection: {workbook.name}</small>}
      </label>
      <label>Ledger export (UTF-8 CSV, maximum 1 MiB)
        <input type="file" accept=".csv,text/csv" onChange={event => {
          const file = event.target.files?.[0]
          if (file) onUpload(file, 'ledger')
        }} />
        {ledger && <small>Retained selection: {ledger.name}</small>}
      </label>
      <label>Existing account IDs, separated by commas
        <input value={value.scopeText} disabled={!!session} onChange={event => onChange({ scopeText: event.target.value })} />
        <small>A delta keeps the original 1–200 account scope.</small>
      </label>
      <label>Stable mapping run ID
        <input value={value.runId} maxLength={100} onChange={event => onChange({ runId: event.target.value })} />
      </label>
      <label>Incumbent responsible system
        <input value={value.sourceSystem} maxLength={120} disabled={!!session} onChange={event => onChange({ sourceSystem: event.target.value })} />
      </label>
      <label><input type="checkbox" style={checkStyle} checked={value.consent} onChange={event => onChange({ consent: event.target.checked })} />I authorize scoped native read-only comparison of these supplied exports, the named accounts and scoped Pier variants. Cost: 0 cents. Contacts: 0.</label>
      {!session && <label><input type="checkbox" style={checkStyle} checked={value.freeze} onChange={event => onChange({ freeze: event.target.checked })} />Pause new order entry for these accounts until cutoff sign-off. Existing approved orders remain preserved and excluded from the bridge export.</label>}
    </fieldset>
    <label>Reason and disposition for the next action
      <textarea rows={3} maxLength={1000} value={value.reason} disabled={busy} onChange={event => onChange({ reason: event.target.value })} />
      <small>Explain source differences, missing releases, responsible systems, feed changes or rollback consequences. A new reason is required for each action.</small>
    </label>
    <div className="br-actions">
      {!session ? <button type="button" disabled={busy || !canCreate} onClick={onCreate}>Create baseline and pause scoped order entry</button>
        : rehearsal && <button type="button" disabled={busy || !canCompare} onClick={onCompare}>{dirty ? 'Recompare corrected source and mappings' : 'Compare full source delta'}</button>}
    </div>
  </div>
}
