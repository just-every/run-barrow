import { useState } from 'react'
import type { SftpConfig } from '../feeds/types'
import type { FeedConfiguration, FeedSnapshot } from '../feeds/layout'
import { ConfirmationLayoutTools } from './confirmation-layouts'
import { JsonDetail } from './primitives'

export type DeltaFeedConfig = FeedConfiguration
export type DeltaFeedView = Partial<FeedSnapshot>
const blankConnection: SftpConfig = {host:'',port:22,username:'',secretId:'',hostKey:'',importDirectory:'',exportDirectory:'',ackDirectory:''}
const nativeMapping: DeltaFeedConfig['mapping'] = {products:{sku:'sku',name:'name',unit:'unit',casePack:'casePack',increment:'increment'},customers:{accountId:'accountId',name:'name'},ats:{sku:'sku',warehouse:'warehouse',available:'available',observedAt:'observedAt'}}

export function DeltaFeedForm({ feed, scope, busy, signedoff, stale, onEdit, onRehearse, onRun }: {
  feed:DeltaFeedView;scope:string[];busy:boolean;signedoff:boolean;stale:boolean
  onEdit:()=>void;onRehearse:(config:DeltaFeedConfig)=>void;onRun:()=>void
}) {
  const [connection,setConnection] = useState<SftpConfig>(feed.config?.connection ?? blankConnection)
  const [mapping,setMapping] = useState<DeltaFeedConfig['mapping']>(feed.config?.mapping ?? nativeMapping)
  const [accountText,setAccountText] = useState((feed.config?.accountIds ?? scope).join(', '))
  const [layoutId,setLayoutId] = useState(feed.config?.layout?.id ?? feed.config?.layoutId ?? '')
  const [consent,setConsent] = useState(false)
  const accountIds=accountText.split(',').map(value=>value.trim())
  function edit() {setConsent(false);onEdit()}
  const requiredColumns=[...Object.values(mapping.products),mapping.customers.accountId,...Object.values(mapping.ats)]
  const valid=Object.entries(connection).every(([key,value])=>key==='port'?Number.isInteger(value)&&Number(value)>0&&Number(value)<=65535:typeof value==='string'&&!!value.trim())
    && /^SHA256:[A-Za-z0-9+/]{43}=?$/.test(connection.hostKey) && accountIds.every(id=>scope.includes(id))
    && new Set(accountIds).size===accountIds.length && requiredColumns.every(value=>!!value.trim()) && !!layoutId
  return <div className="br-card br-stack" style={{minWidth:0}}>
    <h3>SFTP feed rehearsal and delivery</h3>
    <p>Use the merchant’s pinned SFTP server and a server-held credential reference. Enter no passwords or private keys here. Feed ATS rows are reconciliation evidence; they do not replace Pier’s live inventory authority. Order delivery follows Barrow orders already accepted by Pier.</p>
    <fieldset className="br-stack" disabled={busy || signedoff}><legend>Merchant SFTP connection</legend>
      <div className="br-form-grid">{([
        ['host','SFTP host'],['username','SFTP username'],['secretId','Server credential reference'],['hostKey','Pinned host key (SHA256 fingerprint)'],
        ['importDirectory','Import directory'],['exportDirectory','Order export directory'],['ackDirectory','Acknowledgment directory'],
      ] as const).map(([key,label])=><label key={key}>{label}<input value={connection[key]} maxLength={key.includes('Directory')?1024:256} autoComplete="off" onChange={event=>{edit();setConnection(current=>({...current,[key]:event.target.value}))}}/></label>)}</div>
      <label>SFTP port<input type="number" min={1} max={65535} value={connection.port} onChange={event=>{edit();setConnection(current=>({...current,port:Number(event.target.value)}))}}/></label>
      <label>Feed account IDs, separated by commas<input value={accountText} onChange={event=>{edit();setAccountText(event.target.value)}}/><small>Use only account IDs in this cutover’s scope: {scope.join(', ')}.</small></label>
    </fieldset>
    <fieldset className="br-stack" disabled={busy || signedoff}><legend>Saved CSV column mappings</legend>
      <p>Enter the exact source CSV header for each field. These mappings are captured with the rehearsal.</p>
      {(['products','customers','ats'] as const).map(kind=><div className="br-stack" key={kind}><h4>{kind === 'ats' ? 'ATS evidence' : kind === 'products' ? 'Products' : 'Customers'}</h4><div className="br-form-grid">
        {Object.keys(nativeMapping[kind]).map(field=><label key={field}>{kind}: {field}{kind==='customers'&&field==='name'?' (optional)':''}<input value={(mapping[kind] as Record<string,string>)[field]??''} maxLength={100} onChange={event=>{edit();setMapping(current=>({...current,[kind]:{...current[kind],[field]:event.target.value}}))}}/></label>)}
      </div></div>)}
    </fieldset>
    <fieldset disabled={busy || signedoff} onChange={edit} className="br-stack"><legend>Named native CSV export layout</legend>
      <ConfirmationLayoutTools selected={layoutId} onSelect={id=>{edit();setLayoutId(id)}}/>
      <p>Choose an explicit named layout. Rehearse again after editing its columns. This feed uses Barrow native CSV, not a platform-specific incumbent format.</p>
    </fieldset>
    {!signedoff && <label><input type="checkbox" checked={consent} disabled={busy} style={{width:20,minHeight:20,marginRight:8}} onChange={event=>setConsent(event.target.checked)}/>I authorize SFTP reads from this server and these directories for this scoped rehearsal. Rehearsal sends no order file.</label>}
    {stale && <p role="status">Feed settings changed. Rehearse them before signing off the cutoff or running delivery.</p>}
    <div className="br-actions"><button type="button" disabled={busy || signedoff || !valid || !consent} onClick={()=>onRehearse({connection,accountIds,mapping:{...mapping,customers:{accountId:mapping.customers.accountId,...(mapping.customers.name?{name:mapping.customers.name}:{})}},layoutId})}>Rehearse feed and save configuration</button>
      <button type="button" className="br-secondary" disabled={busy || !signedoff || stale || !consent} onClick={onRun}>Run post-cutoff export and acknowledgments</button></div>
    {signedoff && <label><input type="checkbox" checked={consent} disabled={busy} style={{width:20,minHeight:20,marginRight:8}} onChange={event=>setConsent(event.target.checked)}/>I authorize the signed-off feed’s order export and acknowledgment reads using the retained configuration.</label>}
    {feed.rehearsal && <>
      <p>Accepted rehearsal rows: {feed.rehearsal.products} products, {feed.rehearsal.ats} ATS evidence, {feed.rehearsal.customers} customers. Unresolved errors: {feed.rehearsal.unresolvedErrors}.</p>
      <div className="br-table-wrap"><table style={{minWidth:1050}}><caption>Received SFTP files and owned errors</caption><thead><tr><th scope="col">File</th><th scope="col">Kind</th><th scope="col">Accepted rows</th><th scope="col">Owner</th><th scope="col">Errors</th></tr></thead><tbody>{feed.rehearsal.files.map(file=><tr key={file.id}><th scope="row">{file.name}<small style={{overflowWrap:'anywhere'}}>SHA-256: {file.sha256}</small></th><td>{file.kind}</td><td>{file.rowsAccepted}</td><td>{file.owner}</td><td>{file.errors.length ? <ul>{file.errors.map((error,index)=><li key={index}>Row {error.row}: {error.code} — {error.message} · Owner: {error.owner}</li>)}</ul> : 'None'}</td></tr>)}</tbody></table></div>
      <JsonDetail value={{products:feed.rehearsal.productRows,ats:feed.rehearsal.atsRows,customers:feed.rehearsal.customerRows}} label="Read reconciled feed rows"/>
    </>}
    <JsonDetail value={feed.deliveries?.map(({bytesBase64,...delivery})=>delivery)} label="Order delivery and acknowledgment journal"/>
    <JsonDetail value={feed.config} label="Retained feed configuration and named layout"/>
  </div>
}
