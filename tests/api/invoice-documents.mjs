import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { installation, stock, accountValue, activateStaff, archive, restore } from './harness.mjs';
import { erasurePreview, erasurePayload, verifiedRequest } from './retention-fixture.mjs';

// Read actual PDF content streams and their Unicode character maps, independently
// of invoice formatting. These are the bytes returned by the public download.
export async function readPdf(bytes) {
 const document=await PDFDocument.load(bytes),streams=[],fonts=[];
 for(const match of Buffer.from(bytes).toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
  let data=Buffer.from(match[1],'latin1');try { data=inflateSync(data); } catch {}
  if(data.length>=4&&[0x00010000,0x74727565].includes(data.readUInt32BE(0)))fonts.push(fontkit.create(data));
  else streams.push(data.toString('utf8'));
 }
 const mapping=new Map();
 for(const stream of streams)for(const section of stream.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))for(const pair of section[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
  mapping.set(pair[1].toUpperCase(),String.fromCharCode(...pair[2].match(/.{4}/g).map(hex=>parseInt(hex,16))));
 }
 assert.ok(fonts.length,'Invoice embeds readable glyph outlines');
 const lines=[];
 for(const stream of streams)for(const text of stream.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
  const glyphs=text[1].match(/.{4}/g);
  assert.ok(glyphs.every(hex=>parseInt(hex,16)!==0),'PDF text uses a missing glyph instead of the retained character');
  lines.push(glyphs.map(hex=>{
   const value=mapping.get(hex.toUpperCase())??'';
   if(value.trim())assert.ok(fonts[0].getGlyph(parseInt(hex,16)).path.commands.length,`Downloaded PDF has no outline for ${value}`);
   return value;
  }).join(''));
 }
 return {pages:document.getPageCount(),text:lines.join('\n')};
}
export async function invoiceDownload(h,order,who={}) {
 const response=await h.request(`/api/barrow/invoices/${order.id}.pdf`,who);
 assert.equal(response.status,200,await response.clone().text());
 assert.equal(response.headers.get('content-type'),'application/pdf');
 assert.equal(response.headers.get('cache-control'),'no-store');
 assert.equal(response.headers.get('x-content-type-options'),'nosniff');
 assert.match(response.headers.get('content-disposition'),/attachment; filename="barrow-.*\.pdf"/);
 const bytes=Buffer.from(await response.arrayBuffer()),pdf=await readPdf(bytes);
 assert.ok(pdf.text.includes(`Invoice ${order.invoice.number}`),pdf.text);
 assert.ok(pdf.text.includes(`Currency: ${order.currency??'AUD'}`));
 assert.ok(pdf.text.includes(`(${order.totalCents} minor units)`));
 assert.ok(pdf.text.includes('Tax: Not calculated; no verified tax is included.'));
 assert.ok(pdf.text.includes(`Issue date: ${order.invoice.issuedAt}`));
 assert.ok(pdf.text.includes(`Due date: ${order.invoice.dueAt}`));
 return {...pdf,bytes};
}

export async function invoiceFixture(t,options={}) {
 const pier=await installation({pier:true});t.after(()=>pier.close());
 const source=await stock(pier,'200'),items=[];
 for(let index=0;index<12;index++)items.push(await pier.command('item.save',{sku:`synthetic-barrow-${730+index}`,name:`Crème d’avoine Łódź ${index+1} ${'retained description '.repeat(4)}`,unit:'case',packSize:'1'}));
 const po=await pier.command('po.draft',{supplierId:source.supplier.id,promiseDate:'2026-11-01',reason:'Invoice document fixture stock',lines:items.map(item=>({itemId:item.id,quantity:'20',price:'20.00'}))});
 await pier.command('po.approve',{poId:po.id,version:po.version});await pier.command('po.commit',{poId:po.id,version:po.version});
 await pier.command('receipt.create',{poId:po.id,supplierReference:'synthetic-barrow-752',lines:po.lines.map(line=>({poLineId:line.id,locationId:source.location.id,quantity:'20',cost:'20.00'}))});
 const h=await installation({...options,https:true,bindings:{PIER_ORIGIN:pier.origin,PIER_SESSION:pier.cookie}});t.after(()=>h.close());
 let account=await h.command('account.save',{id:'cedar',value:{...accountValue(source.customer.id),name:('王氏食品 Wáng Family Foods Épicerie Łódź '+ 'Long retained buyer identity '.repeat(4)).trim(),minimumCents:0,prices:items.map((item,index)=>({sku:item.sku,unitCents:6501+index,minQty:1}))}});
 const buyer={as:await h.signIn(account.value.email)};
 const seller=await h.command('seller.identity',{revision:null,legalName:'Société Ω des récoltes',address:'12 rue de la Récolte, Montréal '+ 'Long retained address '.repeat(8),registration:'synthetic-barrow-753'});
 const bill=await h.command('location.save',{accountId:'cedar',kind:'bill-to',value:{name:'Retained billing',line1:'101 Original Avenue',city:'New York',state:'NY',zip:'10004'}});
 const ship=await h.command('location.save',{accountId:'cedar',kind:'ship-to',value:{name:'Retained receiving',line1:'102 Original Avenue',city:'New York',state:'NY',zip:'10004'}});
 const method={id:'parcel',name:'Recorded parcel',kind:'parcel',accountIds:[],states:[],warehouses:[],minCents:0,maxCents:null,baseCents:1500,handlingCents:250,freeOverCents:null,transitMinDays:2,transitMaxDays:5,quoteRequired:false};
 const shipping=await h.command('shipping.settings',{revision:null,methods:[method]});
 let order=await h.command('order.prepare',{accountId:'cedar',reference:'synthetic-barrow-754',lines:items.map(item=>({sku:item.sku,quantity:2}))},buyer);
 const pending=await h.request(`/api/barrow/invoices/${order.id}.pdf`,buyer);assert.equal(pending.status,409);
 const option=(await h.api(`/api/barrow/shipping/options?orderId=${order.id}`,undefined,buyer)).options[0];
 await h.command('shipping.select',{orderId:order.id,...option},buyer);
 await h.command('order.submit',{orderId:order.id,deliveryAcknowledged:true},buyer);
 order=await h.command('order.approve',{orderId:order.id});
 assert.equal(order.status,'approved');assert.equal(order.totalCents,157906);assert.equal(order.delivery.totalCents,1750);
 return {h,pier,source,items,buyer,account,seller,bill,ship,method,shipping,order};
}

export async function invoiceDocuments(t) {
 const f=await invoiceFixture(t),{h,pier,buyer,order,items}=f;
 console.info('Invoice probe: native fixture acknowledged');
 const before=await h.api('/api/barrow/export.json'),stockBefore=(await pier.api('/api/pier/state')).orders,mailBefore=h.mail.deliveries.length;
 const pdf=await invoiceDownload(h,order,buyer),csv=await(await h.request(`/api/barrow/invoices/${order.id}.csv`,buyer)).text();
 console.info('Invoice probe: downloaded Unicode PDF and CSV');
 assert.ok(pdf.pages>=3);const compact=pdf.text.replace(/\s/g,'');
 for(const value of [f.account.value.name,f.seller.identity.legalName,f.seller.identity.address,'101 Original Avenue','102 Original Avenue','157906 minor units','1500 minor units','250 minor units','1750 minor units','Net 30 days','2 case'])assert.ok(compact.includes(value.replace(/\s/g,'')),value);
 for(const [index,item] of items.entries()) {
  assert.ok(compact.includes(item.name.replace(/\s/g,'')));assert.ok(compact.includes(`(${(6501+index)*2}minorunits)`));
  assert.ok(csv.includes(`"${6501+index}","${(6501+index)*2}","157906"`));
 }
 assert.ok(csv.includes('not calculated'));assert.ok(csv.includes(f.seller.identity.legalName));
 assert.equal(h.mail.deliveries.length,mailBefore);
 console.info('Invoice probe: exact retained fields checked');
 const {token}=await h.api('/api/barrow/agent-token',{}),agent={as:'',headers:{authorization:`Bearer ${token}`}};
 const foreignCustomer=await pier.command('party.save',{name:'Separate invoice account',kind:'customer'});
 const foreign=await h.command('account.save',{id:'foreign',value:{...accountValue(foreignCustomer.id,f.account.value.email.replace('@','+foreign@')),minimumCents:0}});
 const other={as:await h.signIn(foreign.value.email)};
 console.info('Invoice probe: foreign account created');
 const finance=await activateStaff(h,f.account.value.email.replace('@','+finance@'),{role:'finance',accounts:['cedar'],warehouses:[],reports:[],discountLimitCents:0,stockExceptionLimitCents:0});
 const operations=await activateStaff(h,f.account.value.email.replace('@','+operations@'),{role:'operations',accounts:['cedar'],warehouses:'all',reports:['fulfillment'],discountLimitCents:0,stockExceptionLimitCents:0});
 assert.deepEqual((await invoiceDownload(h,order,finance.who)).bytes,pdf.bytes);
 for(const extension of ['pdf','csv'])for(const [who,status] of [[other,404],[operations.who,403],[agent,403],[{as:''},401]])assert.equal((await h.request(`/api/barrow/invoices/${order.id}.${extension}`,who)).status,status);
 console.info('Invoice probe: functional finance and refusals checked');
 const email=f.account.value.email.replace('@','+purchaser@');
 await h.command('company.invite',{accountId:'cedar',email,name:'Purchaser without finance',policy:{rights:['purchaser'],locations:'all',perOrderLimitCents:null,approvalLimitCents:null},reason:'Explicit purchaser without invoice permission.'},buyer);
 const purchaser={as:await h.signIn(email,'existing')},message=h.mail.requests.findLast(row=>row.message.subject==='Your company buyer invitation'&&row.message.to.includes(email)).message,link=new URL(message.text.match(/https?:\/\/[^\s<>]+\/app\?[^\s<>]+/)[0]);
 await h.command('company.accept',{invitationId:link.searchParams.get('companyInvitation'),token:link.searchParams.get('companyToken')},purchaser);
 for(const extension of ['pdf','csv'])assert.equal((await h.request(`/api/barrow/invoices/${order.id}.${extension}`,purchaser)).status,403);
 await h.command('staff.revoke',{userId:finance.id,revision:finance.grant.revision,reason:'End invoice access after reviewed role removal.'});
 for(const extension of ['pdf','csv'])assert.equal((await h.request(`/api/barrow/invoices/${order.id}.${extension}`,finance.who)).status,404);
 console.info('Invoice probe: purchaser and revoked finance refused');
 await h.command('seller.identity',{revision:f.seller.revision,legalName:'Changed current seller',address:'Changed current address'});
 await h.command('account.save',{id:'cedar',revision:f.account.revision,value:{...f.account.value,name:'Changed current buyer',termsDays:7,prices:items.map(item=>({sku:item.sku,unitCents:9999,minQty:1}))}});
 await h.command('location.save',{accountId:'cedar',id:f.bill.id,revision:f.bill.revision,value:{...f.bill.value,line1:'Changed billing address'}});
 await h.command('shipping.settings',{revision:f.shipping.revision,methods:[{...f.method,baseCents:9999}]});
 await pier.command('item.save',{id:items[0].id,version:items[0].version,sku:items[0].sku,name:'Changed catalog description',unit:'case',packSize:'1'});
 assert.deepEqual((await invoiceDownload(h,order,buyer)).bytes,pdf.bytes);assert.equal(await(await h.request(`/api/barrow/invoices/${order.id}.csv`,buyer)).text(),csv);
 assert.deepEqual((await h.api('/api/barrow/export.json')).orders,before.orders);assert.deepEqual((await pier.api('/api/pier/state')).orders,stockBefore);
 // The other retained seller source is the accepted order's buying profile.
 const brand=await h.command('brand.save',{id:'synthetic-barrow-755',revision:null,value:{name:'Original brand',seller:{legalName:'Original profile seller',address:'Original profile address'},currency:'USD'}});
 const profile=await h.command('profile.save',{id:'synthetic-barrow-756',revision:null,accountId:'cedar',value:{brandId:brand.id,name:'Original buying profile',prices:[{sku:items[0].sku,unitCents:6501,minQty:1}],minimumCents:0,termsDays:14}});
 await h.command('profile.grant',{profileId:profile.id,userId:(await h.api('/api/barrow/state',undefined,buyer)).actor.id,approved:true,reason:'Supplier approved this buyer for the retained profile.'});
 let profiled=await h.command('order.prepare',{accountId:'cedar',profileId:profile.id,reference:'synthetic-barrow-757',lines:[{sku:items[0].sku,quantity:2}]},buyer);
 await h.command('shipping.select',{orderId:profiled.id,...(await h.api(`/api/barrow/shipping/options?orderId=${profiled.id}`,undefined,buyer)).options[0]},buyer);
 await h.command('order.submit',{orderId:profiled.id,deliveryAcknowledged:true},buyer);profiled=await h.command('order.approve',{orderId:profiled.id});
 const profilePdf=await invoiceDownload(h,profiled,buyer),profileCsv=await(await h.request(`/api/barrow/invoices/${profiled.id}.csv`,buyer)).text();
 assert.ok(profilePdf.text.includes('Seller: Original profile seller'));assert.ok(profilePdf.text.includes('Net 14 days'));
 await h.command('brand.save',{id:brand.id,revision:brand.revision,value:{...brand.value,name:'Changed current brand',seller:{legalName:'Changed current profile seller',address:'Changed current profile address'}}});
 await h.command('profile.save',{id:profile.id,revision:profile.revision,accountId:'cedar',value:{...profile.value,termsDays:7,prices:[{sku:items[0].sku,unitCents:9999,minQty:1}]}});
 assert.deepEqual((await invoiceDownload(h,profiled,buyer)).bytes,profilePdf.bytes);assert.equal(await(await h.request(`/api/barrow/invoices/${profiled.id}.csv`,buyer)).text(),profileCsv);
 // Legacy archive records predate currency snapshots; their public download stays AUD.
 const legacy={...order,id:'legacy-invoice',invoice:{...order.invoice,number:'BAR-legacy-invoice'}};delete legacy.currency;
 await h.db.prepare('INSERT INTO bw_orders VALUES(?,?,?,?)').bind(legacy.id,legacy.accountId,JSON.stringify(legacy),legacy.revision).run();
 const legacyPdf=await invoiceDownload(h,legacy,buyer);assert.ok(legacyPdf.text.includes('Seller: Not recorded'));assert.ok((await(await h.request('/api/barrow/invoices/legacy-invoice.csv',buyer)).text()).includes('"AUD"'));
 await h.command('order.cancel',{orderId:order.id,reason:'Supplier reviewed the unshipped cancellation.'});
 assert.equal((await h.request(`/api/barrow/invoices/${order.id}.pdf`,buyer)).status,409);
 await h.command('credit.issue',{orderId:order.id,kind:'cancellation',lines:order.lines.map((line,index)=>({line:index+1,quantity:line.quantity})),freightCents:1750,reason:'Correct the original retained invoice after confirmed cancellation.'});
 const withdrawn=await invoiceDownload(h,order,buyer);assert.ok(withdrawn.text.includes('withdrawn; original preserved with linked credit'));assert.ok(withdrawn.text.replace(/\s/g,'').includes('157906minorunits'));
 console.info('Invoice probe: cancellation correction retained');
 const saved=await archive(h);await verifiedRequest(h);await h.command('retention.erase-account',erasurePayload(await erasurePreview(h)));
 assert.equal((await h.request(`/api/barrow/invoices/${order.id}.pdf`,buyer)).status,401);
 assert.deepEqual((await invoiceDownload(h,order)).bytes,withdrawn.bytes);
 console.info('Invoice probe: reviewed erasure retained financial history');
 const target=await installation();t.after(()=>target.close());await restore(target,saved);
 assert.deepEqual((await invoiceDownload(target,order)).bytes,withdrawn.bytes);assert.deepEqual((await invoiceDownload(target,legacy)).bytes,legacyPdf.bytes);
 assert.equal((await target.request(`/api/barrow/invoices/${order.id}.pdf`,buyer)).status,401);
}
