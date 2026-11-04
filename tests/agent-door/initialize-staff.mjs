import assert from 'node:assert/strict'
export const staffFixtures=new Map()
export const staffPolicy=(role,accounts=[])=>({role,accounts,warehouses:[],reports:[],discountLimitCents:0,stockExceptionLimitCents:0})
/** Activate Native identity, then consume the separately scoped company invitation. */
export default async function({request,origin,email,sub,label,owner,mail}) {
 const headers={Cookie:owner.cookie,Origin:origin,'Content-Type':'application/json'}
 async function command(type,payload,as=owner.cookie) {
  const response=await request(origin+'/api/barrow/commands',{method:'POST',headers:{...headers,Cookie:as},body:JSON.stringify({type,payload})})
  assert.equal(response.status,200,'Staff fixture '+type);return (await response.json()).result
 }
 if(label==='sales-manager') {
  const selected=await(await request(origin+'/api/barrow/accounts/by-id/juniper',{headers})).json()
  await command('account.save',{id:'staff-other',value:{...selected.value,pierCustomerId:'custody-review',name:'Synthetic second market',email:['synthetic-barrow-42','example.invalid'].join('@'),prices:[{sku:'LINEN',unitCents:3100,minQty:1}]}})
 }
 const companyRights={buyer:['purchaser'],'buyer-approver':['approver'],'buyer-finance':['finance'],'buyer-admin':['administrator']}[label]
 const policy=companyRights?{rights:companyRights,locations:'all',perOrderLimitCents:100000,approvalLimitCents:0}:staffPolicy(label,label==='rep'?[]:['juniper'])
 let grant
 if(label==='native-admin') {
  const people=await(await request(origin+'/auth/operators',{headers})).json(),person=people.find(row=>row.email===email)
  const promoted=await request(origin+'/auth/operator/role',{method:'POST',headers,body:JSON.stringify({operatorId:person.id,role:'admin'})})
  assert.equal(promoted.status,200);await promoted.body?.cancel()
 }
 if(companyRights||label==='native-admin') {
  const invitation=await request(origin+'/auth/invite',{method:'POST',headers,body:JSON.stringify({email,displayName:'Synthetic '+label,role:label==='native-admin'?'admin':'member',returnTo:'/app'})})
  assert.equal(invitation.status,202,await invitation.text())
 } else grant=await command('staff.invite',{email,name:'Synthetic '+label,policy,reason:'Owner reviewed native account scope.'})
 const message=(await mail.read()).at(-1)
 const href=message?.text.match(/https?:\/\/[^\s<>]+\/auth\/confirm\?token=[^\s<>]+/)?.[0]??message?.html.match(/href="([^"]*\/auth\/confirm\?token=[^"]+)"/)?.[1]?.replaceAll('&amp;','&')
 assert.ok(href,'Actual native invitation')
 const response=await request(origin+'/auth/confirm',{method:'POST',redirect:'manual',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({token:new URL(href).searchParams.get('token')})})
 assert.equal(response.status,303)
 const cookie=response.headers.getSetCookie().map(value=>value.split(';',1)[0]).join('; ')
 if(companyRights) {
  await command('company.invite',{accountId:'juniper',email,name:'Synthetic '+label,policy,reason:'Owner reviewed explicit company rights.'})
  const invitation=(await mail.read()).at(-1),link=new URL(invitation.text.match(/https?:\/\/[^\s<>]+\/app\?[^\s<>]+/)[0])
  grant=await command('company.accept',{invitationId:link.searchParams.get('companyInvitation'),token:link.searchParams.get('companyToken')},cookie)
 }
 const roster=await(await request(origin+'/auth/operators',{headers})).json(),person=roster.find(person=>person.email===email),name=person.displayName
 staffFixtures.set(label,{email,sub,cookie,grant:{...grant,userId:person.id},policy,name})
 return response
}
