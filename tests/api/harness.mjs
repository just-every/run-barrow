import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { unstable_splitSqlQuery } from 'wrangler';
import { build } from 'esbuild';
import { randomBytes,randomUUID } from 'node:crypto';
import { mkdtemp,readFile,readdir,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve,join } from 'node:path';
import assert from 'node:assert/strict';
import { pierSource } from '../pier-source.mjs';
export async function installation({pier=false,bindings={}}={}) {
 const root=pier?await pierSource():resolve('.');
 const directory=await mkdtemp(join(tmpdir(),'barrow-api-'));
 const bundled=await build({entryPoints:[join(root,'tests/api/worker.ts')],bundle:true,write:false,format:'esm',platform:'neutral',target:'es2022',external:['node:*','cloudflare:*'],loader:{'.css':'text','.svg':'text'}});
 const setup=randomBytes(32).toString('hex'),key=randomBytes(32).toString('hex'),secret=randomBytes(32).toString('hex');
 const messages=[];
 // Fake only the external mail boundary; Pier remains the real pinned Worker.
 const mailEdge=async request=>{
  if(new URL(request.url).hostname==='api.resend.com') {
   messages.push(await request.json());return Response.json({id:randomUUID()});
  }
  // Node fetch supplies its own framing when forwarding the workerd request.
  const headers=Object.fromEntries([...request.headers].filter(([name])=>!['connection','transfer-encoding','content-length','host','expect'].includes(name)));
  const response=await fetch(request.url,{method:request.method,headers,...(['GET','HEAD'].includes(request.method)?{}:{body:await request.arrayBuffer()})});
  return new Response(await response.arrayBuffer(),{status:response.status,headers:Object.fromEntries(response.headers)});
 };
 let origin='http://localhost';
 const options=port=>({...convertV4MiniflareOptions({host:'127.0.0.1',port,modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-09-08',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],bindings:{AUTH_LOCAL:'true',AUTH_ORIGIN:origin,OWNER_EMAIL:'owner@example.test',SESSION_SECRET:secret,SETUP_TOKEN:setup,MAIL_PROVIDER:pier?'development':'resend',MAIL_API_KEY:'test-network-edge',MAIL_FROM:'auth@example.test',RER_DEV_KEY:key,...bindings},...(!pier?{outboundService:mailEdge}:{})}),resourcePersistencePath:directory});
 const originalCwd=process.cwd();if(pier)process.chdir(root);
 const mf=new Miniflare(options(0));
 try {
  origin=(await mf.ready).origin; await mf.setOptions(options(Number(new URL(origin).port)));await mf.ready;process.chdir(originalCwd);
  const db=await mf.getD1Database('DB');
  for(const file of (await readdir(join(root,'migrations/core'))).filter(f=>f.endsWith('.sql')).sort()) await db.batch(unstable_splitSqlQuery(await readFile(join(root,'migrations/core',file),'utf8')).map(sql=>db.prepare(sql)));
  let cookie='';
  const request=(path,{method='GET',body,as=cookie,headers={}}={})=>fetch(origin+path,{method,redirect:'manual',headers:{origin,'content-type':'application/json',...(as?{cookie:as}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  const boot=await request('/auth/bootstrap',{method:'POST',body:{token:setup,displayName:'Supplier'}});assert.equal(boot.status,303);
  cookie=boot.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
  const api=async(path,body,opts={})=>{
   const response=await request(path,{...(body===undefined?{}:{method:'POST',body}),...opts});const value=await response.json();
   if(opts.status!==undefined) assert.equal(response.status,opts.status,JSON.stringify(value)); else assert.ok(response.ok,JSON.stringify(value));
   return value;
  };
  const command=async(type,payload,opts={})=>{
   const value=await api(pier?'/api/pier/commands':'/api/barrow/commands',{type,payload,...(pier?{commandId:opts.commandId??randomUUID()}:{})},opts);return opts.status&&opts.status>=400?value:value.result;
  };
  const signIn=async(email)=>{
   await api('/auth/invite',{email,displayName:'Trade buyer',role:'member',returnTo:'/app'},{status:202});
   if(!pier) {
    const message=messages.findLast(message=>JSON.stringify(message.to).includes(email));
    const link=new URL(message?.text?.match(/https?:\/\/[^\s<>]+\/auth\/confirm\?token=[^\s<>]+/)?.[0] ?? message?.html?.match(/href="([^"]*\/auth\/confirm\?token=[^"]+)"/)?.[1]?.replaceAll('&amp;','&'));
    const confirmed=await request('/auth/confirm',{method:'POST',as:'',body:{token:link.searchParams.get('token')}});
    assert.equal(confirmed.status,303);
    return confirmed.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
   }
   const listing=await (await request('/__dev/outbox',{headers:{'x-rer-dev-key':key}})).text();
   for(const [,path] of listing.matchAll(/href="(\/__dev\/outbox\?message=[^"]+)"/g)) {
    const detail=await (await request(path.replaceAll('&amp;','&'),{headers:{'x-rer-dev-key':key}})).text();
    if(!detail.includes(email))continue;
    const match=detail.match(/href="([^"]*\/auth\/confirm\?token=[^"]+)"/);if(!match)continue;
    const link=new URL(match[1].replaceAll('&amp;','&'),origin);
    const confirmed=await request('/auth/confirm',{method:'POST',as:'',body:{token:link.searchParams.get('token')}});
    if(confirmed.status!==303)continue;
    return confirmed.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
   }
   throw Error('Invitation did not produce a usable sign-in link');
  };
  return {mf,db,origin,cookie,request,api,command,signIn,async close(){await mf.dispose();await rm(directory,{recursive:true,force:true})}};
 }catch(error){process.chdir(originalCwd);await mf.dispose();await rm(directory,{recursive:true,force:true});throw error}
}
export async function stock(pier,quantity='24') {
 const item=await pier.command('item.save',{sku:'OAT-1',name:'Toasted oat granola',unit:'case',packSize:'1'});
 const location=await pier.command('location.save',{name:'Shelf A1',warehouse:'Brisbane',kind:'bin'});
 const supplier=await pier.command('party.save',{name:'Mill House Foods',kind:'supplier'});
 const customer=await pier.command('party.save',{name:'Cedar Street Pantry',kind:'customer'});
 const po=await pier.command('po.draft',{supplierId:supplier.id,promiseDate:'2026-10-20',reason:'Opening stock',lines:[{itemId:item.id,quantity,price:'20.00'}]});
 await pier.command('po.approve',{poId:po.id,version:po.version});
 await pier.command('po.commit',{poId:po.id,version:po.version});
 await pier.command('receipt.create',{poId:po.id,supplierReference:'Delivery 1',lines:[{poLineId:po.lines[0].id,locationId:location.id,quantity,cost:'20.00'}]});
 return {item,location,supplier,customer};
}
export const accountValue=(customerId,email='buyer@example.test')=>({name:'Cedar Street Pantry',email,pierCustomerId:customerId,termsDays:30,minimumCents:10000,prices:[{sku:'OAT-1',unitCents:6500,minQty:2}]});
export async function archive(h) {
 const {id}=await h.api('/api/barrow/portability/exports',{});
 let status;do{status=await h.api(`/api/barrow/portability/exports/${id}/advance`,{})}while(status.phase!=='complete');
 const response=await h.request(`/api/barrow/portability/exports/${id}/download`);assert.equal(response.status,200);
 return (await response.text()).trim().split('\n').map(line=>JSON.parse(line));
}
export async function restore(h,lines,{status=200,laterJournal}={}) {
 const {id}=await h.api('/api/barrow/portability/imports',{manifest:lines[0],confirmed:true});
 for(const part of lines.filter(x=>x.kind==='part')) await h.api(`/api/barrow/portability/imports/${id}/parts/${part.index}`,part,{method:'PUT'});
 return h.api(`/api/barrow/portability/imports/${id}/finalize`,{contentHash:lines.at(-1).contentHash,archiveHash:lines.at(-1).archiveHash,...(laterJournal?{laterJournal}:{})},{status});
}
