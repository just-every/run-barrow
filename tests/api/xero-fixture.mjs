import assert from 'node:assert/strict';
import {installation,stock,accountValue} from './harness.mjs';
export async function xeroFixture(t,options={}){
 const pier=await installation({pier:true});t.after(()=>pier.close());const products=await stock(pier,'500');
 const tenant='12345678-1234-4234-8234-123456789012',connectionId='12345678-1234-4234-8234-123456789013';
 const edge={tenant,count:1,fail:false,revoked:false,currency:'USD',total:130,balance:130,token:'0',updated:'2026-11-06T12:00:00Z',referenceToken:'0',expiresIn:3600,calls:[],refreshes:0};
 const bindings={PIER_ORIGIN:pier.origin,PIER_SESSION:pier.cookie,XERO_CLIENT_ID:'synthetic-barrow-901',XERO_CLIENT_SECRET:'synthetic-barrow-902'};
 const h=await installation({...options,https:true,clock:'2026-11-06T15:00:00Z',bindings,networkEdge:async request=>{
  const url=new URL(request.url);if(!['identity.xero.com','api.xero.com'].includes(url.hostname))return;
  edge.calls.push({host:url.hostname,path:url.pathname,method:request.method});
  if(url.pathname==='/connect/token'){const form=new URLSearchParams(await request.text());if(form.get('grant_type')==='refresh_token')edge.refreshes++;return Response.json({access_token:'synthetic-barrow-903',refresh_token:'synthetic-barrow-904',expires_in:edge.expiresIn,scope:'offline_access accounting.transactions.read accounting.contacts.read accounting.settings.read'})}
  assert.equal(request.headers.get('authorization'),'Bearer synthetic-barrow-903');
  if(url.pathname==='/connections')return Response.json([{id:connectionId,tenantId:edge.tenant,tenantType:'ORGANISATION'}]);
  if(url.pathname==='/connections/'+connectionId&&request.method==='DELETE'){edge.revoked=true;return new Response(null,{status:204})}
  assert.equal(request.method,'GET');assert.equal(request.headers.get('xero-tenant-id'),tenant);
  if(edge.fail)return Response.json({Message:'synthetic-barrow-905'},{status:503});
  const resource=url.pathname.split('/').at(-1),position=Number(url.searchParams.get('page')??1),date='/Date('+Date.parse(edge.updated)+')/';
  const references={Contacts:[{ContactID:'10',ContactStatus:'ACTIVE',UpdatedDateUTC:edge.referenceToken,EmailAddress:['must-not-retain','example.test'].join('@')}],Items:[{Code:'20',UpdatedDateUTC:edge.referenceToken,SalesDetails:{AccountCode:'30',TaxType:'40'}}],Accounts:[{AccountID:'30',Code:'30',Status:'ACTIVE',Type:'REVENUE',UpdatedDateUTC:edge.referenceToken}],TaxRates:[{TaxType:'40',Status:'ACTIVE',EffectiveRate:0,UpdatedDateUTC:edge.referenceToken}]};
  if(references[resource])return Response.json({[resource]:references[resource]});
  assert.equal(resource,'Invoices');assert.equal(url.searchParams.get('pageSize'),'50');assert.equal(url.searchParams.get('order'),'InvoiceID');assert.match(url.searchParams.get('where'),/ACCREC/);
  const all=Array.from({length:edge.count},(_,i)=>({InvoiceID:String(100+i),Type:'ACCREC',Status:'AUTHORISED',Contact:{ContactID:'10',Name:'must-not-retain'},CurrencyCode:edge.currency,Date:'/Date('+Date.parse('2026-11-06T00:00:00Z')+')/',DueDate:'2026-12-06',Total:edge.total,AmountDue:edge.balance,LineItems:[{ItemCode:'20',AccountCode:'30',TaxType:'40'}],UpdatedDateUTC:date,Reference:'must not retain provider narratives'}));
  return Response.json({Invoices:all.slice((position-1)*50,position*50)});
 }});t.after(()=>h.close());
 const email=['synthetic-barrow-906','example.test'].join('@');
 const account=await h.command('account.save',{id:'cedar',value:accountValue(products.customer.id,email)}),buyer={as:await h.signIn(email)};
 const draft=await h.command('order.prepare',{accountId:'cedar',reference:'Xero native source',lines:[{sku:'OAT-1',quantity:2}]},buyer);await h.command('order.attach',{orderId:draft.id,name:'synthetic-barrow-909.pdf',contentBase64:Buffer.from('%PDF-1.4 synthetic-barrow-909').toString('base64')},buyer);await h.command('order.submit',{orderId:draft.id},buyer);const order=await h.command('order.approve',{orderId:draft.id});assert.ok(order.invoice);
 const begin=()=>h.command('xero.begin',{tenant,consent:true,reason:'Owner reviewed this exact tenant and separate custody.'});
 const callback=authorization=>'/api/barrow/xero/callback?'+new URLSearchParams({state:new URL(authorization.authorizationUrl).searchParams.get('state'),code:'synthetic-barrow-907'});
 const connect=async()=>{const authorization=await begin();assert.equal((await h.request(callback(authorization))).status,303)};
 const workspace=()=>h.api('/api/barrow/xero');
 const map=async(kind,nativeId)=>{await h.command('xero.references',{kind,reason:'Read current source references.'});const state=await workspace(),ref=state.references.find(row=>row.kind===kind),prior=state.mappings.find(row=>row.kind===kind);return h.command('xero.mapping',{kind,sourceId:ref.source_id,sourceToken:ref.token,nativeId,nativeRevision:account.revision,revision:prior?.revision??null,reason:'Owner reviewed exact source and native references.'})};
 const mappings=async()=>{for(const [kind,target] of [['Contact','cedar'],['Item','OAT-1'],['Account','receivables'],['TaxCode','reviewed tax reference']])await map(kind,target)};
 const start=()=>h.command('xero.start',{asOf:'2026-11-06',reason:'Owner reviewed a current dated invoice read.'});
 const resume=run=>h.command('xero.resume',{id:run.id,revision:run.revision,reason:'Resume the same bounded accounting correlation.'});
 return {h,pier,edge,order,buyer,account,begin,callback,connect,workspace,map,mappings,start,resume};
}
