import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogFixture } from '../fixtures/catalog-search.mjs';
import { archive } from './harness.mjs';

test('catalog search finds entitled SKU, barcode and text with stable pages and observed-stock variant filters',async t=>{
 const {h,pier,items,search}=await catalogFixture(t);
 await h.command('catalog.refresh',{accountId:'cedar'});
 assert.equal((await search({sku:items[3].sku.toLowerCase()})).items[0].sku,items[3].sku);
 assert.equal((await search({barcode:items[7].barcode})).items[0].sku,items[7].sku);
 const first=await search({q:'WHOLESALE COTTON'}),second=await search({q:'Wholesale cotton',page:'2'});
 assert.equal(first.items.length,25);assert.equal(first.hasNext,true);assert.equal(second.items.length,7);assert.equal(second.hasNext,false);
 assert.equal(new Set([...first.items,...second.items].map(item=>item.sku)).size,32);
 const filtered=await search({color:'Blue',size:'M',availability:'out-of-stock'});
 assert.ok(filtered.items.length>0);assert.ok(filtered.items.every(item=>item.color==='Blue'&&item.size==='M'&&item.available==='0'));
 assert.equal((await search({availability:'in-stock'})).items[0].sku,'OAT-1');
 assert.equal((await search({q:'%_'})).items.length,0);
 assert.equal((await search({q:"' OR 1=1 --"})).items.length,0);
 for(const query of [{page:'0'},{page:'1.1'},{q:'x'.repeat(161)},{availability:'promised'},{category:'unimplemented'}])await search(query,{status:400});
 const refresh=await h.command('catalog.refresh',{accountId:'cedar'});
 assert.equal(refresh.count,33);assert.equal(await h.db.prepare('SELECT COUNT(*) n FROM bw_catalog_search').first('n'),33);
 assert.ok((await h.api('/api/barrow/audit?search=catalog.refreshed')).events.length>0);
 // Refresh removes source-retired products; an unavailable source preserves the previous atomic observation.
 await pier.command('item.save',{...items[3],archived:true});await h.command('catalog.refresh',{accountId:'cedar'});
 assert.equal((await search({sku:items[3].sku})).items.length,0);
 const observation=(await search({barcode:items[7].barcode})).revision;
 await pier.close();await h.command('catalog.refresh',{accountId:'cedar'},{status:503});
 assert.equal((await search({barcode:items[7].barcode})).revision,observation);
 assert.ok((await archive(h)).filter(row=>row.kind==='part').every(row=>!JSON.stringify(row).includes('bw_catalog_search')));
});

test('catalog search enforces current account authority and invalidates observations after price, attribute or connection changes',async t=>{
 const {h,products,value,buyer,search}=await catalogFixture(t,3,{BARROW_TEST_CLOCK:'2030-01-02T04:59:59Z'});
 await search({},{...buyer,status:409});
 await h.command('catalog.refresh',{accountId:'cedar'});
 const other={as:await h.signIn('other@example.test')};
 await h.command('account.save',{id:'other',value:{...value,name:'Other company',email:'other@example.test',pierCustomerId:products.customer.id,prices:[{sku:'OAT-1',unitCents:9999,minQty:1}]},duplicateReviews:[{id:'cedar',revision:'synthetic-barrow-account-revision'}]});
 await h.command('catalog.refresh',{accountId:'other'});
 await search({accountId:'other'},{...buyer,status:404});
 await search({},{...other,status:404});
 await search({},{as:'',status:401});
 await h.command('catalog.refresh',{accountId:'cedar'},{...buyer,status:403});
 const {token}=await h.api('/api/barrow/agent-token',{});
 await search({},{as:'',headers:{authorization:`Bearer ${token}`},status:403});
 const found=await search({sku:'OAT-1'});assert.equal(found.items[0].unitCents,6500);assert.ok(!JSON.stringify(found).includes('9999'));
 const current=await h.api('/api/barrow/accounts/by-id/cedar');
 await h.command('account.save',{id:current.id,revision:current.revision,value:{...current.value,priceRevisions:[{effectiveFrom:'2030-01-02',prices:[{sku:'OAT-1',unitCents:1303,minQty:1}]}]}});
 await h.command('catalog.refresh',{accountId:'cedar'});assert.equal((await search({sku:'OAT-1'})).items[0].unitCents,6500);
 await h.configure({BARROW_TEST_CLOCK:'2030-01-02T05:00:00Z'});
 assert.equal((await search({sku:'OAT-1'},{...buyer,status:409})).error.code,'CATALOG_REFRESH');
 assert.equal((await h.api('/api/barrow/catalogue?accountId=cedar',undefined,buyer)).items[0].unitCents,1303);
 await h.command('catalog.refresh',{accountId:'cedar'});assert.equal((await search({sku:'OAT-1'})).items[0].unitCents,1303);assert.equal((await search({sku:'STYLE-00000'})).items.length,0);
 await h.db.prepare('UPDATE bw_accounts SET revision=? WHERE id=?').bind('synthetic-barrow-new-price','cedar').run();
 await search({},{...buyer,status:409});await h.command('catalog.refresh',{accountId:'cedar'});
 await h.db.prepare("UPDATE bw_settings SET revision=? WHERE key='variant-attributes'").bind('synthetic-barrow-new-attributes').run();
 await search({},{...buyer,status:409});await h.command('catalog.refresh',{accountId:'cedar'});
 await h.configure({PIER_ORIGIN:'http://127.0.0.1:1'});await search({},{...buyer,status:409});
});
