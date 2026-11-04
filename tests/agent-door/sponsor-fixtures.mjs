import assert from 'node:assert/strict'
import {inactiveSponsor} from './initialize-inactive.mjs'

/** Only the verifier signs tokens; preparation uses the owner's native doors. */
export default async function({phase,request,origin,cookie}) {
 if(phase!=='negative')return {}
 const sponsor=inactiveSponsor()
 const headers={Cookie:cookie,Origin:origin,'Content-Type':'application/json'}
 async function person() {
  const response=await request(origin+'/auth/operators',{headers})
  assert.equal(response.status,200)
  const matches=(await response.json()).filter(row=>row.email===sponsor.email)
  assert.equal(matches.length,1)
  return matches[0]
 }
 const active=await person()
 assert.equal(active.status,'active')
 assert.equal(active.role,'admin')
 const response=await request(origin+'/auth/operator/status',{method:'POST',headers,body:JSON.stringify({operatorId:active.id,status:'inactive'})})
 assert.equal(response.status,200)
 await response.body?.cancel()
 const inactive=await person()
 assert.equal(inactive.id,active.id)
 assert.equal(inactive.role,'admin')
 assert.equal(inactive.status,'inactive')
 console.log('NATIVE PASS Business-bound admin invitation confirmed; owner deactivation persisted before the signed inactive-sponsor probe')
 return {sponsors:{inactive:sponsor}}
}
