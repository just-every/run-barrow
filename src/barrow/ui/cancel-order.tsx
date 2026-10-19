import { useState } from 'react'
import { Dialog } from './dialog'
import { orderNumber, type Order, type RunCommand } from './types'

// STK-004: the supplier names a reason; Pier releases the stock and only its confirmation clears the order.
export function CancelOrder({ order, run, busy, onClose }: { order: Order; run: RunCommand; busy: boolean; onClose: () => void }) {
  const [reason, setReason] = useState('')
  async function confirm() {
    await run('order.cancel', { orderId: order.id, reason: reason.trim() })
    onClose()
  }
  return <Dialog title={`Cancel ${orderNumber(order.id)}`} busy={busy} onClose={onClose}>
    <p>Pier will release every unit reserved for this order. Until Pier confirms, those units stay unavailable to other buyers. Shipped units cannot be cancelled.</p>
    <label>Reason for cancelling<input value={reason} maxLength={160} required disabled={busy} onChange={event => setReason(event.target.value)} /></label>
    <div className="br-actions"><button type="button" disabled={busy || !reason.trim()} onClick={() => void confirm()}>Cancel order & release stock</button><button type="button" className="br-secondary" disabled={busy} onClick={onClose}>Keep order</button></div>
  </Dialog>
}
