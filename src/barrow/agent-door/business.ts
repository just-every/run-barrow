import { installationTrust } from './trust.ts'
import { createBusinessSettings } from '../../modules/business-settings/index.ts'
import { operatorAuth, type Bindings } from '../../auth.server.ts'

/** Business binds existing native operators; it does not create a second people store. */
export function businessSettings(env: Bindings) {
 const claim=installationTrust(env)
 return createBusinessSettings({db:env.DB,trust:claim?{v:1,issuer:claim.issuer,audience:claim.appOrigin,subject:claim.installationId,keys:claim.publicKeys}:null,
  business:{settings:1,values:['display_name','owner_name','brand_color','logo','timezone'],team:{roles:{admin:'admin',member:'member'}}},
  team:operatorAuth(env).businessTeam})
}
