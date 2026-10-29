import type { Bindings } from '../../auth.server.ts'
import type { Trust } from '../../modules/agent-door/types.ts'
/** Agent access and Business binding use the installation's existing claim ring. */
export function installationTrust(env:Bindings):Trust|null {
 return env.RER_OWNER_CLAIM_PUBLIC_KEYS?{issuer:env.RER_OWNER_CLAIM_ISSUER??'',installationId:env.RER_OWNER_CLAIM_INSTALLATION_ID??'',appOrigin:env.AUTH_ORIGIN,publicKeys:JSON.parse(env.RER_OWNER_CLAIM_PUBLIC_KEYS)}:null
}
