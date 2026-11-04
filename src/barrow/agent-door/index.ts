import { accountErasureFenced } from './erasure.ts'
import { createAgentDoor } from '../../modules/agent-door/index.ts'
import { installationTrust } from './trust.ts'
import type { Bindings } from '../../auth.server.ts'
import { people,localCredential,currentScopes } from './native.ts'
import { agentRegistry } from './registry.ts'
import { registryInstructions, withRegistryInstructions } from './discovery.ts'

export const notTools=[
 {clauses:['BAR-006','MOB-001'],reason:'screen' as const},
 {clauses:['REP-002','REP-003','REP-006'],reason:'device' as const},
 {clauses:Array.from({length:21},(_,i)=>`INT-${String(i+1).padStart(3,'0')}`),reason:'connector' as const},
 {clauses:Array.from({length:9},(_,i)=>`MOVE-${String(i+1).padStart(3,'0')}`),reason:'import-door' as const},
 {clauses:['BASE-001'],reason:'installation' as const}
]
export function agentDoor(env:Bindings) {
 const trust=installationTrust(env)
 const surface=agentRegistry(env)
 return withRegistryInstructions(createAgentDoor({seed:'barrow',name:'Barrow',...surface,db:env.DB,origin:env.AUTH_ORIGIN,trust,
  erasure:{secret:env.SESSION_SECRET,fenced:(name,args,ctx)=>accountErasureFenced(env,name,args,ctx)},
  people:people(env),notTools,
  localCredentials:request=>localCredential(env,request),currentScopes:principal=>currentScopes(env,principal)
  }),registryInstructions(surface))
}
