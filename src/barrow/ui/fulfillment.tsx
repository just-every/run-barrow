import { useEffect, useState } from 'react'
import { request, errorMessage } from './api'
import { AccountPicker, Notice } from './primitives'
import { orderNumber, when, type Account } from './types'
import type { fulfillmentReport } from '../fulfillment'
type Report = Awaited<ReturnType<typeof fulfillmentReport>>

export function FulfillmentReport({ accounts }: { accounts: Account[] }) {
 const [report, setReport] = useState<Report | null>(null), [error, setError] = useState('')
 const [zone, setZone] = useState(''), [saving, setSaving] = useState(false)
 const [accountId, setAccount] = useState(''), [warehouse, setWarehouse] = useState(''), [late, setLate] = useState(false), [refresh, setRefresh] = useState(0)
 useEffect(() => {
  let current = true
  setReport(null); setError('')
  void request<Report>(`/api/barrow/reports/fulfillment?${new URLSearchParams({ accountId })}`).then(value => { if (current) setReport(value) }).catch(cause => { if (current) setError(errorMessage(cause)) })
  return () => { current = false }
 }, [accountId, refresh])
 const warehouses = [...new Set([...(report?.lines.flatMap(line => line.warehouses.map(row => row.warehouse)) ?? []), ...(report?.channelLines.length ? ['Unknown warehouse'] : [])])].sort()
 const channelLines = !late && (!warehouse || warehouse === 'Unknown warehouse') ? report?.channelLines : []
 const lines = (late ? report?.lateLines : report?.lines)?.filter(line => !warehouse || line.warehouses.some(row => row.warehouse === warehouse) || (warehouse === 'Unassigned backorder' && line.unassignedBackorder !== '0'))
 async function saveZone() {
  setSaving(true); setError('')
  try { await request('/api/barrow/commands', { type: 'settings.timezone', payload: { timeZone: zone } }); setRefresh(value => value + 1) }
  catch (cause) { setError(errorMessage(cause)) }
  finally { setSaving(false) }
 }
 return <div className="br-card br-stack"><h2>Fulfillment & backorders</h2>
  <div className="br-form-grid"><AccountPicker accounts={accounts} value={accountId} onChange={setAccount} empty="All trade accounts"/>
   <label>Warehouse evidence<select value={warehouse} onChange={event => setWarehouse(event.target.value)}><option value="">All warehouses</option>{warehouses.map(value => <option key={value}>{value}</option>)}<option>Unassigned backorder</option></select></label></div>
  <div className="br-actions"><button className="br-secondary" onClick={() => setRefresh(value => value + 1)}>Refresh fulfillment</button><button className="br-secondary" aria-pressed={late} onClick={() => setLate(value => !value)}>{late ? 'Show all lines' : 'Open late-line queue'}</button></div>
  <details><summary>Reporting time zone</summary><label>Installation reporting time zone<input placeholder="America/New_York" value={zone} onChange={event => setZone(event.target.value)} /></label><button className="br-secondary" disabled={saving || !zone} onClick={() => void saveZone()}>Save reporting time zone</button><p>Existing order date snapshots keep their original semantics.</p></details>
  {error && <Notice error>{error}</Notice>}
  {!report && !error && <p role="status">Reading Pier…</p>}
  {report && <><p>Report days: {report.timeZone} · Pier observed {when(report.checkedAt)} · {report.status === 'read' ? 'Source answered' : 'Unavailable'}</p><p className="br-quiet-text">{report.note}</p>
   {channelLines?.map(line=><article className="br-card br-stack" key={`${line.brand}:${line.orderId}:${line.lineId}`}><h3>Faire · {line.orderId} · {line.sku}</h3><p>Ordered {line.ordered} · shipped {line.shipped} · warehouse {line.warehouse}</p><p>Delivery {line.delivery} · settlement owned by {line.settlementOwner}</p>{line.reviewRequired&&<Notice>Source changed. Owner review required.</Notice>}</article>)}
   {report.status === 'unavailable' && <Notice>Fulfillment unknown. Reconnect Pier and refresh.</Notice>}
   {report.status === 'read' && lines?.length === 0 && <p>No matching {late ? 'late ' : ''}lines.</p>}
   {lines?.map(line => <article className="br-card br-stack" key={`${line.orderId}:${line.sku}`}>
    <h3>{orderNumber(line.orderId)} · {line.customer} · {line.sku}</h3><p>{line.reference || 'No buyer PO'} · base unit: {line.unit}</p>
    <p>Ordered {line.ordered} · shipped {line.shipped} · cancelled {line.cancelled} · allocated {line.allocated} · backordered {line.backordered} · outstanding {line.outstanding}</p>
    <p>Fill {line.fillBasisPoints === null ? 'not applicable' : `${(line.fillBasisPoints / 100).toFixed(2)}%`} · age since approval {line.ageDays} days{line.overdue ? ' · past requested date' : ''}</p>
    <p>Agreed date {line.agreedDate ?? 'not recorded'} · Pier promise {line.promisedDate ?? 'not recorded'}{line.promiseChanged ? ' · differs from agreed date' : ''} · promise history: {line.promiseHistory}</p>
    <p>Dispatched by requested date: {line.dispatchedByDate ?? 'unknown'} · dispatched late: {line.dispatchedLate ?? 'unknown'}</p>
    <p>Delivery: unknown · on-time delivery: unknown · {line.tracking}</p>
    <ul>{line.warehouses.map(row => <li key={row.warehouse}>{row.warehouse}: {row.allocated} allocated, {row.shipped} shipped</li>)}{line.unassignedBackorder !== '0' && <li>Unassigned backorder: {line.unassignedBackorder}</li>}</ul>
    <p>Source order <code>{line.sourceOrderId}</code></p>{line.action && <Notice>Owner: {line.owner}. {line.action}</Notice>}
   </article>)}
   {report.exceptions.map(item => <Notice key={item.orderId} error>{orderNumber(item.orderId)}: {item.reason} Owner: {item.owner}.</Notice>)}
  </>}
 </div>
}
