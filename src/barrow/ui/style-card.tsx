import { Flat } from './flat'
import type { StyleRow } from './styles'
import { money, when } from './types'

// The large card beside the matrix: the style the rep last touched, its prices and what Pier can promise per size.
export function StyleCard({ row, observedAt }: { row?: StyleRow; observedAt: string }) {
  if (!row) return <aside className="br-style-card br-card" aria-label="Selected style"><p className="br-quiet-text">Choose a style to see its sizes and stock.</p></aside>
  const first = row.cells[row.sizes[0]]
  return <aside className="br-style-card br-card" aria-label={`Selected style: ${row.name}`}>
    <figure className="br-style-figure"><Flat name={row.name} code={row.key} large /></figure>
    <div className="br-style-head">
      <Flat name={row.name} code={row.key} />
      <div>
        <h2>{row.name}</h2>
        <p className="br-style-price"><strong>{money(row.cents)}</strong>{row.note && <span> / {row.note}</span>}</p>
        <p className="br-style-sku">{row.key} · {first.unit}</p>
      </div>
    </div>
    <div className="br-style-stock">
      <p className="br-label">Available to promise</p>
      <dl className="br-size-stock">{row.sizes.map(size => <div key={size}><dt>{size}</dt><dd>{row.cells[size].available}</dd></div>)}</dl>
      <p className="br-quiet-text">Pier stock observed {when(observedAt)}. Stock is reserved only after supplier approval.</p>
    </div>
  </aside>
}
