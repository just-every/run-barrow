import assert from 'node:assert/strict'

let identity
export function inactiveSponsor() {
 assert.ok(identity,'The negative sponsor must complete native initialization')
 return {...identity}
}

/** Confirm the native invitation created by the signed Business roster. */
export default async function({request,origin,email,sub,mail}) {
 identity=undefined
 const messages=await mail.read(),message=messages.at(-1)
 const match=message?.text.match(/https?:\/\/[^\s<>]+\/auth\/confirm\?token=[^\s<>]+/)
 const link=new URL(match?.[0]??message?.html.match(/href="([^"]*\/auth\/confirm\?token=[^"]+)"/)?.[1]?.replaceAll('&amp;','&'))
 assert.equal(link.origin,origin)
 assert.ok(link.searchParams.get('token'))
 const response=await request(origin+'/auth/confirm',{method:'POST',redirect:'manual',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({token:link.searchParams.get('token')})})
 assert.equal(response.status,303)
 const cookie=response.headers.getSetCookie().map(value=>value.split(';',1)[0]).join('; ')
 assert.ok(cookie)
 const headers={Cookie:cookie,Origin:origin}
 const session=await request(origin+'/auth/session',{headers})
 assert.equal(session.status,200)
 const {operator}=await session.json()
 assert.equal(operator.email,email)
 assert.equal(operator.status,'active')
 assert.equal(operator.role,'admin')
 // Paired installations derive this admission from the durable Business binding.
 const state=await request(origin+'/agents/api/state',{headers})
 assert.equal(state.status,200)
 await state.body?.cancel()
 identity={sub,email:operator.email}
 return response
}
