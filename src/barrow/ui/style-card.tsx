import { Flat } from './flat'
import type { StyleRow } from './styles'
import { money, when } from './types'

// The large card beside the matrix: the style the rep last touched, its prices and what Pier can promise per size.
export function StyleCard({ row, observedAt }: { row?: StyleRow; observedAt: string }) {
  if (!row) return <aside className="br-style-card br-card" aria-label="Selected style"><p className="br-quiet-text">Choose a style to see its sizes and stock.</p></aside>
  const first = row.cells[row.sizes[0]], cells = row.sizes.map(size => row.cells[size])
  // The style's stock summed over its sizes, per Pier warehouse and per incoming promise date.
  const sum = (entries: [string, number][]) => [...entries.reduce((map, [key, value]) => map.set(key, (map.get(key) ?? 0) + value), new Map<string, number>())]
  const promised = new Set(cells.flatMap(cell => (cell.warehouses ?? []).filter(value => value.promised).map(value => value.warehouse)))
  const warehouses = sum(cells.flatMap(cell => (cell.warehouses ?? []).map(value => [value.warehouse, Number(value.available)] as [string, number]))).map(([name, quantity]) => [name, quantity, promised.has(name)] as const)
  const incoming = sum(cells.flatMap(cell => (cell.incoming ?? []).map(value => [value.date ?? '', Number(value.quantity)] as [string, number])))
  return <aside className="br-style-card br-card" aria-label={`Selected style: ${row.name}`}>
    <figure className="br-style-figure"><Flat name={row.name} code={row.key} large /></figure>
    <div className="br-style-head">
      <Flat name={row.name} code={row.key} />
      <div>
        <h2>{row.name}</h2>
        <p className="br-style-price"><strong>{money(row.cents,row.currency)}</strong>{row.note && <span> / {row.note}</span>}</p>
        <p className="br-style-sku">{row.key} · {first.unit}</p>
      </div>
    </div>
    <div className="br-style-stock">
      <p className="br-label">Available to promise</p>
      <dl className="br-size-stock">{row.sizes.map(size => <div key={size}><dt>{size}</dt><dd>{row.cells[size].available}</dd></div>)}</dl>
      {warehouses.length > 0 && <p className="br-quiet-text">By warehouse: {warehouses.map(([name, quantity, promised]) => `${name} ${quantity}${promised ? '' : ' (not promised to this account)'}`).join(' · ')}</p>}
      {incoming.length > 0 && <p className="br-quiet-text">Incoming, not yet received: {incoming.map(([date, quantity]) => `${quantity} ${date ? `by ${date} (Pier PO promise date)` : '(date unknown)'}`).join(' · ')}. Incoming stock is not promised until Pier receives it.</p>}
      <p className="br-quiet-text">Pier stock observed {when(observedAt)}. Stock is reserved only after supplier approval.</p>
    </div>
  </aside>
}
