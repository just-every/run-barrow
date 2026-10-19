// ORD-002: saved shopping lists. A list belongs to one trade account and keeps only desired SKUs, selling units and
// quantities: never a price, stock figure or promise. A private list is seen by its creator alone; a shared list by
// everyone who can act for the account today (its buyer and the supplier owner/admin) and by agents, who only read it.
// Adding a list to a cart goes through ORD-001's cart.preview, which rechecks current price, stock and pack rules.
import { commit, changed } from './access'
import { account } from './accounts'
import { csvText } from './cart-csv'
import { now } from './clock'
import { fail, requirePerson, text, type Actor } from './model'
import { formatMicro, quantityMicro } from './units'

export type ListLine = { sku: string; unit?: string; quantity: string }
export type ShoppingList = { id: string; accountId: string; name: string; shared: boolean; createdBy: string; createdAt: string; updatedBy: string; updatedAt: string; duplicatedFrom?: string; lines: ListLine[]; revision: string }
export const maxListLines = 100, maxLists = 50
const missing = () => fail('NOT_FOUND', 'Shopping list not found.', 404)

function lines(input: unknown): ListLine[] {
 if (!Array.isArray(input) || !input.length || input.length > maxListLines) fail('LINES', `A list holds between 1 and ${maxListLines} lines.`, 400)
 const seen = new Set<string>()
 return input.map((line: any) => {
  const sku = text(line?.sku, 'SKU', 100), unit = line?.unit === undefined || line.unit === '' ? undefined : text(line.unit, 'Selling unit', 32)
  let micro: bigint
  try { micro = quantityMicro(line?.quantity) } catch { fail('QUANTITY', `${sku}: give a quantity above zero and at most 1000000.`, 400) }
  const key = `${sku}|${unit ?? ''}`
  if (seen.has(key)) fail('LINES', `${sku} appears twice; keep one line per SKU and selling unit.`, 400)
  seen.add(key)
  return { sku, ...(unit ? { unit } : {}), quantity: formatMicro(micro) }
 })
}

const parse = (row: any): ShoppingList => ({ ...JSON.parse(row.value_json), id: row.id, accountId: row.account_id, revision: row.revision })
const visible = (actor: Actor, list: ShoppingList) => list.shared || (!actor.agent && list.createdBy === actor.id)

/** Every list on one account this person or agent may see, newest first; another account's lists stay not found. */
export async function readLists(db: D1Database, actor: Actor, accountId: string) {
 const selected = await account(db, actor, accountId)
 const rows = await db.prepare('SELECT * FROM bw_lists WHERE account_id=? ORDER BY rowid DESC').bind(selected.id).all<any>()
 return rows.results.map(parse).filter(list => visible(actor, list)).map(list => ({ ...list, mine: !actor.agent && list.createdBy === actor.id }))
}

export async function readList(db: D1Database, actor: Actor, id: string) {
 const row = await db.prepare('SELECT * FROM bw_lists WHERE id=?').bind(id).first<any>()
 if (!row) missing()
 const list = parse(row)
 try { await account(db, actor, list.accountId) } catch { missing() }
 return visible(actor, list) ? list : missing()
}

/** The list as ORD-001 preview input: the same CSV a buyer could upload, so one preview judges both. */
export const listCsv = (list: ShoppingList) => csvText([['sku', 'unit', 'quantity'], ...list.lines.map(line => [line.sku, line.unit ?? '', line.quantity])])

/** Names are unique, ignoring case, among one person's lists on one account, so no private name is revealed. */
async function nameFree(db: D1Database, accountId: string, createdBy: string, name: string, except = '') {
 if (await db.prepare('SELECT 1 FROM bw_lists WHERE account_id=? AND created_by=? AND name=? COLLATE NOCASE AND id<>?').bind(accountId, createdBy, name, except).first()) fail('LIST_NAME', `You already have a list named ${name} on this account.`)
}

async function insert(db: D1Database, actor: Actor, accountId: string, value: Omit<ShoppingList, 'id' | 'accountId' | 'revision'>) {
 const count = await db.prepare('SELECT count(*) AS n FROM bw_lists WHERE account_id=? AND created_by=?').bind(accountId, actor.id).first<{ n: number }>()
 if ((count?.n ?? 0) >= maxLists) fail('LISTS', `Keep at most ${maxLists} lists per account; delete one first.`)
 await nameFree(db, accountId, actor.id, value.name)
 const id = crypto.randomUUID(), revision = crypto.randomUUID()
 await commit(db, actor, [db.prepare('INSERT INTO bw_lists(id,account_id,name,created_by,value_json,revision) VALUES(?,?,?,?,?,?)').bind(id, accountId, value.name, actor.id, JSON.stringify(value), revision)])
 return { ...value, id, accountId, revision }
}

export async function listCommand(db: D1Database, actor: Actor, type: string, p: any) {
 requirePerson(actor)
 const at = (await now()).toISOString(), name = () => text(p.name, 'List name', 80)
 if (type === 'list.save' && p.listId === undefined) {
  const selected = await account(db, actor, text(p.accountId, 'Account'))
  return insert(db, actor, selected.id, { name: name(), shared: p.shared === true, createdBy: actor.id, createdAt: at, updatedBy: actor.id, updatedAt: at, lines: lines(p.lines) })
 }
 const list = await readList(db, actor, text(p.listId, 'List'))
 const mine = list.createdBy === actor.id
 if (type === 'list.duplicate') {
  const target = await account(db, actor, p.accountId === undefined ? list.accountId : text(p.accountId, 'Account'))
  return insert(db, actor, target.id, { name: p.name === undefined ? `${list.name} (copy)`.slice(0, 80) : name(), shared: false, createdBy: actor.id, createdAt: at, updatedBy: actor.id, updatedAt: at, duplicatedFrom: list.id, lines: list.lines })
 }
 if (p.revision !== list.revision) fail('CHANGED', 'This list changed. Refresh it before saving.')
 if (type === 'list.delete') {
  if (!mine) fail('FORBIDDEN', 'Only the person who created this list can delete it.', 403)
  await commit(db, actor, [db.prepare('DELETE FROM bw_lists WHERE id=? AND revision=?').bind(list.id, list.revision), changed(db)])
  return { deleted: list.id }
 }
 if (type !== 'list.save') fail('COMMAND', 'Unknown list command.', 404)
 const shared = p.shared === undefined ? list.shared : p.shared === true
 if (shared !== list.shared && !mine) fail('FORBIDDEN', 'Only the person who created this list can change who sees it.', 403)
 const value = { name: p.name === undefined ? list.name : name(), shared, createdBy: list.createdBy, createdAt: list.createdAt, updatedBy: actor.id, updatedAt: at, ...(list.duplicatedFrom ? { duplicatedFrom: list.duplicatedFrom } : {}), lines: p.lines === undefined ? list.lines : lines(p.lines) }
 await nameFree(db, list.accountId, list.createdBy, value.name, list.id)
 const revision = crypto.randomUUID()
 await commit(db, actor, [db.prepare('UPDATE bw_lists SET name=?,value_json=?,revision=? WHERE id=? AND revision=?').bind(value.name, JSON.stringify(value), revision, list.id, list.revision), changed(db)])
 return { ...value, id: list.id, accountId: list.accountId, revision }
}
