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
