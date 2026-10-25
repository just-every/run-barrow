import { useEffect, useState, type FormEvent } from 'react'
import { request, errorMessage } from './api'

type Seller = { legalName: string; address: string; registration?: string }
type Brand = { id: string; revision: string; value: { name: string; seller: Seller; currency: 'USD' | 'CAD'; termsSeries?: string; requireAcceptance?: boolean } }
type Profile = { id: string; accountId: string; revision: string; value: { brandId: string; name: string; prices: Record<string, unknown>[]; minimumCents: number; termsDays: number }; brand: Brand; approved: boolean }
type Board = { profiles: Profile[]; people: { id: string; email: string }[]; brands: Brand[] }
type Save = (type: string, payload: Record<string, unknown>) => Promise<void>

function BrandEditor({ brands, busy, save }: { brands: Brand[]; busy: boolean; save: Save }) {
  const [selected, setSelected] = useState(''), [id, setId] = useState(''), [name, setName] = useState('')
  const [legalName, setLegalName] = useState(''), [address, setAddress] = useState(''), [registration, setRegistration] = useState('')
  const [currency, setCurrency] = useState<'USD' | 'CAD'>('USD'), [termsSeries, setTermsSeries] = useState(''), [requireAcceptance, setRequireAcceptance] = useState(false)
  function choose(value: string) {
    const brand = brands.find(brand => brand.id === value)
    setSelected(value); setId(brand?.id ?? ''); setName(brand?.value.name ?? '')
    setLegalName(brand?.value.seller.legalName ?? ''); setAddress(brand?.value.seller.address ?? ''); setRegistration(brand?.value.seller.registration ?? '')
    setCurrency(brand?.value.currency ?? 'USD'); setTermsSeries(brand?.value.termsSeries ?? ''); setRequireAcceptance(brand?.value.requireAcceptance ?? false)
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    void save('brand.save', { id, revision: brands.find(brand => brand.id === selected)?.revision ?? null, value: { name, seller: { legalName, address, ...(registration.trim() ? { registration } : {}) }, currency, ...(termsSeries.trim() ? { termsSeries, requireAcceptance } : {}) } })
  }
  return <form className="br-card br-stack" aria-label="Brand settings" onSubmit={submit}>
    <h3>Brand and legal seller</h3>
    <label>Edit brand<select value={selected} disabled={busy} onChange={event => choose(event.target.value)}><option value="">New brand</option>{brands.map(brand => <option key={brand.id} value={brand.id}>{brand.value.name}</option>)}</select></label>
    <div className="br-form-grid"><label>Brand ID<input value={id} required maxLength={100} disabled={busy || !!selected} onChange={event => setId(event.target.value)} /></label>
      <label>Brand name<input value={name} required maxLength={160} disabled={busy} onChange={event => setName(event.target.value)} /></label></div>
    <label>Legal seller name<input value={legalName} required maxLength={160} disabled={busy} onChange={event => setLegalName(event.target.value)} /></label>
    <label>Seller address<textarea value={address} required maxLength={400} disabled={busy} onChange={event => setAddress(event.target.value)} /></label>
    <label>Seller registration (optional)<input value={registration} maxLength={80} disabled={busy} onChange={event => setRegistration(event.target.value)} /></label>
    <label>Brand currency<select value={currency} disabled={busy || !!selected} onChange={event => setCurrency(event.target.value as 'USD' | 'CAD')}><option value="USD">USD — US dollars</option><option value="CAD">CAD — Canadian dollars</option></select></label>
    <p>Prices are recorded in the brand’s currency. Create a separate brand with independent prices to use another currency; amounts are never converted. Existing orders retain their recorded seller and currency.</p>
    <label>Published sales terms series (optional)<input value={termsSeries} maxLength={80} disabled={busy} onChange={event => setTermsSeries(event.target.value)} /></label>
    <label><input type="checkbox" checked={requireAcceptance} disabled={busy || !termsSeries.trim()} onChange={event => setRequireAcceptance(event.target.checked)} /> Require buyer acceptance of these terms</label>
    <div className="br-actions"><button disabled={busy}>Save brand</button></div>
  </form>
}

function ProfileEditor({ accountId, profiles, brands, busy, save }: { accountId: string; profiles: Profile[]; brands: Brand[]; busy: boolean; save: Save }) {
  const [selected, setSelected] = useState(''), [id, setId] = useState(''), [name, setName] = useState(''), [brandId, setBrandId] = useState('')
  const [minimumCents, setMinimum] = useState('0'), [termsDays, setTermsDays] = useState('30'), [prices, setPrices] = useState('[]'), [error, setError] = useState('')
  function choose(value: string) {
    const profile = profiles.find(profile => profile.id === value)
    setSelected(value); setId(profile?.id ?? ''); setName(profile?.value.name ?? ''); setBrandId(profile?.value.brandId ?? '')
    setMinimum(String(profile?.value.minimumCents ?? 0)); setTermsDays(String(profile?.value.termsDays ?? 30)); setPrices(JSON.stringify(profile?.value.prices ?? [], null, 2)); setError('')
  }
  function submit(event: FormEvent) {
    event.preventDefault(); setError('')
    let rows: unknown
    try { rows = JSON.parse(prices) } catch { setError('Enter the price rows as a JSON array.'); return }
    if (!Array.isArray(rows)) { setError('Enter the price rows as a JSON array.'); return }
    void save('profile.save', { id, revision: profiles.find(profile => profile.id === selected)?.revision ?? null, accountId, value: { brandId, name, prices: rows, minimumCents: Number(minimumCents), termsDays: Number(termsDays) } })
  }
  return <form className="br-card br-stack" aria-label="Buying profile settings" onSubmit={submit}>
    <h3>Buying profile and price book</h3>
    <label>Edit buying profile<select value={selected} disabled={busy} onChange={event => choose(event.target.value)}><option value="">New buying profile</option>{profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.value.name}</option>)}</select></label>
    <div className="br-form-grid"><label>Buying profile ID<input value={id} required maxLength={100} disabled={busy || !!selected} onChange={event => setId(event.target.value)} /></label>
      <label>Buying profile name<input value={name} required maxLength={160} disabled={busy} onChange={event => setName(event.target.value)} /></label></div>
    <label>Brand for this profile<select required value={brandId} disabled={busy || !!selected} onChange={event => setBrandId(event.target.value)}><option value="">Choose a brand</option>{brands.map(brand => <option key={brand.id} value={brand.id}>{brand.value.name} · {brand.value.currency}</option>)}</select></label>
    <div className="br-form-grid"><label>Minimum order in cents<input type="number" min="0" step="1" required value={minimumCents} disabled={busy} onChange={event => setMinimum(event.target.value)} /></label>
      <label>Payment terms in days<input type="number" min="0" step="1" required value={termsDays} disabled={busy} onChange={event => setTermsDays(event.target.value)} /></label></div>
    <label>Price rows as JSON<textarea rows={7} value={prices} required disabled={busy} onChange={event => setPrices(event.target.value)} /></label>
    <p>Each row names an exact SKU, its unitCents and minQty. Amounts use the selected brand’s currency. Create a separate profile to use another legal seller.</p>
    {error && <p role="alert">{error}</p>}
    <div className="br-actions"><button disabled={busy || !brandId}>Save buying profile</button></div>
  </form>
}

function ProfileGrant({ data, busy, save }: { data: Board; busy: boolean; save: Save }) {
  const [profileId, setProfile] = useState(''), [userId, setUser] = useState(''), [approved, setApproved] = useState(true), [reason, setReason] = useState('')
  return <form className="br-card br-stack" aria-label="Buyer profile approval" onSubmit={event => { event.preventDefault(); void save('profile.grant', { profileId, userId, approved, reason }) }}>
    <h3>Approve a buyer for a profile</h3>
    <label>Profile access<select required value={profileId} disabled={busy} onChange={event => setProfile(event.target.value)}><option value="">Choose a buying profile</option>{data.profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.value.name} · {profile.brand.value.name}</option>)}</select></label>
    <label>Buyer for this profile<select required value={userId} disabled={busy} onChange={event => setUser(event.target.value)}><option value="">Choose an account buyer</option>{data.people.map(person => <option key={person.id} value={person.id}>{person.email}</option>)}</select></label>
    <label>Buyer access<select value={approved ? 'approved' : 'revoked'} disabled={busy} onChange={event => setApproved(event.target.value === 'approved')}><option value="approved">Approved</option><option value="revoked">Revoked</option></select></label>
    <label>Reason for profile access<textarea required maxLength={1000} value={reason} disabled={busy} onChange={event => setReason(event.target.value)} /></label>
    <div className="br-actions"><button disabled={busy || !profileId || !userId || !reason.trim()}>Save buyer profile access</button></div>
  </form>
}

export function BrandProfilesSettings({ accountId, version }: { accountId: string; version: unknown }) {
  const [data, setData] = useState<Board | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [tick, setTick] = useState(0), [notice, setNotice] = useState('')
  useEffect(() => {
    let current = true; setData(null); setError('')
    if (accountId) void request<Board>(`/api/barrow/buying-profiles?${new URLSearchParams({ accountId })}`).then(value => { if (current) setData(value) }).catch(cause => { if (current) setError(errorMessage(cause)) })
    return () => { current = false }
  }, [accountId, version, tick])
  async function save(type: string, payload: Record<string, unknown>) {
    setBusy(true); setError(''); setNotice('')
    try { await request('/api/barrow/commands', { type, payload }); setTick(value => value + 1); setNotice('Saved. Review the current brands, price books and buyer access below.') }
    catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }
  return <section className="br-card br-stack" aria-label="Brands and buying profiles">
    <h2>Brands and buying profiles</h2>
    <p>Each profile has its own brand, seller, currency and agreed price book. A buyer needs explicit approval before selecting it.</p>
    {!accountId && <p>Choose a trade account to manage its buying profiles.</p>}
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {data && <>
      <ul>{data.profiles.map(profile => <li key={profile.id}>{profile.value.name} · {profile.brand.value.name} · {profile.brand.value.seller.legalName} · {profile.brand.value.currency} · {profile.value.prices.length} price rows</li>)}</ul>
      <BrandEditor key={`brand:${accountId}:${tick}`} brands={data.brands} busy={busy} save={save} />
      <ProfileEditor key={`profile:${accountId}:${tick}`} accountId={accountId} profiles={data.profiles} brands={data.brands} busy={busy} save={save} />
      <ProfileGrant key={`grant:${accountId}:${tick}`} data={data} busy={busy} save={save} />
    </>}
  </section>
}
