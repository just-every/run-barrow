import {DeltaRollback,type RollbackJournal} from './delta-rollback'
import { useEffect, useRef, useState } from 'react'
import type { CutoverInput, CutoverRecord } from '../imports/cutover-source'
import { request, errorMessage } from './api'
import { JsonDetail, Notice } from './primitives'
import { DeltaFeedForm, type DeltaFeedView } from './delta-feed-form'
import { DeltaSourceForm, readDeltaSourceFile, type DeltaSourceFields, type DeltaSourceFileKind } from './delta-source-form'
import { DeltaComparison, type DeltaComparisonReport, type DeltaSourceChange } from './delta-comparison'

type DeltaSession = {
  id:string;state:string;revision:string;fingerprint:string;sourceSystem:string;scope:string[];cutoffAt:string|null;authorities:Record<string,string>
  source:{records?:CutoverRecord[];artifacts?:{name:string;base64:string;sha256:string}[];input?:{runId:string}}
  report:{comparison?:DeltaComparisonReport;changes?:DeltaSourceChange[];rollback?:RollbackJournal}
  feed:DeltaFeedView;reason:string;signedoffBy:string|null;signedoffAt:string|null;excludedOrderIds:string[]
}
const root = '/api/barrow/cutover/deltas'
const checkStyle = {width:20,minHeight:20,marginRight:8,verticalAlign:'middle'}
const sourceKey = (record:CutoverRecord) => `${record.kind}:${record.id}`
const decode = (value:string) => new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(value),character=>character.charCodeAt(0)))

export function DeltaCutoverReview() {
  const [sessions,setSessions]=useState<DeltaSession[]>([]),[session,setSession]=useState<DeltaSession|null>(null)
  const [workbook,setWorkbook]=useState<CutoverInput['workbook']|null>(null),[ledger,setLedger]=useState<CutoverInput['ledger']|null>(null)
  const [scopeText,setScopeText]=useState(''),[runId,setRunId]=useState(''),[sourceSystem,setSourceSystem]=useState(''),[reason,setReason]=useState('')
  const [mappings,setMappings]=useState<Record<string,string>>({}),[authorities,setAuthorities]=useState<Record<string,string>>({})
  const [consent,setConsent]=useState(false),[freeze,setFreeze]=useState(false),[reviewed,setReviewed]=useState(false),[resumeNative,setResumeNative]=useState(false)
  const [dirty,setDirty]=useState(false),[filesChanged,setFilesChanged]=useState(false),[feedDirty,setFeedDirty]=useState(false),[cutoffAt,setCutoffAt]=useState('')
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[loaded,setLoaded]=useState(false)
  const lock=useRef(false)
  async function list() {const result=await request<{sessions:DeltaSession[]}>(root);setSessions(result.sessions);setLoaded(true)}
  useEffect(()=>{void list().catch(cause=>setError(errorMessage(cause)))},[])
  function adopt(next:DeltaSession) {
    setSession(next);setScopeText(next.scope.join(', '));setRunId(next.source.input?.runId??'');setSourceSystem(next.sourceSystem)
    const [book,csv]=next.source.artifacts??[]
    setWorkbook(book?{name:book.name,base64:book.base64}:null);setLedger(csv?{name:csv.name,csv:decode(csv.base64)}:null)
    setMappings(next.report.comparison?.mappings??{});setAuthorities(Object.fromEntries((next.source.records??[]).filter(row=>row.kind==='orders'||row.kind==='receivables').map(row=>[sourceKey(row),next.authorities[sourceKey(row)]??next.sourceSystem])))
    setCutoffAt(next.cutoffAt??'');setReason('');setDirty(false);setFilesChanged(false);setFeedDirty(false);setReviewed(false);setConsent(false);setResumeNative(false)
  }
  async function act(action:()=>Promise<void>) {if(lock.current)return;lock.current=true;setBusy(true);setError('');setNotice('');try{await action()}catch(cause){setError(errorMessage(cause));setReviewed(false)}finally{lock.current=false;setBusy(false)}}
  function changed() {setDirty(true);setReviewed(false);setConsent(false);setNotice('')}
  async function open(id:string) {adopt(await request<DeltaSession>(`${root}/${encodeURIComponent(id)}`))}
  async function mutate(action:string,body:unknown) {
    if(!session)return
    await request(`${root}/${encodeURIComponent(session.id)}/${action}`,body);await open(session.id);await list();setNotice('Cutover journal updated. Review the current revision before the next action.')
  }
  const scope=scopeText.split(',').map(value=>value.trim()),validScope=scope.length<=200&&scope.every(id=>/^[-\w.:]{1,100}$/.test(id))&&new Set(scope).size===scope.length
  const validSource=!!workbook&&!!ledger&&validScope&&/^[A-Za-z0-9][\w.:-]{0,99}$/.test(runId)&&consent&&!!reason.trim()
  const rehearsal=session?.state==='rehearsal',signedoff=session?.state==='signedoff',comparison=session?.report.comparison
  const feedReady=!!session?.feed.rehearsal&&session.feed.rehearsal.products>0&&session.feed.rehearsal.ats>0&&session.feed.rehearsal.unresolvedErrors===0&&!!session.feed.permissions?.removed
  function input():CutoverInput {if(!workbook||!ledger)throw new Error('Choose both source exports.');return{workbook,ledger,scope,runId,consent,mappings}}
  async function create() {const next=await request<DeltaSession>(root,{...input(),sourceSystem:sourceSystem.trim(),reason:reason.trim(),freezeOrderEntry:true});adopt(next);await list();setNotice('Rehearsal created. New order entry is paused for these accounts until the signed cutoff or explicit native-only rollback.')}
  async function upload(file:File,kind:DeltaSourceFileKind) {
    changed();setFilesChanged(true);setMappings({})
    if(kind==='workbook')setWorkbook(null);else setLedger(null)
    const content=await readDeltaSourceFile(file,kind)
    if(kind==='workbook')setWorkbook({name:file.name,base64:content})
    else setLedger({name:file.name,csv:content})
  }
  function updateSource(patch:Partial<DeltaSourceFields>) {
    if(patch.scopeText!==undefined||patch.runId!==undefined||patch.sourceSystem!==undefined)changed()
    if(patch.scopeText!==undefined){setScopeText(patch.scopeText);setMappings({})}
    if(patch.runId!==undefined)setRunId(patch.runId)
    if(patch.sourceSystem!==undefined)setSourceSystem(patch.sourceSystem)
    if(patch.consent!==undefined){setConsent(patch.consent);setReviewed(false)}
    if(patch.freeze!==undefined)setFreeze(patch.freeze)
    if(patch.reason!==undefined){setReason(patch.reason);setReviewed(false);setResumeNative(false)}
  }
  async function compare() {
    if(!session)return
    setDirty(true);setReviewed(false)
    await mutate('compare',{...input(),revision:session.revision,reason:reason.trim()})
  }
  function correction(row:CutoverRecord,value:string) {
    changed();setMappings(current=>{const next={...current,[sourceKey(row)]:value};if(row.kind==='accounts')for(const proposal of comparison?.proposals??[])if(proposal.source.accountId===row.id)next[sourceKey(proposal.source)]='';return next})
  }
  return <section className="br-stack" aria-label="Delta cutover and feed rehearsal" style={{minWidth:0}}>
    <div><h2>Delta cutover and feed rehearsal</h2><p>Retain a baseline, compare a full source delta, rehearse the merchant feed and sign off the order-entry cutoff. Historical sources initiate no reservations, invoices, payments or outreach.</p></div>
    {error&&<Notice error>{error}</Notice>}{notice&&<Notice>{notice}</Notice>}
    {session?.state==='erased'&&<Notice>Source custody for this session was erased. It cannot be reopened or reactivated.</Notice>}
    {session?.state==='inactive'&&<Notice>This restored session is inactive. Order entry remains paused until the owner explicitly rolls back to native Pier-only entry.</Notice>}
    <div className="br-card br-stack"><div className="br-heading-row"><h3>Cutover sessions</h3><button type="button" className="br-secondary" disabled={busy} onClick={()=>void act(list)}>Refresh sessions</button></div>
      {!loaded?<p>Sessions have not loaded.</p>:sessions.length===0?<p>No delta cutover sessions recorded.</p>:<div className="br-table-wrap"><table style={{minWidth:760}}><caption>Scoped cutoff and rehearsal journals</caption><thead><tr><th scope="col">Session</th><th scope="col">State</th><th scope="col">Source authority</th><th scope="col">Cutoff</th><th scope="col">Review</th></tr></thead><tbody>{sessions.map(row=><tr key={row.id}><th scope="row">{row.id}</th><td>{row.state}</td><td>{row.sourceSystem}</td><td>{row.cutoffAt??'Not signed off'}</td><td><button type="button" className="br-secondary" disabled={busy} onClick={()=>void act(()=>open(row.id))}>Open session</button></td></tr>)}</tbody></table></div>}
      {session&&<div className="br-actions">
        <button type="button" className="br-secondary" disabled={busy} onClick={()=>{setSession(null);setWorkbook(null);setLedger(null);setScopeText('');setRunId('');setSourceSystem('');setMappings({});setReason('');setFreeze(false);setConsent(false);setDirty(false);setFilesChanged(false);setFeedDirty(false);setReviewed(false)}}>Start another baseline</button>
        <button type="button" className="br-secondary" disabled={busy} onClick={()=>void act(()=>open(session.id))}>Reload selected session</button>
      </div>}
    </div>
    <DeltaSourceForm
      session={session} value={{scopeText,runId,sourceSystem,reason,consent,freeze}}
      workbook={workbook} ledger={ledger} busy={busy} dirty={dirty}
      canCreate={validSource&&!!sourceSystem.trim()&&freeze} canCompare={validSource}
      onChange={updateSource} onUpload={(file,kind)=>void act(()=>upload(file,kind))}
      onCreate={()=>void act(create)} onCompare={()=>void act(compare)}
    />
    {session&&comparison&&<>
      <DeltaComparison
        comparison={comparison} changes={session.report.changes??[]} source={session.source}
        mappings={mappings} busy={busy} rehearsal={!!rehearsal} dirty={dirty}
        filesChanged={filesChanged} onCorrection={correction}
      />
      <DeltaFeedForm key={`${session.id}:${session.revision}`} feed={session.feed} scope={session.scope} busy={busy||!reason.trim()||dirty||!['rehearsal','signedoff'].includes(session.state)} signedoff={!!signedoff} stale={feedDirty||dirty} onEdit={()=>{setFeedDirty(true);setReviewed(false)}} onRehearse={config=>void act(async()=>{setFeedDirty(true);setReviewed(false);await mutate('feed/rehearse',{revision:session.revision,config,consent:true,testPermissions:true,reason:reason.trim()})})} onRun={()=>void act(()=>mutate('feed/run',{revision:session.revision,consent:true,reason:reason.trim()}))}/>
      <div className="br-card br-stack"><h3>Cutoff and source authority sign-off</h3><p>Each retained source order and receivable stays with its declared responsible system. Existing native orders are excluded from bridge exports. Only eligible new orders after the signed cutoff can be delivered.</p>
        <fieldset disabled={busy||!rehearsal} className="br-stack"><legend>Responsible systems</legend>{Object.entries(authorities).map(([key,system])=><label key={key}>Responsible system for {key}<input value={system} maxLength={120} onChange={event=>{setAuthorities(current=>({...current,[key]:event.target.value}));setReviewed(false)}}/></label>)}</fieldset>
        <label>Exact cutoff in UTC<input value={cutoffAt} disabled={busy||!rehearsal} onChange={event=>{setCutoffAt(event.target.value);setReviewed(false)}} placeholder="YYYY-MM-DDTHH:mm:ss.sssZ"/><small>After this rehearsal was created, and no more than five minutes ahead. Use “Set cutoff to now” for the current UTC instant.</small></label>
        <div className="br-actions"><button type="button" className="br-secondary" disabled={busy||!rehearsal} onClick={()=>{setCutoffAt(new Date().toISOString());setReviewed(false)}}>Set cutoff to now</button></div>
        <label>Current source and feed fingerprint<input value={session.fingerprint} readOnly className="br-mono"/></label>
        {!feedReady&&<p>Sign-off needs product and ATS rehearsal rows with no unresolved feed errors, plus tested connection permissions.</p>}
        <label><input type="checkbox" style={checkStyle} checked={reviewed} disabled={busy||!rehearsal||dirty||feedDirty||!comparison.canApply||!feedReady} onChange={event=>setReviewed(event.target.checked)}/>I approve this exact source and feed fingerprint, all mappings, balances, differences and missing releases, the cutoff and every record’s declared responsible system. I approve applying the rehearsed case packs and increments to scoped matching native price-book entries.</label>
        <div className="br-actions"><button type="button" disabled={busy||!rehearsal||dirty||feedDirty||!reviewed||!reason.trim()||!cutoffAt||Object.values(authorities).some(value=>!value.trim())} onClick={()=>void act(()=>mutate('signoff',{revision:session.revision,fingerprint:session.fingerprint,cutoffAt,authorities,consent:true,reason:reason.trim()}))}>Sign off cutoff and source authorities</button></div>
        {signedoff&&<p>Signed off by {session.signedoffBy} at {session.signedoffAt}. New order entry opens at {session.cutoffAt}. Feed delivery still requires an explicit authorized run.</p>}
        <JsonDetail value={{authorities:session.authorities,excludedOrderIds:session.excludedOrderIds,reason:session.reason}} label="Read signed authority and exclusion journal"/>
      </div>
      <DeltaRollback state={session.state} journal={session.report.rollback} busy={busy} consent={resumeNative} onConsent={setResumeNative} reason={reason} onRollback={()=>void act(()=>mutate('rollback',{revision:session.revision,reason:reason.trim(),resumeNativeOnly:true,consent:true}))}/>
    </>}
  </section>
}
