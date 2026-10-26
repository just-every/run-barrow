import { Buffer } from 'node:buffer'
import readExcelFile from 'read-excel-file/universal'
import { strToU8, zipSync } from 'fflate/browser'
import { inspectWorkbook } from './imports/cutover-xlsx'
import { sha256 } from '../modules/import-kit/src/provenance/identity'
import { fail } from './model'
import type { CatalogWorkbook } from './catalog-maintenance-model'

export const catalogColumns = ['sku', 'variantKey', 'style', 'color', 'size', 'attributes', 'categories', 'assortments', 'mediaSha256', 'listing'] as const
export const sourceColumns = ['name', 'barcode', 'stock', 'sourceSku', 'itemId'] as const
export type WorkbookRow = { row: number; values: Record<string, string> }
/** Values-only XLSX; the shared ZIP inspector bounds expansion, sparse cells and active content. */
export async function catalogWorkbook(workbook: CatalogWorkbook) {
 if (!workbook || typeof workbook.name !== 'string' || !/^[^\\/\u0000-\u001f]{1,180}\.xlsx$/i.test(workbook.name)) fail('CATALOG_WORKBOOK', 'Supply a plain XLSX filename.', 400)
 const base64 = workbook.base64
 if (typeof base64 !== 'string' || !base64 || base64.length > 1398104 || base64.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) fail('CATALOG_WORKBOOK', 'Supply at most 1 MiB of canonical base64 XLSX bytes.', 400)
 const bytes = Buffer.from(base64, 'base64')
 if (bytes.length > 1024 * 1024 || bytes.toString('base64') !== base64) fail('CATALOG_WORKBOOK', 'Workbook bytes must be canonical base64 of at most 1 MiB.', 400)
 const sheets = await readExcelFile<string>(inspectWorkbook(bytes), { trim: false, parseNumber: value => value }).catch(() => fail('CATALOG_WORKBOOK', 'The XLSX workbook could not be read.', 400))
 if (sheets.length !== 1 || sheets[0].sheet !== 'Catalog') fail('CATALOG_WORKBOOK', 'Use exactly one worksheet named Catalog; additional sheets are not silently discarded.', 400)
 const data = sheets[0].data
 if (!data.length || data.length > 5001) fail('CATALOG_WORKBOOK', 'Supply a header and at most 5,000 catalog rows.', 400)
 const headers = data[0].map(value => typeof value === 'string' ? value : '')
 const known = new Set<string>([...catalogColumns, ...sourceColumns])
 const rejectedFields = headers.filter(value => !known.has(value))
 const missingColumns = catalogColumns.filter(value => !headers.includes(value))
 if (new Set(headers).size !== headers.length) fail('CATALOG_WORKBOOK', 'Every worksheet column must have a distinct header.', 400)
 const rows: WorkbookRow[] = []
 for (const [index, cells] of data.slice(1).entries()) {
  if (cells.every(value => value === null || value === '')) continue
  if (cells.length > headers.length) fail('CATALOG_WORKBOOK', `Row ${index + 2} has cells beyond the header.`, 400)
  const values: Record<string, string> = Object.create(null)
  for (const [column, header] of headers.entries()) {
   const value = cells[column]
   if (value !== null && value !== undefined && typeof value !== 'string') fail('CATALOG_WORKBOOK', `Row ${index + 2}, ${header}: use plain text values.`, 400)
   values[header] = value ?? ''
  }
  rows.push({ row: index + 2, values })
 }
 return { rows, rejectedFields, missingColumns, artifact: { name: workbook.name, sha256: sha256(bytes), bytes: bytes.length } }
}
const entities: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }
const xml = (value: string) => value.replace(/[<>&"']/g, ch => entities[ch])
const col = (value: number): string => value > 26 ? col(Math.floor((value - 1) / 26)) + col((value - 1) % 26 + 1) : String.fromCharCode(64 + value)
/** String cells keep identifiers, leading zero barcodes and formula-like labels as inert text. */
export function catalogXlsx(rows: string[][]): Uint8Array<ArrayBuffer> {
 const worksheet = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((row, index) => `<row r="${index + 1}">${row.map((value, column) => `<c r="${col(column + 1)}${index + 1}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`
 return Uint8Array.from(zipSync(Object.fromEntries(Object.entries({
  '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
  '_rels/.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  'xl/workbook.xml': '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Catalog" sheetId="1" r:id="rId1"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
  'xl/worksheets/sheet1.xml': worksheet,
 }).map(([name, value]) => [name, strToU8(value)])), { level: 0 }))
}
