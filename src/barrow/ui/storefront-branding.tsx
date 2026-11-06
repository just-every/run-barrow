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
 const lock = useRef(false)
 useEffect(() => { setDraft(value); setReviewed(false) }, [value.revision])
 const edit = (next: Partial<StorefrontBranding>) => { setDraft({...draft,...next}); setReviewed(false); setNotice('') }
 async function save() {
  if (lock.current) return
  lock.current = true; setBusy(true); setError(''); setNotice('')
  try {
   const response = await request<{result:StorefrontBranding}>('/api/barrow/commands', {type:'storefront.save', payload:{...draft, reviewed, reason}})
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
    <div className="br-branding-colors">
     <label>Accent color<select aria-label="Accent color" value={draft.accent} onChange={event=>edit({accent:event.target.value as StorefrontBranding['accent']})}>{Object.entries(storefrontAccents).map(([id,choice])=><option key={id} value={id}>{choice.name}</option>)}</select></label>
     <label>Page color<select aria-label="Page color" value={draft.canvas} onChange={event=>edit({canvas:event.target.value as StorefrontBranding['canvas']})}>{Object.entries(storefrontCanvases).map(([id,choice])=><option key={id} value={id}>{choice.name}</option>)}</select></label>
    </div>
    <label>Publication reason<textarea aria-label="Publication reason" required maxLength={500} value={reason} onChange={event=>{setReason(event.target.value);setReviewed(false)}}/></label>
    <label className="br-branding-review"><input type="checkbox" required checked={reviewed} onChange={event=>setReviewed(event.target.checked)}/>I reviewed this merchant identity, colors and support contact.</label>
   </fieldset>
   <div className="br-actions"><button disabled={busy || !reviewed}>{busy?'Publishing…':'Publish storefront identity'}</button><button type="button" className="br-secondary" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await onSaved();setNotice('Current storefront settings loaded.')}catch(cause){setError(errorMessage(cause))}finally{setBusy(false)}}}>Reload storefront settings</button></div>
  </form>
 </section>
}
