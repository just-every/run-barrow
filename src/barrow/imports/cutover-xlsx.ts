import { Buffer } from 'node:buffer';
import { inflateSync, zipSync } from 'fflate/browser';
import { fail as problem } from '../model';
const maxRows=5000,maxExpanded=8*1024*1024;
function fail(code:string,message:string):never {problem(`CUTOVER_${code}`,message,400)}

/** Inspect XML before the reader can substitute cached formula results or allocate sparse rows. */
export function inspectWorkbook(bytes: Buffer): ArrayBuffer {
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), u16 = (offset: number) => view.getUint16(offset, true), u32 = (offset: number) => view.getUint32(offset, true);
    let end = bytes.length - 22;
    while (end >= Math.max(0, bytes.length - 65557) && u32(end) !== 0x06054b50) end--;
    if (end < 0 || u32(end) !== 0x06054b50 || end + 22 + u16(end + 20) !== bytes.length) fail('XLSX', 'Workbook must be an ordinary XLSX ZIP archive.');
    const count = u16(end + 10), start = u32(end + 16);
    if (!count || count > 512 || u16(end + 4) || u16(end + 6) || u16(end + 8) !== count || start + u32(end + 12) !== end) fail('XLSX', 'Split, ZIP64 or oversized XLSX archives are unsupported.');
    let cursor = start, expanded = 0, rows = 0;
    const entries: Record<string, Uint8Array> = Object.create(null);
    const names = new Set<string>(), spans: { start: number; end: number; descriptor: boolean }[] = [];
    for (let index = 0; index < count; index++) {
      if (u32(cursor) !== 0x02014b50) fail('XLSX', 'Invalid workbook ZIP directory.');
      const flags = u16(cursor + 8), method = u16(cursor + 10), size = u32(cursor + 20), length = u32(cursor + 24);
      const nameLength = u16(cursor + 28), local = u32(cursor + 42);
      const name = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
      if (names.has(name) || /(?:^|\/)\.\.(?:\/|$)|\\/.test(name) || name.startsWith('/') || flags & 1 || ![0, 8].includes(method) || u32(local) !== 0x04034b50 || u16(local + 6) !== flags || u16(local + 8) !== method) fail('XLSX', 'Unsupported or ambiguous workbook ZIP entry.');
      names.add(name); expanded += length;
      if (expanded > maxExpanded) fail('SIZE', 'Workbook expanded content exceeds 8 MiB.');
      if (/vbaProject|externalLinks|activeX|embeddings|macrosheets/i.test(name)) fail('ACTIVE', 'Export a values-only workbook without macros or external workbook links.');
      const localNameLength = u16(local + 26), data = local + 30 + localNameLength + u16(local + 28);
      if (new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(local + 30, local + 30 + localNameLength)) !== name || data + size > start) fail('XLSX', 'Invalid workbook ZIP entry bounds.');
      const content = method === 8 ? inflateSync(bytes.subarray(data, data + size), { out: new Uint8Array(length + 1) }) : bytes.subarray(data, data + size);
      if (content.length !== length) fail('XLSX', 'Workbook ZIP entry size differs from its directory.');
      entries[name] = content;
      spans.push({ start: local, end: data + size, descriptor: !!(flags & 8) });
      if (/\.xml(?:\.rels)?$/i.test(name)) {
        const xml = new TextDecoder('utf-8', { fatal: true }).decode(content);
        if (xml.includes('\0')) fail('XLSX', 'Workbook XML must use UTF-8 encoding.');
        if (/<!DOCTYPE|<!ENTITY|<(?:[\w.-]+:)?f(?:\s|\/?>)/i.test(xml)) fail('FORMULA', 'Export workbook values without formulas or XML entities; cached formula values are not accepted.');
        if (/\bTargetMode\s*=\s*["']External["']/i.test(xml)) fail('ACTIVE', 'External workbook relationships are not accepted.');
        rows += [...xml.matchAll(/<(?:[\w.-]+:)?row(?:\s|>)/g)].length;
        if (rows > maxRows + 32) fail('ROWS', 'Workbook exceeds 5000 data rows.');
        for (const match of xml.matchAll(/<(?:[\w.-]+:)?(?:c|row|dimension)\b[^>]*\b(?:r|ref)\s*=\s*["']([^"']+)["']/g)) {
          for (const reference of match[1].split(':')) {
            const address = /^([A-Z]*)(\d+)$/.exec(reference);
            if (!address) fail('XLSX', 'Invalid worksheet cell address.');
            const col = [...address[1]].reduce((n, char) => n * 26 + char.charCodeAt(0) - 64, 0);
            if (Number(address[2]) < 1 || Number(address[2]) > maxRows + 1 || col > 256) fail('ROWS', 'Workbook is limited to 5001 worksheet rows and 256 columns.');
          }
        }
      }
      cursor += 46 + nameLength + u16(cursor + 30) + u16(cursor + 32);
    }
    spans.sort((a, b) => a.start - b.start);
    if (cursor !== end || spans[0].start !== 0) fail('XLSX', 'Invalid workbook ZIP layout.');
    for (const [index, span] of spans.entries()) {
      const next = spans[index + 1]?.start ?? start, gap = next - span.end;
      if (span.descriptor ? ![12, 16].includes(gap) : gap !== 0) fail('XLSX', 'Unlisted or overlapping workbook ZIP entries are not accepted.');
    }
    // Stored entries keep universal's unzip on its synchronous path in Workers.
    return Uint8Array.from(zipSync(entries, { level: 0 })).buffer;
  } catch (error) {
    if (error instanceof Error && 'code' in error && String(error.code).startsWith('CUTOVER_')) throw error;
    fail('XLSX', 'Workbook ZIP/XML content is invalid or exceeds the supported size.');
  }
}

