import { useEffect, useState } from 'react'
import { request, errorMessage } from './api'
import { Notice } from './primitives'
import type { MediaCatalog } from '../catalog-media-access'
import type { readCatalogMedia } from '../catalog-media'

type MediaState = Awaited<ReturnType<typeof readCatalogMedia>>
type Review = { fingerprint: string; affectedCatalogs: string[]; grantRevision: string; variantRevision: string; imageRevision: string }
export function CatalogMedia() {
 const [data, setData] = useState<MediaState | null>(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false)
 const [catalogId, setCatalogId] = useState(''), [sku, setSku] = useState(''), [imageSha256, setImage] = useState(''), [slot, setSlot] = useState('1'), [reason, setReason] = useState('')
 const [review, setReview] = useState<Review | null>(null), [approved, setApproved] = useState(false)
 const [membership, setMembership] = useState<MediaCatalog[]>([]), [membershipReason, setMembershipReason] = useState('')
 const reload = async () => { const next = await request<MediaState>('/api/barrow/catalog-media'); setData(next); setMembership(next.catalogs.map(({ id, name, skus, images }) => ({ id, name, skus, images }))) }
 useEffect(() => { void reload().catch(cause => setError(errorMessage(cause))) }, [])
 const invalidate = () => { setReview(null); setApproved(false); setNotice('') }
 const act = async (work: () => Promise<void>) => { setBusy(true); setError(''); setNotice(''); try { await work() } catch (cause) { setError(errorMessage(cause)); invalidate() } finally { setBusy(false) } }
 const editMembership = (index: number, patch: Partial<MediaCatalog>) => setMembership(rows => rows.map((row, at) => at === index ? { ...row, ...patch } : row))
 const catalog = data?.catalogs.find(row => row.id === catalogId)
 const input = { catalogId, sku, slot: Number(slot), imageSha256 }
 return <section className="br-card br-stack" aria-labelledby="catalog-media-title">
  <h2 id="catalog-media-title">Catalog media</h2>
  <p>Match an imported variant to an accepted JPEG reference, review the exact change, then replace one slot. Existing order and confirmation images remain fixed.</p>
  {error && <Notice error>{error}</Notice>}{notice && <Notice>{notice}</Notice>}
  {!data && !error && <p role="status">Loading catalog media…</p>}
  {data && <>
   {!data.current && <Notice error>The owner must review membership against current imported source revisions before media changes.</Notice>}
   <fieldset className="br-stack" disabled={busy}>
    <label>Media catalog<select aria-label="Media catalog" value={catalogId} onChange={event => { setCatalogId(event.target.value); setSku(''); setImage(''); invalidate() }}><option value="">Choose a catalog</option>{data.catalogs.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
    <label>Imported variant<select aria-label="Imported variant" value={sku} onChange={event => { setSku(event.target.value); invalidate() }}><option value="">Choose a variant</option>{catalog?.variants.map(row => <option key={row.sku} value={row.sku} disabled={!row.editable}>{row.sku}{row.editable ? '' : ' — outside shared scope'}</option>)}</select></label>
    <label>Accepted image reference<select aria-label="Accepted image reference" style={{maxWidth:'100%'}} value={imageSha256} onChange={event => { setImage(event.target.value); invalidate() }}><option value="">Choose a stored JPEG</option>{catalog?.images.map(sha => <option key={sha} value={sha}>{sha}</option>)}</select></label>
    <label>Image slot<input type="number" min={1} max={99} step={1} value={slot} onChange={event => { setSlot(event.target.value); invalidate() }}/></label>
    <div className="br-actions"><button disabled={!data.current || !catalogId || !sku || !imageSha256} onClick={() => void act(async () => { setReview(await request('/api/barrow/catalog-media/preview', input)); setApproved(false) })}>Prepare media match</button></div>
   </fieldset>
   {review && <div className="br-stack" aria-label="Review catalog media">
    <h3>Review slot replacement</h3><p style={{overflowWrap:'anywhere'}}>Variant {sku}, slot {slot}. Image {imageSha256}. Affected catalogs: {review.affectedCatalogs.join(', ')}.</p>
    <details><summary>Bound source revisions</summary><p style={{overflowWrap:'anywhere'}}>Grant {review.grantRevision}. Variants {review.variantRevision}. Image {review.imageRevision}. Fingerprint {review.fingerprint}.</p></details>
    <label>Media approval reason<textarea maxLength={1000} value={reason} onChange={event => { setReason(event.target.value); setApproved(false) }}/></label>
    <label><input type="checkbox" checked={approved} onChange={event => setApproved(event.target.checked)}/>I reviewed this exact media replacement</label>
    <div className="br-actions"><button disabled={busy || !approved || !reason.trim()} onClick={() => void act(async () => { await request('/api/barrow/catalog-media/apply', { ...input, fingerprint: review.fingerprint, reason }); await reload(); setReview(null); setApproved(false); setNotice('Reviewed media replacement saved. Historical documents are unchanged.') })}>Apply reviewed replacement</button></div>
   </div>}
   {catalog && <ul aria-label="Current catalog image slots">{catalog.variants.map(row => <li key={row.sku} style={{overflowWrap:'anywhere'}}>{row.sku}: {Object.entries(row.slots).map(([position, image]) => `${position}: ${image.sha256}`).join(', ') || 'No image slots'}</li>)}</ul>}
   <button className="br-secondary" disabled={busy} onClick={() => void act(async () => { invalidate(); await reload() })}>Refresh catalog media</button>
   {data.owner && <details className="br-details"><summary>Catalog membership settings</summary><div className="br-stack">
    <p>Review the complete named catalog membership and accepted image references below. Shared variants require entitlement to every containing catalog. Labels in import workbooks grant no access.</p>
    {membership.map((row, index) => <fieldset className="br-card br-stack" key={index} aria-label={`Catalog membership ${index + 1}`} disabled={busy}>
     <legend>Named catalog {index + 1}</legend>
     <label>Catalog ID<input maxLength={100} value={row.id} onChange={event => editMembership(index, { id: event.target.value })}/></label>
     <label>Catalog name<input maxLength={120} value={row.name} onChange={event => editMembership(index, { name: event.target.value })}/></label>
     <fieldset className="br-stack"><legend>Imported members</legend>{data.imported?.map(variant => <label key={variant.sku}><input type="checkbox" checked={row.skus.includes(variant.sku)} onChange={event => editMembership(index, { skus: event.target.checked ? [...row.skus, variant.sku] : row.skus.filter(sku => sku !== variant.sku) })}/>{variant.sku}</label>)}</fieldset>
     <fieldset className="br-stack"><legend>Accepted images for this catalog</legend>{data.acceptedImages?.map(image => <label key={image.sha256} style={{overflowWrap:'anywhere'}}><input type="checkbox" checked={row.images.includes(image.sha256)} onChange={event => editMembership(index, { images: event.target.checked ? [...row.images, image.sha256] : row.images.filter(sha => sha !== image.sha256) })}/>{image.sha256} ({image.width} × {image.height})</label>)}</fieldset>
     <button type="button" className="br-secondary" onClick={() => setMembership(rows => rows.filter((_, at) => at !== index))}>Remove named catalog</button>
    </fieldset>)}
    <button type="button" className="br-secondary" disabled={busy || membership.length >= 100} onClick={() => setMembership(rows => [...rows, { id: '', name: '', skus: [], images: [] }])}>Add named catalog</button>
    <label>Membership review reason<textarea maxLength={1000} value={membershipReason} onChange={event => setMembershipReason(event.target.value)}/></label>
    <button disabled={busy || !membershipReason.trim()} onClick={() => void act(async () => { await request('/api/barrow/catalog-media/membership', { revision: data.revision, catalogRevision: data.catalogRevision, variantRevision: data.variantRevision, catalogs: membership, reason: membershipReason }); invalidate(); await reload(); setNotice('Owner-reviewed catalog membership saved.') })}>Save reviewed membership</button>
   </div></details>}
  </>}
 </section>
}
