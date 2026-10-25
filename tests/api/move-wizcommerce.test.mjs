import test from 'node:test';
import assert from 'node:assert/strict';
import {archive,restore,installation} from './harness.mjs';
import {sparkFixture} from './sparklayer-fixture.mjs';
import {wizInput,wizWorkbook,wizNativeInput,csv,headers,items} from './wizcommerce-fixture.mjs';

test('WizCommerce FTP UUID joins preserve separate order and quote facts, payments and units; workbook layouts replay without duplicate history',async t=>{
 const {h,pier}=await sparkFixture(t),input=wizInput(),mail=h.mail.deliveries.length,before=await pier.api('/api/pier/state');
 const preview=p=>h.api('/api/barrow/imports/wizcommerce/preview',p),apply=async p=>{const report=await preview(p);return h.api('/api/barrow/imports/wizcommerce/apply',{...p,fingerprint:report.fingerprint,reason:'Owner retained labeled WizCommerce history; no native customers or login authority activated.'})};
 const first=await preview(input);assert.equal(first.source.documents,2);assert.deepEqual(first.quantityRules,[{accountId:'cedar',sku:'OAT-1',previous:{casePack:null,increment:null},planned:{casePack:2,increment:2}}]);assert.equal(first.source.lines,2);assert.deepEqual(first.entities,{customers:1,addresses:0,websiteUsers:1});assert.match(first.missing.join(' '),/separate explicit native invitation review/);assert.equal(first.incomplete,false);
 assert.equal((await h.api('/api/barrow/imports/wizcommerce')).history.length,0);const report=await preview(input);const approval={...input,fingerprint:report.fingerprint,reason:'Exact FTP approval'};await h.api('/api/barrow/imports/wizcommerce/apply',approval);assert.equal((await h.api('/api/barrow/imports/wizcommerce/apply',approval)).replayed,true);
 assert.equal((await h.api('/api/barrow/accounts/by-id/cedar')).value.prices[0].casePack,2);
 const docs=(await h.api('/api/barrow/imports/wizcommerce')).history;assert.equal(docs.length,2);
 const order=docs.find(row=>row.document_type==='order').value,quote=docs.find(row=>row.document_type==='quote').value;
 assert.equal(order.id,'synthetic-barrow-51');assert.equal(order.sourceFacts.reference,'WC_001');assert.equal(order.sourceFacts.paidCents,13000);assert.equal(order.sourceFacts.paymentStatus,'Paid');assert.equal(order.lines[0].unit,'case');assert.equal(order.originals[0].fields['Document ID'],'WC_001');assert.equal(quote.type,'quote');assert.equal(quote.totalCents,7000);assert.equal(quote.currency,'CAD');
 await apply(input);
 for(const layout of ['split','master']) {
  const workbook={...input,ftp:undefined,websiteUsers:undefined,workbook:wizWorkbook(layout)},report=await preview(workbook);assert.equal(report.planned.newDocuments,0);assert.deepEqual(report.entities,{customers:1,addresses:1,websiteUsers:0});await apply(workbook);
 }
 const exported=await h.api('/api/barrow/export.json');assert.equal(exported.sourcehistory.length,2);assert.equal(exported.sourceimports.length,4);assert.equal(exported.orders.length,0);assert.equal(exported.quotes.length,0);
 assert.equal((await h.api('/api/barrow/state')).orders.length,0);assert.deepEqual((await pier.api('/api/pier/state')).orders,before.orders);assert.equal(h.mail.deliveries.length,mail);
 assert.equal((await h.db.prepare('SELECT count(*) AS n FROM bw_company_invites').first()).n,0);
});

test('WizCommerce refuses orphan or ambiguous references, conflicting headers, unmapped customers and changed replay without losing original history',async t=>{
 const {h}=await sparkFixture(t),original=wizInput();
 const preview=p=>h.request('/api/barrow/imports/wizcommerce/preview',{method:'POST',body:p});
 for(const mutate of [p=>p.ftp.items.csv=p.ftp.items.csv.replaceAll('synthetic-barrow-51','synthetic-barrow-99'),p=>p.ftp.items.csv=p.ftp.items.csv.replaceAll('WC_001','WC_002'),p=>p.ftp.headers.csv=csv([...headers,headers[1]]),p=>p.authority.customers={},p=>p.ftp.headers.csv+='malformed\n']) {
  const input=structuredClone(original);mutate(input);assert.equal((await preview(input)).status,400);
 }
 const unsafe={...original,ftp:undefined,workbook:wizWorkbook('split',{formula:true})};assert.equal((await preview(unsafe)).status,400);
 const report=await (await preview(original)).json();await h.api('/api/barrow/imports/wizcommerce/apply',{...original,fingerprint:report.fingerprint,reason:'Reviewed source'});
 original.ftp.headers.csv=original.ftp.headers.csv.replace('130.00','131.00');const conflict=await (await preview(original)).json();assert.equal(conflict.matches,false);assert.match(conflict.errors.join(' '),/changed after import/);
 const buyer={as:await h.signIn('buyer@example.test')};assert.equal((await h.request('/api/barrow/imports/wizcommerce',buyer)).status,403);
 assert.equal((await h.api('/api/barrow/imports/wizcommerce')).history.length,2);
});


test('WizCommerce website users need an explicit replay-safe native invitation review and exact-email acceptance before purchasing access',async t=>{
 const {h}=await sparkFixture(t),input=wizInput(),report=await h.api('/api/barrow/imports/wizcommerce/preview',input);
 assert.deepEqual(report.invitationCandidates,[{accountId:'cedar',email:'new-buyer@example.test',name:'New buyer'}]);
 const applied=await h.api('/api/barrow/imports/wizcommerce/apply',{...input,fingerprint:report.fingerprint,reason:'Retain source and review invitations separately'});
 assert.equal(h.mail.deliveries.length,0);
 const review={importId:applied.id,fingerprint:applied.fingerprint,email:'new-buyer@example.test',policy:{rights:['purchaser'],locations:'all',perOrderLimitCents:25000,approvalLimitCents:0},reason:'Owner reviewed this source contact and its limited purchasing rights.'};
 assert.equal((await h.api('/api/barrow/imports/wizcommerce/invite',review,{status:400})).error.code,'IMPORT_INVITATION');
 assert.equal((await h.api('/api/barrow/imports/wizcommerce/invite',{...review,confirm:true,email:'foreign@example.test'},{status:400})).error.code,'IMPORT_INVITATION');
 const first=await h.api('/api/barrow/imports/wizcommerce/invite',{...review,confirm:true});assert.equal(first.status,'invitation requested');
 await h.api('/api/barrow/imports/wizcommerce/invite',{...review,confirm:true});assert.equal(h.mail.deliveries.length,1);assert.equal((await h.api('/api/barrow/imports/wizcommerce/invite',{...review,confirm:true,policy:{...review.policy,perOrderLimitCents:50000}},{status:409})).error.code,'IMPORT_INVITATION_CHANGED');
 assert.equal((await h.db.prepare("SELECT count(*) AS n FROM bw_company_invites WHERE email='new-buyer@example.test' AND status='requested'").first()).n,1);
 assert.equal((await h.db.prepare("SELECT state FROM bw_company_members WHERE email='new-buyer@example.test'").first()).state,'invited');
 const buyer={as:await h.signIn('new-buyer@example.test','existing')};assert.equal((await h.api('/api/barrow/state',undefined,buyer)).accounts.length,0);
 const message=h.mail.requests.find(row=>row.message.subject==='Your company buyer invitation').message,link=new URL(message.text.match(/https?:\/\/[^\s<>]+\/app\?[^\s<>]+/)[0]);
 await h.command('company.accept',{invitationId:link.searchParams.get('companyInvitation'),token:link.searchParams.get('companyToken')},buyer);
 const state=await h.api('/api/barrow/state',undefined,buyer);assert.equal(state.accounts.length,1);assert.deepEqual(state.actor.company.rights,['purchaser']);assert.equal(state.actor.company.perOrderLimitCents,25000);
 assert.equal((await h.request('/api/barrow/imports/wizcommerce/invite',{...buyer,method:'POST',body:{...review,confirm:true}})).status,403);
 const member=(await h.api('/api/barrow/company/members?accountId=cedar')).members.find(user=>user.email==='new-buyer@example.test');await h.command('company.erase',{memberId:member.id,revision:member.revision,confirm:'ERASE',reason:'Owner retires imported website-user custody.'});assert.ok((await h.api('/api/barrow/imports/wizcommerce')).imports.every(row=>row.source_json==='{}'));
 await h.command('account.erase',{accountId:'cedar',confirm:'ERASE'});assert.equal((await h.db.prepare('SELECT count(*) AS n FROM bw_import_invitations').first()).n,0);
 assert.equal((await h.api('/api/barrow/imports/wizcommerce/invite',{...review,confirm:true},{status:400})).error.code,'IMPORT_INVITATION');
});


test('WizCommerce activates reviewed native customers contacts and addresses atomically with write-free reconciliation, stable replay and inert restore',async t=>{
 const {h}=await sparkFixture(t),cedar=await h.api('/api/barrow/accounts/by-id/cedar');
 const input=wizNativeInput({...cedar.value,pierCustomerId:'synthetic-barrow-71'}),preview=p=>h.api('/api/barrow/imports/wizcommerce/preview',p),apply=async p=>{const report=await preview(p);assert.equal(report.matches,true,JSON.stringify(report.errors));return h.api('/api/barrow/imports/wizcommerce/apply',{...p,fingerprint:report.fingerprint,reason:'Owner reviewed exact native identities, source totals and current commercial settings.'})};
 const before=await h.api('/api/barrow/export.json'),mail=h.mail.deliveries.length,report=await preview(input);
 assert.deepEqual(report.nativeEntities,{source:{customers:1,contacts:1,addresses:2},planned:{customers:1,contacts:1,addresses:2,newCustomers:1,newContacts:1,newAddresses:2}});
 assert.deepEqual(report.totals,report.plannedTotals);assert.deepEqual(report.totals.map(row=>[row.currency,row.totalCents,row.quantity]),[['CAD',7000,1],['USD',13000,2]]);assert.equal(report.source.lists,0);assert.deepEqual(report.rejectedFields,[]);
 const afterPreview=await h.api('/api/barrow/export.json');delete before.manifest.exportedAt;delete afterPreview.manifest.exportedAt;assert.deepEqual(afterPreview,before);assert.equal(h.mail.deliveries.length,mail);
 const missing=structuredClone(input);delete missing.nativeAccounts;assert.match((await preview(missing)).errors.join(' '),/Missing native account settings/);
 const invalid=structuredClone(input);invalid.ftp.addresses.csv=invalid.ftp.addresses.csv.replaceAll('11201','90210');assert.equal((await h.request('/api/barrow/imports/wizcommerce/preview',{method:'POST',body:invalid})).status,400);
 const approval={...input,fingerprint:report.fingerprint,reason:'Reviewed exact native activation'};
 const applied=await h.api('/api/barrow/imports/wizcommerce/apply',approval);assert.equal((await h.api('/api/barrow/imports/wizcommerce/apply',approval)).replayed,true);
 const account=await h.api('/api/barrow/accounts/by-id/wren');assert.equal(account.value.prices[0].unitCents,cedar.value.prices[0].unitCents);assert.equal(account.value.prices[0].casePack,2);
 const places=(await h.api('/api/barrow/locations?accountId=wren')).locations;assert.equal(places.length,3);assert.equal(places.filter(row=>row.isDefault).length,2);assert.equal(places.find(row=>row.kind==='contact').value.email,'receiving@example.test');
 const buyer={as:await h.signIn('wren@example.test')};assert.equal((await h.api('/api/barrow/state',undefined,buyer)).accounts.length,0);
 for(const layout of ['split','master']){const p=wizNativeInput({...cedar.value,pierCustomerId:'synthetic-barrow-71'},layout),r=await preview(p);assert.equal(r.nativeEntities.planned.newCustomers,0);assert.equal(r.nativeEntities.planned.newContacts,0);assert.equal(r.nativeEntities.planned.newAddresses,0);assert.equal(r.planned.newDocuments,0);await apply(p)}
 assert.equal((await h.api('/api/barrow/locations?accountId=wren')).locations.length,3);assert.equal((await h.api('/api/barrow/imports/wizcommerce')).history.length,2);
 const current=(await h.api('/api/barrow/locations?accountId=wren')).locations.find(row=>row.kind==='contact');await h.command('location.save',{accountId:'wren',id:current.id,revision:current.revision,value:{...current.value,name:'Native contact edit'}});await apply(input);assert.equal((await h.api('/api/barrow/locations?accountId=wren')).locations.find(row=>row.id===current.id).value.name,'Native contact edit');
 const stale=await preview(input),loc=(await h.api('/api/barrow/locations?accountId=wren')).locations.find(row=>row.id===current.id);await h.command('location.save',{accountId:'wren',id:loc.id,revision:loc.revision,value:{...loc.value,phone:'212 555 0101'}});assert.equal((await h.api('/api/barrow/imports/wizcommerce/apply',{...input,fingerprint:stale.fingerprint,reason:'Stale location approval'},{status:409})).error.code,'IMPORT_CHANGED');
 const changed=structuredClone(input);changed.ftp.contacts.csv=changed.ftp.contacts.csv.replace('Wren receiving','Changed source');assert.match((await preview(changed)).errors.join(' '),/changed after import/);
 const exported=await h.api('/api/barrow/export.json');assert.equal(exported.locations.filter(row=>row.accountId==='wren').length,3);assert.equal(exported.orders.length,0);assert.equal(exported.lists.length,0);assert.ok((await h.api('/api/barrow/audit?action=import.approved')).events.some(row=>row.revision===applied.fingerprint));
 const restored=await installation();t.after(()=>restored.close());await restore(restored,await archive(h));assert.equal((await restored.api('/api/barrow/locations?accountId=wren')).locations.length,3);assert.equal(restored.mail.deliveries.length,0);
 await h.command('account.erase',{accountId:'wren',confirm:'ERASE'});assert.equal((await h.api('/api/barrow/imports/wizcommerce')).history.length,0);assert.equal((await h.api('/api/barrow/export.json')).locations.filter(row=>row.accountId==='wren').length,0);assert.match((await preview(input)).errors.join(' '),/custody.*retired/);
});
