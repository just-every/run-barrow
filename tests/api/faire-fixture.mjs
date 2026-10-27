import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {installation,accountValue} from './harness.mjs';
export async function faireFixture(t,{built=false}={}) {
 const state={failSecond:true,requests:[],unauthorized:0,paymentRequests:0,orders:[
  {id:'synthetic-barrow-order-1',retailer_id:'synthetic-barrow-retailer-1',state:'PROCESSING',items:[{id:'synthetic-barrow-item-1',sku:'OAT-1',quantity:3,price:{currency:'USD',amount_minor:6500}}],payout_costs:{commission_bps:1500,commission_flat_fee:{currency:'USD',amount_minor:1000},payout_fee:{currency:'USD',amount_minor:130}},shipments:[]},
  {id:'synthetic-barrow-order-2',retailer_id:'synthetic-barrow-retailer-2',state:'NEW',items:[{id:'synthetic-barrow-item-2',sku:'UNKNOWN-1',quantity:2,price:{currency:'USD',amount_minor:5200}}],shipments:[]}
 ]};
 const server=createServer((request,response)=>{
  const url=new URL(request.url,'http://localhost');state.requests.push({method:request.method,path:url.pathname,cursor:url.searchParams.get('cursor'),limit:url.searchParams.get('limit')});
  if(request.headers['x-faire-access-token']!=='synthetic-barrow-1'&&!(['synthetic-barrow-2','synthetic-barrow-4'].includes(request.headers['x-faire-oauth-access-token'])&&request.headers['x-faire-app-credentials']==='synthetic-barrow-3')){state.unauthorized++;response.writeHead(401).end();return}
  if(request.method!=='GET'||url.pathname!=='/external-api/v2/orders'){response.writeHead(404).end();return}
  if(url.searchParams.get('cursor')==='synthetic-barrow-cursor-2'&&state.failSecond){response.writeHead(503).end('synthetic-barrow-unavailable');return}
  if(request.headers['x-faire-oauth-access-token']==='synthetic-barrow-4'){response.setHeader('content-type',['application','json'].join('/'));response.end(JSON.stringify({orders:[{...state.orders[0],id:'synthetic-barrow-order-3'}],cursor:null}));return}
  response.setHeader('content-type',['application','json'].join('/'));const body=JSON.stringify(url.searchParams.has('cursor')?{orders:[state.orders[1]],cursor:null}:{orders:[state.orders[0]],cursor:'synthetic-barrow-cursor-2'});
  if(state.hold){const held=state.hold;state.hold=null;held(()=>response.end(body));return}
  response.end(body);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const origin='http://127.0.0.1:'+server.address().port;
 const bindings={FAIRE_CONNECTIONS:JSON.stringify({brand1:{origin,accessToken:'synthetic-barrow-1'}})};
 const h=await installation({built,bindings,networkEdge:async request=>{if(new URL(request.url).hostname==='api.stripe.com'){state.paymentRequests++;return Response.json({error:'Unexpected collection'},{status:500})}}});t.after(()=>h.close());
 await h.command('account.save',{id:'cedar',value:{...accountValue('synthetic-barrow-customer-1'),minimumCents:0}});
 const configure=(enabled=true,opts={})=>h.api('/api/barrow/faire/configure',{brand:'brand1',enabled,reason:'Owner authorizes the configured brand read boundary.'},opts);
 const poll=(payload={},opts={})=>h.api('/api/barrow/faire/poll',{brand:'brand1',...payload},opts);
 const read=()=>h.api('/api/barrow/faire');
 const match=(row,skuMap,opts={},extras={})=>h.api('/api/barrow/faire/match',{brand:row.brand,id:row.source_id,revision:row.revision,accountId:'cedar',skuMap,reason:'Owner reviewed the exact retailer and SKU mapping.',...extras},opts);
 const holdNextPage=()=>{let release,received;const ready=new Promise(resolve=>{received=resolve});state.hold=send=>{release=send;received()};return {ready,release:()=>release()}};
 return {h,state,bindings,origin,configure,poll,read,match,holdNextPage};
}
export async function ingestFixture(f) {
 await f.configure();let result=await f.poll();await f.match(result.orders[0],{'OAT-1':'OAT-1'});f.state.failSecond=false;result=await f.poll();await f.match(result.orders.find(row=>row.source_id==='synthetic-barrow-order-2'),{'UNKNOWN-1':'OAT-1'});assert.equal((await f.read()).orders.length,2);
}
