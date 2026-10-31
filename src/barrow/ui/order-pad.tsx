import { priceLine } from '../pricing'
import { supplierDate } from '../model'
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { request, errorMessage } from './api'
import { AccountPicker, Empty, ErrorSummary, Notice, type FieldProblem } from './primitives'
import { UnitDraft } from './unit-draft'
import { UnitOrder } from './unit-order'
import { CartImport, type CartLine } from './cart-import'
import { SavedLists, type SavedList } from './saved-lists'
import { StyleCard } from './style-card'
import { StyleMatrix, cellProblem, quantityId, type PriceChange } from './style-matrix'
import { quantityProblem } from '../quantity-rules'
import { groupStyles, quantityOf, type StyleRow } from './styles'
import type { Account, Catalogue, Order, RunCommand } from './types'
import { useLocations } from './locations'
import { byAgent, clock, money as formatMoney, terms, town, when } from './types'

interface Props {
  account: Account; accounts: Account[]; supplier: boolean; canPurchase?:boolean; draft?: Order; draftCount: number; commandError?: string; run: RunCommand; busy: boolean
  onAccount: (id: string) => void; onDraft: (id: string) => void; onPrepared: () => void
}

// The rep's order pad: one account, a large style card beside the size matrix, and the running total always in view.
export function OrderPad({ account, accounts, supplier, canPurchase=true, draft, draftCount, commandError='', run, busy, onAccount, onDraft, onPrepared }: Props) {
  const prefix = useId()
  const [validationAttempt, setValidationAttempt] = useState(0)
  const currency=account.value.currency??'USD'
  const money=(cents:number,code=currency as 'USD'|'AUD'|'CAD'|'EUR'|'GBP')=>formatMoney(cents,code)
  const unitDraft=Boolean(draft?.lines.some(line=>line.unit && line.unit!==line.baseUnit))
  const [unitOrder,setUnitOrder] = useState(false)
  const [importing,setImporting] = useState(false)
  const [listing,setListing] = useState(false)
  const [fromList,setFromList] = useState<SavedList | undefined>()
  const [unitLines,setUnitLines] = useState<CartLine[] | undefined>()
  // ORD-007 buyer SKU aliases carried in from an upload, kept as written on each line.
  const [aliases,setAliases] = useState<Record<string,string>>({})
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [reference, setReference] = useState('')
  const [deliveryLocation, setDeliveryLocation] = useState('')
  // ACC-003: blank uses the account's default ship-to; the order keeps a copy of the address.
  const [shipToId, setShipToId] = useState('')
  const shipTos = useLocations(account.id, refresh).filter(location => location.kind === 'ship-to' && !location.archived)
  const [details, setDetails] = useState({ requestedDate: '', cancelAfter: '', instructions: '' })
  const [kept, setKept] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState('')
  const [sku, setSku] = useState('')
  const [skuMessage, setSkuMessage] = useState('')
  const cells = useRef(new Map<string, HTMLInputElement>())
  const live = useRef(true)
  useEffect(() => {
    live.current = true
    let current = true
    setLoading(true); setError(''); setCatalogue(null)
    void request<Catalogue>(`/api/barrow/catalogue?${new URLSearchParams({accountId:account.id,...(account.buyingProfile?{profileId:account.buyingProfile.id}:{})})}`)
      .then(data => { if (current) setCatalogue(data) })
      .catch(error => { if (current) setError(errorMessage(error)) })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false; live.current = false }
  }, [account.id, refresh])
  // Opening a draft fills the pad with its quantities; a new order starts empty.
  useEffect(() => {
    setValidationAttempt(0)
    setQuantities(Object.fromEntries((draft?.lines ?? []).map(line => [line.sku, String(line.quantity)])))
    setUnitOrder(false);setUnitLines(undefined);setAliases(Object.fromEntries((draft?.lines ?? []).filter(line => line.buyerSku).map(line => [line.sku, line.buyerSku!])));setReference(draft?.reference ?? ''); setDeliveryLocation(draft?.deliveryLocation ?? ''); setDetails({ requestedDate: draft?.requestedDate ?? '', cancelAfter: draft?.cancelAfter ?? '', instructions: draft?.instructions ?? '' }); setKept(new Set()); setSelected('')
  }, [draft?.id, account.id])

  const items = catalogue?.items ?? []
  const { rows, columns } = useMemo(() => groupStyles(items,currency), [catalogue])
  const currentAccount = catalogue?.account ?? account
  const draftCurrency = draft?.currency ?? 'AUD'
  const changes: Record<string, PriceChange> = {}
  for (const line of draft?.lines ?? []) {
    const item = items.find(value => value.sku === line.sku)
    if (item && (item.unitCents !== line.unitCents || draftCurrency !== currency)) changes[line.sku] = { from: line.unitCents, to: item.unitCents, currency: draftCurrency }
  }
  const missing = (draft?.lines ?? []).filter(line => catalogue && !items.some(item => item.sku === line.sku))
  const chosen = items.filter(item => quantityOf(quantities[item.sku]) > 0)
  const units = chosen.reduce((sum, item) => sum + quantityOf(quantities[item.sku]), 0)
  let pricingProblem=''
  const priced = chosen.flatMap(item=>{try{return [{sku:item.sku,...priceLine(quantityOf(quantities[item.sku]),item.unitCents,item.pricing,supplierDate(new Date(catalogue!.observedAt)))}]}catch(error){pricingProblem=error instanceof Error?error.message:'Check quantities.';return []}})
  const total = priced.reduce((sum,line)=>sum+line.lineCents,0)
  const inactive = (account.value.lifecycle ?? 'active') !== 'active'
  const invalid = items.some(item => cellProblem(item, quantities[item.sku]))
  // PRI-003: suggested quantities are offered, never applied; the buyer picks one.
  const corrections = items.flatMap(item => { const quantity = quantityOf(quantities[item.sku]); const problem = quantity > 0 && Number.isSafeInteger(quantity) ? quantityProblem(String(quantity), item) : null; return problem ? [problem.below, problem.above].filter((value): value is string => Boolean(value)).map(value => ({ sku: item.sku, value })) : [] })
  const minimum = currentAccount.value.minimumCents, belowMinimum = chosen.length > 0 && total < minimum
  const unsettled = rows.filter(row => !kept.has(row.key) && row.sizes.some(size => changes[row.cells[size].sku] && quantityOf(quantities[row.cells[size].sku]) > 0))
  const blocked = inactive || !catalogue || !chosen.length || invalid || Boolean(pricingProblem) || belowMinimum || unsettled.length > 0
  const hint = !catalogue ? '' : !chosen.length ? 'Enter quantities to prepare a draft.' : pricingProblem ? pricingProblem : invalid ? 'Fix the highlighted quantities.' : belowMinimum ? `Add ${money(minimum - total)} to meet the minimum.` : unsettled.length ? 'Settle the price change first.' : ''
  const shown = rows.find(row => row.key === selected) ?? rows.find(row => row.sizes.some(size => quantityOf(quantities[row.cells[size].sku]) > 0)) ?? rows[0]

  const today = catalogue ? supplierDate(new Date(catalogue.observedAt)) : ''
  const requestedDateProblem = details.requestedDate && details.requestedDate < today ? 'Choose today or a future delivery date.' : ''
  const dateProblem = details.cancelAfter && details.cancelAfter < today ? 'Choose today or a future cancel date.' : details.requestedDate && details.cancelAfter && details.cancelAfter < details.requestedDate ? 'Choose a date on or after the requested delivery date.' : ''
  const orderQuantityProblem = validationAttempt && (belowMinimum || pricingProblem) && chosen[0] ? { sku: chosen[0].sku, message: pricingProblem || `Add ${money(minimum - total)} to meet the minimum.` } : undefined
  const problems: FieldProblem[] = items.flatMap(item => {
    const message = cellProblem(item, quantities[item.sku])
    return message ? [{ id: quantityId(prefix, item.sku), label: item.sku, message }] : []
  })
  if (requestedDateProblem) problems.push({ id: `${prefix}-requested`, label: 'Requested delivery date', message: requestedDateProblem })
  if (dateProblem) problems.push({ id: `${prefix}-cancel`, label: 'Cancel after date', message: dateProblem })
  if (validationAttempt) {
    if (!chosen.length && items[0]) problems.push({ id: quantityId(prefix, items[0].sku), label: 'Order quantities', message: 'Enter at least one quantity.' })
    if (orderQuantityProblem) problems.push({ id: quantityId(prefix, orderQuantityProblem.sku), label: 'Order quantities', message: orderQuantityProblem.message })
    for (const row of unsettled) problems.push({ id: `${prefix}-price-${encodeURIComponent(row.key)}`, label: row.name, message: 'Review and settle the changed price.' })
  }

  async function prepare(event: FormEvent) {
    event.preventDefault()
    if (!canPurchase || busy || unitOrder || unitDraft) return
    if (blocked || requestedDateProblem || dateProblem) { setValidationAttempt(value => value + 1); return }
    // A draft opened here is replaced by the order prepared from it, so it never waits in Drafts again.
    const prepared = await run('order.prepare', { accountId: account.id, ...(account.buyingProfile?{profileId:account.buyingProfile.id}:{}), reference, deliveryLocation, ...(shipToId ? { shipToId } : {}), ...Object.fromEntries(Object.entries(details).filter(([, value]) => value.trim())), ...(draft ? { replaces: draft.id } : {}), lines: chosen.map(item => ({ sku: item.sku, quantity: quantityOf(quantities[item.sku]), ...(aliases[item.sku] ? { buyerSku: aliases[item.sku] } : {}) })) })
    if (prepared) {
      if (live.current) { setQuantities({}); setAliases({}); setReference(''); setDeliveryLocation('') }
      onPrepared()
    }
  }
  // ORD-004: the cart becomes a quote request; the supplier proposes prices and terms, nothing is reserved.
  async function requestQuote() {
    if (await run('quote.request', { accountId: account.id, ...(account.buyingProfile?{profileId:account.buyingProfile.id}:{}), lines: chosen.map(item => ({ sku: item.sku, quantity: quantityOf(quantities[item.sku]) })) })) {
      if (live.current) { setQuantities({}); setAliases({}) }
      onPrepared()
    }
  }
  function find(event: FormEvent) {
    event.preventDefault()
    const wanted = sku.trim().toUpperCase()
    if (!wanted) return
    // ORD-001: a scanner types a Pier barcode into this field like a keyboard; it finds that item's cell.
    const item = items.find(value => value.sku.toUpperCase() === wanted) ?? items.find(value => value.barcode === sku.trim())
    const row = item ? rows.find(value => Object.values(value.cells).includes(item)) : rows.find(value => value.key.toUpperCase() === wanted || value.key.toUpperCase().endsWith(`-${wanted}`))
    if (!row) { setSkuMessage(`${sku.trim()} is not on this account’s price list.`); return }
    setSkuMessage(''); setSku(''); setSelected(row.key)
    cells.current.get((item ?? row.cells[row.sizes[0]]).sku)?.focus()
  }
  // A cart from the preview replaces the pad's quantities; selling-unit lines continue in the selling-unit order.
  function apply(lines: CartLine[]) {
    if (lines.some(line => line.unit && line.unit !== items.find(item => item.sku === line.sku)?.unit)) { setUnitLines(lines); setUnitOrder(true); return }
    setQuantities(Object.fromEntries(lines.map(line => [line.sku, String(line.quantity)])))
    setAliases(Object.fromEntries(lines.filter(line => line.buyerSku).map(line => [line.sku, line.buyerSku!])))
  }
  function remove(row: StyleRow) {
    setQuantities(current => { const next = { ...current }; for (const size of row.sizes) delete next[row.cells[size].sku]; return next })
  }
  const padCart: CartLine[] = chosen.map(item => ({ sku: item.sku, quantity: quantityOf(quantities[item.sku]), ...(aliases[item.sku] ? { buyerSku: aliases[item.sku] } : {}) }))
  const draftTotal = draft && draftCurrency === currency && catalogue && Object.keys(changes).length ? total - draft.totalCents : 0

  if(unitDraft && draft) return <UnitDraft key={draft.id} account={account} draft={draft} catalogue={catalogue} loading={loading} error={error || commandError} busy={busy} run={run} onNew={()=>onDraft('')} onPrepared={onPrepared} />

  return <form noValidate className={`br-pad${problems.length ? ' br-pad-has-errors' : ''}`} onSubmit={event => void prepare(event)} aria-busy={loading || busy}>
    {account.buyingProfile&&<section aria-label="Buying seller and permissions"><h2>{account.buyingProfile.brandName}</h2><p>Seller: {account.buyingProfile.seller.legalName} · {account.buyingProfile.seller.address}</p><p>Profile: {account.buyingProfile.name} · {account.buyingProfile.currency} · {canPurchase?'Purchasing permitted':'Read only'} · Account owner: {account.value.name}</p></section>}
    {inactive && <Notice error>This account is {account.value.lifecycle === 'closed' ? 'closed' : 'on hold'}. Contact the supplier before placing a new order. Existing order history remains available in Orders.</Notice>}
    <div className="br-pad-head">
      <div className="br-pad-title">
        <h1>{currentAccount.value.name}{town(currentAccount.value) && <span className="br-pad-town"> · {town(currentAccount.value)}</span>}</h1>
        <div className="br-chips">
          <span className="br-chip">{money(minimum)} minimum · {terms(currentAccount.value.termsDays)}</span>
          {catalogue && <span className="br-chip">Pier stock {clock(catalogue.observedAt)} <span className="br-check" aria-label="observed">✓</span> · {draftCount} {draftCount === 1 ? 'draft' : 'drafts'}</span>}
        </div>
      </div>
      <div className="br-pad-pickers">
        {supplier && <AccountPicker accounts={accounts} value={account.id} onChange={id => id && onAccount(id)} />}
        {shipTos.length > 0 && <label>Ship to<select value={shipToId} onChange={event => setShipToId(event.target.value)} disabled={busy}><option value="">Default ship-to</option>{shipTos.map(location => <option key={location.id} value={location.id}>{location.value.name} · {location.value.city}, {location.value.state}{location.isDefault ? ' (default)' : ''}</option>)}</select></label>}
        <label>Delivery location label<input value={deliveryLocation} maxLength={240} onChange={event => setDeliveryLocation(event.target.value)} disabled={busy} placeholder="Store or delivery location" /></label>
        {draft && <p className="br-pad-context">{byAgent(draft) && <span className="br-rivet" aria-hidden="true" />}{byAgent(draft) ? 'Prepared by your agent' : 'Draft written'} {when(draft.preparedAt)}{draft.reference && ` · ${draft.reference}`}</p>}
      </div>
      <div className="br-pad-find" role="search">
        <label className="br-sku"><span className="br-sr-only">Scan or type SKU</span><input id={`${prefix}-sku`} aria-invalid={skuMessage ? true : undefined} aria-describedby={skuMessage ? `${prefix}-sku-error` : undefined} value={sku} placeholder="Scan or type SKU" autoComplete="off" spellCheck={false} disabled={!catalogue}
          onChange={event => { setSku(event.target.value); setSkuMessage('') }} onKeyDown={event => { if (event.key === 'Enter') find(event) }} /></label>
        {skuMessage && <p id={`${prefix}-sku-error`} className="br-sku-message" role="status">{skuMessage}</p>}
      </div>
    </div>
    <div className="br-pad-send">
      {catalogue && catalogue.items.length > 0 && <button type="button" className="br-secondary" disabled={busy || inactive} onClick={() => setImporting(true)}>Paste or upload CSV</button>}
      {catalogue && catalogue.items.length > 0 && <button type="button" className="br-secondary" disabled={busy || inactive} onClick={() => setListing(true)}>Saved lists</button>}
      {catalogue && catalogue.items.length > 0 && <button type="button" className="br-secondary" disabled={!canPurchase || busy || inactive || !chosen.length || invalid} onClick={() => void requestQuote()}>Request quote</button>}
      {canPurchase&&catalogue?.items.some(item=>item.units?.length) && <button type="button" className="br-secondary" disabled={busy || inactive} onClick={()=>{setUnitLines(undefined);setUnitOrder(true)}}>Order by selling unit</button>}
      <button disabled={!canPurchase || busy || !catalogue || inactive || unitDraft}>{busy ? 'Preparing…' : 'Prepare draft'}</button>
      {hint && <p className="br-quiet-text">{hint}</p>}
      {corrections.length > 0 && <div className="br-actions">{corrections.map(({ sku, value }) => <button key={`${sku}-${value}`} type="button" className="br-secondary" disabled={busy} onClick={() => { setQuantities(current => ({ ...current, [sku]: value })); cells.current.get(sku)?.focus() }}>Use {value} for {sku}</button>)}</div>}
    </div>
    <ErrorSummary className="br-pad-errors" problems={problems} attempt={validationAttempt} />
    {loading && <p role="status" className="br-pad-status br-card">Fetching live stock and agreed prices from Pier…</p>}
    {error && <div className="br-pad-status"><Notice error><strong>Catalog unavailable</strong><p>{error}</p><p>No order can be prepared until live stock is available.</p><div><button type="button" className="br-secondary" onClick={() => setRefresh(value => value + 1)} disabled={busy}>Refresh stock</button></div></Notice></div>}
    {catalogue && items.length === 0 && <div className="br-pad-status"><Empty title="No agreed products yet">Your supplier needs to add agreed SKU prices to this trade account before you can order.</Empty></div>}
    {catalogue && items.length > 0 && <>
      <StyleCard row={shown} observedAt={catalogue.observedAt} />
      <section className="br-matrix-card br-card" aria-label="Size matrix">
        {missing.length > 0 && <Notice>{missing.map(line => line.sku).join(', ')} {missing.length === 1 ? 'is' : 'are'} no longer on this account’s price list and {missing.length === 1 ? 'was' : 'were'} left out.</Notice>}
        <StyleMatrix orderQuantityProblem={orderQuantityProblem} prefix={prefix} rows={rows} columns={columns} quantities={quantities} busy={busy} selected={shown?.key ?? ''} customer={currentAccount.value.name} pricingReasons={Object.fromEntries(priced.filter(line=>line.pricing).map(line=>[line.sku,`${line.pricing!.reason} · ${money(line.lineCents)}`]))} lineCents={Object.fromEntries(priced.map(line=>[line.sku,line.lineCents]))} changes={changes} kept={kept} writtenAt={draft?.preparedAt} cells={cells}
          onQuantity={(key, value) => setQuantities(current => ({ ...current, [key]: value }))} onSelect={setSelected} onKeep={key => setKept(current => new Set(current).add(key))} onRemove={remove} />
        <p className="br-quiet-text br-matrix-foot">{canPurchase?'Preparing creates a draft for review. Submit it from Orders when you are ready.':'Your approver rights allow company review in Orders; preparing purchases requires purchaser rights.'}<button type="button" className="br-quiet" onClick={() => setRefresh(value => value + 1)} disabled={loading || busy}>Refresh stock</button></p>
      </section>
      <label className="br-pad-ref">Your purchase order / reference<input value={reference} maxLength={100} onChange={event => setReference(event.target.value)} disabled={busy} placeholder="Purchase order or reference" /></label>
      <details className="br-details"><summary>Delivery dates & instructions</summary>
        <label>Requested delivery date (Eastern time)<input id={`${prefix}-requested`} aria-invalid={requestedDateProblem ? true : undefined} aria-describedby={requestedDateProblem ? `${prefix}-requested-error` : undefined} type="date" value={details.requestedDate} disabled={busy} onChange={event => setDetails(current => ({ ...current, requestedDate: event.target.value }))} /></label>{requestedDateProblem && <p id={`${prefix}-requested-error`} className="br-field-error">{requestedDateProblem}</p>}
        <label>Cancel if not shipped after (Eastern time)<input id={`${prefix}-cancel`} aria-invalid={dateProblem ? true : undefined} aria-describedby={dateProblem ? `${prefix}-cancel-error` : undefined} type="date" value={details.cancelAfter} min={details.requestedDate || undefined} disabled={busy} onChange={event => setDetails(current => ({ ...current, cancelAfter: event.target.value }))} /></label>{dateProblem && <p id={`${prefix}-cancel-error`} className="br-field-error">{dateProblem}</p>}
        <label>Instructions for the supplier<textarea value={details.instructions} maxLength={1000} disabled={busy} onChange={event => setDetails(current => ({ ...current, instructions: event.target.value }))} /></label>
      </details>
      <div className="br-pad-foot" role="status" aria-live="polite">
        <p className="br-pad-total"><span className="br-sr-only">Order total: </span>{units} {units === 1 ? 'unit' : 'units'} · {money(total)}</p>
        {chosen.length > 0 && (belowMinimum
          ? <span className="br-pill br-pill-warn">Add {money(minimum - total)} to meet {money(minimum)} minimum</span>
          : <span className="br-pill br-pill-good"><span className="br-pill-check" aria-hidden="true">✓</span>Min {money(minimum)} met</span>)}
        <span className="br-pad-terms"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>{terms(currentAccount.value.termsDays)} from approval</span>
        {draftTotal !== 0 && <span className="br-hand">{`${draftTotal > 0 ? '+' : '−'}${money(Math.abs(draftTotal))} since draft`}</span>}
      </div>
    </>}
    {unitOrder && catalogue && catalogue.items.length>0 && <UnitOrder key={unitLines?'import':draft?.id??"new"} catalogue={catalogue} draft={unitDraft?draft:undefined} initial={unitLines} run={run} busy={busy} error={commandError} onClose={()=>setUnitOrder(false)} onPrepared={onPrepared} />}
    {(importing || fromList) && catalogue && <CartImport profileId={account.buyingProfile?.id} accountId={account.id} cart={padCart} list={fromList} onApply={apply} onClose={() => { setImporting(false); setFromList(undefined) }} />}
    {listing && catalogue && <SavedLists accountId={account.id} cart={padCart} onAdd={list => { setListing(false); setFromList(list) }} onClose={() => setListing(false)} />}
  </form>
}
