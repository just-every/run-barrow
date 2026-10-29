import { request as httpsRequest } from 'node:https';
import { Miniflare, Log, LogLevel, convertV4MiniflareOptions } from 'miniflare';
import { unstable_splitSqlQuery } from 'wrangler';
import { build } from 'esbuild';
import { randomBytes,randomUUID } from 'node:crypto';
import { mkdtemp,readFile,readdir,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve,join } from 'node:path';
import assert from 'node:assert/strict';
import { pierSource } from '../pier-source.mjs';
import { localTls } from './tls.mjs';
const nativePiers=new Map();
export async function configurePierRouting(pier) {
 const state=await pier.api('/api/pier/state');
 if(state.routingRules?.some(rule=>rule.source==='manual'&&rule.activeAt))return;
 const eligible=[...new Set(state.locations.filter(row=>row.kind==='bin').map(row=>row.warehouse))];
 if(!eligible.length)return;
 for(const customer of state.parties.filter(row=>row.kind==='customer'))await pier.command('customer.splitPolicy',{customerId:customer.id,version:customer.version,allowSplit:true,reason:'Synthetic installation owner approved the fixture’s multi-warehouse fulfillment policy.'});
 let rule=await pier.command('routing.save',{source:'manual',mode:'rules',shortage:'split',zones:[],defaultEligible:eligible});
 rule=await pier.command('routing.preview',{ruleId:rule.id,version:rule.version});
 await pier.command('routing.activate',{ruleId:rule.id,version:rule.version});
}
export async function installation({pier=false,bindings={},https=pier,built=false,captureLogs=false,networkEdge,clock,socketEdge=false}={}) {
 const connected=nativePiers.get(bindings.PIER_ORIGIN);
 if(!pier&&connected&&connected.cookie===bindings.PIER_SESSION)await configurePierRouting(connected);
 const root=pier?await pierSource():resolve('.');
 const directory=await mkdtemp(join(tmpdir(),'barrow-api-'));
 const tls=pier?await localTls(directory):undefined;
 const bundled=await build({...(clock&&built?{banner:{js:'const NativeDate=Date;globalThis.Date=class extends NativeDate{constructor(...args){if(args.length)super(...args);else super('+JSON.stringify(clock)+')}static now(){return new NativeDate('+JSON.stringify(clock)+').getTime()}};'}}:{}),entryPoints:[join(root,built?'dist/server/index.js':'tests/api/worker.ts')],bundle:true,write:false,format:'esm',platform:'neutral',mainFields:['browser','module','main'],alias:{crypto:'node:crypto'},target:'es2022',external:['node:*','cloudflare:*'],nodePaths:[resolve('node_modules')],loader:{'.css':'text','.svg':'text'},plugins:(socketEdge?[{name:'tls-network-edge',setup(builder){builder.onResolve({filter:/^cloudflare:sockets$/},()=>({path:resolve('tests/api/socket-edge.ts')}))}}]:[]).concat(clock?[{name:'fixed-business-clock',setup(builder){builder.onLoad({filter:/\/src\/barrow\/clock\.ts$/},()=>({contents:'export const now = async () => new Date('+JSON.stringify(clock)+')',loader:'ts'}))}}]:!pier&&!built&&bindings.BARROW_TEST_CLOCK?[{name:'test-clock',setup(plugin){plugin.onLoad({filter:/[\/]src[\/]barrow[\/]clock\.ts$/},()=>({contents:'export {now} from '+JSON.stringify(resolve('tests/api/clock.ts')),loader:'ts'}))}}]:[])});
 const setup=randomBytes(32).toString('hex'),key=randomBytes(32).toString('hex'),secret=randomBytes(32).toString('hex');
 const logs=[];class CapturedLog extends Log {log(message){logs.push(String(message))}}
 const logger=captureLogs?new CapturedLog(LogLevel.DEBUG):undefined;
 const messages=[],mail={deliveries:[],requests:[],reject:false,failStatus:undefined},idempotency=new Map();
 // Fake only the external mail boundary; Pier remains the real pinned Worker.
 const mailEdge=async request=>{
  if(new URL(request.url).hostname==='api.resend.com') {
   const message=await request.json();messages.push(message);mail.requests.push({message,key:request.headers.get('idempotency-key')});
   if(mail.failStatus)return Response.json({message:'Test provider response'}, {status:mail.failStatus});
   if(mail.reject)return Response.json({message:'Rejected test edge'}, {status:422});
   const deliveryKey=request.headers.get('idempotency-key');
   if(deliveryKey&&idempotency.has(deliveryKey))return Response.json({id:idempotency.get(deliveryKey)});
   const id=randomUUID();if(deliveryKey)idempotency.set(deliveryKey,id);mail.deliveries.push({id,message,key:deliveryKey});if(mail.afterSend)await mail.afterSend(message);return Response.json({id});
  }
  if(networkEdge){const response=await networkEdge(request);if(response)return response}
  // Node fetch supplies its own framing when forwarding the workerd request.
  const headers=Object.fromEntries([...request.headers].filter(([name])=>!['connection','transfer-encoding','content-length','host','expect'].includes(name)));
  const source=nativePiers.get(new URL(request.url).origin);
  if(source)return source.raw(new URL(request.url).pathname+new URL(request.url).search,{method:request.method,headers,...(['GET','HEAD'].includes(request.method)?{}:{body:Buffer.from(await request.arrayBuffer())})});
  const response=await fetch(request.url,{method:request.method,headers,...(['GET','HEAD'].includes(request.method)?{}:{body:await request.arrayBuffer()})});
  return new Response(await response.arrayBuffer(),{status:response.status,headers:Object.fromEntries(response.headers)});
 };
 let origin='http://localhost';
 const options=port=>({...convertV4MiniflareOptions({host:'127.0.0.1',port,https:Boolean(https),...(tls?{httpsCert:tls.httpsCert,httpsKey:tls.httpsKey}:{}),modules:true,script:bundled.outputFiles[0].text,...(built?{assets:{directory:join(root,'dist/client'),binding:'ASSETS',run_worker_first:true,routerConfig:{has_user_worker:true}}}:{}),compatibilityDate:'2026-09-08',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['ERASURE_JOURNAL'],bindings:{AUTH_LOCAL:pier?'false':'true',AUTH_ORIGIN:origin,OWNER_EMAIL:'owner@example.test',SESSION_SECRET:secret,SETUP_TOKEN:setup,MAIL_PROVIDER:'resend',MAIL_API_KEY:'synthetic-barrow-1',MAIL_FROM:'auth@example.test',RER_DEV_KEY:key,...bindings},outboundService:mailEdge}),resourcePersistencePath:directory,...(logger?{log:logger}:{})});
 const originalCwd=process.cwd();if(pier)process.chdir(root);
 const mf=new Miniflare(options(0));
 try {
  const localOrigin=(await mf.ready).origin;origin=localOrigin;await mf.setOptions(options(Number(new URL(localOrigin).port)));await mf.ready;process.chdir(originalCwd);
  let db=await mf.getD1Database('DB');
  for(const file of (await readdir(join(root,'migrations/core'))).filter(f=>f.endsWith('.sql')).sort()) await db.batch(unstable_splitSqlQuery(await readFile(join(root,'migrations/core',file),'utf8')).map(sql=>db.prepare(sql)));
  let cookie='',closed=false;
  // Use the real local TLS listener; trust only this fixture's generated certificate.
  const raw=(path,init={})=>!https?fetch(origin+path,init):new Promise((resolve,reject)=>{
   const req=httpsRequest(origin+path,{method:init.method??'GET',headers:init.headers,...(tls?{ca:tls.httpsCert}:{rejectUnauthorized:false}),agent:false},response=>{
    const parts=[];response.on('data',part=>parts.push(part));response.on('end',()=>{
     const headers=new Headers();for(let i=0;i<response.rawHeaders.length;i+=2)headers.append(response.rawHeaders[i],response.rawHeaders[i+1]);
     resolve(new Response([204,205,304].includes(response.statusCode)?null:Buffer.concat(parts),{status:response.statusCode,headers}));
    });response.on('error',reject);
   });req.on('error',error=>reject(new Error(`${init.method??'GET'} ${path.split('?')[0]}: ${error.code??'transport failure'}`)));if(init.body!==undefined)req.write(init.body);req.end();
  });
  const request=(path,{method='GET',body,as=cookie,headers={}}={})=>raw(path,{method,redirect:'manual',headers:{origin,'content-type':'application/json',...(as?{cookie:as}:{}),...headers},...(body!==undefined?{body:JSON.stringify(!pier&&path==='/api/barrow/commands'&&headers.authorization?.startsWith('Bearer ')&&['order.prepare','proposal.submit'].includes(body.type)?{...body,payload:{idempotency_key:randomUUID(),...body.payload}}:body)}:{})});
  const boot=await request('/auth/bootstrap',{method:'POST',body:{token:setup,displayName:'Supplier'}});assert.equal(boot.status,303,await boot.text());
  cookie=boot.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
  // Existing commercial journeys now start with the owner's explicit standalone policy.
  // The production conformance journey separately proves unset/held/blocked policy.
  if(!pier){const policy=await request('/agents/api/policy',{method:'PUT',body:{document:{schema:'rer-agent-policy/1',catalogue:'rer-agent-classes/1',rules:[{id:'native-fixture',class:'*',do:'autonomous'}],spend:{none:true}}}});assert.equal(policy.status,200,await policy.text());}
  const api=async(path,body,opts={})=>{
   const response=await request(path,{...(body===undefined?{}:{method:'POST',body}),...opts});const value=await response.json();
   if(opts.status!==undefined) assert.equal(response.status,opts.status,JSON.stringify(value)); else assert.ok(response.ok,JSON.stringify(value));
   return value;
  };
  const command=async(type,payload,opts={})=>{
   const value=await api(pier?'/api/pier/commands':'/api/barrow/commands',{type,payload,...(pier?{commandId:opts.commandId??randomUUID()}:{})},opts);return opts.status&&opts.status>=400?value:value.result;
  };
  const signIn=async(email,role='member')=>{
   if(role==='existing')await api('/auth/magic-link',{email,returnTo:'/app'},{as:'',status:202});
   else await api('/auth/invite',{email,displayName:role==='member'?'Trade buyer':'Supplier staff',role,returnTo:'/app'},{status:202});
   const message=messages.findLast(message=>message.to.includes(email));
   assert.ok(message,'Sign-in invitation reached the external mail edge');
   const link=new URL(message.text?.match(/https?:\/\/[^\s<>]+\/auth\/confirm\?token=[^\s<>]+/)?.[0] ?? message.html?.match(/href="([^"]*\/auth\/confirm\?token=[^"]+)"/)?.[1]?.replaceAll('&amp;','&'));
   assert.equal(link.origin,origin);
   const confirmed=await request('/auth/confirm',{method:'POST',as:'',body:{token:link.searchParams.get('token')}});
   assert.equal(confirmed.status,303);
   return confirmed.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
  };
  const harness={mf,logs,certificatePath:tls?.certificatePath,get db(){return db},origin,cookie,request,raw,api,command,signIn,mail,async configure(next){for(const [name,value] of Object.entries(next)){if(value===undefined)delete bindings[name];else bindings[name]=value}await mf.setOptions(options(Number(new URL(localOrigin).port)));await mf.ready;db=await mf.getD1Database('DB')},async close(){if(closed)return;closed=true;nativePiers.delete(origin);await mf.dispose();await rm(directory,{recursive:true,force:true})}};
  if(pier)nativePiers.set(origin,harness);
  return harness;
 }catch(error){process.chdir(originalCwd);await mf.dispose();await rm(directory,{recursive:true,force:true});throw error}
}
export async function stock(pier,quantity='24') {
 const item=await pier.command('item.save',{sku:'OAT-1',name:'Toasted oat granola',unit:'case',packSize:'1'});
 const location=await pier.command('location.save',{name:'Shelf A1',warehouse:'New York',kind:'bin'});
 const supplier=await pier.command('party.save',{name:'Mill House Foods',kind:'supplier'});
 const customer=await pier.command('party.save',{name:'Cedar Street Pantry',kind:'customer'});
 const po=await pier.command('po.draft',{supplierId:supplier.id,promiseDate:'2026-10-20',reason:'Opening stock',lines:[{itemId:item.id,quantity,price:'20.00'}]});
 await pier.command('po.approve',{poId:po.id,version:po.version});
 await pier.command('po.commit',{poId:po.id,version:po.version});
 await pier.command('receipt.create',{poId:po.id,supplierReference:'Delivery 1',lines:[{poLineId:po.lines[0].id,locationId:location.id,quantity,cost:'20.00'}]});
 await configurePierRouting(pier);
 return {item,location,supplier,customer};
}
export const accountValue=(customerId,email='buyer@example.test')=>({name:'Cedar Street Pantry',email,pierCustomerId:customerId,termsDays:30,minimumCents:10000,prices:[{sku:'OAT-1',unitCents:6500,minQty:2}]});
const archiveSources=new WeakMap();
export async function archive(h) {
 const {id}=await h.api('/api/barrow/portability/exports',{});
 let status;do{status=await h.api(`/api/barrow/portability/exports/${id}/advance`,{})}while(status.phase!=='complete');
 const response=await h.request(`/api/barrow/portability/exports/${id}/download`);assert.equal(response.status,200);
 const lines=(await response.text()).trim().split('\n').map(line=>JSON.parse(line));archiveSources.set(lines,h);return lines;
}
export async function restore(h,lines,{status=200,laterJournal,journalSource=archiveSources.get(lines)}={}) {
 // Attaching the source bucket is separate from importing the database archive.
 if(journalSource){const bundle=await journalSource.api('/api/barrow/erasure-journal');await h.api('/api/barrow/erasure-journal',{bundle,confirm:'JOURNAL',reason:'Owner attached the source installation’s complete current independent journal before restore.'})}
 const {id}=await h.api('/api/barrow/portability/imports',{manifest:lines[0],confirmed:true});
 for(const part of lines.filter(x=>x.kind==='part')) await h.api(`/api/barrow/portability/imports/${id}/parts/${part.index}`,part,{method:'PUT'});
 return h.api(`/api/barrow/portability/imports/${id}/finalize`,{contentHash:lines.at(-1).contentHash,archiveHash:lines.at(-1).archiveHash,...(laterJournal?{laterJournal}:{})},{status});
}
// Consume the Native invitation staff.invite actually sent, so the version-bound activation path stays under test.
export async function confirmInvitation(h,email) {
 const message=h.mail.requests.findLast(row=>row.message.to.includes(email))?.message;
 assert.ok(message,'Native invitation reached the external mail edge');
 const href=message.text?.match(/https?:\/\/[^\s<>]+\/auth\/confirm\?token=[^\s<>]+/)?.[0]??message.html?.match(/href="([^"]*\/auth\/confirm\?token=[^"]+)"/)?.[1]?.replaceAll('&amp;','&');
 const response=await h.request('/auth/confirm',{method:'POST',as:'',body:{token:new URL(href).searchParams.get('token')}});
 assert.equal(response.status,303);
 return {as:response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ')};
}
export async function activateStaff(h,email,policy) {
 const grant=await h.command('staff.invite',{email,name:email.split('@')[0],policy,reason:'Owner reviewed this exact functional role and scope.'});
 return {grant,who:await confirmInvitation(h,email),id:grant.userId};
}
