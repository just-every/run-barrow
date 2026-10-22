import { useEffect, useState } from 'react'
import { request, errorMessage } from './api'
import type { SellerIdentity } from '../seller-identity'
import type { VariantAttributes } from '../variant-attributes'

type Identity = { identity: SellerIdentity | null; revision: string | null }
type Variants = { variants: Record<string, VariantAttributes>; revision: string | null }
const rowsText = (variants: Record<string, VariantAttributes>) => Object.entries(variants).map(([sku, value]) => [sku, value.style, value.color, value.size].join(', ')).join('\n')

// ORD-014: what later confirmations record about the seller and each variant. Earlier documents keep their copies.
export function ConfirmationSettings() {
 const [identity, setIdentity] = useState<Identity | null>(null), [variants, setVariants] = useState<Variants | null>(null)
 const [form, setForm] = useState({ legalName: '', address: '', registration: '' }), [rows, setRows] = useState(''), [imageSku, setImageSku] = useState('')
 const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState('')
 async function load() {
  const [nextIdentity, nextVariants] = await Promise.all([request<Identity>('/api/barrow/seller-identity'), request<Variants>('/api/barrow/variant-attributes')])
  setIdentity(nextIdentity); setVariants(nextVariants); setRows(rowsText(nextVariants.variants))
  setForm({ legalName: nextIdentity.identity?.legalName ?? '', address: nextIdentity.identity?.address ?? '', registration: nextIdentity.identity?.registration ?? '' })
 }
 useEffect(() => { void load().catch(cause => setError(errorMessage(cause))) }, [])
 async function save(type: string, payload: Record<string, unknown>, done: string) {
  setBusy(true); setError(''); setSaved('')
  try { await request('/api/barrow/commands', { type, payload }); await load(); setSaved(done) } catch (cause) { setError(errorMessage(cause)) } finally { setBusy(false) }
 }
 function saveVariants() {
  const parsed = rows.split('\n').map(line => line.trim()).filter(Boolean).map(line => { const [sku, style, color, size] = line.split(',').map(part => part.trim()); return { sku, style, color, size } })
  const remove = Object.keys(variants?.variants ?? {}).filter(sku => !parsed.some(row => row.sku === sku))
  void save('variant.attributes', { revision: variants?.revision ?? null, variants: parsed, remove }, 'Variant attributes saved. New orders copy them; earlier orders keep theirs.')
 }
 async function upload(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  await save('variant.image', { revision: variants?.revision ?? null, sku: imageSku, contentBase64: btoa(binary) }, `Product image saved for ${imageSku}; metadata was removed. New orders show it; earlier orders keep theirs.`)
 }
 return <section className="br-card br-stack" aria-labelledby="confirmation-settings">
  <h2 id="confirmation-settings">Order confirmation details</h2>
  <p className="br-quiet-text">Every confirmation recorded from now on names this seller identity and each line’s style, color and size. Confirmations already recorded keep what they recorded.</p>
  {error && <p role="alert">{error}</p>}
  {saved && <p role="status">{saved}</p>}
  {identity && <fieldset className="br-stack" disabled={busy}><legend>Seller legal identity</legend>
   <label>Legal name<input value={form.legalName} maxLength={160} onChange={event => setForm({ ...form, legalName: event.target.value })} /></label>
   <label>Registered address<input value={form.address} maxLength={400} onChange={event => setForm({ ...form, address: event.target.value })} /></label>
   <label>Registration or tax ID (optional)<input value={form.registration} maxLength={80} onChange={event => setForm({ ...form, registration: event.target.value })} /></label>
   <div className="br-actions"><button type="button" disabled={!form.legalName.trim() || !form.address.trim()} onClick={() => void save('seller.identity', { revision: identity.revision, legalName: form.legalName, address: form.address, ...(form.registration.trim() ? { registration: form.registration } : {}) }, 'Seller legal identity saved for later confirmations.')}>Save seller identity</button></div>
  </fieldset>}
  {variants && <fieldset className="br-stack" disabled={busy}><legend>Variant style, color and size</legend>
   <label htmlFor="variant-attribute-rows">One variant per line: SKU, style, color, size</label>
   <textarea id="variant-attribute-rows" rows={6} value={rows} onChange={event => setRows(event.target.value)} />
   <p className="br-quiet-text">{Object.keys(variants.variants).length} variants recorded. Removing a line clears that variant for new orders only.</p>
   <div className="br-actions"><button type="button" onClick={saveVariants}>Save variant attributes</button></div>
  </fieldset>}
  {variants && Object.keys(variants.variants).length > 0 && <fieldset className="br-stack" disabled={busy}><legend>Product images</legend>
   <p className="br-quiet-text">One JPEG per variant, up to 200 KiB. Barrow removes photo metadata and keeps each image while any order or confirmation shows it. Images are not malware-screened; they are parsed as JPEG only.</p>
   <label>Variant<select value={imageSku} onChange={event => setImageSku(event.target.value)}><option value="">Choose a variant</option>{Object.entries(variants.variants).map(([sku, value]) => <option key={sku} value={sku}>{sku} · {value.style} {value.color} {value.size}{value.image ? ' · image recorded' : ''}</option>)}</select></label>
   <label>JPEG image<input type="file" accept="image/jpeg" disabled={!imageSku} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file) }} /></label>
   <div className="br-actions"><button type="button" className="br-secondary" disabled={!variants.variants[imageSku]?.image} onClick={() => void save('variant.image', { revision: variants.revision, sku: imageSku, remove: true }, `Product image removed from ${imageSku} for new orders.`)}>Remove image for new orders</button></div>
  </fieldset>}
 </section>
}
