import assert from 'node:assert/strict';
import {installation,stock,accountValue} from './harness.mjs';
export async function qboFixture(t,options={}) {
 const pier=await installation({pier:true});t.after(()=>pier.close());const products=await stock(pier,'500');
 const edge={count:1,fail:false,revoked:false,currency:'USD',total:130,balance:130,token:'0',updated:'2026-11-06T12:00:00Z',referenceToken:'0',expiresIn:3600,calls:[],refreshes:0};
 const bindings={PIER_ORIGIN:pier.origin,PIER_SESSION:pier.cookie,QBO_CLIENT_ID:'synthetic-barrow-901',QBO_CLIENT_SECRET:'synthetic-barrow-902'};
 const h=await installation({...options,https:true,clock:'2026-11-06T15:00:00Z',bindings,networkEdge:async request=>{
  const url=new URL(request.url);if(!url.hostname.endsWith('intuit.com'))return;
  edge.calls.push({host:url.hostname,path:url.pathname,method:request.method});
  if(url.pathname.endsWith('/tokens/bearer')){const form=new URLSearchParams(await request.text());if(form.get('grant_type')==='refresh_token')edge.refreshes++;return Response.json({access_token:'synthetic-barrow-903',refresh_token:'synthetic-barrow-904',expires_in:edge.expiresIn})}
  if(url.pathname.endsWith('/tokens/revoke')){edge.revoked=true;return new Response(null,{status:200})}
  assert.equal(url.pathname,'/v3/company/123456/query');assert.equal(request.method,'GET');assert.equal(request.headers.get('authorization'),'Bearer synthetic-barrow-903');
  if(edge.fail)return Response.json({Fault:{Error:[{Message:'synthetic-barrow-905'}]}},{status:503});
  const query=url.searchParams.get('query'),kind=/from (\w+)/i.exec(query)[1],position=Number(/startposition (\d+)/i.exec(query)[1]);assert.match(query,/maxresults 50$/);
  const refs={Customer:'10',Item:'20',Account:'30',TaxCode:'40'};
  if(refs[kind])return Response.json({QueryResponse:{[kind]:[{Id:refs[kind],SyncToken:edge.referenceToken,Active:true}]}});
  assert.equal(kind,'Invoice');
  const all=Array.from({length:edge.count},(_,i)=>({Id:String(100+i),SyncToken:edge.token,CustomerRef:{value:'10'},CurrencyRef:{value:edge.currency},TxnDate:'2026-11-06',DueDate:'2026-12-06',TotalAmt:edge.total,Balance:edge.balance,ARAccountRef:{value:'30'},TxnTaxDetail:{TxnTaxCodeRef:{value:'40'}},Line:[{SalesItemLineDetail:{ItemRef:{value:'20'}}}],MetaData:{LastUpdatedTime:edge.updated},BillEmail:{Address:['must-not-retain','example.test'].join('@')},PrivateNote:'must not retain provider narratives'}));
  return Response.json({QueryResponse:{Invoice:all.slice(position-1,position-1+50)}});
 }});t.after(()=>h.close());
 const email=['synthetic-barrow-906','example.test'].join('@');
 let account=await h.command('account.save',{id:'cedar',value:accountValue(products.customer.id,email)});const buyer={as:await h.signIn(email)};
 const draft=await h.command('order.prepare',{accountId:'cedar',reference:'QBO native source',lines:[{sku:'OAT-1',quantity:2}]},buyer);await h.command('order.submit',{orderId:draft.id},buyer);const order=await h.command('order.approve',{orderId:draft.id});assert.ok(order.invoice);
 const begin=()=>h.command('qbo.begin',{realm:'123456',mode:'sandbox',consent:true,reason:'Owner reviewed this exact company and separate custody.'});
 const callback=authorization=>'/api/barrow/qbo/callback?'+new URLSearchParams({state:new URL(authorization.authorizationUrl).searchParams.get('state'),realmId:'123456',code:'synthetic-barrow-907'});
 const connect=async()=>{const authorization=await begin();assert.equal((await h.request(callback(authorization))).status,303)};
 const workspace=()=>h.api('/api/barrow/qbo');
 const map=async(kind,nativeId)=>{
  await h.command('qbo.references',{kind,reason:'Read current source references.'});const state=await workspace(),ref=state.references.find(row=>row.kind===kind),prior=state.mappings.find(row=>row.kind===kind);
  return h.command('qbo.mapping',{kind,sourceId:ref.source_id,sourceToken:ref.token,nativeId,nativeRevision:account.revision,revision:prior?.revision??null,reason:'Owner reviewed exact source and native references.'});
 };
 const mappings=async()=>{for(const [kind,target] of [['Customer','cedar'],['Item','OAT-1'],['Account','receivables'],['TaxCode','reviewed tax reference']])await map(kind,target)};
 const start=()=>h.command('qbo.start',{asOf:'2026-11-06',reason:'Owner reviewed a current dated invoice read.'});
 const resume=run=>h.command('qbo.resume',{id:run.id,revision:run.revision,reason:'Resume the same bounded accounting correlation.'});
 return {h,pier,edge,order,buyer,account,begin,callback,connect,workspace,map,mappings,start,resume};
}
