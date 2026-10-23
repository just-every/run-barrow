import { Problem } from '../model'
import type { SftpConfig } from './types'
const invalid = () => new Problem('SFTP_CONFIG', 'The SFTP connection settings are invalid.', 400)

export function safePath(path: string): string {
 if (typeof path !== 'string' || !path.startsWith('/') || path.length > 1024 || /[\0\\]/.test(path)) throw invalid()
 const segments = path.split('/')
 if (segments.some(segment => segment === '.' || segment === '..')) throw invalid()
 if (segments.slice(1, -1).some(segment => !segment)) throw invalid()
 return path === '/' ? path : path.replace(/\/$/, '')
}

export function settings(config: SftpConfig): string[] {
 if (!config || typeof config.host !== 'string' || !/^[a-zA-Z0-9.:[\]-]{1,253}$/.test(config.host)
  || !Number.isInteger(config.port) || config.port < 1 || config.port > 65535
  || typeof config.username !== 'string' || !config.username || config.username.length > 256 || /\0/.test(config.username)
  || typeof config.secretId !== 'string' || !config.secretId || config.secretId.length > 160
  || typeof config.hostKey !== 'string' || !/^SHA256:[A-Za-z0-9+/]{43}=?$/.test(config.hostKey)) throw invalid()
 const keys=['host','port','username','secretId','hostKey','importDirectory','exportDirectory','ackDirectory']
 if(Object.keys(config).some(key=>!keys.includes(key)))throw invalid()
 const roots=[config.importDirectory, config.exportDirectory, config.ackDirectory].map(safePath)
 if(roots.some((root,index)=>roots.some((other,otherIndex)=>index!==otherIndex&&(root===other||root==='/'||other.startsWith(root+'/')))))throw invalid()
 return roots
}

/** Only this function sees the server-held BARROW_SFTP_SECRETS binding. */
export function credential(secretId: string, secrets: string | undefined): { password?: string; privateKey?: { pem: string; passphrase?: string } } {
 const rejected = () => new Problem('SFTP_SECRET', 'The SFTP credential is unavailable or invalid.', 503)
 try {
  if (!secrets || secrets.length > 1024 * 1024) throw rejected()
  const values: unknown = JSON.parse(secrets)
  if (!values || typeof values !== 'object' || Array.isArray(values) || !Object.hasOwn(values, secretId)) throw rejected()
  const value: unknown = (values as Record<string, unknown>)[secretId]
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw rejected()
  const { password, privateKey, passphrase } = value as Record<string, unknown>
  for (const entry of [password, privateKey, passphrase]) {
   if (entry !== undefined && (typeof entry !== 'string' || !entry || entry.length > 65536)) throw rejected()
  }
  if ((!password && !privateKey) || (passphrase && !privateKey)) throw rejected()
  return {
   ...(typeof password === 'string' ? { password } : {}),
   ...(typeof privateKey === 'string' ? { privateKey: { pem: privateKey, ...(typeof passphrase === 'string' ? { passphrase } : {}) } } : {}),
  }
 } catch { throw rejected() }
}

