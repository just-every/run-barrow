import { unzipSync } from 'fflate'
import { fail } from './model'

/** Bound compressed bytes, expanded bytes, entry count and paths before inflating any entry. */
export function imageArchive(base64: unknown): { name: string; base64: string }[] {
 if (typeof base64 !== 'string' || base64.length > 28000000) fail('IMAGE_ZIP', 'Choose a ZIP archive of at most 20 MiB.', 400)
 try {
  const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0))
  let count = 0, size = 0
  const files = unzipSync(bytes, { filter: entry => {
   if (entry.name.endsWith('/')) return false
   count++; size += entry.originalSize
   if (count > 1000 || size > 30 * 1024 * 1024 || entry.originalSize > 205000 || /[\\/]/.test(entry.name)) throw new Error('limits')
   return true
  } })
  return Object.entries(files).map(([name, value]) => {
   let binary = ''
   for (let at = 0; at < value.length; at += 0x8000) binary += String.fromCharCode(...value.subarray(at, at + 0x8000))
   return { name, base64: btoa(binary) }
  })
 } catch { return fail('IMAGE_ZIP', 'Use a valid ZIP with up to 1,000 plain filenames, each at most 200 KiB, and at most 30 MiB expanded.', 400) }
}
