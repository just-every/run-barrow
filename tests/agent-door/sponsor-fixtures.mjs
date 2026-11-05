import assert from 'node:assert/strict'
import {inactiveSponsor,inactiveSponsorSession} from './initialize-inactive.mjs'

/** Only the verifier signs tokens; preparation uses the owner's native doors. */
export default async function({phase,request,origin,cookie}) {
 if(phase!=='negative')return {}
 const sponsor=inactiveSponsor()
 const session=inactiveSponsorSession()
 const headers={Cookie:cookie,Origin:origin,'Content-Type':'application/json'}
 async function person() {
  const response=await request(origin+'/auth/operators',{headers})
  assert.equal(response.status,200)
  const matches=(await response.json()).filter(row=>row.email===sponsor.email)
  assert.equal(matches.length,1)
  return matches[0]
 }
 const active=await person()
 assert.equal(active.id,session.operatorId)
 assert.equal(active.status,'active')
 assert.equal(active.role,'admin')
 const response=await request(origin+'/auth/operator/status',{method:'POST',headers,body:JSON.stringify({operatorId:active.id,status:'inactive'})})
 assert.equal(response.status,200)
 await response.body?.cancel()
 const inactive=await person()
 assert.equal(inactive.id,active.id)
 assert.equal(inactive.role,'admin')
 assert.equal(inactive.status,'inactive')
 const inactiveHeaders={Cookie:session.cookie,Origin:origin}
 const signedOut=await request(origin+'/auth/session',{headers:inactiveHeaders})
 assert.equal(signedOut.status,401)
 assert.deepEqual(await signedOut.json(),{error:'unauthenticated'})
 const refused=await request(origin+'/agents/api/state',{headers:inactiveHeaders})
 assert.equal(refused.status,401)
 assert.deepEqual(await refused.json(),{code:'unauthenticated'})
 console.log('NATIVE PASS same confirmed Business-bound admin deactivated; existing native session and agent controls refuse before the signed inactive-sponsor probe')
 return {sponsors:{inactive:sponsor}}
}
