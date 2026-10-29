/** Disposable native lifecycle, not a production route or database writer. */
export default async function({request,origin,email,claim,token,fixtures,reviewers}) {
 const bootstrap=await request(origin+claim.path,{method:'POST',redirect:'manual',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({token:claim.token,displayName:'Juniper wholesale owner',returnTo:'/setup'})})
 if(bootstrap.status!==303)throw new Error('Native owner claim failed')
 const cookie=bootstrap.headers.getSetCookie().map(value=>value.split(';',1)[0]).join('; ')
 const headers={Origin:origin,Cookie:cookie,'Content-Type':'application/json'}
 const setup=await request(origin+'/setup',{method:'POST',headers:{...headers,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({confirm:'yes',displayName:'Juniper wholesale owner'}),redirect:'manual'})
 if(setup.status!==303)throw new Error('Native first run failed')
 await reviewers.initialize('local-admin',{cookie})
 await fixtures.set(origin,{cookie:token})
 async function command(type,payload) {
  const response=await request(origin+'/api/barrow/commands',{method:'POST',headers,body:JSON.stringify({type,payload})})
  if(!response.ok)throw new Error('Native fixture preparation failed: '+type)
  return response.json()
 }
 await command('account.save',{id:'juniper',value:{name:'Juniper Market',email:'synthetic-buyer@example.com',pierCustomerId:'juniper',termsDays:30,minimumCents:0,currency:'USD',prices:[{sku:'LINEN',unitCents:2400,minQty:1},{sku:'HEMP',unitCents:2500,minQty:1}]}})
 await command('list.save',{accountId:'juniper',name:'Replenishment',shared:true,lines:[{sku:'LINEN',quantity:'2'}]})
 const prepared=await command('order.prepare',{accountId:'juniper',lines:[{sku:'LINEN',quantity:2}]})
 const original=prepared.result??prepared
 await command('order.submit',{orderId:original.id})
 await command('order.approve',{orderId:original.id})
 const grant=await request(origin+'/api/barrow/proposal-grants',{method:'POST',headers,body:JSON.stringify({accountId:'juniper',costLimitCents:0,contactLimit:3,approvedSubstitutes:[{fromSku:'LINEN',skus:['HEMP']}],consent:true,reason:'Owner authorized draft alternatives; no automatic stock or contact effects.'})})
 if(!grant.ok)throw new Error('Native proposal scope setup failed')
 await grant.body?.cancel()
 return bootstrap
}
