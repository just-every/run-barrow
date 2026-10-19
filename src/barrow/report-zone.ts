import { audit, commit } from './access'
import { fail, requireSupplier, supplierZone, type Actor } from './model'

/** Installation reporting zone; existing order date snapshots keep their original semantics. */
export async function reportZone(db: D1Database) {
 const row = await db.prepare("SELECT value_json FROM bw_settings WHERE key='timeZone'").first<{ value_json: string }>()
 return row ? JSON.parse(row.value_json) as string : supplierZone
}
export function calendarDate(at: Date, timeZone: string) {
 const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at).map(part => [part.type, part.value]))
 return `${parts.year}-${parts.month}-${parts.day}`
}
export async function saveReportZone(db: D1Database, actor: Actor, p: any) {
 requireSupplier(actor)
 if (typeof p.timeZone !== 'string') fail('INPUT', 'Supply an IANA time zone.', 400)
 let timeZone: string
 try { timeZone = new Intl.DateTimeFormat('en-US', { timeZone: p.timeZone }).resolvedOptions().timeZone }
 catch { return fail('INPUT', 'Supply an IANA time zone, such as America/New_York.', 400) }
 const revision = crypto.randomUUID()
 await commit(db, actor, [db.prepare("INSERT INTO bw_settings(key,value_json,revision) VALUES('timeZone',?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,revision=excluded.revision").bind(JSON.stringify(timeZone), revision), audit(db, actor, 'settings:timeZone', 'settings.time-zone', { revision, source: 'settings.timezone', reason: `Supplier set the installation reporting time zone to ${timeZone}. Existing order date snapshots retain their semantics.` })])
 return { timeZone }
}
