import type { qboComparisons } from '../accounting/reconciliation'
type Comparison=Awaited<ReturnType<typeof qboComparisons>>[number]
const amount=(value:number,currency:string)=>currency+' '+(value/100).toFixed(2)
export function QboComparisons({rows}:{rows:Comparison[]}) {
 if(!rows.length)return null
 return <section className="br-stack" aria-label="QuickBooks dated comparisons"><h3>QuickBooks dated comparisons</h3><p>Observed ledger invoices remain separate from native balances. Differences require review; they never apply a payment or change an issued document.</p>{rows.map(row=><article className="br-stack" key={row.accountId+':'+row.currency}><p><strong>{row.accountId} · {row.currency} · {row.status}</strong><br/>As of {row.asOf} · observed {row.observedAt}<br/>Company {row.realm} · correlation {row.runId}</p><p>Native {amount(row.nativeCents,row.currency)} · QuickBooks {amount(row.ledgerCents,row.currency)} · difference {amount(row.differenceCents,row.currency)}</p><ul>{row.sources.map(source=><li key={source.id}><a href={source.path}>QBO {source.sourceId}</a> · revision {source.sourceToken} · {source.orderId||'unlinked native invoice'} · {source.status} · {amount(source.ledgerCents,source.currency)}</li>)}</ul></article>)}</section>
}
