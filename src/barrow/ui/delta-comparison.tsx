import type { CutoverRecord } from '../imports/cutover-source'
import { JsonDetail, Notice } from './primitives'

export type DeltaComparisonReport = Awaited<ReturnType<typeof import('../imports/cutover-service').previewCutover>>
export type DeltaSourceChange = {
  sourceKey: string; change: string; fields: string[]; before: unknown; after: unknown; disposition: string
}
const sourceKey = (record: CutoverRecord) => `${record.kind}:${record.id}`

export function DeltaComparison({
  comparison, changes, source, mappings, busy, rehearsal, dirty, filesChanged, onCorrection,
}: {
  comparison: DeltaComparisonReport
  changes: DeltaSourceChange[]
  source: unknown
  mappings: Record<string, string>
  busy: boolean
  rehearsal: boolean
  dirty: boolean
  filesChanged: boolean
  onCorrection: (row: CutoverRecord, value: string) => void
}) {
  return <div className="br-card br-stack" style={{ minWidth: 0 }}>
    <h3>Source changes and reconciliation</h3>
    {dirty && <Notice>The displayed comparison is stale. Compare the full source and corrected mappings, then rehearse the feed and review sign-off again.</Notice>}
    <div className="br-table-wrap"><table style={{ minWidth: 760 }}>
      <caption>Counts, exact cents and quantities by category and currency</caption>
      <thead><tr><th scope="col">Category / currency</th><th scope="col">Source / native count</th><th scope="col">Source / native cents</th><th scope="col">Difference cents</th><th scope="col">Source / native quantity</th></tr></thead>
      <tbody>{comparison.totals.map(total => <tr key={`${total.kind}:${total.currency}`}>
        <th scope="row">{total.kind} / {total.currency || 'No currency'}</th>
        <td>{total.sourceCount} / {total.targetCount}</td>
        <td>{total.sourceCents} / {total.targetCents}</td>
        <td>{total.differenceCents}</td>
        <td>{total.sourceQuantity ?? 'Unknown'} / {total.targetQuantity ?? 'Unknown'}</td>
      </tr>)}</tbody>
    </table></div>
    <p>{comparison.balanceNote}</p>
    <div className="br-table-wrap"><table style={{ minWidth: 1050 }}>
      <caption>Full-export delta from the preceding retained source</caption>
      <thead><tr><th scope="col">Source record</th><th scope="col">Change</th><th scope="col">Fields</th><th scope="col">Disposition and original evidence</th></tr></thead>
      <tbody>{changes.map(change => <tr key={change.sourceKey}>
        <th scope="row">{change.sourceKey}</th><td>{change.change}</td><td>{change.fields.join(', ')}</td>
        <td>{change.disposition}<JsonDetail value={{ before: change.before, after: change.after }} label={`Read ${change.sourceKey} before and after`} /></td>
      </tr>)}</tbody>
    </table></div>
    <div className="br-table-wrap"><table style={{ minWidth: 1050 }}>
      <caption>Reviewed source-to-native mappings and citations</caption>
      <thead><tr><th scope="col">Source and citation</th><th scope="col">Target mapping</th><th scope="col">Basis and differences</th></tr></thead>
      <tbody>{comparison.proposals.map(proposal => {
        const row = proposal.source, key = sourceKey(row)
        const parentChanged = !!row.accountId && mappings[`accounts:${row.accountId}`] !== comparison.mappings[`accounts:${row.accountId}`]
        return <tr key={key}>
          <th scope="row">{key}
            <small>{row.citation.artifact} · {row.citation.sheet} row {row.citation.row}</small>
            <small style={{ overflowWrap: 'anywhere' }}>{row.citation.sha256}</small>
          </th>
          <td><label>Target for {key}
            <select aria-label={`Target for ${key}`} value={mappings[key] ?? ''} disabled={busy || !rehearsal || parentChanged || filesChanged} onChange={event => onCorrection(row, event.target.value)}>
              <option value="">Unresolved</option>
              {row.kind !== 'accounts' && <option value="retain-history">Retain history only</option>}
              {proposal.candidates.map(candidate => <option key={String(candidate.id)} value={String(candidate.id)}>{[candidate.name, candidate.sku, candidate.id].filter(Boolean).join(' · ')}</option>)}
            </select>
          </label>{parentChanged && <small>Recompare this account to refresh candidates.</small>}</td>
          <td>{dirty ? 'Recompare to confirm basis' : proposal.basis}
            <ul>{proposal.differences.map((difference, index) => <li key={index}>{difference}</li>)}</ul>
          </td>
        </tr>
      })}</tbody>
    </table></div>
    {!!comparison.issues.length && <Notice><strong>Review issues and missing releases</strong><ul>{comparison.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul></Notice>}
    {!!comparison.missing.length && <Notice error><strong>Missing source categories block sign-off</strong><ul>{comparison.missing.map((missing, index) => <li key={index}>{missing}</li>)}</ul></Notice>}
    <JsonDetail value={comparison.unmatched} label="Unmatched native records" />
    <JsonDetail value={source} label="Retained source originals and field provenance" />
  </div>
}
