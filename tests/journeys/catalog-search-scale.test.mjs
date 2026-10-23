import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { catalogFixture } from '../fixtures/catalog-search.mjs';

test('10,000-variant public catalog SKU, barcode and filtered first-page searches have p95 at most one second',async t=>{
 const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 const {h,items,search}=await catalogFixture(t,10000);
 const refreshed=await h.command('catalog.refresh',{accountId:'cedar'});assert.equal(refreshed.count,10001);
 const timings={sku:[],barcode:[],filtered:[]};
 // Include each first request: no warmup samples are discarded.
 for(let i=0;i<30;i++)for(const kind of Object.keys(timings)){
  const target=items[(i*331)%items.length],query=kind==='sku'?{sku:target.sku}:kind==='barcode'?{barcode:target.barcode}:{color:'Blue',size:'M',availability:'out-of-stock'};
  const start=performance.now(),result=await search(query);timings[kind].push(performance.now()-start);
  if(kind==='filtered'){assert.equal(result.items.length,25);assert.ok(result.hasNext);assert.ok(result.items.every(row=>row.color==='Blue'&&row.size==='M'&&row.available==='0'))}
  else{assert.equal(result.items.length,1);assert.equal(result.items[0].sku,target.sku)}
 }
 for(const [kind,samples] of Object.entries(timings)){
  samples.sort((a,b)=>a-b);const p95=samples[Math.ceil(samples.length*.95)-1];
  t.diagnostic(JSON.stringify({head,variants:10000,kind,samples:samples.length,p95Ms:p95}));assert.ok(p95<=1000,`${kind} p95 ${p95}ms exceeds 1 second`);
 }
});
