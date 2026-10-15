import { useState, type FormEvent } from 'react'
import type { Account, Price, RunCommand } from './types'
import { Notice } from './primitives'

function parsePrices(text: string): Price[] {
  if (!text.trim()) return []
  const prices = text.split(/\r?\n/).filter(line => line.trim()).map((line, index) => {
    const values = line.split(',').map(value => value.trim())
    const [sku, cents, quantity] = values
    const unitCents = Number(cents), minQty = Number(quantity)
    if (values.length !== 3 || !sku || !/^\d+$/.test(cents) || !Number.isSafeInteger(unitCents) || !/^\d+$/.test(quantity) || !Number.isSafeInteger(minQty) || minQty < 1) {
      throw new Error(`Price row ${index + 1}: enter SKU, non-negative unit price in cents, and a minimum quantity of at least 1.`)
    }
    return { sku, unitCents, minQty }
  })
  if (new Set(prices.map(price => price.sku)).size !== prices.length) throw new Error('Each SKU can have one agreed price. Remove duplicate rows.')
  return prices
}

export function AccountForm({ account, run, busy, onClose }: { account?: Account; run: RunCommand; busy: boolean; onClose: () => void }) {
  const [error, setError] = useState('')
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('')
    const data = new FormData(event.currentTarget)
    try {
      const id = String(data.get('id')).trim()
      const value = {
        name: String(data.get('name')).trim(), email: String(data.get('email')).trim().toLowerCase(),
        pierCustomerId: String(data.get('pierCustomerId')).trim(), termsDays: Number(data.get('termsDays')),
        minimumCents: Number(data.get('minimumCents')), prices: parsePrices(String(data.get('prices'))),
      }
      if (await run('account.save', { ...(id ? { id } : {}), ...(account ? { revision: account.revision } : {}), value })) onClose()
    } catch (error) { setError(error instanceof Error ? error.message : 'Check the account fields.') }
  }
  return <form onSubmit={event => void save(event)} className="br-stack">
    <div className="br-heading-row"><h2>{account ? 'Edit trade account' : 'New trade account'}</h2><button type="button" className="br-quiet" onClick={onClose} disabled={busy}>Cancel</button></div>
    {error && <Notice error>{error}</Notice>}
    <fieldset disabled={busy} className="br-form-grid">
      <label>Business name<input name="name" required defaultValue={account?.value.name} autoComplete="organization" /></label>
      <label>Customer email<input name="email" type="email" required readOnly={!!account} defaultValue={account?.value.email} autoComplete="email" />{account && <small>Create a separate account to change the customer’s sign-in email.</small>}</label>
      <label>Account ID<input name="id" defaultValue={account?.id} readOnly={!!account} placeholder="Generated when left blank" /><small>{account ? 'The account ID is permanent.' : 'Use a stable ID for imports and account updates.'}</small></label>
      <label>Pier customer ID<input name="pierCustomerId" required defaultValue={account?.value.pierCustomerId} /></label>
      <label>Payment terms (days)<input name="termsDays" type="number" min="0" max="365" step="1" required defaultValue={account?.value.termsDays ?? 30} /></label>
      <label>Minimum order (AUD cents)<input name="minimumCents" type="number" min="0" step="1" required defaultValue={account?.value.minimumCents ?? 0} /></label>
      <label className="br-full">Agreed prices<textarea name="prices" rows={6} defaultValue={account?.value.prices.map(price => `${price.sku},${price.unitCents},${price.minQty}`).join('\n')} placeholder="SKU,unitCents,minQty" spellCheck={false} /><small>One row per SKU, with no header. For example: COFFEE-1KG,2400,6 means $24.00 each, minimum quantity 6. Only agreed SKUs appear in this account’s catalogue.</small></label>
    </fieldset>
    <div className="br-actions"><button disabled={busy}>{busy ? 'Saving…' : 'Save account'}</button></div>
  </form>
}
