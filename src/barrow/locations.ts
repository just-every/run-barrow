import { requireCompanyRight, companyMembership } from './company-policy'
// ACC-003: billing and delivery locations. Each trade account keeps bill-to, ship-to and contact records; ship-tos carry
// default delivery instructions and a location-specific tax exemption reference. Addresses are format checked, never
// claimed as verified. Orders snapshot the chosen bill-to and ship-to in full, so editing, re-defaulting or archiving
// a location never rewrites an order. The owner, admins and the account's buyer maintain them; agents neither read
// nor write them. Tax is not calculated: the jurisdiction is the ship-to's state until TAX-001.
import { audit, changed, commit } from './access'
import { account } from './accounts'
import { fail, requirePerson, text, type Account, type Actor } from './model'
import { addressCheck, usAddress } from './us-address'

export type LocationKind = 'bill-to' | 'ship-to' | 'contact'
export type LocationValue = { name: string; line1?: string; line2?: string; city?: string; state?: string; zip?: string; deliveryInstructions?: string; exemption?: { reference: string; state: string }; email?: string; phone?: string; role?: string }
export type Location = { id: string; accountId: string; kind: LocationKind; value: LocationValue; revision: string; isDefault: boolean; archived: boolean }
/** What an order keeps of a location: the full record as chosen, its revision and the honest labels. */
export type LocationSnapshot = LocationValue & { id: string; revision: string; jurisdiction?: string; check: string }

const kinds: LocationKind[] = ['bill-to', 'ship-to', 'contact']
const optional = (value: unknown, name: string, limit: number) => value === undefined || value === '' ? undefined : text(value, name, limit)
const row = (value: any): Location => ({ id: value.id, accountId: value.account_id, kind: value.kind, value: JSON.parse(value.value_json), revision: value.revision, isDefault: Boolean(value.is_default), archived: Boolean(value.archived) })
export const jurisdictionLabel = 'State jurisdiction from the ship-to address; local jurisdictions and rates come with TAX-001. No tax is calculated.'

export function locationValue(kind: LocationKind, p: any): LocationValue {
 const name = text(p?.name, kind === 'contact' ? 'Contact name' : 'Location name', 120)
 if (kind === 'contact') {
  const email = optional(p.email, 'Email', 200)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('INPUT', 'Enter a valid email address.', 400)
  return { name, ...(email ? { email } : {}), ...(optional(p.phone, 'Phone', 40) ? { phone: p.phone.trim() } : {}), ...(optional(p.role, 'Role', 80) ? { role: p.role.trim() } : {}) }
 }
 const { state, zip } = usAddress(p.state, p.zip)
 const value: LocationValue = { name, line1: text(p.line1, 'Address line 1', 120), ...(optional(p.line2, 'Address line 2', 120) ? { line2: p.line2.trim() } : {}), city: text(p.city, 'City', 80), state, zip }
 if (kind === 'ship-to') {
  const instructions = optional(p.deliveryInstructions, 'Delivery instructions', 240)
  if (instructions) value.deliveryInstructions = instructions
  if (p.exemption !== undefined && p.exemption !== null) {
   if (typeof p.exemption.state !== 'string' || p.exemption.state.trim().toUpperCase() !== state) fail('INPUT', 'Record the exemption certificate issued by the ship-to’s own state.', 400)
   value.exemption = { reference: text(p.exemption.reference, 'Tax exemption reference', 80), state }
  }
 }
 return value
}

export async function readLocations(db: D1Database, actor: Actor, accountId: string) {
 requirePerson(actor)
 const selected = await account(db, actor, text(accountId, 'Account'))
 const locations=(await db.prepare('SELECT * FROM bw_locations WHERE account_id=? ORDER BY kind,rowid').bind(selected.id).all<any>()).results.map(row)
 const member=await companyMembership(db,actor,accountId)
 return member&&member.locations!=='all'&&!member.rights.includes('administrator')?locations.filter(location=>location.kind==='ship-to'&&member.locations.includes(location.id)):locations
}

export async function locationCommand(db: D1Database, actor: Actor, type: string, p: any) {
 requirePerson(actor)
 const selected = await account(db, actor, text(p.accountId, 'Account'))
 await requireCompanyRight(db,actor,selected.id,'administrator')
 if (type === 'location.save') {
  const existing = p.id ? await db.prepare('SELECT * FROM bw_locations WHERE id=? AND account_id=?').bind(text(p.id, 'Location', 60), selected.id).first<any>() : null
  if (p.id && !existing) fail('NOT_FOUND', 'Location not found.', 404)
  const kind: LocationKind = existing ? existing.kind : kinds.includes(p.kind) ? p.kind : fail('INPUT', 'Choose bill-to, ship-to or contact.', 400)
  if (existing && (existing.revision !== p.revision || existing.archived)) fail('CHANGED', 'This location changed or was archived. Refresh it before saving.')
  const value = locationValue(kind, p.value), id = existing?.id ?? crypto.randomUUID(), revision = crypto.randomUUID()
  const first = !(await db.prepare('SELECT 1 FROM bw_locations WHERE account_id=? AND kind=? AND is_default=1').bind(selected.id, kind).first())
  const makeDefault = kind !== 'contact' && (p.makeDefault === true || first)
  const statements = [
   ...(makeDefault ? [db.prepare('UPDATE bw_locations SET is_default=0 WHERE account_id=? AND kind=? AND id<>?').bind(selected.id, kind, id)] : []),
   existing
    ? db.prepare('UPDATE bw_locations SET value_json=?,revision=?,is_default=CASE WHEN ? THEN 1 ELSE is_default END WHERE id=? AND revision=? AND archived=0').bind(JSON.stringify(value), revision, makeDefault ? 1 : 0, id, existing.revision)
    : db.prepare('INSERT INTO bw_locations(id,account_id,kind,value_json,revision,is_default) VALUES(?,?,?,?,?,?)').bind(id, selected.id, kind, JSON.stringify(value), revision, makeDefault ? 1 : 0),
   changed(db),
   audit(db, actor, id, existing ? 'location.updated' : 'location.added', { accountId: selected.id, revision, source: 'location.save', reason: `${existing ? 'Updated' : 'Added'} ${kind} ${value.name}${makeDefault ? ' as the default' : ''}; orders keep their own snapshot.` }),
  ]
  await commit(db, actor, statements)
  return row(await db.prepare('SELECT * FROM bw_locations WHERE id=?').bind(id).first<any>())
 }
 if (type === 'location.archive') {
  const existing = await db.prepare('SELECT * FROM bw_locations WHERE id=? AND account_id=?').bind(text(p.id, 'Location', 60), selected.id).first<any>()
  if (!existing) fail('NOT_FOUND', 'Location not found.', 404)
  if (existing.revision !== p.revision) fail('CHANGED', 'This location changed. Refresh it before archiving.')
  const revision = crypto.randomUUID()
  await commit(db, actor, [db.prepare('UPDATE bw_locations SET archived=1,is_default=0,revision=? WHERE id=? AND revision=?').bind(revision, existing.id, existing.revision), changed(db), audit(db, actor, existing.id, 'location.archived', { accountId: selected.id, revision, source: 'location.archive', reason: `Archived ${existing.kind} ${JSON.parse(existing.value_json).name}; orders keep their own snapshot.` })])
  return row(await db.prepare('SELECT * FROM bw_locations WHERE id=?').bind(existing.id).first<any>())
 }
 fail('COMMAND', 'Unknown location command.', 404)
}

/** The chosen (or default) active location of a kind, as an order snapshot; none when the account keeps no such records. */
export async function locationSnapshot(db: D1Database, selected: Account, kind: 'bill-to' | 'ship-to', id: unknown): Promise<LocationSnapshot | undefined> {
 const found = id !== undefined && id !== null && id !== ''
  ? await db.prepare('SELECT * FROM bw_locations WHERE id=? AND account_id=? AND kind=?').bind(text(id, kind === 'ship-to' ? 'Ship-to' : 'Bill-to', 60), selected.id, kind).first<any>()
  : await db.prepare('SELECT * FROM bw_locations WHERE account_id=? AND kind=? AND is_default=1 AND archived=0').bind(selected.id, kind).first<any>()
 if (id && !found) fail('LOCATION', `That ${kind} is not one of this account’s locations.`, 400)
 if (!found) return undefined
 if (found.archived) fail('LOCATION', `That ${kind} was archived. Choose a current location.`, 400)
 const location = row(found)
 return { id: location.id, revision: location.revision, ...location.value, ...(kind === 'ship-to' ? { jurisdiction: `US-${location.value.state}` } : {}), check: addressCheck }
}

/** Whether an active ship-to still exists, so a reorder can keep the original's delivery address. */
export async function activeShipTo(db: D1Database, accountId: string, id: string | undefined) {
 if (!id) return undefined
 return (await db.prepare("SELECT id FROM bw_locations WHERE id=? AND account_id=? AND kind='ship-to' AND archived=0").bind(id, accountId).first<{ id: string }>())?.id
}
