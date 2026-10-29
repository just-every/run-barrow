import assert from 'node:assert/strict'

let session
export function takeLocalAdmin() { const value=session;session=undefined;return value }

/** Native invitation and confirmation, with only the sending edge isolated. */
export default async function({request,origin,email,owner,mail}) {
 const invitation=await request(origin+'/auth/invite',{method:'POST',headers:{Cookie:owner.cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email,displayName:'Avery stock operator',role:'admin',returnTo:'/app'})})
 assert.equal(invitation.status,202);await invitation.body?.cancel()
 const messages=await mail.read(),message=messages.at(-1)
 const match=message?.text.match(/https?:\/\/[^\s<>]+\/auth\/confirm\?token=[^\s<>]+/)
 const link=new URL(match?.[0]??message?.html.match(/href="([^"]*\/auth\/confirm\?token=[^"]+)"/)?.[1]?.replaceAll('&amp;','&'))
 assert.equal(link.origin,origin)
 const response=await request(origin+'/auth/confirm',{method:'POST',redirect:'manual',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({token:link.searchParams.get('token')})})
 assert.equal(response.status,303)
 session={email,cookie:response.headers.getSetCookie().map(value=>value.split(';',1)[0]).join('; ')}
 return response
}
