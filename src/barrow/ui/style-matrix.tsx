import { Fragment, type RefObject } from 'react'
import { Flat } from './flat'
import { quantityOf, rowCents, rowUnits, type StyleRow } from './styles'
import type { CatalogueItem } from './types'
import { quantityProblem } from '../quantity-rules'
import { money as formatMoney, when } from './types'

/** A draft line whose agreed price moved after the draft was written. */
export interface PriceChange { from: number; to: number; currency: 'USD' | 'AUD' | 'CAD' | 'EUR' | 'GBP' }

export function cellProblem(item: CatalogueItem, value: string | undefined) {
  if (!value) return ''
  const quantity = Number(value)
  if (!Number.isSafeInteger(quantity) || quantity < 0) return 'Enter a whole number.'
  const rule = quantity > 0 ? quantityProblem(String(quantity), item) : null
  if (rule) return `${rule.reason[0].toUpperCase()}${rule.reason.slice(1)}: choose ${[rule.below, rule.above].filter(Boolean).join(' or ')}.`
  if (quantity > Number(item.available)) return `Only ${item.available} available.`
  return ''
}

export const quantityId = (prefix: string, sku: string) => `${prefix}-quantity-${encodeURIComponent(sku)}`

interface Props {
  prefix: string
  rows: StyleRow[]; columns: string[]; quantities: Record<string, string>; busy: boolean; selected: string; customer: string
  pricingReasons?:Record<string,string>; lineCents?:Record<string,number>; changes: Record<string, PriceChange>; kept: Set<string>; writtenAt?: string; cells: RefObject<Map<string, HTMLInputElement>>
  onQuantity: (sku: string, value: string) => void; onSelect: (key: string) => void; onKeep: (key: string) => void; onRemove: (row: StyleRow) => void
}

// Styles down, sizes across, then Units and Line $. A price that moved since the draft is settled inside its own row.
export function StyleMatrix({ prefix, rows, columns, quantities, busy, selected, customer, changes, kept, writtenAt, cells, lineCents, pricingReasons, onQuantity, onSelect, onKeep, onRemove }: Props) {
  const money=(cents:number,code:'USD'|'AUD'|'CAD'|'EUR'|'GBP'=rows[0]?.currency??'USD')=>formatMoney(cents,code)
  return <div className="br-matrix-wrap"><table className="br-matrix" style={{ ['--br-sizes' as string]: columns.length }}>
    <caption className="br-sr-only">Order quantities by style and size</caption>
    <thead><tr><th scope="col" className="br-col-style">Style</th><th scope="col" className="br-col-price">Price</th>{columns.map(size => <th scope="col" key={size} className="br-col-size">{size}</th>)}<th scope="col" className="br-col-units">Units</th><th scope="col" className="br-col-line">Line $</th></tr></thead>
    <tbody>{rows.map(row => {
      const skus = row.sizes.map(size => row.cells[size].sku)
      const moved = skus.filter(sku => changes[sku] && quantityOf(quantities[sku]) > 0)
      const open = moved.length > 0 && !kept.has(row.key), settled = moved.length > 0 && kept.has(row.key)
      const was = rowCents(row, quantities, item => changes[item.sku]?.from ?? item.unitCents), now = lineCents ? skus.reduce((sum,sku)=>sum+(lineCents[sku]??0),0) : rowCents(row, quantities)
      const prices = [...new Set(moved.map(sku => `${money(changes[sku].from, changes[sku].currency)} → ${money(changes[sku].to)}`))]
      const newPrices = [...new Set(moved.map(sku => money(changes[sku].to)))]
      return <Fragment key={row.key}>
        <tr className={`br-style-row${selected === row.key ? ' br-selected' : ''}${open ? ' br-changed' : ''}`} aria-selected={selected === row.key}>
          <th scope="row" className="br-col-style"><button type="button" className="br-style-pick" onClick={() => onSelect(row.key)} aria-pressed={selected === row.key}>
            <Flat name={row.name} code={row.key} />
            <span><span className="br-style-name">{row.name}</span>{row.note && <span className="br-style-note">{row.note}</span>}{skus.filter(sku=>pricingReasons?.[sku]).map(sku=><span className="br-style-note" aria-label="Current pricing rules" key={sku}>{sku}: {pricingReasons![sku]}</span>)}{settled && <span className="br-style-kept">Kept {newPrices.join(', ')} ✓</span>}</span>
          </button></th>
          <td className="br-col-price">{money(row.cents)}</td>
          {columns.map(size => {
            const item = row.cells[size]
            if (!item) return <td key={size} className="br-col-size"><span className="br-cell br-cell-none" title={`${size} is not offered`}>–</span></td>
            const value = quantities[item.sku] ?? '', problem = cellProblem(item, value)
            return <td key={size} className="br-col-size"><input id={quantityId(prefix, item.sku)} ref={element => { if (element) cells.current?.set(item.sku, element); else cells.current?.delete(item.sku) }}
              className={`br-cell${quantityOf(value) > 0 ? ' br-cell-filled' : ''}`} type="number" inputMode="numeric" min="0" step="1" placeholder="–" value={value} readOnly={busy}
              aria-label={`${size} quantity for ${row.name}`} aria-invalid={problem ? true : undefined} aria-describedby={problem ? `${quantityId(prefix, item.sku)}-error` : undefined} title={problem || `${item.sku} · ${item.available} available${item.awaitingRelease ? ` · ${item.awaitingRelease} held until Pier confirms a cancelled order’s release` : ''}`}
              onFocus={() => onSelect(row.key)} onChange={event => onQuantity(item.sku, event.target.value)} />{problem && <p id={`${quantityId(prefix, item.sku)}-error`} className="br-field-error">{problem}</p>}</td>
          })}
          <td className="br-col-units">{rowUnits(row, quantities) || '–'}</td>
          <td className="br-col-line">{now ? money(now) : <span className="br-none">–</span>}</td>
        </tr>
        {open && <tr className="br-change-row"><td colSpan={columns.length + 4}>
          <p className="br-change-note"><span className="br-warn" aria-hidden="true">!</span>Price changed since this draft was written: {prices.join(', ')}{writtenAt && ` (written ${when(writtenAt)})`} · line {money(was, changes[moved[0]].currency)} → {money(now)}</p>
          <div className="br-change-actions">
            <p className="br-agent-line"><span className="br-rivet" aria-hidden="true" />Barrow prepares a new draft at today’s price to replace this one; {customer} re-confirms it.</p>
            <button type="button" id={`${prefix}-price-${encodeURIComponent(row.key)}`} onClick={() => onKeep(row.key)} disabled={busy}>Keep {newPrices.length === 1 ? newPrices[0] : 'the new prices'}, buyer re-confirms</button>
            <button type="button" className="br-secondary" onClick={() => onRemove(row)} disabled={busy}>Remove {row.key.replace(/^[A-Z]+-/, '')} from this order</button>
          </div>
        </td></tr>}
      </Fragment>
    })}</tbody>
  </table></div>
}
