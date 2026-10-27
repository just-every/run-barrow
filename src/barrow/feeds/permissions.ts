import { digest } from '../digest'
import { fail } from '../model'
import { canonicalJson } from '../imports/delta-store'
import { openSftp } from './transport'
import type { FeedConfiguration } from './layout'
/** Explicit owner consent authorizes only this non-order probe, removed before success. */
export async function checkFeedPermissions(config:FeedConfiguration,secrets:string|undefined,at:string) {
 const connection=await openSftp(config.connection,secrets)
 const path=config.connection.exportDirectory.replace(/\/$/,'')+'/.barrow-permission-'+crypto.randomUUID()+'.tmp'
 let created=false
 try {
  await connection.list(config.connection.importDirectory)
  await connection.list(config.connection.ackDirectory)
  const bytes=new TextEncoder().encode('Barrow connection permission check. This is not an order.')
  created=true;await connection.write(path,bytes)
  const received=await connection.read(path,1024)
  if(new TextDecoder().decode(received)!==new TextDecoder().decode(bytes))fail('FEED_PERMISSION','The permission-test file did not round-trip unchanged.',502)
  await connection.remove(path);created=false
  return {configHash:await digest(canonicalJson(config)),checkedAt:at,read:true,write:true,removed:true}
 } finally {
  if(created)await connection.remove(path).catch(()=>{})
  await connection.close()
 }
}
