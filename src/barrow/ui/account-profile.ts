import type { Account } from './types'

export const companyName = (value: string) => value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase()

export function duplicateCompanies(accounts: Account[], account: Account | undefined, name: string, pierCustomerId: string) {
  const renamed = !account || companyName(account.value.name) !== companyName(name) || account.value.pierCustomerId !== pierCustomerId.trim()
  if (!renamed) return []
  return accounts.filter(candidate => candidate.id !== account?.id && (
    companyName(candidate.value.name) === companyName(name) || candidate.value.pierCustomerId === pierCustomerId.trim()
  ))
}

export function profileFields(data: FormData) {
  const providerReferences: Record<string, string> = Object.create(null)
  for (const line of String(data.get('providerReferences') ?? '').split(/\r?\n/).filter(line => line.trim())) {
    const divider = line.indexOf('=')
    const key = line.slice(0, divider).trim(), value = line.slice(divider + 1).trim()
    if (divider < 1 || !value || Object.hasOwn(providerReferences, key)) throw new Error('Provider references need one unique provider=reference per line.')
    providerReferences[key] = value
  }
  return {
    lifecycle: String(data.get('lifecycle')) as 'active' | 'on-hold' | 'closed',
    ...Object.fromEntries(['channel', 'territory', 'assignedRep'].map(key => [key, String(data.get(key) ?? '').trim()]).filter(([, value]) => value)),
    catalogs: String(data.get('catalogs') ?? '').split(/\r?\n/).map(value => value.trim()).filter(Boolean),
    providerReferences,
  }
}
