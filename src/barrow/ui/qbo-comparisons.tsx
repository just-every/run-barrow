import type { ledgerComparisons } from '../accounting/ledger-comparisons'
type Comparison=Awaited<ReturnType<typeof ledgerComparisons>>[number]
const amount=(value:number,currency:string)=>currency+' '+(value/100).toFixed(2)
export function QboComparisons({rows}:{rows:Comparison[]}) {
 const groups=[['qbo','QuickBooks','QBO'],['xero','Xero','Xero']] as const
 if(!rows.length)return null
 return <>{groups.map(([provider,label,short])=>{const selected=rows.filter(row=>row.provider===provider);return selected.length?<LedgerGroup key={provider} rows={selected} label={label} short={short}/>:null})}</>
}
function LedgerGroup({rows,label,short}:{rows:Comparison[];label:string;short:string}){
 return <section className="br-stack" aria-label={label+' dated comparisons'} style={{overflowWrap:'anywhere',minWidth:0}}><h3>{label} dated comparisons</h3><p>Observed ledger invoices remain separate from native balances. Differences require review; they never apply a payment or change an issued document.</p>{rows.map(row=><article className="br-stack" key={row.accountId+':'+row.currency}><p><strong>{row.accountId} · {row.currency} · {row.status}</strong><br/>As of {row.asOf} · observed {row.observedAt}<br/>Tenant {row.tenant} · correlation {row.runId}</p><p>Native {amount(row.nativeCents,row.currency)} · {label} {amount(row.ledgerCents,row.currency)} · difference {amount(row.differenceCents,row.currency)}</p><ul>{row.sources.map(source=><li key={source.id}><a href={source.path}>{short} {source.sourceId}</a> · revision {source.sourceToken} · {source.orderId||'unlinked native invoice'} · {source.status} · {amount(source.ledgerCents,source.currency)}</li>)}</ul></article>)}</section>
}
