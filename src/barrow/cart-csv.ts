// ORD-001 order forms and cart uploads are RFC 4180 CSV: UTF-8 (a leading BOM is ignored), comma separated,
// quoted fields with doubled quotes, CRLF on download. Any spreadsheet opens, fills and saves them.
import { fail } from './model'
export const maxCartBytes = 256 * 1024, maxCartRows = 500

export function parseCsv(input: string): string[][] {
 if (input.length > maxCartBytes) fail('CART_CSV', 'A cart upload is at most 256 KB.', 400)
 const rows: string[][] = []
 let row: string[] = [], cell = '', quoted = false
 const endRow = () => { row.push(cell); cell = ''; if (row.some(value => value.trim())) rows.push(row); row = []; if (rows.length > maxCartRows + 1) fail('CART_CSV', `A cart upload has at most ${maxCartRows} rows.`, 400) }
 for (let n = input.startsWith('﻿') ? 1 : 0; n < input.length; n++) {
  const ch = input[n]
  if (quoted) {
   if (ch === '"' && input[n + 1] === '"') { cell += '"'; n++ }
   else if (ch === '"') quoted = false
   else cell += ch
  } else if (ch === '"' && !cell.trim()) { cell = ''; quoted = true }
  else if (ch === ',') { row.push(cell); cell = '' }
  else if (ch === '\r' || ch === '\n') { if (ch === '\r' && input[n + 1] === '\n') n++; endRow() }
  else cell += ch
 }
 if (quoted) fail('CART_CSV', 'The CSV has an unterminated quoted field.', 400)
 endRow()
 return rows
}
/** Pasted lines: "code quantity [unit]" separated by tabs, commas or spaces, one line per entry, no header. */
export function parsePaste(input: string) {
 if (input.length > maxCartBytes) fail('CART_CSV', 'Pasted text is at most 256 KB.', 400)
 const rows = input.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => line.split(/\t|,|\s+/).map(value => value.trim()).filter(Boolean))
 if (rows.length > maxCartRows) fail('CART_CSV', `Paste at most ${maxCartRows} lines.`, 400)
 return rows
}
// Cells that a spreadsheet would run as a formula are written with a leading apostrophe and read back without it.
const formula = /^[=+@\-\t\r]/
export const cellValue = (value: string) => value.trim().replace(/^'(?=[=+@\-\t\r])/, '')
const cell = (value: unknown) => '"' + String(value ?? '').replace(formula, "'$&").replaceAll('"', '""') + '"'
export const csvText = (rows: unknown[][]) => rows.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n'
