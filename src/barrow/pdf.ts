// A plain-text PDF: US Letter pages of Helvetica lines, 48 lines a page. Characters outside printable ASCII become
// their nearest ASCII form (typographic quotes and dashes) or "?", so the text extracts exactly as written.
const ascii = (value: string) => value.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—−]/g, '-').replace(/[^\x20-\x7e]/g, '?')
const escape = (value: string) => ascii(value).replace(/[\\()]/g, '\\$&')

export function textPdf(lines: string[]): Uint8Array<ArrayBuffer> {
 const pages: string[][] = []
 for (let index = 0; index < Math.max(lines.length, 1); index += 48) pages.push(lines.slice(index, index + 48))
 const objects: string[] = ['<< /Type /Catalog /Pages 2 0 R >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>']
 const kids: string[] = []
 for (const page of pages) {
  const stream = `BT /F1 10 Tf 14 TL 54 738 Td ${page.map(line => `(${escape(line)}) Tj T*`).join(' ')} ET`
  objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
  objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${objects.length} 0 R >>`)
  kids.push(`${objects.length} 0 R`)
 }
 objects[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`
 let body = '%PDF-1.4\n'
 const offsets = objects.map((object, index) => { const at = body.length; body += `${index + 1} 0 obj\n${object}\nendobj\n`; return at })
 const xref = body.length
 body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(at => `${String(at).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
 return new TextEncoder().encode(body)
}

/** ORD-014: the same Helvetica lines with embedded JPEG product images (DCTDecode), 48 points high, in reading order. */
export type PdfEntry = string | { image: string }
export function imagePdf(entries: PdfEntry[], images: Map<string, { bytes: Uint8Array; width: number; height: number; components: 1 | 3 }>): Uint8Array<ArrayBuffer> {
 const used = [...new Set(entries.flatMap(entry => typeof entry === 'string' || !images.has(entry.image) ? [] : [entry.image]))]
 const ids = new Map(used.map((key, index) => [key, 4 + index]))
 const pages: string[][] = []
 let ops: string[] = [], y = 738
 const flush = () => { pages.push(ops); ops = []; y = 738 }
 for (const entry of entries) {
  if (typeof entry === 'string') { if (y < 54) flush(); ops.push(`BT /F1 10 Tf 54 ${y} Td (${escape(entry)}) Tj ET`); y -= 14; continue }
  const image = images.get(entry.image)
  if (!image) continue
  const height = 48, width = Math.max(1, Math.min(144, Math.round(height * image.width / image.height)))
  if (y - height < 54) flush()
  ops.push(`q ${width} 0 0 ${height} 54 ${y - height + 10} cm /Im${ids.get(entry.image)} Do Q`); y -= height + 6
 }
 if (ops.length || !pages.length) flush()
 const encoder = new TextEncoder(), chunks: Uint8Array[] = [], offsets: number[] = []
 let length = 0
 const push = (part: string | Uint8Array) => { const bytes = typeof part === 'string' ? encoder.encode(part) : part; chunks.push(bytes); length += bytes.length }
 const object = (id: number, body: string) => { offsets[id - 1] = length; push(`${id} 0 obj\n${body}\nendobj\n`) }
 const first = 4 + used.length, kids = pages.map((_, index) => `${first + index * 2 + 1} 0 R`)
 push('%PDF-1.4\n')
 object(1, '<< /Type /Catalog /Pages 2 0 R >>')
 object(2, `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`)
 object(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
 for (const key of used) {
  const image = images.get(key)!, id = ids.get(key)!
  offsets[id - 1] = length
  push(`${id} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /${image.components === 1 ? 'DeviceGray' : 'DeviceRGB'} /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`)
  push(image.bytes); push('\nendstream\nendobj\n')
 }
 const xobjects = used.map(key => `/Im${ids.get(key)} ${ids.get(key)} 0 R`).join(' ')
 pages.forEach((page, index) => {
  const stream = page.join('\n'), content = first + index * 2
  object(content, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
  object(content + 1, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >>${xobjects ? ` /XObject << ${xobjects} >>` : ''} >> /Contents ${content} 0 R >>`)
 })
 const xref = length
 push(`xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n${offsets.map(at => `${String(at).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
 const out = new Uint8Array(length)
 let offset = 0
 for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length }
 return out
}
