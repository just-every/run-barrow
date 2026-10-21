import { useEffect, useState, type FormEvent } from 'react'
import type { Account, RunCommand } from './types'
import { validatePriceUnits, type AccountValue } from '../imports/validation'
import { applyPricing, PricingSettings } from './pricing-settings'
import { Notice } from './primitives'
import { profileFields } from './account-profile'
import { request, errorMessage } from './api'

function parsePrices(text: string, unitText: string): AccountValue['prices'] {
  const prices: AccountValue['prices'] = text.split(/\r?\n/).filter(line => line.trim()).map((line, index) => {
    const values = line.split(',').map(value => value.trim())
    const [sku, cents, quantity, pack = '', step = ''] = values
    const unitCents = Number(cents), minQty = Number(quantity)
    if (values.length < 3 || values.length > 5 || !sku || !/^\d+$/.test(cents) || !Number.isSafeInteger(unitCents) || !/^\d+$/.test(quantity) || !Number.isSafeInteger(minQty) || minQty < 1 || [pack, step].some(value => value && !/^[1-9]\d{0,4}$/.test(value))) {
      throw new Error(`Price row ${index + 1}: enter SKU, non-negative unit price in cents, a minimum quantity of at least 1, and optionally a case pack and an increment of at least 1.`)
    }
    return { sku, unitCents, minQty, ...(pack ? { casePack: Number(pack) } : {}), ...(step ? { increment: Number(step) } : {}) }
  })
  if (new Set(prices.map(price => price.sku)).size !== prices.length) throw new Error('Each SKU can have one agreed price. Remove duplicate rows.')
  if (unitText.trim()) {
    let definitions: unknown
    try { definitions = JSON.parse(unitText) } catch { throw new Error('Unit configuration must be valid JSON.') }
    if (!Array.isArray(definitions) || !definitions.length) throw new Error('Unit configuration needs a nonempty array of SKU entries, or leave the field blank.')
    const seen = new Set<string>()
    for (const entry of definitions) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry) || Object.keys(entry).length !== 2 || !Object.hasOwn(entry, 'sku') || !Object.hasOwn(entry, 'units') || typeof entry.sku !== 'string') throw new Error('Each unit configuration entry requires exactly sku and units.')
      const price = prices.find(price => price.sku === entry.sku)
      if (!price) throw new Error(`Unit configuration SKU ${entry.sku} needs an agreed price row.`)
      if (seen.has(entry.sku)) throw new Error('Each SKU can have one unit configuration entry. Remove duplicates.')
      seen.add(entry.sku)
      price.units = validatePriceUnits(entry.units)
    }
  }
  return prices
}

function configuredUnits(prices: AccountValue['prices']): string {
  const entries = prices.filter(price => price.units !== undefined).map(({ sku, units }) => ({ sku, units }))
  return entries.length ? JSON.stringify(entries, null, 2) : ''
}

export function AccountForm({ account, run, busy, onClose }: { account?: Account; run: RunCommand; busy: boolean; onClose: () => void }) {
  const [error, setError] = useState('')
  const [name, setName] = useState(account?.value.name ?? '')
  const [pierId, setPierId] = useState(account?.value.pierCustomerId ?? '')
  type Candidate={id:string;revision:string;name:string}
  const [duplicates,setDuplicates]=useState<Candidate[]>([]),[reviews,setReviews]=useState<Candidate[]>([])
  const [duplicatePage,setDuplicatePage]=useState(1),[hasNext,setHasNext]=useState(false),[checking,setChecking]=useState(true),[checkError,setCheckError]=useState(''),[retry,setRetry]=useState(0)
  const reviewed=duplicates.every(row=>reviews.some(review=>review.id===row.id&&review.revision===row.revision))
  useEffect(()=>{setReviews([]);setDuplicatePage(1)},[name,pierId])
  useEffect(()=>{
    let current=true;setChecking(true);setCheckError('');setDuplicates([]);setHasNext(false)
    const timer=setTimeout(()=>void request<{candidates:Candidate[];hasNext:boolean}>(`/api/barrow/accounts/duplicates?${new URLSearchParams({name,pierCustomerId:pierId,exclude:account?.id??'',page:String(duplicatePage)})}`).then(value=>{if(current){setDuplicates(value.candidates);setHasNext(value.hasNext)}}).catch(cause=>{if(current)setCheckError(errorMessage(cause))}).finally(()=>{if(current)setChecking(false)}),200)
    return ()=>{current=false;clearTimeout(timer)}
  },[name,pierId,account?.id,duplicatePage,retry])
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('')
    const data = new FormData(event.currentTarget)
    try {
      const id = String(data.get('id')).trim()
      const value = {
        ...profileFields(data),
        name: String(data.get('name')).trim(), email: String(data.get('email')).trim().toLowerCase(),
        pierCustomerId: String(data.get('pierCustomerId')).trim(), termsDays: Number(data.get('termsDays')),
        minimumCents: Number(data.get('minimumCents')), prices: applyPricing(parsePrices(String(data.get('prices')), String(data.get('units') ?? '')),String(data.get('pricing')??'')),
        ...Object.fromEntries(['city', 'state'].map(key => [key, String(data.get(key)).trim()]).filter(([, value]) => value)),
      }
      if (checking || checkError || hasNext || !reviewed) throw new Error('Review the possible duplicate companies before saving.')
      if (await run('account.save', { ...(String(data.get('reason')??'').trim()?{reason:String(data.get('reason')).trim()}:{}), duplicateReviews: reviews.map(({ id, revision }) => ({ id, revision })), ...(id ? { id } : {}), ...(account ? { revision: account.revision } : {}), value })) onClose()
    } catch (error) { setError(error instanceof Error ? error.message : 'Check the account fields.') }
  }
  return <form onSubmit={event => void save(event)} className="br-stack">
    <div className="br-heading-row"><h2>{account ? 'Edit trade account' : 'New trade account'}</h2><button type="button" className="br-quiet" onClick={onClose} disabled={busy}>Cancel</button></div>
    {error && <Notice error>{error}</Notice>}
    <fieldset disabled={busy} className="br-form-grid">
      <label>Business name<input name="name" required value={name} onChange={event => setName(event.target.value)} autoComplete="organization" /></label>
      <label>Customer email<input name="email" type="email" required readOnly={!!account} defaultValue={account?.value.email} autoComplete="email" />{account && <small>Create a separate account to change the customer’s sign-in email.</small>}</label>
      <label>Account ID<input name="id" defaultValue={account?.id} readOnly={!!account} placeholder="Generated when left blank" /><small>{account ? 'The account ID is permanent.' : 'Use a stable ID for imports and account updates.'}</small></label>
      <label>City<input name="city" defaultValue={account?.value.city} autoComplete="address-level2" maxLength={80} /></label>
      <label>State<input name="state" defaultValue={account?.value.state} autoComplete="address-level1" maxLength={40} placeholder="SC" /></label>
      <label>Pier customer ID<input name="pierCustomerId" required value={pierId} onChange={event => setPierId(event.target.value)} /></label>
      <label>Account state<select name="lifecycle" defaultValue={account?.value.lifecycle ?? 'active'}><option value="active">Active</option><option value="on-hold">On hold</option><option value="closed">Closed</option></select><small>On hold and closed block new ordering; existing history stays available.</small></label>
      <label>Sales channel<input name="channel" defaultValue={account?.value.channel} maxLength={80} /></label>
      <label>Territory<input name="territory" defaultValue={account?.value.territory} maxLength={80} /></label>
      <label>Assigned rep reference<input name="assignedRep" defaultValue={account?.value.assignedRep} maxLength={160} /></label>
      <label>Promise stock from these Pier warehouses<textarea name="warehouses" rows={2} defaultValue={account?.value.warehouses?.join('\n')} /><small>One Pier warehouse name per line; leave empty for every warehouse. Barrow promises only this stock to the account; Pier still chooses the bins when it reserves an approved order.</small></label>
      <label>Catalog references<textarea name="catalogs" rows={3} defaultValue={account?.value.catalogs?.join('\n')} /><small>One reference per line. Rep and catalog references record existing assignments; portal access still follows agreed SKUs.</small></label>
      <label>Provider references<textarea name="providerReferences" rows={3} defaultValue={Object.entries(account?.value.providerReferences ?? {}).map(([provider, reference]) => `${provider}=${reference}`).join('\n')} /><small>One provider=reference per line. Pier uses the separate Pier customer ID.</small></label>
      <label>Payment terms (days)<input name="termsDays" type="number" min="0" max="365" step="1" required defaultValue={account?.value.termsDays ?? 30} /></label>
      <label>Minimum order (cents)<input name="minimumCents" type="number" min="0" step="1" required defaultValue={account?.value.minimumCents ?? 0} /></label>
      <label className="br-full">Agreed prices<textarea name="prices" rows={6} defaultValue={account?.value.prices.map(price => [price.sku, price.unitCents, price.minQty, ...(price.casePack || price.increment ? [price.casePack ?? '', price.increment ?? ''] : [])].join(',').replace(/,$/, '')).join('\n')} placeholder="SKU,unitCents,minQty[,casePack[,increment]]" spellCheck={false} /><small>One row per SKU, with no header. For example: <span className="br-nowrap">JV-2214-S,4800,2</span> means $48.00 each, minimum quantity 2. Add a case pack and an increment in base units to require whole cases and steps above the minimum: <span className="br-nowrap">JV-2214-S,4800,12,6,12</span> allows 12, 24, 36… Only agreed SKUs appear in this account’s catalog.</small></label>
      <label className="br-full">Selling units (optional JSON)<textarea name="units" rows={8} defaultValue={configuredUnits(account?.value.prices ?? [])} placeholder={'[{"sku":"JV-2214-S","units":[{"code":"case","baseQuantity":"12","unitCents":48000,"packContents":"12 each per case"}]}]'} spellCheck={false} /><small>List each SKU with its selling units. Each unit needs a unique code, an exact baseQuantity conversion to Pier stock units, a unitCents price and a packContents description. Base quantities must be positive, at most 1000000 and have at most six decimal places. Use quantityKind "measured" for decimal quantities; case and pallet stay whole. Unit codes must differ from the stock unit. Leave blank to use the agreed prices without configured units.</small></label>
      <label className="br-full">Reason for change (optional)<input name="reason" maxLength={240} /><small>Recorded in the supplier audit with this revision. An override retains its approved reason when this field is empty.</small></label>
      <PricingSettings prices={account?.value.prices??[]} />
    </fieldset>
    {checking && <p role="status">Checking possible duplicate companies…</p>}
    {checkError && <Notice error>{checkError}<button type="button" className="br-secondary" onClick={()=>setRetry(value=>value+1)}>Retry duplicate review</button></Notice>}
    {duplicates.length > 0 && <Notice><strong>Review possible duplicate companies · page {duplicatePage}</strong><ul>{duplicates.map(candidate => <li key={candidate.id}>{candidate.name} · {candidate.id}</li>)}</ul><p>Keep their accounts, sign-in emails and history separate.</p><button type="button" className="br-secondary" disabled={busy||checking||reviewed} aria-pressed={reviewed} onClick={() => setReviews(current=>[...current.filter(row=>!duplicates.some(candidate=>candidate.id===row.id)),...duplicates])}>{reviewed ? 'Separate companies confirmed' : 'Confirm separate companies'}</button>{hasNext&&<button type="button" className="br-secondary" disabled={busy||checking||!reviewed} onClick={()=>setDuplicatePage(value=>value+1)}>Review next duplicate companies</button>}</Notice>}
    <div className="br-actions"><button disabled={busy || checking || !!checkError || hasNext || !reviewed}>{busy ? 'Saving…' : 'Save account'}</button></div>
  </form>
}
