import type { Bindings } from '../../auth.server'
import { audit, commit } from '../access'
import { digest } from '../digest'
import { fail, text, type Actor } from '../model'
import { openSftp } from './transport'
import type { SftpConfig } from './types'

/** Read-only prerequisite check. It grants no feed authority and performs no
 * migration, inventory handoff or outbound order publication. */
export async function probeSftp(env:Bindings,actor:Actor,input:{config:SftpConfig;consent:boolean;reason:string}) {
 if(actor.agent||actor.role!=='owner'||actor.staff)fail('FORBIDDEN','Only the signed-in owner may test a merchant SFTP destination.',403)
 if(input?.consent!==true)fail('SFTP_CONSENT','Explicitly authorize this destination and pinned host key before connecting.',400)
 const reason=text(input.reason,'Destination test reason',500)
 const connection=await openSftp(input.config,env.BARROW_SFTP_SECRETS)
 try {
  const directories=[]
  for(const [kind,path] of Object.entries({imports:input.config.importDirectory,exports:input.config.exportDirectory,acknowledgments:input.config.ackDirectory})) {
   const files=await connection.list(path)
   directories.push({kind,path,files})
  }
  const revision=await digest(JSON.stringify(input.config))
  await commit(env.DB,actor,[audit(env.DB,actor,`sftp:${revision}`,'feed.destination-tested',{revision,source:'feed.probe',reason})])
  return {hostKeyVerified:true,destination:`${input.config.host}:${input.config.port}`,directories,authority:'Read-only destination test; no feed or inventory authority granted'}
 } finally {await connection.close()}
}
