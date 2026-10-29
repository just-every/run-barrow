import { PrebookOrder } from './prebooks'
import { useEffect, useState, type ComponentProps } from 'react'
import { DraftWorkspace } from './draft-workspace'
import { BrandProfilesSettings } from './buying-profiles'
import { AccountPicker, Notice } from './primitives'
import { request, errorMessage } from './api'
import type { Account, Order } from './types'
import type { readBuyingProfiles } from '../buying-profiles'
type Directory=Awaited<ReturnType<typeof readBuyingProfiles>>
export function ProfileConfiguration({accounts,version}:{accounts:Account[];version:unknown}) {
 const [accountId,setAccountId]=useState('')
 return <section className="br-card br-stack" aria-label="Buying profile account"><h2>Brand buying profiles</h2><AccountPicker accounts={accounts} value={accountId} onChange={setAccountId}/>{accountId&&<BrandProfilesSettings accountId={accountId} version={version}/>}</section>
}
export function ProfileWorkspace(props:ComponentProps<typeof DraftWorkspace>) {
 const [directory,setDirectory]=useState<Directory|null>(null),[profileId,setProfileId]=useState(''),[error,setError]=useState('')
 useEffect(()=>{let live=true;setError('');void request<Directory>(`/api/barrow/buying-profiles?${new URLSearchParams({accountId:props.account.id})}`).then(value=>{if(live)setDirectory(value)}).catch(cause=>{if(live)setError(errorMessage(cause))});return()=>{live=false}},[props.account.id,props.version])
 useEffect(()=>{if(!props.draftId)return;let live=true;void request<Order>(`/api/barrow/orders/${encodeURIComponent(props.draftId)}`).then(order=>{if(live)setProfileId(order.buyingProfile?.id??'')}).catch(cause=>{if(live)setError(errorMessage(cause))});return()=>{live=false}},[props.draftId])
 const profile=directory?.profiles.find(value=>value.id===profileId)
 const selected:Account=profile?{...props.account,value:{...props.account.value,prices:profile.value.prices,minimumCents:profile.value.minimumCents,termsDays:profile.value.termsDays,currency:profile.brand.value.currency},buyingProfile:{id:profile.id,name:profile.value.name,revision:profile.revision,brandId:profile.brand.id,brandRevision:profile.brand.revision,brandName:profile.brand.value.name,seller:profile.brand.value.seller,currency:profile.brand.value.currency,termsSeries:profile.brand.value.termsSeries,requireAcceptance:profile.brand.value.requireAcceptance}}:props.account
 return <div className="br-stack">{error&&<Notice error>{error}</Notice>}{directory&&<><label>Buying profile<select value={profileId} disabled={props.busy} onChange={event=>{props.onDraft('');setProfileId(event.target.value)}}><option value="">Account price book</option>{profileId&&!profile&&<option value={profileId}>Profile no longer approved</option>}{directory.profiles.map(value=><option key={value.id} value={value.id}>{value.brand.value.name} · {value.value.name} · {value.brand.value.currency}</option>)}</select></label><p>Switching profiles starts a separate cart. Orders remain owned by {props.account.value.name}.</p>{profileId&&!profile?<Notice error>This buying profile is no longer approved. Choose a current profile.</Notice>:<><DraftWorkspace {...props} key={`${props.account.id}:${profileId}`} account={selected}/>{props.canPurchase&&<PrebookOrder account={selected} version={props.version} run={props.run} busy={props.busy} onPrepared={props.onPrepared}/>}</>}</>}</div>
}
