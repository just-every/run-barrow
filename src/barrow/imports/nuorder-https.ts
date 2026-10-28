import { connect } from 'cloudflare:sockets'
import { Buffer } from 'node:buffer'
import { isIP } from 'node:net'

const transferLimit = 204 * 1024
const problem = (reason: string): never => { throw new Error('Image retrieval ' + reason) }
function publicAddress(address: string) {
 if (isIP(address) === 4) {
  const [a, b, c] = address.split('.').map(Number)
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 100 && b >= 64 && b <= 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0 || b === 88 && c === 99) || a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) || a === 203 && b === 0 && c === 113)
 }
 if (isIP(address) !== 6) return false
 const words = address.toLowerCase().split(':'), first = parseInt(words[0], 16), second = parseInt(words[1] || '0', 16)
 return first >= 0x2000 && first < 0x4000 && first !== 0x2002 && first !== 0x3fff && !(first === 0x2001 && (second < 0x0200 || second === 0x0db8))
}
async function destinations(host: string, signal: AbortSignal) {
 const records = await Promise.all(['A', 'AAAA'].map(async type => {
  const query = new URL('https://cloudflare-dns.com/dns-query'); query.searchParams.set('name', host); query.searchParams.set('type', type)
  const response = await fetch(query, { headers: { accept: 'application/dns-json' }, redirect: 'manual', signal })
  if (response.status !== 200 || !response.body) problem('could not verify the public destination')
  const reader = response.body!.getReader(), chunks: Uint8Array[] = []; let length = 0
  try {
   while (true) { const next = await reader.read(); if (next.done) break; length += next.value.length; if (length > 65536) problem('could not verify the public destination'); chunks.push(next.value) }
  } finally { void reader.cancel().catch(() => {}) }
  const answer = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { Status: number; Answer?: Array<{ type: number; data: string }> }
  if (![0, 3].includes(answer.Status) || answer.Answer && !Array.isArray(answer.Answer)) problem('could not verify the public destination')
  return (answer.Answer ?? []).filter(record => [1, 28].includes(record.type)).map(record => record.data)
 }))
 const addresses = [...new Set(records.flat())]
 if (!addresses.length || addresses.some(address => !publicAddress(address))) problem('refused a non-public destination')
 return addresses
}
function imageBody(raw: Uint8Array) {
 const bytes = Buffer.from(raw), split = bytes.indexOf('\r\n\r\n')
 if (split < 0 || split > 16384) problem('returned invalid HTTP headers')
 const lines = bytes.subarray(0, split).toString().split('\r\n'), status = /^HTTP\/1\.[01] ([0-9]{3})(?: |$)/.exec(lines.shift() ?? '')
 if (!status) problem('returned an invalid HTTP response')
 if (status![1] !== '200') problem('returned HTTP ' + status![1])
 const headers = new Map<string, string>()
 for (const line of lines) {
  const match = /^([!#$%&'*+.^_`|~0-9A-Za-z-]+):[ \t]*([^\r\n]*)$/.exec(line)
  if (!match || headers.has(match[1].toLowerCase())) problem('returned ambiguous HTTP headers')
  headers.set(match![1].toLowerCase(), match![2].trim())
 }
 if (headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'image/jpeg') problem('did not return a JPEG')
 if (headers.has('content-encoding') && headers.get('content-encoding') !== 'identity') problem('returned an unsupported content encoding')
 const body = bytes.subarray(split + 4), transfer = headers.get('transfer-encoding'), length = headers.get('content-length')
 if (body.length > transferLimit || length && (!/^\d+$/.test(length) || Number(length) > transferLimit)) problem('exceeds the transferred-byte limit')
 if (transfer) {
  if (transfer.toLowerCase() !== 'chunked' || length) problem('returned ambiguous HTTP framing')
  const parts: Uint8Array[] = []; let cursor = 0
  while (cursor < body.length) {
   const end = body.indexOf('\r\n', cursor), line = body.subarray(cursor, end).toString()
   if (end < cursor || !/^[0-9a-f]{1,8}(?:;[^\r\n]*)?$/i.test(line)) problem('returned invalid chunk framing')
   const size = parseInt(line, 16); cursor = end + 2
   if (!size) {
    const trailers = body.subarray(cursor).toString()
    if (trailers !== '\r\n' && !trailers.endsWith('\r\n\r\n')) problem('returned a truncated JPEG')
    return Buffer.concat(parts).toString('base64')
   }
   if (cursor + size + 2 > body.length || body[cursor + size] !== 13 || body[cursor + size + 1] !== 10) problem('returned a truncated JPEG')
   parts.push(body.subarray(cursor, cursor + size)); cursor += size + 2
  }
  problem('returned a truncated JPEG')
 }
 if (length && Number(length) !== body.length) problem('returned a truncated JPEG')
 return Buffer.from(body).toString('base64')
}
/** Resolve before connecting, then pin the TLS socket to that public address with the original SNI. */
export async function retrieveNuorderImage(url: URL, approved: Map<string, Promise<string[]>>) {
 const controller = new AbortController()
 let socket: ReturnType<typeof connect> | undefined, reader: ReadableStreamDefaultReader<Uint8Array> | undefined, timer: ReturnType<typeof setTimeout> | undefined
 const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); void socket?.close().catch(() => {}); reject(new Error('Image retrieval exceeded five seconds')) }, 5000) })
 try {
  return await Promise.race([timeout, (async () => {
   let resolution=approved.get(url.hostname)
   if(!resolution){resolution=destinations(url.hostname,controller.signal);approved.set(url.hostname,resolution)}
   const addresses = await resolution
   if (controller.signal.aborted) problem('exceeded five seconds')
   socket = connect({ hostname: addresses[0], port: 443 }, { secureTransport: 'starttls', allowHalfOpen: false })
   void socket.closed.catch(() => {}); await socket.opened
   socket = socket.startTls({ expectedServerHostname: url.hostname }); void socket.closed.catch(() => {}); await socket.opened
   if (controller.signal.aborted) problem('exceeded five seconds')
   const writer = socket.writable.getWriter()
   await writer.write(new TextEncoder().encode(`GET ${url.pathname} HTTP/1.1\r\nHost: ${url.hostname}\r\nAccept: image/jpeg\r\nAccept-Encoding: identity\r\nConnection: close\r\n\r\n`)); writer.releaseLock()
   reader = socket.readable.getReader()
   const chunks: Uint8Array[] = []; let size = 0, headerLength = -1
   while (true) {
    const next = await reader.read(); if (next.done) break
    size += next.value.length
    if (size > transferLimit + 16388) problem('exceeds the transferred-byte limit')
    chunks.push(next.value)
    if (headerLength < 0) {
     const current = Buffer.concat(chunks), split = current.indexOf('\r\n\r\n')
     if (split < 0 && size > 16384 || split > 16384) problem('returned invalid HTTP headers')
     if (split >= 0) {
      headerLength = split + 4
      const header = Buffer.from(current.subarray(0, split)).toString()
      const status = /^HTTP\/1\.[01] ([0-9]{3})(?: |\r\n)/.exec(header)
      if (!status || status[1] !== '200') problem(status ? 'returned HTTP ' + status[1] : 'returned an invalid HTTP response')
      const declared = /\r\ncontent-length:\s*(\d+)\s*(?:\r\n|$)/i.exec(header)
      if (declared && Number(declared[1]) > transferLimit) problem('exceeds the transferred-byte limit')
     }
    }
    if (headerLength >= 0 && size - headerLength > transferLimit) problem('exceeds the transferred-byte limit')
   }
   return imageBody(Buffer.concat(chunks))
  })()])
 } finally {
  if (timer) clearTimeout(timer)
  controller.abort(); void reader?.cancel().catch(() => {}); void socket?.close().catch(() => {})
 }
}
