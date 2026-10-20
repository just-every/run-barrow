import test from 'node:test';
import assert from 'node:assert/strict';
import { installation, stock, accountValue, archive, restore } from './harness.mjs';

test('AUTO-005: source-linked next actions retain failed contacts, ownership and snoozes; acceptance resolves its quote once while unanswered work remains', async t => {
 const pier = await installation({ pier: true }); t.after(() => pier.close());
 const products = await stock(pier, '80');
 const h = await installation({ bindings: { PIER_ORIGIN: pier.origin, PIER_SESSION: pier.cookie } }); t.after(() => h.close());
 await h.command('account.save', { id: 'cedar', value: accountValue(products.customer.id) });
 const dormantParty = await pier.command('party.save', { name: 'Dormant Market', kind: 'customer' });
 await h.command('account.save', { id: 'dormant', value: { ...accountValue(dormantParty.id, 'dormant@example.test'), name: 'Dormant Market' } });
 const freshParty = await pier.command('party.save', { name: 'New Market', kind: 'customer' });
 await h.command('account.save', { id: 'new', value: { ...accountValue(freshParty.id, 'new@example.test'), name: 'New Market' } });
 // Only historical fixture dates are edited; all accounts, quotes and orders enter through real HTTP commands.
 await h.db.prepare("UPDATE bw_audit SET created_at=? WHERE action='account.saved' AND subject_id='dormant'").bind(new Date(Date.now()-120*86400000).toISOString()).run();
 const buyer = { as: await h.signIn('buyer@example.test') }, admin = { as: await h.signIn('rep-cover@example.test', 'admin') };
 const adminId = (await h.api('/api/barrow/state', undefined, admin)).actor.id;
 let quote = await h.command('quote.request', { accountId: 'cedar', lines: [{ sku: 'OAT-1', quantity: 2 }] }, buyer);
 const unanswered = await h.command('quote.request', { accountId: 'cedar', lines: [{ sku: 'OAT-1', quantity: 3 }] }, buyer);
 const validity = new Intl.DateTimeFormat('en-CA', { timeZone:'America/New_York' }).format(new Date(Date.now()+10*86400000));
 quote = await h.command('quote.propose', { quoteId: quote.id, revision: quote.revision, validUntil: validity, lines: [{ sku:'OAT-1', quantity:2 }] });
 const draft = await h.command('order.prepare', { accountId:'cedar', reference:'ABANDONED', lines:[{sku:'OAT-1',quantity:2}] }, buyer);
 const pending = await h.command('order.prepare', { accountId:'cedar', reference:'AWAITING', lines:[{sku:'OAT-1',quantity:2}] }, buyer);
 await h.command('order.submit', { orderId:pending.id }, buyer);
 for (const [order,days] of [[draft,8],[pending,2]]) {
  const value = await h.api(`/api/barrow/orders/${order.id}`);
  await h.db.prepare('UPDATE bw_orders SET value_json=? WHERE id=?').bind(JSON.stringify({...value,preparedAt:new Date(Date.now()-days*86400000).toISOString()}),order.id).run();
 }
 await h.db.prepare("UPDATE bw_audit SET created_at=? WHERE subject_id=? AND action='order.submitted'").bind(new Date(Date.now()-2*86400000).toISOString(),pending.id).run();
 const undated=await h.command('order.prepare',{accountId:'cedar',reference:'LEGACY-UNDATED',lines:[{sku:'OAT-1',quantity:2}]},buyer);
 await h.command('order.submit',{orderId:undated.id},buyer);
 await h.db.prepare("DELETE FROM bw_audit WHERE subject_id=? AND action='order.submitted'").bind(undated.id).run();
 const refresh = () => h.command('followup.refresh', {}), read = query => h.api('/api/barrow/followups'+(query?'?'+query:''));
 const reconciled=await refresh(); assert.ok(reconciled.unknownAge.some(note=>note.includes(undated.id))); let board = await read('view=all');
 assert.equal(board.tasks.length,5);
 assert.deepEqual(new Set(board.tasks.map(task=>task.sourceId)),new Set([quote.id,unanswered.id,draft.id,pending.id,'dormant']));
 assert.equal(board.tasks[0].sourceId,pending.id);
 assert.match(board.notes.exceptions,/not recorded/); assert.match(board.notes.contact,/no email.*sent/i);
 assert.ok(board.tasks.every(task=>task.ownerId && task.nextContactDate===board.today && task.reason && task.priority>=0));
 for (const task of board.tasks) assert.equal((await h.request(task.sourcePath)).status,200);
 await refresh(); assert.equal((await read('view=all')).tasks.length,5);
 await h.command('quote.propose',{quoteId:unanswered.id,revision:unanswered.revision,validUntil:validity,lines:[{sku:'OAT-1',quantity:3}]}); await refresh();
 board=await read('view=all'); assert.match(board.tasks.find(task=>task.sourceId===unanswered.id).reason,/proposed/);
 const before = board.tasks.find(task=>task.sourceId===unanswered.id);
 const future = new Date(Date.parse(board.today+'T12:00:00Z')+3*86400000).toISOString().slice(0,10);
 await h.command('followup.update',{id:before.id,revision:before.revision,ownerId:adminId,nextContactDate:future,contact:{outcome:'failed',note:'Called the store; no answer. No message sent.'}});
 const snoozed = (await read('view=all')).tasks.find(task=>task.id===before.id);
 assert.equal(snoozed.status,'open'); assert.equal(snoozed.ownerId,adminId); assert.equal(snoozed.contacts.length,1); assert.equal(snoozed.contacts[0].outcome,'failed'); assert.ok(snoozed.contacts[0].by && snoozed.contacts[0].at);
 assert.ok(!(await read()).tasks.some(task=>task.id===before.id));
 assert.ok((await read('on='+future)).tasks.some(task=>task.id===before.id));
 await h.command('followup.update',{id:before.id,revision:before.revision,nextContactDate:future},{status:409});
 await h.command('followup.update',{id:snoozed.id,revision:snoozed.revision,nextContactDate:'2026-02-30'},{status:400});
 await refresh(); assert.equal((await read('view=all')).tasks.find(task=>task.id===before.id).contacts.length,1);
 await h.command('quote.accept',{quoteId:quote.id,number:1},buyer); await refresh();
 board=await read('view=all');
 const resolved=board.tasks.find(task=>task.sourceId===quote.id);
 assert.equal(resolved.status,'closed'); assert.match(resolved.resolution,/accept/i);
 assert.equal(board.tasks.find(task=>task.sourceId===unanswered.id).status,'open');
 // A recorded human resolution closes an item; refresh does not silently reopen it.
 await h.command('order.approve',{orderId:pending.id}); await refresh();
 assert.equal((await read('view=all')).tasks.find(task=>task.sourceId===pending.id).status,'closed');
 const manual=board.tasks.find(task=>task.sourceId===draft.id);
 await h.command('followup.update',{id:manual.id,revision:manual.revision,close:true,resolution:''},{status:400});
 await h.command('followup.update',{id:manual.id,revision:manual.revision,close:true,resolution:'Buyer confirmed this draft is no longer needed.'});
 await refresh(); assert.equal((await read('view=all')).tasks.find(task=>task.id===manual.id).status,'closed');
 // Missing source history cannot falsely prove a resolution: retain the existing owned task.
 await h.db.batch(['bw_quote_entries','bw_quote_notices','bw_quotes'].map(table=>h.db.prepare(`DELETE FROM ${table} WHERE ${table==='bw_quotes'?'id':'quote_id'}=?`).bind(unanswered.id))); await refresh();
 assert.equal((await read('view=all')).tasks.find(task=>task.id===before.id).status,'open');
 const ownerExport=await h.api('/api/barrow/export.json'); assert.equal(ownerExport.followups.length,(await read('view=all')).tasks.length);
 const csv=await(await h.request('/api/barrow/export/followups.csv')).text(); assert.ok(csv.includes(snoozed.id) && csv.includes('Called the store'));
 assert.equal((await h.api('/api/barrow/export.json',undefined,buyer)).followups,undefined);
 await h.api('/api/barrow/export/followups.csv',undefined,{...buyer,status:403});
 await h.api('/api/barrow/followups',undefined,{...buyer,status:403});
 await h.command('followup.refresh',{}, {...buyer,status:403});
 const {token}=await h.api('/api/barrow/agent-token',{}), agent={as:'',headers:{authorization:`Bearer ${token}`}};
 await h.api('/api/barrow/followups',undefined,{...agent,status:403});
 await h.command('followup.update',{id:snoozed.id,revision:snoozed.revision,close:true,resolution:'No authority'}, {...agent,status:403});
 assert.equal((await h.api('/api/barrow/followups?view=all',undefined,admin)).tasks.length,ownerExport.followups.length);
 await h.command('account.erase',{accountId:'dormant',confirm:'ERASE'});
 assert.ok(!(await read('view=all')).tasks.some(task=>task.accountId==='dormant'));
 assert.ok(!(await h.api('/api/barrow/export.json')).followups.some(task=>task.accountId==='dormant'));
 const audit=await h.api('/api/barrow/audit?accountId=cedar');
 assert.ok(JSON.stringify(audit).includes('followup.update'));
});


test('AUTO-005: native archives restore durable tasks, contacts and resolutions while excluding installation credentials', async t => {
 const h=await installation();t.after(()=>h.close());
 await h.command('account.save',{id:'old',value:{...accountValue('customer-native'),name:'Old Market'}});
 await h.db.prepare("UPDATE bw_audit SET created_at=? WHERE subject_id='old' AND action='account.saved'").bind(new Date(Date.now()-120*86400000).toISOString()).run();
 await h.command('followup.refresh',{});
 const task=(await h.api('/api/barrow/followups?view=all')).tasks[0];
 await h.command('followup.update',{id:task.id,revision:task.revision,contact:{outcome:'failed',note:'Store closed; call next week.'},nextContactDate:'2030-01-01'});
 const before=await h.api('/api/barrow/followups?view=all');
 const {token}=await h.api('/api/barrow/agent-token',{}), snapshot=await archive(h);
 assert.ok(!JSON.stringify(snapshot).includes(token)); assert.ok(!JSON.stringify(snapshot).includes(h.cookie));
 const restored=await installation();t.after(()=>restored.close());await restore(restored,snapshot);
 assert.deepEqual((await restored.api('/api/barrow/followups?view=all')).tasks,before.tasks);
 assert.equal((await restored.api('/api/barrow/export.json')).followups[0].id,task.id);
});
