import { useEffect, useId, useState } from 'react'
import { Dialog } from './dialog'
import { ErrorSummary, Notice } from './primitives'
import { request, errorMessage } from './api'
import { money as formatMoney } from './types'

export interface CartLine { sku: string; unit?: string; quantity: number; buyerSku?: string }
interface PreviewRow { ref: string; input: string; quantity: string; status: 'ok' | 'error' | 'blank' | 'left out'; message?: string }
interface PreviewLine { key: string; sku: string; name: string; unit: string; quantity: string; rows: string[]; combined?: string; inCart?: string; lineCents?: number; problem?: string; choices?: string[] }
interface Preview { currency:'USD'|'CAD'; layout: string; rows: PreviewRow[]; lines: PreviewLine[]; errors: number; blocked?: string; ready: boolean; mode?: 'merge' | 'replace'; cart?: CartLine[]; totalCents: number; minimumCents: number }

const command = async <T,>(type: string, payload: Record<string, unknown>) => (await request<{ result: T }>('/api/barrow/commands', { type, payload })).result

// ORD-001: paste or upload, review every row on the server's preview, resolve each problem, then merge or replace.
export function CartImport({ accountId, profileId, cart, list, onApply, onClose }: { profileId?:string; accountId: string; cart: CartLine[]; list?: { id: string; name: string }; onApply: (lines: CartLine[]) => void; onClose: () => void }) {
  const prefix = useId()
  const [attempt, setAttempt] = useState(0)
  const [source, setSource] = useState<{ csv?: string; paste?: string; listId?: string } | null>(null)
  const [paste, setPaste] = useState('')
  const [skip, setSkip] = useState<string[]>([])
  const [set, setSet] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState<Preview | null>(null)
  const money=(cents:number)=>formatMoney(cents,preview?.currency??'USD')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'merge' | 'replace' | undefined>()
  async function run(next: { source?: typeof source; skip?: string[]; set?: Record<string, string>; mode?: 'merge' | 'replace' }) {
    const using = next.source ?? source, skipping = next.skip ?? skip, setting = next.set ?? set, choice = next.mode ?? mode
    if (!using) return
    setBusy(true); setError('')
    try {
      const result = await command<Preview>('cart.preview', { accountId, ...(profileId?{profileId}:{}), ...using, skip: skipping, set: setting, cart, ...(choice ? { mode: choice } : {}) })
      setAttempt(value => value + 1)
      setSource(using); setSkip(skipping); setSet(setting); setMode(choice); setPreview(result)
      if (result.cart) { onApply(result.cart); onClose() }
    } catch (failure) { setAttempt(value => value + 1); setError(errorMessage(failure)) } finally { setBusy(false) }
  }
  async function download(layout: 'vertical' | 'matrix') {
    setBusy(true); setError('')
    try {
      const form = await command<{ filename: string; csv: string }>('cart.form', { accountId, ...(profileId?{profileId}:{}), layout, cart })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(new Blob([form.csv], { type: 'text/csv;charset=utf-8' })); link.download = form.filename; link.click()
      URL.revokeObjectURL(link.href)
    } catch (failure) { setAttempt(value => value + 1); setError(errorMessage(failure)) } finally { setBusy(false) }
  }
  const restart = (next: typeof source) => { setMode(undefined); void run({ source: next, skip: [], set: {}, mode: undefined }) }
  // ORD-002: a saved list opens straight into the preview at current prices, stock and pack rules.
  useEffect(() => { if (list) restart({ listId: list.id }) }, [list?.id])
  const problems = preview?.rows.filter(row => row.status === 'error') ?? []
  return <Dialog title={list ? `Add ${list.name} to cart` : 'Add lines by paste or CSV'} busy={busy} onClose={onClose}>
    {list ? <p>Each line is checked at today’s price, stock and pack rules. Resolve every exception, then merge into or replace your cart.</p> : <>
    <p>Paste one line per item (SKU or barcode, quantity, optional selling unit), or upload a CSV with <code>sku</code> or <code>barcode</code> and <code>quantity</code> columns, or a filled order form. Nothing changes your cart until you choose merge or replace.</p>
    <div className="br-actions">
      <button type="button" className="br-secondary" disabled={busy} onClick={() => void download('vertical')}>Download order form (one row per item)</button>
      <button type="button" className="br-secondary" disabled={busy} onClick={() => void download('matrix')}>Download order form (style × size)</button>
    </div>
    <label>Paste lines<textarea id={`${prefix}-paste`} aria-invalid={error ? true : undefined} aria-describedby={error ? `${prefix}-error` : undefined} value={paste} rows={4} disabled={busy} onChange={event => setPaste(event.target.value)} placeholder={'OAT-1 12\n0123456789012, 6'} /></label>
    <div className="br-actions">
      <button type="button" disabled={busy || !paste.trim()} onClick={() => restart({ paste })}>Preview pasted lines</button>
      <label className="br-secondary">Upload CSV<input type="file" accept=".csv,text/csv" disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (file) void file.text().then(csv => restart({ csv })); event.target.value = '' }} /></label>
    </div>
    </>}
    <ErrorSummary attempt={attempt} problems={[
      ...(error ? [{ id: `${prefix}-${list ? 'retry' : 'paste'}`, label: 'Pasted lines', message: error }] : []),
      ...problems.map(row => ({ id: `${prefix}-row-${row.ref}`, label: `Row ${row.ref}`, message: row.message ?? 'Review this row.' })),
      ...(preview?.lines.filter(line => line.problem).map(line => ({ id: `${prefix}-line-${line.key}`, label: line.sku, message: line.problem! })) ?? []),
    ]} />
    {error && list && <button id={`${prefix}-retry`} type="button" disabled={busy} aria-describedby={`${prefix}-error`} onClick={() => void run({})}>Retry list preview</button>}
    {error && <p id={`${prefix}-error`} className="br-field-error" role="alert">{error}</p>}
    {preview && <section aria-label="Upload preview" className="br-stack">
      <p role="status">{preview.lines.length} {preview.lines.length === 1 ? 'line' : 'lines'} · {money(preview.totalCents)}{preview.errors ? ` · ${preview.errors} to resolve` : ' · ready'}{preview.totalCents < preview.minimumCents ? ` · below the ${money(preview.minimumCents)} minimum` : ''}</p>
      {problems.length > 0 && <ul aria-label="Rows to resolve">{problems.map(row => <li key={row.ref}><span id={`${prefix}-row-error-${row.ref}`}>{list ? row.input : `Row ${row.ref}`}: {row.message}</span> <button type="button" className="br-secondary" id={`${prefix}-row-${row.ref}`} aria-describedby={`${prefix}-row-error-${row.ref}`} disabled={busy} onClick={() => void run({ skip: [...skip, row.ref] })}>Leave out {list ? row.input : `row ${row.ref}`}</button></li>)}</ul>}
      <div className="br-table-wrap"><table><caption className="br-sr-only">Lines after this upload</caption>
        <thead><tr><th scope="col">SKU</th><th scope="col">Item</th><th scope="col">Quantity</th><th scope="col">Line</th><th scope="col">Notes</th></tr></thead>
        <tbody>{preview.lines.map(line => <tr key={line.key} aria-invalid={line.problem ? true : undefined}>
          <th scope="row">{line.sku}</th><td>{line.name}</td><td>{line.quantity} {line.unit}</td><td>{line.lineCents === undefined ? '–' : money(line.lineCents)}</td>
          <td><span id={`${prefix}-line-error-${line.key}`}>{[line.combined, line.inCart && `${line.inCart} already in cart`, line.problem].filter(Boolean).join(' · ')}</span>
            {line.problem && <span className="br-actions">{line.choices?.map(value => <button id={value === line.choices?.[0] ? `${prefix}-line-${line.key}` : undefined} aria-describedby={`${prefix}-line-error-${line.key}`} key={value} type="button" className="br-secondary" disabled={busy} onClick={() => void run({ set: { ...set, [line.key]: value } })}>Use {value} for {line.sku}</button>)}
              <button id={!line.choices?.length ? `${prefix}-line-${line.key}` : undefined} aria-describedby={`${prefix}-line-error-${line.key}`} type="button" className="br-secondary" disabled={busy} onClick={() => void run({ set: { ...set, [line.key]: 'skip' } })}>Leave out {line.sku}</button></span>}</td>
        </tr>)}</tbody>
      </table></div>
      {preview.blocked && <Notice error>{preview.blocked}</Notice>}
      <div className="br-actions">
        <button type="button" disabled={busy || problems.length > 0} onClick={() => void run({ mode: 'merge' })}>Merge into cart</button>
        <button type="button" disabled={busy || problems.length > 0} onClick={() => void run({ mode: 'replace' })}>Replace cart</button>
        <button type="button" className="br-secondary" disabled={busy} onClick={onClose}>Cancel</button>
      </div>
    </section>}
    {!preview && <div className="br-actions"><button type="button" className="br-secondary" disabled={busy} onClick={onClose}>Cancel</button></div>}
  </Dialog>
}
