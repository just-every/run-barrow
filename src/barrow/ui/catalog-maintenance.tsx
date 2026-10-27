import { useEffect, useState } from 'react'
import { errorMessage, request } from './api'
import { JsonDetail, Notice } from './primitives'
import type { CatalogWorkbook } from '../catalog-maintenance-model'
import type { previewCatalogMaintenance } from '../catalog-maintenance-preview'
import type { previewBulkImages, readBulkImages } from '../bulk-images'

type Preview = Awaited<ReturnType<typeof previewCatalogMaintenance>>
export function CatalogMaintenance() {
 const [workbook, setWorkbook] = useState<CatalogWorkbook | null>(null), [preview, setPreview] = useState<Preview | null>(null)
 const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
 const [approved, setApproved] = useState(false), [approveRemoved, setApproveRemoved] = useState(false), [reason, setReason] = useState('')
 const [imageRule, setImageRule] = useState('style_color_position'), [imageInput, setImageInput] = useState<object | null>(null)
 const [imagePreview, setImagePreview] = useState<Awaited<ReturnType<typeof previewBulkImages>> | null>(null)
 const [media, setMedia] = useState<Awaited<ReturnType<typeof readBulkImages>> | null>(null)
 const imagePath = '/api/barrow/catalog-maintenance/images'
 const refreshMedia = async () => { const value = await request<Awaited<ReturnType<typeof readBulkImages>>>(imagePath); setMedia(value); setImageRule(value.rule) }
 useEffect(() => { void refreshMedia().catch(cause => setError(errorMessage(cause))) }, [])
 const invalidate = () => { setPreview(null); setApproved(false); setApproveRemoved(false); setMessage('') }
 async function act(run: () => Promise<void>) {
  setBusy(true); setError(''); setMessage('')
  try { await run() } catch (cause) { setError(errorMessage(cause)) } finally { setBusy(false) }
 }
 async function upload(file: File | undefined) {
  invalidate(); setWorkbook(null)
  if (!file) return
  if (!file.name.toLowerCase().endsWith('.xlsx') || file.size > 1024 * 1024) throw new Error('Choose an XLSX workbook of at most 1 MiB.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let start = 0; start < bytes.length; start += 0x8000) binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000))
  setWorkbook({ name: file.name, base64: btoa(binary) })
 }
 async function compare() {
  invalidate()
  const result = await request<Preview>('/api/barrow/catalog-maintenance/preview', { workbook })
  setPreview(result)
 }
 async function apply() {
  if (!preview || !workbook) return
  await request('/api/barrow/catalog-maintenance/apply', { workbook, fingerprint: preview.fingerprint, reason, approveRemoved })
  invalidate(); setMessage('The reviewed catalog was applied. Download the current workbook to inspect the saved metadata and source keys.')
 }
 async function uploadImages(files: File[]) {
  setImageInput(null); setImagePreview(null)
  if (!files.length) return
  if (files.length > 1000 || files.reduce((n, file) => n + file.size, 0) > 30 * 1024 * 1024) throw new Error('Choose up to 1,000 files and 30 MiB per batch.')
  const encode = async (file: File) => {
   const bytes = new Uint8Array(await file.arrayBuffer()); let binary = ''
   for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000))
   return { name: file.name, base64: btoa(binary) }
  }
  if (files.length === 1 && /\.zip$/i.test(files[0].name)) setImageInput({ archive: await encode(files[0]) })
  else setImageInput({ files: await Promise.all(files.map(encode)) })
 }
 return <section className="br-stack" aria-labelledby="catalog-maintenance-title">
  <div className="br-heading-row"><div><h2 id="catalog-maintenance-title">Bulk catalog maintenance</h2><p>Download a workbook, edit catalog metadata, then preview and explicitly approve its fingerprint.</p></div></div>
  <div className="br-card br-stack" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!busy) { const files = Array.from(event.dataTransfer.files); void act(() => uploadImages(files)) } }}>
   <h3>Product image batch</h3>
   <p>Drop JPEG files or one ZIP here, or choose files. Up to 1,000 files and 30 MiB per batch; ZIP archives are at most 20 MiB. JPEGs are at most 200 KiB each. Files stay private to this installation; metadata is stripped, with no malware verdict.</p>
   <label>Image naming rule<select value={imageRule} disabled={busy} onChange={event => { setImageRule(event.target.value); setImagePreview(null) }}><option value="style_color_position">style_color_position</option><option value="sku_position">sku_position</option></select></label>
   <p>Use exact names and underscores, for example Pantry_Natural_1.jpg. Style and color match every size variant; positions are 1 to 99. Position 1 supplies the existing document image. Other positions remain private catalog slots.</p>
   <label>Product image files<input type="file" multiple accept=".jpg,.jpeg,.zip" disabled={busy} onChange={event => { const files = Array.from(event.target.files ?? []); void act(() => uploadImages(files)) }} /></label>
   {imageInput && <p>Image batch selected.</p>}
   <div className="br-actions"><button disabled={busy || !imageInput} onClick={() => void act(async () => { setImagePreview(await request(imagePath + '/preview', { ...imageInput, rule: imageRule })) })}>Preview image batch</button><button disabled={busy} onClick={() => void act(refreshMedia)}>Refresh saved images</button></div>
   {imagePreview && <><p>Preview only: {imagePreview.matched} matched, {imagePreview.held} held. Review every target and reason before applying.</p><ul className="br-stack" aria-label="Image batch preview">{imagePreview.rows.map(row => <li key={row.name} style={{overflowWrap:'anywhere'}}><strong>{row.name}</strong><p>Variant: {row.targets.join(', ') || 'Unmatched'}. Position: {row.position ?? '—'}.<br />{row.reason || 'Matched'}</p></li>)}</ul><button disabled={busy} onClick={() => void act(async () => { setMedia(await request(imagePath + '/apply', { ...imageInput, rule: imageRule, fingerprint: imagePreview.fingerprint })); setImagePreview(null); setImageInput(null); setMessage('Reviewed images saved. Valid held images attach when matching products are imported; existing slots are replaced in place.') })}>Apply reviewed images</button></>}
   {media && <><p>Saved image slots: {media.slots.length}. Held files: {media.held.length}.</p><JsonDetail value={media.held} label="Held image filenames and reasons" /><JsonDetail value={media.slots} label="Saved variant image positions" /></>}
  </div>
  <div className="br-card br-stack">
   <h3>1. Prepare the catalog workbook</h3>
   <div className="br-actions"><a className="br-button br-secondary" href="/api/barrow/catalog-maintenance/export.xlsx" download>Download XLSX workbook</a><a href="/api/barrow/catalog-maintenance/export.csv" download>Export CSV</a><a href="/api/barrow/catalog-maintenance/export.json" download>Export JSON and manifest</a></div>
   <p>Use the Catalog worksheet. Keep sku and itemId as Pier’s exact product identities. Set variantKey, style, color, size, attributes, categories, assortments, mediaSha256 and listing. Attributes use a JSON object of text values; category and assortment labels use | separators.</p>
   <p>Pier owns SKU, name, barcode and stock. Changes to those fields must be made in the connected Pier installation. Media must name an existing sanitized JPEG’s SHA-256; external links are refused. Assortment labels record metadata and do not grant buyer access.</p>
   <p>Set listing to removed for every intended removal. Omitted rows stay unchanged. Removing a listing preserves its metadata and historical order documents.</p>
   <label>Catalog workbook<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={event => { const file = event.target.files?.[0]; void act(() => upload(file)) }} /></label>
   {workbook && <p>Selected: {workbook.name}</p>}
   <div className="br-actions"><button disabled={busy || !workbook} onClick={() => void act(compare)}>Preview workbook</button></div>
  </div>
  {error && <Notice error>{error}</Notice>}
  {message && <Notice>{message}</Notice>}
  {preview && <div className="br-card br-stack">
   <h3>2. Review and approve</h3>
   <p>Preview made no catalog changes. {preview.reconciliation.skuCheck}.{preview.sourceRoute && <> <a href={preview.sourceRoute}>Open connected Pier</a></>}</p>
   <div className="br-table-wrap"><table><caption>Source and planned catalog records</caption><thead><tr><th scope="col">Measure</th><th scope="col">Source</th><th scope="col">Planned</th></tr></thead><tbody>{(['listings', 'listed', 'removed', 'mediaReferences', 'attributes', 'categories', 'assortmentAssignments'] as const).map(key => <tr key={key}><th scope="row">{key}</th><td>{preview.reconciliation.source[key]}</td><td>{preview.reconciliation.planned[key]}</td></tr>)}</tbody></table></div>
   <p>{preview.reconciliation.financialNote}</p>
   {preview.issues.length > 0 && <Notice error><strong>Correct these issues and preview again</strong><ul>{preview.issues.map((issue, index) => <li key={index}>Row {issue.row}, {issue.sku && `${issue.sku}, `}{issue.field}: {issue.message}{issue.sourceRoute && <> <a href={issue.sourceRoute}>Open source route</a></>}</li>)}</ul></Notice>}
   <JsonDetail value={preview.rows} label="Planned catalog rows, media and assignments" />
   <JsonDetail value={preview.reconciliation.missingSourceEntities} label="Source entities not supplied by this catalog workbook" />
   <JsonDetail value={preview.reconciliation.unchangedOmittedListings} label="Omitted listings kept unchanged" />
   {preview.reconciliation.removedListings.length > 0 && <Notice><strong>Explicit removals</strong><ul>{preview.reconciliation.removedListings.map(sku => <li key={sku}>{sku}</li>)}</ul></Notice>}
   <label>Reviewed fingerprint<input value={preview.fingerprint} readOnly className="br-mono" /></label>
   <label>Approval reason<textarea value={reason} maxLength={1000} rows={3} disabled={busy || !preview.canApply} onChange={event => { setReason(event.target.value); setApproved(false) }} /></label>
   <label style={{display:'flex',alignItems:'center',gap:8}}><input style={{width:20,minHeight:20,flex:'0 0 20px'}} type="checkbox" checked={approved} disabled={busy || !preview.canApply} onChange={event => setApproved(event.target.checked)} /> I approve this exact fingerprint and its reconciliation.</label>
   {preview.reconciliation.removedListings.length > 0 && <label style={{display:'flex',alignItems:'center',gap:8}}><input style={{width:20,minHeight:20,flex:'0 0 20px'}} type="checkbox" checked={approveRemoved} disabled={busy || !preview.canApply} onChange={event => setApproveRemoved(event.target.checked)} /> I approve every removal listed above.</label>}
   <div className="br-actions"><button disabled={busy || !preview.canApply || !approved || !reason.trim() || preview.reconciliation.removedListings.length > 0 && !approveRemoved} onClick={() => void act(apply)}>Apply reviewed catalog</button></div>
  </div>}
 </section>
}
