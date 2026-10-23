import {demoEffect} from '../../modules/demo/index.mjs'
import { connect as connectSftp, type SftpSession } from 'edgeport/sftp'
import { connect as connectSsh, type SshChannelHandle, type SshSession } from 'edgeport/ssh'
import { Problem } from '../model'
import type { SftpConfig, SftpConnection } from './types'
import { safePath, settings, credential } from './connection-settings'

export type { SftpConfig, SftpConnection } from './types'
export const SFTP_MAX_BYTES = 10 * 1024 * 1024
const TIMEOUT_MS = 15_000
const CLOSE_TIMEOUT_MS = 2_000
const LIST_BYTES = 1024 * 1024
const LIST_ENTRIES = 1000

const invalid = () => new Problem('SFTP_CONFIG', 'The SFTP connection settings are invalid.', 400)
const limited = () => new Problem('SFTP_LIMIT', 'The SFTP transfer exceeds its allowed limit.', 413)
const unavailable = () => new Problem('SFTP_FAILED', 'The SFTP operation could not be completed.', 502)
const timeout = () => new Problem('SFTP_TIMEOUT', 'The SFTP operation timed out.', 504)

async function deadline<T>(work: Promise<T>, ms: number, expired: () => void): Promise<T> {
 let timer: ReturnType<typeof setTimeout> | undefined
 try {
  return await Promise.race([work, new Promise<never>((_, reject) => {
   timer = setTimeout(() => { expired(); reject(timeout()) }, ms)
  })])
 } finally { if (timer !== undefined) clearTimeout(timer) }
}

async function fingerprint(key: Uint8Array): Promise<string> {
 const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(key)))
 return `SHA256:${btoa(String.fromCharCode(...digest)).replace(/=+$/, '')}`
}

/** Native SSH/SFTP over cloudflare:sockets; no credential or remote error escapes this boundary. */
export async function openSftp(config: SftpConfig, secrets: string | undefined): Promise<SftpConnection> {
 await demoEffect(()=>undefined,()=>{throw new Problem('SFTP_DEMO','Merchant SFTP connections are disabled in demo installations.',409)})
 const roots = settings(config)
 const auth = credential(config.secretId, secrets)
 let ssh: SshSession | undefined
 let sftp: SftpSession | undefined
 let closed = false
 let busy = false
 let hostRejected = false
 let wireBytes = 0
 let wireLimit = LIST_BYTES
 let wireExceeded = false
 const disconnect = () => {
  closed = true
  // Closing SSH independently prevents a stalled channel close from holding the socket open.
  void ssh?.close().catch(() => {})
 }
 const scopedPath = (path: string, file = false) => {
  const safe = safePath(path)
  if (!roots.some(root => safe === root || safe.startsWith(root === '/' ? '/' : `${root}/`))
   || (file && (safe === '/' || roots.includes(safe)))) throw invalid()
  return safe
 }

 try {
  const connecting = connectSsh({
   hostname: config.host, port: config.port, username: config.username, ...auth, timeoutMs: TIMEOUT_MS,
   hostKey: { async verify(_type, key) {
    const trusted = await fingerprint(key) === config.hostKey.replace(/=+$/, '')
    if (!trusted) hostRejected = true
    return trusted && !closed
   } },
  }).then(session => {
   ssh = session
   if (closed) { disconnect(); throw timeout() }
   return session
  })
  await deadline(connecting, TIMEOUT_MS, disconnect)
  const session = ssh!
  const subsystem = session.subsystem.bind(session)
  // The library's list() collects replies in memory. Bound the actual incoming subsystem
  // bytes before its parser, including long names and attributes, rather than just the result.
  session.subsystem = async name => {
   const channel = await subsystem(name)
   const header = new Uint8Array(13)
   let headerUsed = 0, headerLength = 4, remaining = 0
   const stdout = channel.stdout.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
     wireBytes += chunk.byteLength
     if (wireBytes > wireLimit) { wireExceeded = true; disconnect(); throw limited() }
     // SFTP STATUS is length/type/request-id/status. edgeport's list() treats every
     // STATUS as EOF; reject real server failures here so a failed list cannot look empty.
     let offset = 0
     while (offset < chunk.byteLength) {
      if (remaining) {
       const count = Math.min(remaining, chunk.byteLength - offset)
       remaining -= count; offset += count
       continue
      }
      const count = Math.min(headerLength - headerUsed, chunk.byteLength - offset)
      header.set(chunk.subarray(offset, offset + count), headerUsed)
      headerUsed += count; offset += count
      if (headerUsed !== headerLength) continue
      const view = new DataView(header.buffer)
      const length = view.getUint32(0)
      if (length < 5) { disconnect(); throw unavailable() }
      if (length > wireLimit) { wireExceeded = true; disconnect(); throw limited() }
      if (headerLength === 4) { headerLength = Math.min(length + 4, header.length); continue }
      if (header[4] === 101 && (length < 9 || ![0, 1].includes(view.getUint32(9)))) {
       disconnect(); throw unavailable()
      }
      remaining = length + 4 - headerLength
      headerUsed = 0; headerLength = 4
     }
     controller.enqueue(chunk)
    },
   }))
   const bounded: SshChannelHandle = {
    stdout, stderr: channel.stderr, exit: channel.exit,
    write: bytes => channel.write(bytes), eof: () => channel.eof(), close: () => channel.close(),
    [Symbol.asyncDispose]: () => channel.close(),
   }
   return bounded
  }
  sftp = await deadline(connectSftp({ session }), TIMEOUT_MS, disconnect)
 } catch {
  const wasClosed = closed
  disconnect()
  if (hostRejected) throw new Problem('SFTP_HOST_KEY', 'The SFTP server host key did not match the approved fingerprint.', 502)
  if (wireExceeded) throw limited()
  if (wasClosed) throw timeout()
  throw unavailable()
 }
 const client = sftp
 async function run<T>(limit: number, action: () => Promise<T>): Promise<T> {
  if (closed) throw new Problem('SFTP_CLOSED', 'The SFTP connection is closed.', 409)
  if (busy) throw new Problem('SFTP_BUSY', 'The SFTP connection already has an operation in progress.', 409)
  busy = true
  wireBytes = 0
  wireLimit = limit
  try { return await deadline(action(), TIMEOUT_MS, disconnect) }
  catch (error) {
   disconnect()
   if (wireExceeded) throw limited()
   if (error instanceof Problem) throw error
   throw unavailable()
  } finally { busy = false }
 }
 return {
  async list(path) {
   const safe = scopedPath(path)
   return run(LIST_BYTES, async () => {
    const entries = await client.list(safe)
    if (entries.length > LIST_ENTRIES) throw limited()
    return entries.filter(entry => entry.filename !== '.' && entry.filename !== '..').map(entry => {
     if (!entry.filename || entry.filename.length > 255 || /[/\\\0]/.test(entry.filename)) throw invalid()
     const size = entry.attrs.size ?? 0
     const modifiedAt = (entry.attrs.mtime ?? 0) * 1000
     if (!Number.isSafeInteger(size) || size < 0 || !Number.isSafeInteger(modifiedAt) || modifiedAt < 0) throw unavailable()
     return { name: entry.filename, size, modifiedAt, directory: entry.attrs.isDirectory }
    })
   })
  },
  async read(path, maxBytes = SFTP_MAX_BYTES) {
   const safe = scopedPath(path, true)
   if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > SFTP_MAX_BYTES) throw limited()
   return run(maxBytes + LIST_BYTES, async () => {
    const attrs = await client.stat(safe)
    if (attrs.isDirectory || (attrs.size !== undefined && (!Number.isSafeInteger(attrs.size) || attrs.size < 0 || attrs.size > maxBytes))) throw limited()
    const reader = client.createReadStream(safe).getReader()
    const chunks: Uint8Array[] = []
    let length = 0
    try {
     for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > maxBytes) { disconnect(); throw limited() }
      chunks.push(value)
     }
    } finally {
     // A remote handle close must not delay a size-limit refusal.
     void reader.cancel().catch(() => {})
     reader.releaseLock()
    }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return bytes
   })
  },
  async write(path, bytes) {
   const safe = scopedPath(path, true)
   if (!(bytes instanceof Uint8Array) || bytes.byteLength > SFTP_MAX_BYTES) throw limited()
   await run(LIST_BYTES, () => client.writeFile(safe, bytes))
  },
  async rename(from, to) {
   const source = scopedPath(from, true), target = scopedPath(to, true)
   await run(LIST_BYTES, () => client.rename(source, target))
  },
  async remove(path) {
   const safe = scopedPath(path, true)
   await run(LIST_BYTES, () => client.remove(safe))
  },
  async close() {
   if (closed) return
   closed = true
   await deadline(Promise.all([client.close(), ssh!.close()]), CLOSE_TIMEOUT_MS, disconnect).catch(() => {
    throw new Problem('SFTP_CLOSE', 'The SFTP connection could not be closed cleanly.', 502)
   })
  },
 }
}
