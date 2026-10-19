import { useEffect, useState, type FormEvent } from 'react'
import { Dialog } from './dialog'
import { Notice } from './primitives'
import { request, errorMessage } from './api'
import { when } from './types'
import type { CartLine } from './cart-import'

export interface SavedList { id: string; accountId: string; name: string; shared: boolean; mine: boolean; updatedAt: string; lines: { sku: string; unit?: string; quantity: string }[]; revision: string }

const command = async <T,>(type: string, payload: Record<string, unknown>) => (await request<{ result: T }>('/api/barrow/commands', { type, payload })).result

// ORD-002: lists keep desired SKUs and quantities only. Adding one to the cart opens ORD-001's preview at current
// prices, stock and pack rules, where every exception is resolved before merge or replace.
export function SavedLists({ accountId, cart, onAdd, onClose }: { accountId: string; cart: CartLine[]; onAdd: (list: SavedList) => void; onClose: () => void }) {
  const [lists, setLists] = useState<SavedList[] | null>(null)
  const [name, setName] = useState('')
  const [shared, setShared] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let current = true
    void request<{ lists: SavedList[] }>(`/api/barrow/lists?accountId=${encodeURIComponent(accountId)}`)
      .then(data => { if (current) setLists(data.lists) }).catch(failure => { if (current) setError(errorMessage(failure)) })
    return () => { current = false }
  }, [accountId, refresh])
  async function act(type: string, payload: Record<string, unknown>) {
    setBusy(true); setError('')
    try { await command(type, payload); setRefresh(value => value + 1); return true } catch (failure) { setError(errorMessage(failure)); return false } finally { setBusy(false) }
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    if (await act('list.save', { accountId, name, shared, lines: cart.map(line => ({ sku: line.sku, ...(line.unit ? { unit: line.unit } : {}), quantity: String(line.quantity) })) })) { setName(''); setShared(false) }
  }
  return <Dialog title="Saved lists" busy={busy} onClose={onClose}>
    <p>Lists keep the SKUs and quantities you want, not prices or stock. Adding one to your cart checks today’s prices, stock and pack rules first.</p>
    {error && <Notice error>{error}</Notice>}
    {!lists && !error && <p role="status">Loading lists…</p>}
    {lists && lists.length === 0 && <p>No saved lists on this account yet.</p>}
    {lists && lists.length > 0 && <ul aria-label="Lists on this account" className="br-stack">{lists.map(list => <li key={list.id}>
      <strong>{list.name}</strong> · {list.lines.length} {list.lines.length === 1 ? 'line' : 'lines'} · {list.shared ? 'Shared with this account' : 'Only you'} · updated {when(list.updatedAt)}
      <span className="br-actions">
        <button type="button" disabled={busy} onClick={() => onAdd(list)}>Add {list.name} to cart</button>
        <button type="button" className="br-secondary" disabled={busy} onClick={() => void act('list.duplicate', { listId: list.id })}>Duplicate</button>
        {list.mine && <button type="button" className="br-secondary" disabled={busy} onClick={() => void act('list.save', { listId: list.id, revision: list.revision, shared: !list.shared })}>{list.shared ? 'Make private' : 'Share with this account'}</button>}
        {list.mine && <button type="button" className="br-secondary" disabled={busy} onClick={() => void act('list.delete', { listId: list.id, revision: list.revision })}>Delete</button>}
      </span>
    </li>)}</ul>}
    <form onSubmit={event => void save(event)} className="br-stack" aria-label="Save this cart as a list">
      <label>List name<input value={name} maxLength={80} disabled={busy} onChange={event => setName(event.target.value)} placeholder="Store replenishment" /></label>
      <label><input type="checkbox" checked={shared} disabled={busy} onChange={event => setShared(event.target.checked)} /> Share with everyone who orders for this account</label>
      <div className="br-actions">
        <button disabled={busy || !name.trim() || !cart.length}>Save cart as list</button>
        <button type="button" className="br-secondary" disabled={busy} onClick={onClose}>Close</button>
      </div>
      {!cart.length && <p className="br-quiet-text">Enter quantities on the pad to save them as a list.</p>}
    </form>
  </Dialog>
}
