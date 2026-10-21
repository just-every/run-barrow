import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { installation, accountValue } from './harness.mjs';

test('RPT-006: scoped SQL search and ship-window pages stay under two-second p95 across 3 seasons, 400 accounts and 20000 orders', async t => {
 const h=await installation();t.after(()=>h.close());
 // Large historical fixture only: public reads below exercise the real authenticated Worker/D1 door.
 const accounts=Array.from({length:400},(_,i)=>({id:`company-${i}`,value:{...accountValue(`pier-customer-${i}`,`buyer-${i}@example.test`),name:`Wholesale company ${i}`}}));
 for(let start=0;start<accounts.length;start+=50) await h.db.batch(accounts.slice(start,start+50).map(a=>h.db.prepare('INSERT INTO bw_accounts VALUES(?,?,?)').bind(a.id,JSON.stringify(a.value),`account-revision-${a.id}`)));
 const seasons=['2026-02-01','2026-06-01','2026-10-01'];
 for(let start=0;start<20000;start+=50) await h.db.batch(Array.from({length:50},(_,j)=>{
  const i=start+j,a=accounts[i%400],season=seasons[i%3],id=`order_${String(i).padStart(5,'0')}`;
  const order={id,accountId:a.id,accountRevision:`account-revision-${a.id}`,customerName:a.value.name,reference:`PO-${String(i).padStart(5,'0')}`,requestedDate:i%11===0?'':season,preparedAt:`${season}T12:00:00.000Z`,status:'approved',currency:i===0?'AUD':'USD',termsDays:30,totalCents:13000,preparedBy:'historical-owner',pierCustomerId:a.value.pierCustomerId,pierOrigin:'https://inventory.example.test',pierOrderId:`EXT-${String(i).padStart(5,'0')}`,lines:[{sku:`SKU-${i%700}`,name:'Wholesale product',quantity:2,unitCents:6500,lineCents:13000,minQty:1,itemId:`item-${i%700}`} ]};
  return h.db.prepare('INSERT INTO bw_orders VALUES(?,?,?,?)').bind(id,a.id,JSON.stringify(order),`revision-${i}`);
 }));
 const buyer={as:await h.signIn('buyer-0@example.test')},foreign={as:await h.signIn('unlinked@example.test')};
 const search=(query={},actor={})=>h.api('/api/barrow/orders/search?'+new URLSearchParams(query),undefined,actor);
 assert.equal((await search({po:'PO-19999'})).rows[0].id,'order_19999');
 assert.deepEqual((await search({externalId:'EXT-19999'})).rows.map(r=>r.id),['order_19999']);
 const company=await search({company:'Wholesale company 399'});assert.equal(company.rows.length,25);assert.ok(company.rows.every(r=>r.accountId==='company-399'));
 const combined=await search({company:'Wholesale company 399',po:'19999',sku:'SKU-399',externalId:'EXT-19999'});assert.deepEqual(combined.rows.map(r=>r.id),['order_19999']);
 for(const term of ['%','_',"' OR 1=1 --"] ) assert.deepEqual((await search({po:term})).rows,[]);
 assert.deepEqual((await search({po:'PO-19999'},buyer)).rows,[]);assert.deepEqual((await search({},foreign)).rows,[]);
 const own=await search({},buyer);assert.equal(own.rows.length,25);assert.ok(own.rows.every(r=>r.accountId==='company-0'));
 const first=await search({sort:'ship-asc'}),second=await search({sort:'ship-asc',page:'2'});
 assert.equal(first.hasNext,true);assert.equal(first.rows.length,25);assert.equal(second.page,2);
 assert.equal(new Set([...first.rows,...second.rows].map(r=>r.id)).size,50);
 assert.ok([...first.rows,...second.rows].every(r=>r.shipWindow===seasons[0]));
 assert.ok(first.rows.every((r,i,rows)=>i===0||rows[i-1].id<r.id));
 const lastDates=await search({sort:'ship-desc'});assert.ok(lastDates.rows.every(r=>r.shipWindow===seasons[2]));
 for(const sort of ['ship-asc','ship-desc']) assert.ok((await search({sort,page:'800'})).rows.every(r=>r.shipWindow===null));
 assert.equal((await h.request('/api/barrow/orders/search?po=PO-19999')).headers.get('cache-control'),'no-store');
 const legacy=(await search({po:'PO-00000'})).rows[0];assert.equal(legacy.currency,'AUD');
 const source=await h.api(legacy.orderPath);assert.equal(source.revision,legacy.revision);assert.equal(source.totalCents,legacy.totalCents);assert.equal(source.lines[0].lineCents,13000);
 assert.deepEqual((await search({page:'999999'})).rows,[]);
 for(const query of [{page:'0'},{page:'1.5'},{sort:'ship;DROP TABLE bw_orders'},{po:'a'.repeat(161)}]) await h.api('/api/barrow/orders/search?'+new URLSearchParams(query),undefined,{status:400});
 const {token}=await h.api('/api/barrow/agent-token',{});await search({}, {as:'',headers:{authorization:`Bearer ${token}`},status:403});
 await search({},{as:'',status:401});
 // No carrier source exists: do not invent tracking or claim its required performance point.
 assert.match(first.tracking,/not recorded/);
 const timings={po:[],sku:[],sort:[]};
 for(let attempt=0;attempt<20;attempt++)for(const [kind,query] of Object.entries({po:{po:'PO-19999'},sku:{sku:'SKU-399'},sort:{sort:attempt%2?'ship-asc':'ship-desc'}})){
  const before=performance.now(),page=await search(query);timings[kind].push(performance.now()-before);assert.ok(page.rows.length>0&&page.rows.length<=25);
 }
 for(const [kind,times]of Object.entries(timings)){times.sort((a,b)=>a-b);const p95=times[Math.ceil(times.length*.95)-1];t.diagnostic(`${kind} first-page p95 ${p95.toFixed(1)} ms (20 requests, 20000 orders)`);assert.ok(p95<2000,`${kind} p95 ${p95} ms`)}
});
