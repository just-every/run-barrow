import { Buffer } from 'node:buffer'
import { fail } from '../model'

const refuse = (message: string): never => fail('IMPORT_XLS', message, 400)
const maximum = 1048576
const view = (data: Uint8Array) => new DataView(data.buffer, data.byteOffset, data.byteLength)
const uint16 = (data: Uint8Array, at: number) => view(data).getUint16(at, true)
const uint32 = (data: Uint8Array, at: number) => view(data).getUint32(at, true)
const int32 = (data: Uint8Array, at: number) => view(data).getInt32(at, true)
const double = (data: Uint8Array, at: number) => view(data).getFloat64(at, true)
const decode = (data: Uint8Array, encoding: string) => new TextDecoder(encoding).decode(data)
/** Read the values in an ordinary BIFF8 workbook; never evaluate a formula or active content. */
export function binaryWorkbook(file: { name: string; base64: string }) {
 try {
  if (!/^[^\\/]+\.xls$/i.test(file.name) || typeof file.base64 !== 'string' || file.base64.length > 1398104) refuse('Supply a plain XLS filename and a workbook of at most 1 MiB.')
  const bytes = Buffer.from(file.base64, 'base64')
  if (bytes.length > maximum || bytes.toString('base64') !== file.base64 || bytes.subarray(0, 8).toString('hex') !== 'd0cf11e0a1b11ae1') refuse('Supply a canonical, unencrypted Excel 97–2003 XLS workbook.')
  const u16 = (at: number) => uint16(bytes, at), u32 = (at: number) => uint32(bytes, at)
  const major = u16(26), sectorSize = 2 ** u16(30), end = 0xfffffffe
  if (u16(28) !== 0xfffe || ![3, 4].includes(major) || sectorSize !== (major === 3 ? 512 : 4096) || u16(32) !== 6 || bytes.length % sectorSize) refuse('Unsupported XLS compound document layout.')
  const sectors = bytes.length / sectorSize - 1
  const sector = (id: number) => { if (!Number.isInteger(id) || id < 0 || id >= sectors) refuse('Invalid XLS sector reference.'); return bytes.subarray((id + 1) * sectorSize, (id + 2) * sectorSize) }
  const fatSectors: number[] = []
  for (let at = 76; at < 512; at += 4) if (u32(at) !== 0xffffffff) fatSectors.push(u32(at))
  let difat = u32(68)
  const visited = new Set<number>()
  if (u32(72) > sectors) refuse('Invalid XLS directory allocation.')
  for (let n = 0; n < u32(72); n++) {
   if (visited.has(difat)) refuse('Cyclic XLS directory allocation.')
   visited.add(difat)
   const data = sector(difat)
   for (let at = 0; at < sectorSize - 4; at += 4) if (uint32(data, at) !== 0xffffffff) fatSectors.push(uint32(data, at))
   difat = uint32(data, sectorSize - 4)
  }
  if (fatSectors.length !== u32(44) || fatSectors.length > sectors || new Set(fatSectors).size !== fatSectors.length) refuse('Invalid XLS allocation table.')
  const fat = Buffer.concat(fatSectors.map(sector))
  function chain(start: number, allocation: Buffer, chunk: (id: number) => Buffer, bound: number) {
   const seen = new Set<number>(), parts: Buffer[] = []
   for (let id = start; id !== end; id = uint32(allocation, id * 4)) {
    if (id >= allocation.length / 4 || seen.has(id) || seen.size >= bound) refuse('Invalid or cyclic XLS stream.')
    seen.add(id); parts.push(chunk(id))
   }
   return Buffer.concat(parts)
  }
  const directory = chain(u32(48), fat, sector, sectors), entries: Array<{ name: string; type: number; start: number; size: number }> = []
  for (let at = 0; at + 128 <= directory.length; at += 128) {
   const type = directory[at + 66]
   if (!type) continue
   const length = uint16(directory, at + 64)
   if (length < 2 || length > 64 || length % 2 || uint32(directory, at + 124) !== 0) refuse('Invalid XLS stream directory.')
   const entry = { name: decode(directory.subarray(at, at + length - 2), 'utf-16le'), type, start: uint32(directory, at + 116), size: uint32(directory, at + 120) }
   if (entry.size > maximum || /vba|project|macros|objectpool/i.test(entry.name)) refuse('Export an XLS workbook without macros or embedded objects.')
   entries.push(entry)
  }
  const books = entries.filter(entry => entry.type === 2 && ['Workbook', 'Book'].includes(entry.name)), root = entries.find(entry => entry.type === 5)
  if (books.length !== 1 || !root) refuse('Expected exactly one XLS workbook stream.')
  const book = books[0]
  let workbook: Buffer
  if (book.size < 4096) {
   if (u32(56) !== 4096 || u32(64) > sectors) refuse('Invalid XLS small-stream allocation.')
   const miniFat = chain(u32(60), fat, sector, sectors), miniStream = chain(root!.start, fat, sector, sectors).subarray(0, root!.size)
   workbook = chain(book.start, miniFat, id => { if (id * 64 + 64 > miniStream.length) refuse('Invalid XLS small-stream reference.'); return miniStream.subarray(id * 64, id * 64 + 64) }, Math.ceil(maximum / 64))
  } else workbook = chain(book.start, fat, sector, sectors)
  if (workbook.length < book.size) refuse('Truncated XLS workbook stream.')
  workbook = workbook.subarray(0, book.size)
  return sheets(workbook)
 } catch (error) {
  if (error instanceof Error && 'code' in error && error.code === 'IMPORT_XLS') throw error
  return refuse('The XLS workbook is invalid or exceeds the supported bounds. Export values without formulas, macros or external links.')
 }
}

type RecordValue = { id: number; at: number; data: Buffer }
function records(bytes: Buffer) {
 const result: RecordValue[] = []
 for (let at = 0; at < bytes.length;) {
  if (at + 4 > bytes.length) { if (!bytes.subarray(at).some(Boolean)) break; refuse('Truncated XLS record.') }
  const id = uint16(bytes, at), length = uint16(bytes, at + 2)
  if (!id && !length && !bytes.subarray(at).some(Boolean)) break
  if (length > 8224 || at + 4 + length > bytes.length || result.length > 100000) refuse('Invalid XLS record size.')
  if ([0x0006, 0x002f, 0x0023, 0x01ae, 0x0017, 0x01b8].includes(id)) refuse('Export XLS values without formulas, encryption, external links or hyperlinks.')
  result.push({ id, at, data: bytes.subarray(at + 4, at + 4 + length) }); at += 4 + length
 }
 return result
}
function stringReader(parts: Buffer[]) {
 let part = 0, offset = 0
 const advance = () => { while (part < parts.length && offset === parts[part].length) { part++; offset = 0 } if (part >= parts.length) refuse('Truncated XLS text.') }
 const byte = () => { advance(); return parts[part][offset++] }
 const short = () => byte() + byte() * 256
 const uint = () => short() + short() * 65536
 function text() {
  const length = short(), flags = byte(), rich = flags & 8 ? short() : 0, extension = flags & 4 ? uint() : 0
  if (length > 8000 || extension > maximum || flags & 0xf2) refuse('Unsupported XLS text size or encoding.')
  let wide = Boolean(flags & 1), value = ''
  for (let i = 0; i < length; i++) {
   if (offset === parts[part].length) { advance(); const continuation = byte(); if (continuation > 1) refuse('Invalid continued XLS text.'); wide = Boolean(continuation) }
   value += String.fromCharCode(wide ? short() : byte())
  }
  for (let n = 0; n < rich * 4 + extension; n++) byte()
  return value
 }
 return { uint, text }
}
function sheets(bytes: Buffer) {
 const all = records(bytes), first = all[0]
 if (!first || first.id !== 0x0809 || uint16(first.data, 0) !== 0x0600 || uint16(first.data, 2) !== 5) refuse('Only Excel 97–2003 BIFF8 exports are supported.')
 const globals = all.slice(0, all.findIndex(record => record.id === 0x000a) + 1)
 const shared: string[] = [], formats = new Map<number, string>(), xfs: number[] = []
 let epoch = Date.UTC(1899, 11, 30)
 for (let i = 0; i < globals.length; i++) {
  const { id, data } = globals[i]
  if (id === 0x0022 && uint16(data, 0)) epoch = Date.UTC(1904, 0, 1)
  if (id === 0x00e0) xfs.push(uint16(data, 2))
  if (id === 0x041e) formats.set(uint16(data, 0), stringReader([data.subarray(2)]).text())
  if (id === 0x00fc) {
   const parts = [data]; while (globals[i + 1]?.id === 0x003c) parts.push(globals[++i].data)
   const reader = stringReader(parts); reader.uint(); const count = reader.uint()
   if (count > 50100) refuse('XLS contains too many distinct cell values.')
   for (let n = 0; n < count; n++) shared.push(reader.text())
  }
 }
 const bounds = globals.filter(record => record.id === 0x0085).map(({ data }) => {
  if (data[5] !== 0) refuse('Only ordinary worksheets may be imported.')
  const length = data[6], wide = data[7] & 1, name = decode(data.subarray(8, 8 + length * (wide ? 2 : 1)), wide ? 'utf-16le' : 'windows-1252')
  return { at: uint32(data, 0), name }
 })
 if (!bounds.length || bounds.length > 32 || new Set(bounds.map(sheet => sheet.name)).size !== bounds.length) refuse('XLS worksheets must have distinct names.')
 const numeric = (value: number, xf: number) => {
  if (!Number.isFinite(value)) refuse('Invalid XLS numeric value.')
  const format = xfs[xf], custom = (formats.get(format) ?? '').replace(/"[^"]*"|\\./g, '')
  if (format >= 14 && format <= 22 || /[yd]/i.test(custom)) {
   const date = new Date(epoch + Math.round(value * 86400000))
   if (!Number.isFinite(date.getTime())) refuse('Invalid XLS date.')
   return Number.isInteger(value) ? date.toISOString().slice(0, 10) : date.toISOString()
  }
  return String(value)
 }
 const rk = (data: Buffer, at: number) => {
  const raw = int32(data, at)
  let value: number
  if (raw & 2) value = raw >> 2
  else { const buffer = Buffer.alloc(8); view(buffer).setInt32(4, raw & ~3, true); value = double(buffer, 0) }
  return raw & 1 ? value / 100 : value
 }
 return bounds.map(sheet => {
  const start = all.findIndex(record => record.at === sheet.at), begin = all[start]
  if (start < 0 || begin.id !== 0x0809 || uint16(begin.data, 2) !== 0x0010) refuse('Invalid XLS worksheet location.')
  const rows: string[][] = [], occupied = new Set<string>()
  const put = (row: number, column: number, value: string) => {
   if (row > 500 || column > 99 || value.length > 8000 || occupied.has(`${row}:${column}`)) refuse('XLS is limited to 500 data rows and 100 distinct columns per sheet.')
   occupied.add(`${row}:${column}`); (rows[row] ??= [])[column] = value
  }
  for (let i = start + 1; i < all.length && all[i].id !== 0x000a; i++) {
   const { id, data } = all[i]
   if (![0x00fd, 0x0203, 0x027e, 0x00bd, 0x0205, 0x0204].includes(id)) continue
   const row = uint16(data, 0), column = uint16(data, 2), xf = uint16(data, 4)
   if (id === 0x00fd) { const index = uint32(data, 6); if (index >= shared.length) refuse('Invalid XLS shared text.'); put(row, column, shared[index]) }
   if (id === 0x0203) put(row, column, numeric(double(data, 6), xf))
   if (id === 0x027e) put(row, column, numeric(rk(data, 6), xf))
   if (id === 0x00bd) {
    const last = uint16(data, data.length - 2)
    if (last < column || data.length !== 6 + (last - column + 1) * 6) refuse('Invalid XLS numeric row.')
    for (let col = column; col <= last; col++) { const at = 4 + (col - column) * 6; put(row, col, numeric(rk(data, at + 2), uint16(data, at))) }
   }
   if (id === 0x0205) { if (data[7]) refuse('Resolve Excel cell errors before import.'); put(row, column, data[6] ? 'true' : 'false') }
   if (id === 0x0204) put(row, column, stringReader([data.subarray(6)]).text())
  }
  return { sheet: sheet.name, data: Array.from({ length: rows.length }, (_, row) => Array.from({ length: rows[0]?.length ?? 0 }, (_, column) => rows[row]?.[column] ?? '')) }
 })
}
