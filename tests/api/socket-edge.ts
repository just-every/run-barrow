// Network-edge stand-in for the TLS connection, retaining the requested IP and SNI for assertions.
// Production uses cloudflare:sockets; the app parser and destination checks run unchanged.
export function connect(address: { hostname: string; port: number }) {
 const abort = new AbortController()
 let controller: ReadableStreamDefaultController<Uint8Array>, body: ReadableStreamDefaultReader<Uint8Array> | undefined, ended = false
 let finish!: () => void
 const closed = new Promise<void>(resolve => { finish = resolve })
 const enqueue = (bytes: Uint8Array) => { if (!ended) controller.enqueue(bytes) }
 const end = () => { if (!ended) { ended = true; controller.close(); finish() } }
 const close = async () => { abort.abort(); void body?.cancel().catch(() => {}); end() }
 const readable = new ReadableStream<Uint8Array>({ start(value) { controller = value }, cancel() { void close() } })
 let hostname = ''
 const writable = new WritableStream<Uint8Array>({ async write(bytes) {
  const text = new TextDecoder().decode(bytes), path = /^GET ([^ ]+) HTTP\/1\.1\r\n/.exec(text)?.[1]
  if (!path || !hostname) throw new Error('TLS must be established before the image request')
  const headers = new Headers()
  for (const line of text.split('\r\n').slice(1).filter(Boolean)) { const at = line.indexOf(':'); headers.set(line.slice(0, at), line.slice(at + 1).trim()) }
  headers.set('x-test-socket-address', address.hostname); headers.set('x-test-tls-hostname', hostname)
  const response = await fetch('https://' + hostname + path, { headers, redirect: 'manual', signal: abort.signal })
  const rawHeaders = new Headers(response.headers)
  if (!rawHeaders.has('content-length')) rawHeaders.set('transfer-encoding', 'chunked')
  const chunked = rawHeaders.get('transfer-encoding') === 'chunked', encoder = new TextEncoder()
  enqueue(encoder.encode(`HTTP/1.1 ${response.status} Synthetic response\r\n${[...rawHeaders].map(([key, value]) => `${key}: ${value}\r\n`).join('')}\r\n`))
  body = response.body?.getReader()
  // Reads proceed independently of request writes, just as an ordinary socket does.
  void (async () => {
   try {
    while (body) { const part = await body.read(); if (part.done || ended) break; if (chunked) enqueue(encoder.encode(part.value.length.toString(16) + '\r\n')); enqueue(part.value); if (chunked) enqueue(encoder.encode('\r\n')) }
    if (chunked) enqueue(encoder.encode('0\r\n\r\n')); end()
   } catch (error) { if (!ended) { ended = true; controller.error(error); finish() } }
  })()
 } })
 const socket = { readable, writable, closed, opened: Promise.resolve({ remoteAddress: address.hostname }), close, startTls(options: { expectedServerHostname: string }) { hostname = options.expectedServerHostname; return socket } }
 return socket
}
