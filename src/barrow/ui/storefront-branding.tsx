import { useEffect, useRef, useState } from 'react'
import { request, errorMessage } from './api'
import { Notice } from './primitives'
import { storefrontAccents, storefrontCanvases, type StorefrontBranding } from '../storefront-branding-options'

export function StorefrontSettings({value, onSaved}: {value: StorefrontBranding; onSaved: () => Promise<void>}) {
 const [draft, setDraft] = useState(value)
 const [reviewed, setReviewed] = useState(false)
 const [reason, setReason] = useState('')
 const [error, setError] = useState('')
 const [notice, setNotice] = useState('')
 const [busy, setBusy] = useState(false)
 const [images, setImages] = useState<NonNullable<StorefrontBranding['logo']>[]>([])
 const lock = useRef(false)
 useEffect(() => {
  setDraft(value); setReviewed(false)
  let current=true
  void request<{images:NonNullable<StorefrontBranding['logo']>[]} >('/api/barrow/storefront/settings').then(result=>{if(current)setImages(result.images)}).catch(cause=>{if(current)setError(errorMessage(cause))})
  return ()=>{current=false}
 }, [value.revision])
 const edit = (next: Partial<StorefrontBranding>) => { setDraft({...draft,...next}); setReviewed(false); setNotice('') }
 async function save() {
  if (lock.current) return
  lock.current = true; setBusy(true); setError(''); setNotice('')
  try {
   const response = await request<{result:StorefrontBranding}>('/api/barrow/commands', {type:'storefront.save', payload:{...draft, logoSha256:draft.logo?.sha256 ?? '', reviewed, reason}})
   setDraft(response.result); setReviewed(false); setReason('')
   setNotice('Storefront identity published. Signed-in pages use it when refreshed.')
   try { await onSaved() } catch { setError('The identity was published. Refresh records to load the latest storefront.') }
  } catch (cause) { setError(errorMessage(cause)) }
  finally { lock.current = false; setBusy(false) }
 }
 return <section className="br-card br-stack" aria-label="Storefront identity">
  <div><h2>Storefront identity</h2><p>Publish the merchant name, accessible colors and support contact for signed-in shopping.</p></div>
  <p>Legal seller details and existing orders keep their recorded identities and prices.</p>
  {error && <Notice error>{error}</Notice>}{notice && <Notice>{notice}</Notice>}
  <form className="br-stack" onSubmit={event=>{event.preventDefault();void save()}}>
   <fieldset className="br-stack" disabled={busy}>
    <label>Merchant display name<input aria-label="Merchant display name" required maxLength={80} value={draft.displayName} onChange={event=>edit({displayName:event.target.value})}/></label>
    <label>Support contact URL<input aria-label="Support contact URL" type="url" required maxLength={400} placeholder="https://support.your-store.test" value={draft.supportUrl} onChange={event=>edit({supportUrl:event.target.value})}/><span>Use the complete HTTPS address of your customer support page.</span></label>
    <label>Storefront logo<select aria-label="Storefront logo" value={draft.logo?.sha256 ?? ''} onChange={event=>edit({logo:images.find(image=>image.sha256===event.target.value)})}><option value="">Barrow mark</option>{images.map(image=><option key={image.sha256} value={image.sha256}>{image.width} × {image.height} · {image.sha256.slice(0,12)}</option>)}</select><span>Choose an already accepted JPEG in this installation. Publishing makes this exact image visible on signed-in pages.</span></label>
    <div className="br-branding-colors">
     <label>Accent color<select aria-label="Accent color" value={draft.accent} onChange={event=>edit({accent:event.target.value as StorefrontBranding['accent']})}>{Object.entries(storefrontAccents).map(([id,choice])=><option key={id} value={id}>{choice.name}</option>)}</select></label>
     <label>Page color<select aria-label="Page color" value={draft.canvas} onChange={event=>edit({canvas:event.target.value as StorefrontBranding['canvas']})}>{Object.entries(storefrontCanvases).map(([id,choice])=><option key={id} value={id}>{choice.name}</option>)}</select></label>
    </div>
    <label>Storefront prices<select aria-label="Storefront prices" value={draft.priceDisplay} onChange={event=>edit({priceDisplay:event.target.value as StorefrontBranding['priceDisplay']})}><option value="wholesale">Wholesale only</option><option value="retail">Retail only</option><option value="both">Wholesale and MSRP with margin</option></select><span>Each size uses its account price book. MSRP is informational; cart amounts use agreed wholesale prices.</span></label>
    <section className="br-stack" aria-label="Storefront navigation"><h3>Storefront navigation</h3><p>Reorder and name the existing buyer pages. Each person keeps their current permissions.</p>{draft.navigation.map((entry,index)=><div className="br-branding-navigation" key={entry.page}><label>{entry.page==='catalog'?'Catalog':entry.page==='sheets'?'Line sheets':'Orders'} label<input aria-label={`${entry.page} navigation label`} required maxLength={30} value={entry.label} onChange={event=>edit({navigation:draft.navigation.map((item,at)=>at===index?{...item,label:event.target.value}:item)})}/></label><button type="button" className="br-secondary" disabled={!index} onClick={()=>{const next=[...draft.navigation];[next[index-1],next[index]]=[next[index],next[index-1]];edit({navigation:next})}}>Move {entry.page} earlier</button></div>)}</section>
    <section className="br-stack" aria-label="Storefront collections"><h3>Storefront collections</h3><p>Use exact SKU membership. Buyers see only collections and products from their currently approved assortment. Filtering keeps the cart.</p>{draft.collections.map((collection,index)=><fieldset className="br-stack br-branding-collection" key={collection.id}><legend>Collection {index+1}</legend><label>Name<input aria-label={`Collection ${index+1} name`} required maxLength={80} value={collection.name} onChange={event=>edit({collections:draft.collections.map((item,at)=>at===index?{...item,name:event.target.value}:item)})}/></label><label>SKUs, one per line<textarea aria-label={`Collection ${index+1} SKUs`} required rows={3} value={collection.skus.join('\n')} onChange={event=>edit({collections:draft.collections.map((item,at)=>at===index?{...item,skus:event.target.value.split('\n')}:item)})}/></label><button type="button" className="br-secondary" onClick={()=>edit({collections:draft.collections.filter(item=>item.id!==collection.id)})}>Remove collection {index+1}</button></fieldset>)}<button type="button" className="br-secondary" disabled={draft.collections.length>=12} onClick={()=>{let id=1;while(draft.collections.some(collection=>collection.id===`collection-${id}`))id++;edit({collections:[...draft.collections,{id:`collection-${id}`,name:'',skus:[]}]})}}>Add collection</button></section>
    <label>Publication reason<textarea aria-label="Publication reason" required maxLength={500} value={reason} onChange={event=>{setReason(event.target.value);setReviewed(false)}}/></label>
    <label className="br-branding-review"><input type="checkbox" required checked={reviewed} onChange={event=>setReviewed(event.target.checked)}/>I reviewed this merchant identity, colors and support contact.</label>
   </fieldset>
   <div className="br-actions"><button disabled={busy || !reviewed}>{busy?'Publishing…':'Publish storefront identity'}</button><button type="button" className="br-secondary" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await onSaved();setNotice('Current storefront settings loaded.')}catch(cause){setError(errorMessage(cause))}finally{setBusy(false)}}}>Reload storefront settings</button></div>
  </form>
 </section>
}
