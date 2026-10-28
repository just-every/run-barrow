import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { installation, stock, accountValue, archive, restore } from './harness.mjs';

const easternDay = offset => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(Date.now() + offset * 86400000));

test('ORD-007: purchase dates, instructions and buyer SKU aliases reach the order and Pier; an accidental duplicate PO is refused until a numbered release is authorized', async t => {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 const products = await stock(pier, '60');
 const h = await installation({ bindings: { PIER_ORIGIN: pier.origin, PIER_SESSION: pier.cookie } }); t.after(() => h.close());
 const birch = await pier.command('party.save', { name: 'Birch Lane Grocer', kind: 'customer' });
 await h.command('account.save', { id: 'cedar', value: accountValue(products.customer.id) });
 await h.command('account.save', { id: 'birch', value: { ...accountValue(birch.id, 'other@example.test'), name: 'Birch Lane Grocer' } });
 const buyer = await h.signIn('buyer@example.test'), other = await h.signIn('other@example.test');
 const requestedDate = easternDay(14), cancelAfter = easternDay(28);
 const prepare = (payload, as = buyer, accountId = 'cedar') => h.command('order.prepare', { accountId, lines: [{ sku: 'OAT-1', quantity: 2, buyerSku: 'CSP-GRAN-12' }], ...payload }, { as });

 // Dates are Eastern calendar days, inclusive, never before today; cancel-after is on or after the requested date.
 assert.equal((await h.command('order.prepare', { accountId: 'cedar', lines: [{ sku: 'OAT-1', quantity: 2 }], requestedDate: easternDay(-1) }, { as: buyer, status: 400 })).error.code, 'DATES');
 assert.equal((await h.command('order.prepare', { accountId: 'cedar', lines: [{ sku: 'OAT-1', quantity: 2 }], requestedDate, cancelAfter: easternDay(7) }, { as: buyer, status: 400 })).error.code, 'DATES');
 assert.equal((await h.command('order.prepare', { accountId: 'cedar', lines: [{ sku: 'OAT-1', quantity: 2 }], requestedDate: '2026-02-30' }, { as: buyer, status: 400 })).error.code, 'INPUT');
 const sameDay = await h.command('order.prepare', { accountId: 'cedar', lines: [{ sku: 'OAT-1', quantity: 2 }], requestedDate: easternDay(0), cancelAfter: easternDay(0) }, { as: buyer });
 assert.equal(sameDay.cancelAfter, sameDay.requestedDate);

 const first = await prepare({ reference: 'PO-7781', requestedDate, cancelAfter, instructions: 'Deliver to the loading dock before 10 am.' });
 assert.deepEqual([first.reference, first.requestedDate, first.cancelAfter, first.instructions, first.lines[0].buyerSku], ['PO-7781', requestedDate, cancelAfter, 'Deliver to the loading dock before 10 am.', 'CSP-GRAN-12']);
 assert.equal(first.lines[0].sku, 'OAT-1');
 // One supporting PO document per draft: PDF/PNG/JPEG by its bytes, at most 1 MB, downloaded never inline, people only.
 const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(2048, 32), Buffer.from('%%EOF\n')]);
 const attach = (orderId, bytes, name = 'PO 7781 (signed).pdf', opts = { as: buyer }) => h.command('order.attach', { orderId, name, contentBase64: bytes.toString('base64') }, opts);
 assert.equal((await attach(first.id, Buffer.from('<html><script>alert(1)</script>'), 'po.pdf', { as: buyer, status: 400 })).error.code, 'DOCUMENT');
 assert.equal((await attach(first.id, Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(1048576)]), 'big.pdf', { as: buyer, status: 400 })).error.code, 'DOCUMENT');
 assert.equal((await attach(first.id, pdf, 'po.pdf', { as: other, status: 404 })).error.code, 'NOT_FOUND');
 const attached = await attach(first.id, pdf);
 assert.deepEqual([attached.document.name, attached.document.type, attached.document.size, attached.document.sha256], ['PO-7781-signed.pdf', 'application/pdf', pdf.length, createHash('sha256').update(pdf).digest('hex')]);
 const download = await h.request(`/api/barrow/orders/${first.id}/document`, { as: buyer });
 assert.equal(download.status, 200); assert.equal(download.headers.get('content-type'), 'application/pdf');
 assert.equal(download.headers.get('content-disposition'), 'attachment; filename="PO-7781-signed.pdf"'); assert.equal(download.headers.get('x-content-type-options'), 'nosniff');
 assert.ok(Buffer.from(await download.arrayBuffer()).equals(pdf));
 assert.equal((await h.request(`/api/barrow/orders/${first.id}/document`)).status, 200);
 assert.equal((await h.request(`/api/barrow/orders/${first.id}/document`, { as: other })).status, 404);
 const { token } = await h.api('/api/barrow/agent-token', {});
 assert.equal((await h.request(`/api/barrow/orders/${first.id}/document`, { as: '', headers: { authorization: `Bearer ${token}` } })).status, 403);
 assert.equal((await h.request('/api/barrow/commands', { method: 'POST', as: '', headers: { authorization: `Bearer ${token}` }, body: { type: 'order.attach', payload: { orderId: first.id, name: 'x.pdf', contentBase64: pdf.toString('base64') } } })).status, 403);
 await h.command('order.submit', { orderId: first.id }, { as: buyer });
 assert.equal((await attach(first.id, pdf, 'late.pdf', { as: buyer, status: 409 })).error.code, 'DOCUMENT_LOCKED');
 const approved = await h.command('order.approve', { orderId: first.id });
 assert.equal(approved.status, 'approved');
 const handoff = (await pier.api('/api/pier/state')).orders.find(order => order.id === approved.pierOrderId);
 assert.equal(handoff.promiseDate, requestedDate);

 // The same PO on the same account, however it is spaced or cased, is an accidental repeat until a release is authorized.
 const repeat = await prepare({ reference: '  po-7781 ' });
 const refused = await h.command('order.submit', { orderId: repeat.id }, { as: buyer, status: 409 });
 assert.equal(refused.error.code, 'DUPLICATE_PO'); assert.match(refused.error.message, new RegExp(first.id));
 assert.equal((await h.api('/api/barrow/state', undefined, { as: buyer })).orders.find(order => order.id === repeat.id).status, 'draft');
 const buyerId = (await h.api('/api/barrow/state', undefined, { as: buyer })).actor.id;
 const release = await h.command('order.submit', { orderId: repeat.id, release: true }, { as: buyer });
 assert.equal(release.status, 'submitted');
 assert.deepEqual([release.poRelease.number, release.poRelease.of, release.poRelease.authorizedBy], [2, first.id, buyerId]);
 const third = await prepare({ reference: 'PO-7781' });
 assert.equal((await h.command('order.submit', { orderId: third.id, release: true }, { as: buyer })).poRelease.number, 3);
 const trail = (await h.api(`/api/barrow/audit?orderId=${repeat.id}`)).events.map(event => event.action);
 assert.ok(trail.includes('order.submitted-release'));

 // Detection is account-scoped: another company may use the same PO number; a PO-less order is never a duplicate.
 const elsewhere = await prepare({ reference: 'PO-7781' }, other, 'birch');
 assert.equal((await h.command('order.submit', { orderId: elsewhere.id }, { as: other })).poRelease, undefined);
 const unreferenced = await prepare({});
 await h.command('order.submit', { orderId: unreferenced.id }, { as: buyer });
 assert.equal((await h.command('order.submit', { orderId: (await prepare({})).id }, { as: buyer })).status, 'submitted');
 // The owner archive carries the purchase details and the document; a restored installation serves the same bytes.
 const moved = await installation(); t.after(() => moved.close());
 await restore(moved, await archive(h));
 const restored = (await moved.api('/api/barrow/state')).orders.find(order => order.id === first.id);
 assert.deepEqual([restored.requestedDate, restored.cancelAfter, restored.instructions, restored.lines[0].buyerSku, restored.document.sha256], [requestedDate, cancelAfter, 'Deliver to the loading dock before 10 am.', 'CSP-GRAN-12', attached.document.sha256]);
 assert.ok(Buffer.from(await (await moved.request(`/api/barrow/orders/${first.id}/document`)).arrayBuffer()).equals(pdf));
 // Another buyer cannot read the purchase details.
 assert.equal((await h.api('/api/barrow/state', undefined, { as: other })).orders.some(order => order.id === first.id), false);
});

test('credit terms and exposure block an exhausted draft and quote, then verified principal restores available credit without double counting invoices',async t=>{
 const {cardFixture}=await import('./card-fixture.mjs');const {activateStaff}=await import('./harness.mjs');
 const f=await cardFixture(t),{h,buyer,edge}=f;
 const finance=await activateStaff(h,'credit-finance@example.test',{role:'finance',accounts:['cedar'],warehouses:[],reports:['finance'],discountLimitCents:0,stockExceptionLimitCents:0,creditLimitCents:1200000,refundLimitCents:0});
 const selected=await h.api('/api/barrow/accounts/by-id/cedar');await h.command('account.save',{id:'cedar',revision:selected.revision,value:{...selected.value,prices:[{...selected.value.prices[0],unitCents:10000}]}});
 let policy=await h.command('credit-policy.save',{accountId:'cedar',revision:null,currency:'USD',limitCents:1000000,termsDays:30,reason:'Finance approves net thirty and ten thousand dollars.'},finance.who);
 assert.equal(policy.availableCents,1000000);assert.equal(policy.termsDays,30);
 const prepare=async(quantity,reference)=>h.command('order.prepare',{accountId:'cedar',reference,lines:[{sku:'OAT-1',quantity}]},buyer);
 const draft=await prepare(80,'Credit reviewed eight thousand');assert.equal(draft.termsDays,30);assert.equal(draft.totalCents,800000);
 const debt=await prepare(30,'Existing three thousand');await h.command('order.submit',{orderId:debt.id},buyer);const invoice=await h.command('order.approve',{orderId:debt.id});
 policy=await h.api('/api/barrow/account-credit?accountId=cedar',undefined,buyer);assert.equal(policy.exposureCents,300000);assert.equal(policy.unpaidInvoicesCents,300000);assert.equal(policy.openOrdersCents,0);assert.equal(policy.availableCents,700000);assert.deepEqual(policy.sources,[]);assert.equal(policy.policy,undefined);
 assert.equal((await h.command('order.submit',{orderId:draft.id}, {...buyer,status:409})).error.code,'CREDIT_LIMIT');
 let quote=await h.command('quote.request',{accountId:'cedar',lines:[{sku:'OAT-1',quantity:80}]},buyer);quote=await h.command('quote.propose',{quoteId:quote.id,revision:quote.revision,lines:[{sku:'OAT-1',quantity:80}],termsDays:30,validUntil:'2099-12-31'});
 assert.equal((await h.command('quote.accept',{quoteId:quote.id,number:1},{...buyer,status:409})).error.code,'CREDIT_LIMIT');
 let receipt=await h.command('card.prepare',{orderId:invoice.id},buyer);edge.complete(receipt);receipt=await h.command('card.refresh',{paymentId:receipt.id},buyer);receipt=await h.command('card.authorize',{paymentId:receipt.id,consent:true,amountCents:receipt.amountCents,surchargeCents:receipt.surchargeCents},buyer);receipt=await h.command('card.capture',{paymentId:receipt.id,reason:'Collect verified principal against the source invoice.'});
 // An unallocated capture is never silently assigned to invoice debt.
 assert.equal((await h.api('/api/barrow/account-credit?accountId=cedar')).availableCents,700000);
 await h.command('card.allocate',{paymentId:receipt.id,orderId:invoice.id,amountCents:200000,reason:'Allocate a two thousand dollar partial payment.'},finance.who);
 policy=await h.api('/api/barrow/account-credit?accountId=cedar');assert.equal(policy.availableCents,900000);assert.equal(policy.exposureCents,100000);
 await h.command('order.submit',{orderId:draft.id},buyer);policy=await h.api('/api/barrow/account-credit?accountId=cedar');assert.equal(policy.exposureCents,900000);assert.equal(policy.openOrdersCents,800000);
 const accepted=await h.command('order.approve',{orderId:draft.id});assert.equal(accepted.totalCents,800000);assert.equal(accepted.termsDays,30);assert.equal(accepted.currency,'USD');assert.ok(accepted.approvedBy);assert.ok(accepted.pierOrderId);
 assert.equal((await h.api('/api/barrow/account-credit?accountId=cedar')).exposureCents,900000);
 const report=await h.api('/api/barrow/reports/finance?accountId=cedar',undefined,finance.who);assert.deepEqual(report.creditAccounts.map(row=>row.accountId),['cedar']);const credit=report.creditAccounts.find(row=>row.accountId==='cedar');assert.equal(credit.availableCents,100000);assert.equal(credit.exposureCents,900000);assert.deepEqual(credit.sources.map(row=>row.orderId).sort(),[invoice.id,accepted.id].sort());const financeCsv=await (await h.request('/api/barrow/reports/finance.csv?accountId=cedar',finance.who)).text();
 const csvRows=financeCsv.split('\r\n').map(line=>[...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map(match=>match[1].replaceAll('""','"'))),creditSection=csvRows.findIndex(row=>row[0]==='current credit exposure');assert.ok(creditSection>=0);
 const creditHeaders=csvRows[creditSection+1],csvCredits=csvRows.slice(creditSection+2).filter(row=>row[0]==='cedar').map(row=>Object.fromEntries(creditHeaders.map((name,index)=>[name,row[index]])));assert.equal(csvCredits.length,1);const csvCredit=csvCredits[0];
 assert.equal(csvCredit.currency,'USD');assert.equal(Number(csvCredit.limitCents),1000000);assert.equal(Number(csvCredit.exposureCents),900000);assert.equal(Number(csvCredit.availableCents),100000);assert.equal(Number(csvCredit.openOrdersCents),0);assert.equal(Number(csvCredit.unpaidInvoicesCents),900000);
 assert.deepEqual(JSON.parse(csvCredit.sources).map(row=>[row.orderId,row.amountCents,row.path]).sort((a,b)=>a[0].localeCompare(b[0])),[[invoice.id,100000,`/api/barrow/orders/${invoice.id}`],[accepted.id,800000,`/api/barrow/orders/${accepted.id}`]].sort((a,b)=>a[0].localeCompare(b[0])));
 const override=await prepare(20,'Over-limit finance decision');
 assert.equal((await h.command('order.submit',{orderId:override.id},{...buyer,status:409})).error.code,'CREDIT_LIMIT');
 const overrideRequest={accountId:'cedar',revision:policy.revision,orderId:override.id,ceilingCents:1100000,reason:'Finance approves exactly eleven thousand dollars of resulting exposure.'};
 await h.command('credit-policy.release',{...overrideRequest,ceilingCents:1200001},{...finance.who,status:403});
 policy=await h.command('credit-policy.release',overrideRequest,finance.who);await h.command('order.submit',{orderId:override.id},buyer);await h.command('order.approve',{orderId:override.id});
 const events=(await h.api('/api/barrow/audit?accountId=cedar',undefined,finance.who)).events;const event=events.find(row=>row.action==='credit-policy.release');
 assert.ok(event);assert.equal(event.actorId,finance.id);assert.equal(event.actorKind,'human');assert.equal(event.source,'credit-policy.release');assert.equal(event.reason,overrideRequest.reason);assert.ok(event.createdAt);assert.ok(event.revision);
 const wren=await h.api('/api/barrow/accounts/by-id/wren');await h.command('account.save',{id:'wren',revision:wren.revision,value:{...wren.value,currency:'CAD'}});
 await h.command('credit-policy.save',{accountId:'wren',revision:null,currency:'CAD',limitCents:100000,termsDays:0,reason:'Owner configures due on receipt in the account currency.'});
 const cadDraft=await h.command('order.prepare',{accountId:'wren',reference:'CAD due on receipt',lines:[{sku:'OAT-1',quantity:2}]},f.other);await h.command('order.submit',{orderId:cadDraft.id},f.other);const cad=await h.command('order.approve',{orderId:cadDraft.id});assert.equal(cad.currency,'CAD');assert.equal(cad.termsDays,0);assert.equal(cad.invoice.dueAt,cad.invoice.issuedAt);
 const cadBalance=await h.api('/api/barrow/account-credit?accountId=wren');assert.equal(cadBalance.currency,'CAD');assert.equal(cadBalance.exposureCents,13000);assert.equal(cadBalance.availableCents,87000);assert.equal((await h.api('/api/barrow/account-credit?accountId=cedar')).exposureCents,1100000);
 await h.command('credit-policy.save',{accountId:'cedar',revision:policy.revision,currency:'CAD',limitCents:1000000,termsDays:0,reason:'Attempt unsupported currency.'},{...finance.who,status:409});
});

test('finance hold and exact-order release refuse buyers and reps, audit decisions, invalidate on exposure changes and appear in the order timeline',async t=>{
 const {cardFixture}=await import('./card-fixture.mjs');const {activateStaff}=await import('./harness.mjs');
 const f=await cardFixture(t),{h,buyer}=f;
 const finance=await activateStaff(h,'hold-finance@example.test',{role:'finance',accounts:['cedar'],warehouses:[],reports:['finance'],discountLimitCents:0,stockExceptionLimitCents:0,creditLimitCents:100000,refundLimitCents:0});
 const rep=await activateStaff(h,'hold-rep@example.test',{role:'rep',accounts:['cedar'],warehouses:[],reports:[],discountLimitCents:0,stockExceptionLimitCents:0});
 let state=await h.command('credit-policy.save',{accountId:'cedar',revision:null,currency:'USD',limitCents:100000,termsDays:30,reason:'Approved finance limit.'},finance.who);
 const prior=await f.order('Existing overdue invoice');
 await h.db.prepare('UPDATE bw_orders SET value_json=? WHERE id=?').bind(JSON.stringify({...prior,invoice:{...prior.invoice,issuedAt:'2000-01-01',dueAt:'2000-01-31'}}),prior.id).run();
 const draft=await h.command('order.prepare',{accountId:'cedar',reference:'Held buyer draft',lines:[{sku:'OAT-1',quantity:2}]},buyer);
 const owner=(await h.api('/api/barrow/state')).actor.id;
 state=await h.command('credit-policy.hold',{accountId:'cedar',revision:state.revision,kind:'overdue',expiresAt:'2099-12-31T00:00:00Z',ownerId:owner,reason:'Overdue invoice requires a reviewed partial payment.'},finance.who);
 assert.equal(state.held,true);assert.equal((await h.command('order.submit',{orderId:draft.id},{...buyer,status:409})).error.code,'CREDIT_HOLD');
 assert.equal((await h.command('order.submit',{orderId:draft.id},{...rep.who,status:409})).error.code,'CREDIT_HOLD');
 let heldQuote=await h.command('quote.request',{accountId:'cedar',lines:[{sku:'OAT-1',quantity:2}]},buyer);heldQuote=await h.command('quote.propose',{quoteId:heldQuote.id,revision:heldQuote.revision,lines:[{sku:'OAT-1',quantity:2}],validUntil:'2099-12-31'});
 assert.equal((await h.command('quote.accept',{quoteId:heldQuote.id,number:1},{...buyer,status:409})).error.code,'CREDIT_HOLD');
 const requested=await h.command('credit-policy.request',{accountId:'cedar'},buyer);assert.equal(requested.status,'open');assert.deepEqual(await h.command('credit-policy.request',{accountId:'cedar'},rep.who),requested);
 const tasks=(await h.api('/api/barrow/followups?view=all',undefined,finance.who)).tasks.filter(row=>row.kind==='credit');assert.equal(tasks.length,1);assert.equal(tasks[0].accountId,'cedar');assert.equal(tasks[0].ownerId,owner);assert.equal(tasks[0].status,'open');
 let receipt=await h.command('card.prepare',{orderId:prior.id},buyer);f.edge.complete(receipt);receipt=await h.command('card.refresh',{paymentId:receipt.id},buyer);receipt=await h.command('card.authorize',{paymentId:receipt.id,consent:true,amountCents:receipt.amountCents,surchargeCents:receipt.surchargeCents},buyer);receipt=await h.command('card.capture',{paymentId:receipt.id,reason:'Partial collection against the overdue invoice.'});
 await h.command('card.allocate',{paymentId:receipt.id,orderId:prior.id,amountCents:5000,reason:'Apply fifty dollars before a bounded release.'},finance.who);assert.equal((await h.api('/api/barrow/account-credit?accountId=cedar')).exposureCents,8000);
 const decision={accountId:'cedar',revision:state.revision,orderId:draft.id,ceilingCents:100000,reason:'Finance approves this exact resulting exposure.'};
 await h.command('credit-policy.release',decision,{...rep.who,status:403});await h.command('credit-policy.release',decision,{...buyer,status:403});
 state=await h.command('credit-policy.release',decision,finance.who);await h.command('order.submit',{orderId:draft.id},buyer);
 // A new hold invalidates the old release before acceptance.
 state=await h.command('credit-policy.hold',{accountId:'cedar',revision:state.revision,kind:'manual',expiresAt:'2099-12-31T00:00:00Z',ownerId:owner,reason:'Re-review before acceptance.'},finance.who);
 assert.equal((await h.command('order.approve',{orderId:draft.id},{status:409})).error.code,'CREDIT_HOLD');
 state=await h.command('credit-policy.release',{...decision,revision:state.revision},finance.who);
 const other=await h.command('order.prepare',{accountId:'cedar',reference:'Concurrent commitment',lines:[{sku:'OAT-1',quantity:2}]},buyer);
 state=await h.command('credit-policy.release',{...decision,revision:state.revision,orderId:other.id,ceilingCents:34000},finance.who);await h.command('order.submit',{orderId:other.id},buyer);
 assert.equal((await h.command('order.approve',{orderId:draft.id},{status:409})).error.code,'CREDIT_HOLD');
 state=await h.command('credit-policy.release',{...decision,revision:state.revision,ceilingCents:34000},finance.who);const approved=await h.command('order.approve',{orderId:draft.id});assert.equal(approved.totalCents,13000);
 const timeline=await h.api(`/api/barrow/orders/${draft.id}/timeline`,undefined,buyer);assert.ok(timeline.entries.some(row=>row.state==='Credit hold imposed; contact finance'));assert.ok(timeline.entries.some(row=>row.state==='Finance recorded a conditional credit release'));
 const audit=await h.api('/api/barrow/audit?accountId=cedar',undefined,finance.who);assert.ok(JSON.stringify(audit).includes('credit-policy.release'));const csv=await (await h.request('/api/barrow/audit.csv?accountId=cedar',finance.who)).text();assert.ok(csv.includes('credit-policy.release'));assert.ok(csv.includes('Finance approves this exact resulting exposure.'));
 const {token}=await h.api('/api/barrow/agent-token',{});const agent={as:'',headers:{authorization:`Bearer ${token}`}};await h.api('/api/barrow/account-credit?accountId=cedar',undefined,{...agent,status:403});await h.api('/api/barrow/audit',undefined,{...agent,status:403});
 const internalEvent=(await h.api('/api/barrow/audit?accountId=cedar')).events.find(row=>row.action==='credit-policy.release');assert.ok(internalEvent);
 for(const method of ['PATCH','DELETE'])assert.equal((await h.request('/api/barrow/audit/'+internalEvent.id,{method,body:{reason:'Attempt to rewrite history.'}})).status,404);
 const destination=await installation({bindings:{PIER_ORIGIN:f.pier.origin,PIER_SESSION:f.pier.cookie}});t.after(()=>destination.close());await restore(destination,await archive(h));
 const restored=await destination.api('/api/barrow/account-credit?accountId=cedar');assert.deepEqual(restored.policy.releases,[]);assert.equal(restored.held,true);
 assert.ok((await destination.api('/api/barrow/audit?accountId=cedar')).events.some(row=>row.id===internalEvent.id));
 await h.api('/api/barrow/audit',undefined,{...buyer,status:403});
 assert.equal((await h.api('/api/barrow/account-credit?accountId=wren',undefined,{...finance.who,status:404})).error.code,'NOT_FOUND');
 const expired={accountId:'cedar',revision:state.revision,kind:'provider',expiresAt:'2000-01-01T00:00:00Z',ownerId:finance.id,reason:'A past expiry cannot create a new hold.'};await h.command('credit-policy.hold',expired,{...finance.who,status:400});
 state=await h.command('credit-policy.hold',{...expired,expiresAt:'2099-12-31T00:00:00Z',reason:'Finance records a provider-origin hold with itself as responsible owner.'},finance.who);assert.equal(state.policy.hold.kind,'provider');assert.equal(state.policy.hold.ownerId,finance.id);
 state=await h.command('credit-policy.release',{accountId:'cedar',revision:state.revision,ceilingCents:100000,reason:'Finance conditionally releases this account against its current exposure.'},finance.who);assert.equal(state.held,false);
 const accountDestination=await installation({bindings:{PIER_ORIGIN:f.pier.origin,PIER_SESSION:f.pier.cookie}});t.after(()=>accountDestination.close());await restore(accountDestination,await archive(h));const inertAccountRelease=await accountDestination.api('/api/barrow/account-credit?accountId=cedar');assert.equal(inertAccountRelease.policy.accountRelease,undefined);assert.equal(inertAccountRelease.held,true);
 const accountReleased=(await h.command('quote.accept',{quoteId:heldQuote.id,number:1},buyer)).order;assert.equal(accountReleased.totalCents,13000);await h.command('order.approve',{orderId:accountReleased.id});assert.equal((await h.api('/api/barrow/account-credit?accountId=cedar')).held,true);
 const pending=await h.command('order.prepare',{accountId:'cedar',reference:'Revoked finance release',lines:[{sku:'OAT-1',quantity:2}]},buyer);assert.equal((await h.command('order.submit',{orderId:pending.id},{...buyer,status:409})).error.code,'CREDIT_HOLD');state=await h.command('credit-policy.release',{...decision,revision:state.revision,orderId:pending.id,ceilingCents:60000},finance.who);
 const currentGrant=(await h.api('/api/barrow/staff/members')).members.find(row=>row.userId===finance.id);const narrowed=await h.command('staff.update',{userId:finance.id,revision:currentGrant.revision,policy:{role:'finance',accounts:['cedar'],warehouses:[],reports:['finance'],discountLimitCents:0,stockExceptionLimitCents:0,creditLimitCents:1000,refundLimitCents:0},reason:'Owner narrows finance allowance before acceptance.'});
 assert.equal((await h.command('order.submit',{orderId:pending.id},{...buyer,status:409})).error.code,'CREDIT_RELEASE_STALE');
 await h.command('staff.revoke',{userId:finance.id,revision:narrowed.revision,reason:'Owner ends finance authority before acceptance.'});
 assert.equal((await h.command('order.submit',{orderId:pending.id},{...buyer,status:409})).error.code,'CREDIT_RELEASE_STALE');
 const storedPolicy=await h.db.prepare('SELECT value_json FROM bw_settings WHERE key=?').bind('credit-policy:cedar').first();const historical=JSON.parse(storedPolicy.value_json);historical.hold.expiresAt='2000-01-01T00:00:00Z';await h.db.prepare('UPDATE bw_settings SET value_json=? WHERE key=?').bind(JSON.stringify(historical),'credit-policy:cedar').run();
 assert.equal((await h.api('/api/barrow/account-credit?accountId=cedar',undefined,buyer)).held,false);await h.command('order.submit',{orderId:pending.id},buyer);
});
