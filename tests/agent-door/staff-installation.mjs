import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {HOSTED_ORIGIN,serveHosted} from '../../node_modules/@runeditrun/rer/cli/hosted-output.mjs'
import {createAgentConformanceNetwork} from '../../node_modules/@runeditrun/rer/cli/agent-network.mjs'
import {signJws,policyEnvelope,autonomousPolicy,heldPolicy} from '../../node_modules/@runeditrun/rer/modules/agent-door/conformance/crypto.mjs'
import {proveStaffAdmission} from './staff-admission.mjs'
import initializeOwner from './initialize.mjs'
import initializeStaff,{staffFixtures} from './initialize-staff.mjs'
import createStaffTrust,{staffTrust} from './staff-trust.mjs'

/** A second disposable built installation keeps each sponsor's private review
 * queue separate from the generic verifier's single-person audit comparison. */
export async function staffInstallation(run) {
 const root=process.cwd(),surface=JSON.parse(await readFile('agent-surface.json','utf8'))
 const issuer='https://synthetic-barrow-business.invalid',installationId=randomUUID(),sub=randomUUID(),email=['synthetic-barrow-41','example.invalid'].join('@')
 const ring=await createStaffTrust({issuer,installationId,sub,email,publicKeys:'{}'})
 const {signer}=staffTrust(),network=await createAgentConformanceNetwork(root,surface.verification.network,{email,sponsorEmails:[43,44,45,46,47,48,49,50,51].map(n=>['synthetic-barrow-'+n,'example.invalid'].join('@'))})
 let hosted
 try {
  hosted=await serveHosted(root,{fixturePreparation:true,outboundService:request=>network.fetch(request),bindings:{
   AUTH_ORIGIN:HOSTED_ORIGIN,OWNER_EMAIL:email,SETUP_TOKEN:randomUUID()+randomUUID(),SESSION_SECRET:randomUUID(),
   RER_OWNER_CLAIM_ISSUER:issuer,RER_OWNER_CLAIM_INSTALLATION_ID:installationId,RER_OWNER_CLAIM_APP_ORIGIN:HOSTED_ORIGIN,RER_OWNER_CLAIM_PUBLIC_KEYS:ring,
   PIER_ORIGIN:HOSTED_ORIGIN,PIER_SESSION:'synthetic-barrow-pier',
  }})
  console.log('STAFF built installation started')
  const origin=hosted.origin
  const request=async(absolute,init={})=>{const url=new URL(absolute);assert.equal(url.origin,origin);const response=await hosted.fetch(url.href.slice(url.origin.length+1),{...init,origin,signal:AbortSignal.timeout(30000),headers:Object.fromEntries(new Headers(init.headers))});if(url.pathname==='/auth/owner-claim'&&response.status!==303){const body=await response.clone().json();console.error('Staff owner claim status='+response.status+' code='+(body.code??body.error?.code))}return response}
  const sign=(type,payload)=>signJws(signer.privateKey,signer.kid,type,payload)
  const iat=Math.floor(Date.now()/1000)
  const claim=await sign('rer-owner-claim+jwt',{v:1,iss:issuer,aud:origin,installationId,email,jti:randomUUID(),iat,exp:iat+300})
  const bootstrap=await initializeOwner({request,origin,email,claim:{path:'/auth/owner-claim',token:claim},token:'synthetic-barrow-pier',fixtures:network.fixtures,reviewers:{initialize:async()=>{}}})
  console.log('STAFF native owner initialized')
  const cookie=bootstrap.headers.getSetCookie().map(value=>value.split(';',1)[0]).join('; ');await bootstrap.body?.cancel()
  const owner={email,cookie,sub},team=['sales-manager','rep','operations','finance','analyst','buyer','buyer-approver','buyer-finance','buyer-admin'].map((label,i)=>({id:randomUUID(),email:['synthetic-barrow-'+(43+i),'example.invalid'].join('@'),name:label,role:'member',invite:1}))
  const settings=await sign('rer-business-settings+jwt',{v:1,iss:issuer,aud:origin,sub:installationId,business:'rer-agent-conformance',email,owner_id:sub,jti:randomUUID(),iat,exp:iat+300,rev:1,values:{},logo:null,team})
  const paired=await request(origin+'/api/rer/business-settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({settings})})
  assert.equal(paired.status,200);await paired.body?.cancel()
  console.log('STAFF Business mapping paired')
  staffFixtures.clear()
  for(const member of team) {
   const response=await initializeStaff({request,origin,email:member.email,sub:member.id,label:member.name,owner,mail:network.mailFor(member.email)})
   await response.body?.cancel();console.log('STAFF activated '+member.name)
  }
  const database=(await hosted.preparation()).database
  const context={signer,origin,business:'rer-agent-conformance',seq:0,revision:0}
  for(const [phase,document] of [['autonomous',autonomousPolicy()],['held',{...heldPolicy(),reviewers:['sponsor','role:owner']}]]) {
   const signed=await policyEnvelope(context,document)
   const response=await request(origin+'/api/rer/agent-policy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({policy:signed.policy})})
   assert.equal(response.status,200);await response.body?.cancel();context.seq=signed.payload.seq;context.revision=signed.payload.revision
   console.log('STAFF '+phase+' journey begins')
   await run({request,origin,cookie,database,phase,fixtures:network.fixtures})
  }
  await run({request,origin,cookie,database,fixtures:network.fixtures})
  await proveStaffAdmission()
 } finally {try {await hosted?.close()}finally{await network.close()}}
}
