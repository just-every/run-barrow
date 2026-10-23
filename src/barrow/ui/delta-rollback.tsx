import {JsonDetail} from './primitives'

type Disposition={kind:string;id:string;disposition:string;reason:string}
export type RollbackJournal={at:string;by:string;exportsPaused:boolean;resumeNativeOnly:boolean;dispositions:Disposition[]}
export function DeltaRollback({state,journal,busy,consent,onConsent,onRollback,reason}:{state:string;journal?:RollbackJournal;busy:boolean;consent:boolean;onConsent:(value:boolean)=>void;onRollback:()=>void;reason:string}) {
 const native=journal?.dispositions.filter(row=>row.kind.startsWith('native-'))??[]
 return <div className="br-card br-stack">
  <h3>Rollback and retained dispositions</h3>
  <p>Rollback stops bridge exports and resumes ordinary native order entry through Pier. It retains source evidence and external responsibility. Unchanged case packs and increments can be reversed when no later dependency exists; later edits, orders, reservations and shipments remain preserved.</p>
  {['rehearsal','signedoff','inactive'].includes(state)&&<>
   <label><input type="checkbox" checked={consent} disabled={busy} style={{width:20,minHeight:20,marginRight:8,verticalAlign:'middle'}} onChange={event=>onConsent(event.target.checked)}/>I explicitly resume native Pier-only order entry for this scope and stop the cutover bridge’s exports while retaining source history and external responsibility.</label>
   <div className="br-actions"><button type="button" className="br-danger" disabled={busy||!consent||!reason.trim()} onClick={onRollback}>Roll back bridge and resume native order entry</button></div>
  </>}
  {journal&&<>
   <p>Bridge exports stopped. Native Pier-only entry resumed. Recorded by {journal.by} at {journal.at}.</p>
   <dl className="br-stack" aria-label="Native rollback dispositions">{native.map((row,index)=><div key={`${row.kind}:${row.id}:${index}`}>
    <dt><strong>{row.id}</strong> · {row.kind} · <span className="br-badge">{row.disposition}</span></dt><dd style={{marginInlineStart:0}}>{row.reason}</dd>
   </div>)}</dl>
   <p>Retained source records: {journal.dispositions.filter(row=>!row.kind.startsWith('native-')).length}. They initiated no native or provider effect.</p>
  </>}
  <JsonDetail value={journal} label="Read rollback dispositions and preserved dependencies"/>
 </div>
}
