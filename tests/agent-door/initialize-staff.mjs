import assert from 'node:assert/strict'
export const staffFixtures=new Map()
export const staffPolicy=(role,accounts=[])=>({role,accounts,warehouses:[],reports:[],discountLimitCents:0,stockExceptionLimitCents:0})
/** The owner grants staff work; the invited person consumes their actual mail. */
export default async function({request,origin,email,sub,label,owner,mail}) {
 const headers={Cookie:owner.cookie,Origin:origin,'Content-Type':'application/json'}
 async function command(type,payload) {
  const response=await request(origin+'/api/barrow/commands',{method:'POST',headers,body:JSON.stringify({type,payload})})
  assert.equal(response.status,200,'Staff fixture '+type);return (await response.json()).result
 }
 if(label==='sales-manager') {
  const selected=await(await request(origin+'/api/barrow/accounts/by-id/juniper',{headers})).json()
  await command('account.save',{id:'staff-other',value:{...selected.value,pierCustomerId:'custody-review',name:'Synthetic second market',email:['synthetic-barrow-42','example.invalid'].join('@'),prices:[{sku:'LINEN',unitCents:3100,minQty:1}]}})
 }
 const policy=staffPolicy(label,label==='sales-manager'?['juniper']:[])
 const grant=await command('staff.invite',{email,name:'Synthetic '+label,policy,reason:'Owner reviewed native sales scope.'})
 const message=(await mail.read()).at(-1)
 const href=message?.text.match(/https?:\/\/[^\s<>]+\/auth\/confirm\?token=[^\s<>]+/)?.[0]??message?.html.match(/href="([^"]*\/auth\/confirm\?token=[^"]+)"/)?.[1]?.replaceAll('&amp;','&')
 assert.ok(href,'Actual native staff invitation')
 const response=await request(origin+'/auth/confirm',{method:'POST',redirect:'manual',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({token:new URL(href).searchParams.get('token')})})
 assert.equal(response.status,303)
 const cookie=response.headers.getSetCookie().map(value=>value.split(';',1)[0]).join('; ')
 const roster=await(await request(origin+'/auth/operators',{headers})).json(),name=roster.find(person=>person.id===grant.userId).displayName
 staffFixtures.set(label,{email,sub,cookie,grant,policy,name})
 return response
}
