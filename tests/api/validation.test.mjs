import test from 'node:test';
import assert from 'node:assert/strict';
import { installation, stock, accountValue } from './harness.mjs';

test('PRI-007: server admission rejects hidden items, undefined units, minimums and changed prices; client and agent totals never become authority', async t => {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 const products = await stock(pier, '24');
 const h = await installation({ bindings: { PIER_ORIGIN: pier.origin, PIER_SESSION: pier.cookie } }); t.after(() => h.close());
 let account = await h.command('account.save', { id: 'cedar', value: { ...accountValue(products.customer.id), prices: [{ sku: 'OAT-1', unitCents: 6500, minQty: 2, casePack: 2, increment: 2 }] } });
 const buyer = await h.signIn('buyer@example.test'), foreign = await h.signIn('foreign@example.test');
 const prepare = (lines, extra = {}, opts = { as: buyer }) => h.command('order.prepare', { accountId: 'cedar', lines, ...extra }, opts);
 assert.equal((await prepare([{ sku: 'OAT-1', quantity: 2 }], {}, { as: foreign, status: 404 })).error.code, 'NOT_FOUND');
 assert.equal((await prepare([{ sku: 'HIDDEN', quantity: 2 }], {}, { as: buyer, status: 409 })).error.code, 'PRICE');
 assert.equal((await prepare([{ sku: 'OAT-1', quantity: 2, unit: 'pallet' }], {}, { as: buyer, status: 400 })).error.code, 'UNIT');
 const minimum = await prepare([{ sku: 'OAT-1', quantity: 1 }], {}, { as: buyer, status: 409 });
 assert.equal(minimum.error.code, 'MINIMUM'); assert.match(minimum.error.message, /2/);
 assert.equal((await prepare([{ sku: 'OAT-1', quantity: 3 }], {}, { as: buyer, status: 409 })).error.code, 'QUANTITY');
 assert.equal((await prepare([{ sku: 'OAT-1', quantity: 26 }], {}, { as: buyer, status: 409 })).error.code, 'STOCK');
 const draft = await prepare([{ sku: 'OAT-1', quantity: 2, unitCents: 1, lineCents: 2 }], { totalCents: 2, currency: 'EUR', termsDays: 999 });
 assert.deepEqual([draft.lines[0].unitCents, draft.lines[0].lineCents, draft.totalCents, draft.currency, draft.termsDays], [6500, 13000, 13000, 'USD', 30]);
 const { token } = await h.api('/api/barrow/agent-token', {});
 const agent = { as: '', headers: { authorization: `Bearer ${token}` } };
 const proposed = await prepare([{ sku: 'OAT-1', quantity: 2, unitCents: 0 }], { totalCents: 0, accountRevision: 'invented' }, agent);
 assert.equal(proposed.totalCents, 13000); assert.match(proposed.preparedBy, /^agent:/);
 assert.equal((await h.command('order.submit', { orderId: proposed.id }, { ...agent, status: 403 })).error.code, 'PERSON_REQUIRED');
 account = await h.command('account.save', { id: account.id, revision: account.revision, value: { ...account.value, prices: [{ ...account.value.prices[0], unitCents: 7500 }] } });
 const changed = await h.command('order.submit', { orderId: draft.id, totalCents: 13000, unitCents: 6500, override: true }, { as: buyer, status: 409 });
 assert.equal(changed.error.code, 'PRICE_CHANGED'); assert.match(changed.error.message, /new draft/);
 // Re-preparing uses current rules; neither buyer nor supplier can bypass an invalid order minimum.
 account = await h.command('account.save', { id: account.id, revision: account.revision, value: { ...account.value, minimumCents: 20000 } });
 for (const as of [buyer, h.cookie]) {
  const refused = await prepare([{ sku: 'OAT-1', quantity: 2 }], { totalCents: 999999, override: true }, { as, status: 409 });
  assert.equal(refused.error.code, 'MINIMUM');
 }
 const live = await prepare([{ sku: 'OAT-1', quantity: 4 }], { reference: 'LIVE-RECHECK' });
 const consumption = await pier.command('order.create', { customerId: products.customer.id, lines: [{ itemId: products.item.id, quantity: '22' }] });
 assert.equal((await h.command('order.submit', { orderId: live.id }, { as: buyer, status: 409 })).error.code, 'STOCK');
 await pier.command('order.cancel', { orderId: consumption.id, reason: 'Release stock after submission refusal' });
 const current = await prepare([{ sku: 'OAT-1', quantity: 4 }], { reference: 'CURRENT-RULES' });
 assert.equal(current.totalCents, 30000);
 await h.command('order.submit', { orderId: current.id }, { as: buyer });
 // The authority can have less stock by approval time: it acknowledges the exact shortfall, never a fake invoice.
 const allocation = await pier.command('order.create', { customerId: products.customer.id, lines: [{ itemId: products.item.id, quantity: '22' }] });
 const short = await h.command('order.approve', { orderId: current.id });
 assert.equal(short.status, 'shortfall'); assert.equal(short.reservation[0].reserved, '2'); assert.equal(short.invoice, undefined);
 assert.equal((await h.request(`/api/barrow/invoices/${short.id}.csv`)).status, 409);
 const audit = await h.api(`/api/barrow/audit?orderId=${short.id}`);
 assert.ok(audit.events.some(event => event.action === 'order.shortfall' && event.actorId === short.approvedBy));
 await pier.command('order.cancel', { orderId: allocation.id, reason: 'Release competing demand' });
 const awaitingApproval = await prepare([{ sku: 'OAT-1', quantity: 4 }], { reference: 'REVOKED-APPROVAL' });
 await h.command('order.submit', { orderId: awaitingApproval.id }, { as: buyer });
 const awaitingSubmission = await prepare([{ sku: 'OAT-1', quantity: 4 }], { reference: 'REVOKED-SUBMISSION' });
 assert.equal((await pier.request('/auth/signout', { method: 'POST', body: {} })).status, 204);
 assert.equal((await h.command('order.submit', { orderId: awaitingSubmission.id }, { as: buyer, status: 503 })).error.code, 'PIER_UNAVAILABLE');
 assert.equal((await h.command('order.approve', { orderId: awaitingApproval.id }, { status: 503 })).error.code, 'PIER_UNAVAILABLE');
 const retained = (await h.api('/api/barrow/state')).orders;
 assert.equal(retained.find(row => row.id === awaitingSubmission.id).status, 'draft');
 assert.equal(retained.find(row => row.id === awaitingApproval.id).status, 'submitted');
});

test('deployed Pier rotation and revocation are audited once, the replacement works and public evidence contains no credential', async t => {
 const pier=await installation({pier:true});t.after(()=>pier.close());const products=await stock(pier);
 const h=await installation({captureLogs:true,bindings:{PIER_ORIGIN:pier.origin,PIER_SESSION:pier.cookie}});t.after(()=>h.close());
 await h.command('account.save',{id:'cedar',value:accountValue(products.customer.id)});
 const catalogue=()=>h.api('/api/barrow/catalogue?accountId=cedar');assert.equal((await catalogue()).items.length,1);
 const replacement=await pier.signIn('replacement@example.test');
 const replacementId=(await pier.api('/auth/operators')).find(row=>row.email==='replacement@example.test').id;
 await pier.command('role.set',{operatorId:replacementId,role:'operator'});
 const {mkdtemp,writeFile,readFile,stat,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join,resolve}=await import('node:path');
 const {execFile}=await import('node:child_process');const {promisify}=await import('node:util');
 const privateDirectory=await mkdtemp(join(tmpdir(),'barrow-connection-'));t.after(()=>rm(privateDirectory,{recursive:true,force:true}));
 const file=join(privateDirectory,'session');await writeFile(file,replacement,{mode:0o600});
 const helper=await promisify(execFile)(process.execPath,[resolve('scripts/connect-pier.mjs'),'--origin',pier.origin,'--session-file',file],{cwd:privateDirectory});
 assert.equal((await stat(join(privateDirectory,'.dev.vars'))).mode&0o777,0o600);assert.ok((await readFile(join(privateDirectory,'.dev.vars'),'utf8')).includes(JSON.stringify(replacement)));
 assert.equal(helper.stdout.includes(replacement),false);assert.equal(helper.stderr.includes(replacement),false);
 assert.equal((await pier.request('/auth/signout',{method:'POST',body:{}})).status,204);
 await h.api('/api/barrow/catalogue?accountId=cedar',undefined,{status:503});
 await h.configure({PIER_SESSION:replacement});assert.equal((await catalogue()).items.length,1);await catalogue();
 const fingerprint=(await h.db.prepare("SELECT fingerprint FROM bw_connector_config WHERE id='pier'").first()).fingerprint;
 await h.configure({PIER_SESSION:undefined});assert.equal((await h.api('/api/barrow/state')).connection.configured,false);
 await h.api('/api/barrow/state');await h.api('/api/barrow/catalogue?accountId=cedar',undefined,{status:503});
 const events=(await h.api('/api/barrow/audit?limit=200')).events.filter(row=>row.action.startsWith('pier.connection-'));
 assert.deepEqual(events.map(row=>row.action).sort(),['pier.connection-configured','pier.connection-revoked','pier.connection-rotated']);
 assert.ok(events.every(row=>row.actorId==='system:connectors'&&row.revision&&row.source==='pier.configuration'));
 const evidence=JSON.stringify([h.logs,events,await h.api('/api/barrow/diagnostics'),await (await h.request('/api/barrow/diagnostics.json')).text(),await (await h.request('/api/barrow/audit.csv')).text()]);
 for(const secret of [pier.cookie,replacement])assert.equal(evidence.includes(secret),false);
 const {archive}=await import('./harness.mjs');const lines=await archive(h),exported=JSON.stringify(lines);
 for(const table of ['bw_connector_config','bw_request_rates'])assert.equal(lines[0].tables.some(row=>row.name===table),false);
 assert.equal(exported.includes(fingerprint),false);assert.equal(exported.includes(replacement),false);
});

test('unsafe active or embedded content is refused before PO, quote and public application documents are stored', async t=>{
 const pier=await installation({pier:true});t.after(()=>pier.close());const products=await stock(pier);
 const h=await installation({captureLogs:true,bindings:{PIER_ORIGIN:pier.origin,PIER_SESSION:pier.cookie}});t.after(()=>h.close());
 await h.command('account.save',{id:'cedar',value:accountValue(products.customer.id)});
 const buyer={as:await h.signIn('buyer@example.test')},foreign={as:await h.signIn('foreign@example.test')};
 const order=await h.command('order.prepare',{accountId:'cedar',lines:[{sku:'OAT-1',quantity:2}]},buyer);
 const quote=await h.command('quote.request',{accountId:'cedar',lines:[{sku:'OAT-1',quantity:2}]},buyer);
 const form=await h.api('/api/barrow/applications/form',undefined,{as:''});await new Promise(resolve=>setTimeout(resolve,3050));
 const input={name:'Synthetic applicant',noEin:true,contactName:'Synthetic buyer',email:'synthetic@example.test',phone:'803 555 0101',annualVolumeUsd:1000,locations:[{name:'Store',line1:'101 Main Street',city:'Columbia',state:'SC',zip:'29201'}],consent:true,formToken:form.formToken};
 const dangers=['%PDF-1.4 /OpenAction << /S /JavaScript /JS (synthetic-barrow-210) >>','%PDF-1.4 /J#61vaScript (synthetic-barrow-211)','%PDF-1.4 /EmbeddedFile synthetic-barrow-212','%PDF-1.4 /ObjStm synthetic-barrow-213','%PDF-1.4 /Encrypt synthetic-barrow-214','%PDF-1.4 <script>synthetic-barrow-215</script>'];
 for(const content of dangers){
  const document={name:'synthetic.pdf',contentBase64:Buffer.from(content).toString('base64')};
  for(const [type,payload] of [['order.attach',{orderId:order.id,...document}],['quote.message',{quoteId:quote.id,body:'Please review.',attachment:document}]]){
   const result=await h.command(type,payload,{...buyer,status:400});assert.equal(result.error.code,'DOCUMENT_UNSAFE');assert.equal(JSON.stringify(result).includes(content),false);
  }
  const refused=await h.api('/api/barrow/applications',{...input,documents:[document]},{as:'',status:400});assert.equal(refused.error.code,'DOCUMENT_UNSAFE');assert.equal(JSON.stringify(refused).includes(content),false);
 }
 for(const table of ['bw_order_documents','bw_quote_entries','bw_application_intake'])assert.equal((await h.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n,0);
 const safe={name:'synthetic.pdf',contentBase64:Buffer.from('%PDF-1.4 synthetic-barrow-216').toString('base64')};
 await h.command('order.attach',{orderId:order.id,...safe},buyer);const entry=await h.command('quote.message',{quoteId:quote.id,body:'Static document.',attachment:safe},buyer);
 for(const path of [`/api/barrow/orders/${order.id}/document`,entry.attachment.path]){
  const response=await h.request(path,buyer);assert.equal(response.status,200);assert.match(response.headers.get('content-disposition'),/^attachment;/);assert.match(response.headers.get('content-security-policy'),/sandbox/);
  await h.api(path,undefined,{...foreign,status:404});
 }
 const evidence=JSON.stringify([h.logs,await h.api('/api/barrow/audit?limit=200'),await h.api('/api/barrow/diagnostics')]);
 for(const content of [...dangers,'%PDF-1.4 synthetic-barrow-216'])assert.equal(evidence.includes(content),false);
});

test('all Barrow API doors enforce an atomic per-IP fixed-window limit without retaining addresses or request bodies', async t=>{
 const h=await installation();t.after(()=>h.close());const ip='192.0.2.44';
 const first=await h.request('/api/barrow/state',{headers:{'CF-Connecting-IP':ip}});assert.equal(first.status,200);
 // Represent the preceding requests in this same fixed window, then exercise the boundary concurrently through unrelated public doors.
 const row=await h.db.prepare('SELECT digest,expires_at FROM bw_request_rates').first();
 assert.equal(row.digest.includes(ip),false);await h.db.prepare('UPDATE bw_request_rates SET count=599 WHERE digest=?').bind(row.digest).run();
 const results=await Promise.all(['/api/barrow/state','/api/barrow/applications/form'].map(path=>h.request(path,{headers:{'CF-Connecting-IP':ip}})));
 assert.deepEqual(results.map(row=>row.status).sort(),[200,429]);
 for(const path of ['/api/barrow/commands','/api/barrow/quote-mail/webhook','/api/barrow/report-mail/webhook','/api/barrow/portability/exports','/api/barrow/unknown']){
  const response=await h.request(path,{method:'POST',as:'',headers:{'CF-Connecting-IP':ip},body:{synthetic:'synthetic-barrow-220'}});
  assert.equal(response.status,429);assert.ok(Number(response.headers.get('retry-after'))>0);assert.equal((await response.text()).includes('synthetic-barrow-220'),false);
 }
 assert.equal((await h.request('/api/barrow/state',{headers:{'CF-Connecting-IP':'192.0.2.45'}})).status,200);
 await h.db.prepare('UPDATE bw_request_rates SET expires_at=0').run();
 assert.equal((await h.request('/api/barrow/state',{headers:{'CF-Connecting-IP':ip}})).status,200);
 assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM bw_request_rates').first()).n,1);
});
