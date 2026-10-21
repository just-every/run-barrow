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
 // Account pages use the same 400-company fixture; no full directory reaches state or pickers.
 const directory=(query={},actor={})=>h.api('/api/barrow/accounts?'+new URLSearchParams(query),undefined,actor);
 const seen=[];
 for(let page=1;page<=16;page++){
  const result=await directory({page:String(page)});assert.equal(result.accounts.length,25);assert.equal(result.hasNext,page<16);
  seen.push(...result.accounts.map(row=>row.id));
 }
 assert.deepEqual(seen,accounts.map(row=>row.id).sort());assert.equal(new Set(seen).size,400);
 const state=await h.api('/api/barrow/state');assert.equal(state.accounts.length,25);assert.equal(state.accountPage.hasNext,true);
 assert.deepEqual(state.accounts,(await directory()).accounts);
 for(const sort of ['name-asc','name-desc']){
  const result=await directory({sort});
  const expected=[...accounts].sort((a,b)=>{const n=a.value.name<b.value.name?-1:a.value.name>b.value.name?1:0;return (sort==='name-desc'?-n:n)||a.id.localeCompare(b.id)}).slice(0,25);
  assert.deepEqual(result.accounts.map(row=>row.id),expected.map(row=>row.id));
 }
 for(const [q,ids] of [['BUYER-399@EXAMPLE.TEST',['company-399']],['company-399',['company-399']],['pier-customer-399',['company-399']],['Wholesale company 399',['company-399']],['%',[]],['_',[]],["' OR 1=1 --",[]]])assert.deepEqual((await directory({q})).accounts.map(row=>row.id),ids);
 assert.deepEqual((await directory({q:'company-399'},buyer)).accounts,[]);
 assert.deepEqual((await directory({},buyer)).accounts.map(row=>row.id),['company-0']);
 assert.deepEqual((await directory({},foreign)).accounts,[]);
 const later=await h.api('/api/barrow/accounts/by-id/company-399');assert.equal(later.value.email,'buyer-399@example.test');assert.equal(later.revision,'account-revision-company-399');
 await h.api('/api/barrow/accounts/by-id/company-399',undefined,{...buyer,status:404});
 await h.api('/api/barrow/accounts/by-id/not-present',undefined,{status:404});
 for(const query of [{page:'0'},{page:'1.5'},{page:'1000000'},{q:'x'.repeat(161)},{sort:'name;DROP TABLE bw_accounts'}])await directory(query,{status:400});
 assert.deepEqual((await directory({page:'999999'})).accounts,[]);
 assert.equal((await h.request('/api/barrow/accounts')).headers.get('cache-control'),'no-store');
 await directory({},{as:'',status:401});

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
 const agentDirectory=await directory({}, {as:'',headers:{authorization:`Bearer ${token}`}});assert.equal(agentDirectory.accounts.length,25);
 assert.equal((await h.api('/api/barrow/accounts/by-id/company-399',undefined,{as:'',headers:{authorization:`Bearer ${token}`}})).id,'company-399');
 await search({},{as:'',status:401});
 // No carrier source exists: do not invent tracking or claim its required performance point.
 assert.match(first.tracking,/not recorded/);
 const timings={po:[],sku:[],sort:[]};
 for(let attempt=0;attempt<20;attempt++)for(const [kind,query] of Object.entries({po:{po:'PO-19999'},sku:{sku:'SKU-399'},sort:{sort:attempt%2?'ship-asc':'ship-desc'}})){
  const before=performance.now(),page=await search(query);timings[kind].push(performance.now()-before);assert.ok(page.rows.length>0&&page.rows.length<=25);
 }
 for(const [kind,times]of Object.entries(timings)){times.sort((a,b)=>a-b);const p95=times[Math.ceil(times.length*.95)-1];t.diagnostic(`${kind} first-page p95 ${p95.toFixed(1)} ms (20 requests, 20000 orders)`);assert.ok(p95<2000,`${kind} p95 ${p95} ms`)}
 const historical=await h.api('/api/barrow/orders/order_19999');
 const stale={...historical,id:'stale-off-page-account',accountRevision:'old-account-revision',status:'draft'};
 await h.db.prepare('INSERT INTO bw_orders VALUES(?,?,?,?)').bind(stale.id,stale.accountId,JSON.stringify(stale),'stale-draft-revision').run();
 const withDraft=await h.api('/api/barrow/state');assert.equal(withDraft.accounts.length,25);assert.equal(withDraft.accounts.some(row=>row.id==='company-399'),false);assert.equal(withDraft.waitingDraft.id,stale.id);
 const draftHistory=await h.api('/api/barrow/orders/history?status=draft');assert.equal(draftHistory.accountRevisions['company-399'],'account-revision-company-399');
 assert.notEqual(draftHistory.accountRevisions['company-399'],draftHistory.orders[0].accountRevision);

});

test('RPT-006: original workspace, history and account drafts page the full authorized collection without losing stale drafts, duplicate POs or source actors', async t => {
 const h=await installation();t.after(()=>h.close());
 const owner=(await h.api('/api/barrow/state')).actor.id;
 for(const id of ['cedar','wren'])await h.command('account.save',{id,value:{...accountValue('source-'+id,id+'@example.test'),name:id,minimumCents:0}});
 const accounts=(await h.api('/api/barrow/state')).accounts;
 const oldDate='2026-03-08T04:59:59.000Z',newDate='2026-03-08T05:00:00.000Z'; // Eastern midnight across the DST weekend.
 const fixtures=Array.from({length:63},(_,i)=>{
  const a=accounts.find(a=>a.id===(i===0?'wren':'cedar'));
  return {id:`page_${i}`,accountId:a.id,accountRevision:i===1?'old-revision':a.revision,customerName:a.value.name,reference:i===1?'  DÉJÀ   VU  ':i===60?'déjà vu':`ARCHIVE-${i}`,preparedAt:i===1?oldDate:newDate,status:i===60?'submitted':'draft',currency:i===1?'AUD':'USD',termsDays:30,totalCents:13000,preparedBy:owner,pierCustomerId:a.value.pierCustomerId,pierOrigin:'https://inventory.example.test',deliveryLocation:i===1?'Montréal depot':'Queens',shipTo:i===2?{city:'Brooklyn'}:undefined,lines:[{sku:i===1?'CAFÉ-1':'OAT-1',name:'Wholesale product',quantity:2,unitCents:6500,lineCents:13000,minQty:1,itemId:'source-item'}],revision:`revision-${i}`};
 });
 for(let i=0;i<fixtures.length;i+=50)await h.db.batch(fixtures.slice(i,i+50).map(o=>h.db.prepare('INSERT INTO bw_orders VALUES(?,?,?,?)').bind(o.id,o.accountId,JSON.stringify(o),o.revision)));
 const buyer={as:await h.signIn('cedar@example.test')},other={as:await h.signIn('wren@example.test')};
 const state=await h.api('/api/barrow/state');assert.equal(state.orders.length,25);assert.equal(state.orderPage.hasNext,true);assert.equal(state.waitingDraft.id,'page_1');assert.equal(state.orderPage.counts.draft,62);assert.equal(state.people[owner],'Supplier');
 const history=async(params={},as={})=>h.api('/api/barrow/orders/history?'+new URLSearchParams(params),undefined,as);
 const first=await history(),second=await history({page:'2'}),last=await history({page:'3'});
 assert.deepEqual([first.orders.length,second.orders.length,last.orders.length],[25,25,13]);assert.equal(last.hasNext,false);
 assert.deepEqual([...first.orders,...second.orders,...last.orders].map(o=>o.id),fixtures.map(o=>o.id).reverse());
 assert.ok(last.duplicatePOs.includes('page_1'),'Duplicate live PO is detected outside the draft page.');
 assert.equal(last.people[owner],'Supplier');assert.equal(last.orders.find(o=>o.id==='page_1').currency,'AUD');
 assert.deepEqual((await history({po:'déjà',sku:'café',location:'montréal',from:'2026-03-07',to:'2026-03-07'},buyer)).orders.map(o=>o.id),['page_1']);
 assert.equal((await history({from:'2026-03-08',to:'2026-03-08'},buyer)).orders.length,25);
 assert.deepEqual((await history({location:'brooklyn'},buyer)).orders.map(o=>o.id),['page_2']);
 const drafts=[];for(const page of ['1','2','3'])drafts.push(...(await history({accountId:'cedar',status:'draft',page},buyer)).orders);
 assert.equal(drafts.length,61);assert.equal(new Set(drafts.map(o=>o.id)).size,61);assert.ok(drafts.every(o=>o.accountId==='cedar'&&o.status==='draft'));
 assert.deepEqual((await history({status:'review'},buyer)).orders.map(o=>o.id),['page_60']);
 assert.deepEqual((await history({},other)).orders.map(o=>o.id),['page_0']);
 assert.deepEqual((await history({accountId:'cedar'},other)).orders,[]);
 assert.equal((await h.api('/api/barrow/state',undefined,other)).waitingDraft.id,'page_0');
 assert.deepEqual((await history({po:'missing'},buyer)).orders,[]);
 assert.equal((await h.request('/api/barrow/orders/history')).headers.get('cache-control'),'no-store');
 for(const params of [{page:'0'},{page:'1.5'},{status:'not-a-status'},{po:'x'.repeat(161)},{from:'2026-02-30'},{from:'2026-10-01',to:'2026-01-01'}])await history(params,{status:400});
 // Page readers do not mutate commercial records or attributed decisions.
 const before=await h.api('/api/barrow/export.json');await history({page:'2'},buyer);const after=await h.api('/api/barrow/export.json');assert.deepEqual(after.orders,before.orders);assert.deepEqual(after.audit,before.audit);
});

test('RPT-006 / ACC-005 / ACC-006 / INT-015 / DATA-002: saved monthly reports freeze whole source-linked snapshots, email exact staff once, and revoke private downloads on recipient or authority changes',async t=>{
 const {createHmac,randomBytes}=await import('node:crypto');
 const key=randomBytes(32),secret='whsec_'+key.toString('base64');
 const h=await installation({https:true,bindings:{MAIL_WEBHOOK_SECRET:secret,MAIL_EVENT_TENANT:'report-test'}});t.after(()=>h.close());
 const admin={as:await h.signIn('finance@example.test','admin')},buyer={as:await h.signIn('buyer@example.test')},outside={as:await h.signIn('other-staff@example.test','admin')};
 const people=await h.api('/auth/operators'),owner=people.find(p=>p.role==='owner'),finance=people.find(p=>p.email==='finance@example.test'),member=people.find(p=>p.email==='buyer@example.test');
 const {token}=await h.api('/api/barrow/agent-token',{}),agent={as:'',headers:{authorization:`Bearer ${token}`}};
 await h.command('account.save',{id:'cedar',value:accountValue('source-cedar')});await h.command('account.save',{id:'wren',value:{...accountValue('source-wren','wren@example.test'),name:'Wren Market'}});
 const monthEnd=new Date(Date.UTC(new Date().getUTCFullYear(),new Date().getUTCMonth(),0)),from=new Date(Date.UTC(monthEnd.getUTCFullYear(),monthEnd.getUTCMonth(),1)).toISOString().slice(0,10),to=monthEnd.toISOString().slice(0,10);
 const account=(await h.api('/api/barrow/state')).accounts.find(a=>a.id==='cedar');
 const order={id:'REPORT-SOURCE',accountId:'cedar',accountRevision:account.revision,customerName:account.value.name,reference:'PRIVATE-PO-7821',preparedAt:from+'T16:00:00.000Z',status:'approved',currency:'USD',termsDays:30,totalCents:13000,preparedBy:owner.id,pierCustomerId:'source-cedar',pierOrigin:'https://inventory.example.test',invoice:{number:'PRIVATE-INVOICE',issuedAt:from,dueAt:to},lines:[{sku:'OAT-1',name:'Toasted oats',quantity:2,unitCents:6500,lineCents:13000,minQty:1,itemId:'item-oat'}]};
 await h.db.prepare('INSERT INTO bw_orders VALUES(?,?,?,?)').bind(order.id,'cedar',JSON.stringify(order),'source-revision').run();
 const save=(extra={},opts={})=>h.command('report.save',{name:'Monthly sales',reportType:'sales',filters:{accountId:'cedar',sku:'OAT-1'},recipientIds:[owner.id,finance.id],...extra},opts);
 for(const recipients of [['typed@example.test'],[member.id],[finance.id,finance.id],[]])await save({recipientIds:recipients},{status:400});
 await save({filters:{unknown:'ignored?'}},{status:400});await save({}, {...buyer,status:403});await save({}, {...agent,status:403});
 await h.api('/api/barrow/report-schedules',undefined,{...buyer,status:403});await h.api('/api/barrow/report-schedules',undefined,{...agent,status:403});
 const schedule=await save();
 let settings=await h.api('/api/barrow/report-schedules');const saved=settings.schedules.find(s=>s.id===schedule.id);
 assert.deepEqual(saved.filters,{accountId:'cedar',sku:'OAT-1'});assert.deepEqual(saved.recipients.map(r=>r.operator_id).sort(),[owner.id,finance.id].sort());assert.ok(saved.recipients.every(r=>typeof r.operator_version==='number'));
 const run=await h.command('report.run',{scheduleId:schedule.id}),path=`/api/barrow/report-runs/${run.id}.json`;
 const emails=()=>h.mail.deliveries.filter(d=>d.message.subject==='Barrow report: Monthly sales');
 assert.equal(emails().length,2);assert.deepEqual(emails().map(d=>d.message.to[0]).sort(),['owner@example.test','finance@example.test'].sort());
 const mail=emails().find(d=>d.message.to[0]==='finance@example.test');
 for(const forbidden of ['PRIVATE-PO-7821','PRIVATE-INVOICE','Cedar Street Pantry','13000','6500','token=','attachments'])assert.ok(!JSON.stringify(mail.message).includes(forbidden),forbidden);
 const link=new URL(mail.message.text.match(/https:\/\/\S+\/app\?reportRun=\S+/)[0]);assert.equal(link.searchParams.get('reportRun'),run.id);assert.deepEqual([...link.searchParams.keys()],['reportRun']);
 assert.ok(mail.message.text.includes(from)&&mail.message.text.includes(to));assert.match(mail.message.text,/09:00 UTC/);assert.match(mail.message.text,/As of:/);
 const frozen=await h.api(path,undefined,admin);assert.equal(frozen.period,from.slice(0,7));assert.equal(frozen.report.rows.length,1);assert.equal(frozen.report.rows[0].bookedCents,13000);
 const source=await h.api(frozen.report.rows[0].orderPath,undefined,admin);assert.equal(source.id,order.id);assert.equal(source.lines[0].lineCents,frozen.report.rows[0].bookedCents);
 assert.equal((await h.request(path,admin)).headers.get('cache-control'),'no-store');
 await h.api(path,undefined,{...outside,status:403});await h.api(path,undefined,{...buyer,status:403});await h.api(path,undefined,{...agent,status:403});await h.api(path,undefined,{as:'',status:403});
 order.totalCents=99999;order.lines[0].lineCents=99999;await h.db.prepare('UPDATE bw_orders SET value_json=? WHERE id=?').bind(JSON.stringify(order),order.id).run();
 assert.deepEqual(await h.api(path,undefined,admin),frozen);
 await Promise.all([h.command('report.run',{scheduleId:schedule.id}),h.command('report.dispatch',{})]);await h.configure({});await h.command('report.dispatch',{});assert.equal(emails().length,2);
 assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM bw_report_runs WHERE schedule_id=?').bind(schedule.id).first()).n,1);
 // Monthly cron door: due definition, real dispatch, previous complete month, same durable run on restart.
 const scheduled=await save({name:'Due monthly finance',reportType:'finance',filters:{accountId:'cedar'},recipientIds:[owner.id]});
 await h.db.prepare('UPDATE bw_report_schedules SET next_at=? WHERE id=?').bind('2000-01-01T09:00:00.000Z',scheduled.id).run();
 await h.command('report.dispatch',{});const monthly=(await h.api('/api/barrow/report-schedules')).runs.find(r=>r.schedule_id===scheduled.id);assert.ok(monthly);assert.equal(monthly.period,from.slice(0,7));
 assert.equal((await h.api(`/api/barrow/report-runs/${monthly.id}.json`)).report.asOf,to);
 // Signed suppression refuses an existing download, survives a later delivered status and blocks later sends.
 const timestamp=String(Math.floor(Date.now()/1000)),body=JSON.stringify({type:'email.bounced',created_at:new Date().toISOString(),data:{email_id:mail.id,to:['finance@example.test']}}),signature=createHmac('sha256',key).update(`report-bounce.${timestamp}.${body}`).digest('base64');
 const callback=()=>h.raw('/api/barrow/report-mail/webhook',{method:'POST',headers:{'svix-id':'report-bounce','svix-timestamp':timestamp,'svix-signature':'v1,'+signature},body});
 assert.equal((await h.raw('/api/barrow/report-mail/webhook',{method:'POST',headers:{'svix-id':'forged','svix-timestamp':timestamp,'svix-signature':'v1,invalid'},body})).status,400);
 assert.equal((await callback()).status,200);assert.equal((await callback()).status,200);
 await h.api(path,undefined,{...admin,status:403});
 const suppressed=await save({name:'Suppressed report',recipientIds:[finance.id,owner.id]});await h.command('report.run',{scheduleId:suppressed.id});
 assert.ok(!(h.mail.deliveries.filter(d=>d.message.subject==='Barrow report: Suppressed report')).some(d=>d.message.to[0]==='finance@example.test'));
 assert.ok((await h.db.prepare('SELECT reason FROM bw_report_deliveries WHERE run_id LIKE ? AND operator_id=?').bind(suppressed.id+'%',finance.id).first()).reason.includes('suppression'));
 // Self-removal revokes accepted downloads as well as queued notifications.
 await h.command('report.remove-recipient',{scheduleId:schedule.id});await h.api(path,undefined,{status:403});
 await h.configure({MAIL_WEBHOOK_SECRET:undefined});
 const queued=await save({name:'Queued report',recipientIds:[owner.id]});const queuedRun=await h.command('report.run',{scheduleId:queued.id});
 assert.equal((await h.db.prepare('SELECT status FROM bw_report_deliveries WHERE run_id=?').bind(queuedRun.id).first()).status,'not configured');
 await h.command('report.remove-recipient',{scheduleId:queued.id});await h.configure({MAIL_WEBHOOK_SECRET:secret});await h.command('report.dispatch',{});
 assert.equal((await h.db.prepare('SELECT status FROM bw_report_deliveries WHERE run_id=?').bind(queuedRun.id).first()).status,'cancelled');assert.ok(!h.mail.deliveries.some(d=>d.message.subject==='Barrow report: Queued report'));
 // Role change cancels queued delivery at the native identity transaction; no narrowed report is substituted.
 const revokee={as:await h.signIn('revokee@example.test','admin')},revokedPerson=(await h.api('/auth/operators')).find(p=>p.email==='revokee@example.test');
 const roleSchedule=await save({name:'Role revocation',recipientIds:[owner.id,revokedPerson.id]});await h.configure({MAIL_WEBHOOK_SECRET:undefined});const roleRun=await h.command('report.run',{scheduleId:roleSchedule.id});
 await h.api('/auth/operator/role',{operatorId:revokedPerson.id,role:'member'});
 assert.equal((await h.db.prepare('SELECT status FROM bw_report_deliveries WHERE run_id=? AND operator_id=?').bind(roleRun.id,revokedPerson.id).first()).status,'cancelled');
 await h.api('/auth/magic-link',{email:'revokee@example.test',returnTo:'/app'},{as:'',status:202});
 const signInMessage=h.mail.deliveries.findLast(d=>d.message.to.includes('revokee@example.test')).message;
 const signInLink=new URL(signInMessage.text.match(/https?:\/\/[^\s<>]+\/auth\/confirm\?token=[^\s<>]+/)[0]);
 const confirmed=await h.request('/auth/confirm',{method:'POST',as:'',body:{token:signInLink.searchParams.get('token')}});assert.equal(confirmed.status,303);
 const narrowed={as:confirmed.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ')};await h.api(`/api/barrow/report-runs/${roleRun.id}.json`,undefined,{...narrowed,status:403});
 // Exact operator-version changes, inactive users and expiry each fail closed with an audit reason.
 const expired=await save({name:'Expired report',recipientIds:[owner.id]});await h.configure({MAIL_WEBHOOK_SECRET:secret});const expiredRun=await h.command('report.run',{scheduleId:expired.id});
 await h.db.prepare('UPDATE bw_report_runs SET expires_at=? WHERE id=?').bind(new Date(Date.now()-1).toISOString(),expiredRun.id).run();await h.api(`/api/barrow/report-runs/${expiredRun.id}.json`,undefined,{status:403});
 // Deactivation cancels a queued delivery immediately; reactivation cannot resurrect its old version.
 const inactiveCookie=await h.signIn('inactive@example.test','admin'),inactive=(await h.api('/auth/operators')).find(p=>p.email==='inactive@example.test');
 await h.configure({MAIL_WEBHOOK_SECRET:undefined});const inactiveSchedule=await save({name:'Inactive recipient',recipientIds:[owner.id,inactive.id]}),inactiveRun=await h.command('report.run',{scheduleId:inactiveSchedule.id});
 await h.api('/auth/operator/status',{operatorId:inactive.id,status:'inactive'});
 assert.equal((await h.db.prepare('SELECT status FROM bw_report_deliveries WHERE run_id=? AND operator_id=?').bind(inactiveRun.id,inactive.id).first()).status,'cancelled');
 await h.api(`/api/barrow/report-runs/${inactiveRun.id}.json`,undefined,{as:inactiveCookie,status:403});
 await h.api('/auth/operator/status',{operatorId:inactive.id,status:'active'});await h.configure({MAIL_WEBHOOK_SECRET:secret});await h.command('report.dispatch',{});
 assert.ok(!h.mail.deliveries.some(d=>d.message.subject==='Barrow report: Inactive recipient'&&d.message.to[0]==='inactive@example.test'));
 // A refused/uncertain provider submission keeps one durable attempt across restart; no blind resends.
 h.mail.failStatus=429;const uncertain=await save({name:'Uncertain submission',recipientIds:[owner.id]}),uncertainRun=await h.command('report.run',{scheduleId:uncertain.id});h.mail.failStatus=undefined;
 const attempts=h.mail.requests.filter(r=>r.message.subject==='Barrow report: Uncertain submission').length;assert.equal(attempts,1);
 await h.configure({});await h.command('report.dispatch',{});assert.equal(h.mail.requests.filter(r=>r.message.subject==='Barrow report: Uncertain submission').length,attempts);
 assert.equal((await h.db.prepare('SELECT status FROM bw_report_deliveries WHERE run_id=?').bind(uncertainRun.id).first()).status,'rate_limited');
 const audit=JSON.stringify(await h.api('/api/barrow/audit?search=report.'));
 for(const action of ['report.saved','report.frozen','report.queued','report.submission','report.submission-result','report.downloaded','report.recipient-removed','report.recipient-revoked','report.delivery-event','report.refused'])assert.ok(audit.includes(action),action);
 assert.ok(!audit.includes(secret));
 for(const sourceValue of ['PRIVATE-PO-7821','PRIVATE-INVOICE'])assert.ok(!audit.includes(sourceValue));
});


test('RPT-006 / ACC-004: duplicate company review spans pages and server rechecks every exact revision, including matches beyond the account workspace',async t=>{
 const h=await installation();t.after(()=>h.close());
 for(let i=0;i<30;i++){
  const id='duplicate-'+String(i).padStart(2,'0'),value={...accountValue('shared-source',`duplicate-${i}@example.test`),name:i===29?'ＣＥＤＡＲ   STREET pantry':`Separate company ${i}`};
  await h.db.prepare('INSERT INTO bw_accounts VALUES(?,?,?)').bind(id,JSON.stringify(value),'revision-'+i).run();
 }
 const buyer={as:await h.signIn('duplicate-29@example.test')};
 const {token}=await h.api('/api/barrow/agent-token',{}),agent={as:'',headers:{authorization:`Bearer ${token}`}};
 const query=new URLSearchParams({name:'Cedar Street Pantry',pierCustomerId:'shared-source'});
 const duplicates=(page=1,opts={})=>h.api('/api/barrow/accounts/duplicates?'+query+'&page='+page,undefined,opts);
 const first=await duplicates(),second=await duplicates(2);
 assert.equal(first.candidates.length,25);assert.equal(first.hasNext,true);assert.equal(second.candidates.length,5);assert.equal(second.hasNext,false);
 assert.deepEqual([...first.candidates,...second.candidates].map(row=>row.id),Array.from({length:30},(_,i)=>'duplicate-'+String(i).padStart(2,'0')));
 // Duplicate review returns identity metadata only, never all agreed prices.
 assert.ok(first.candidates.every(row=>!('value' in row)&&!('prices' in row)));
 await duplicates(1,{...buyer,status:403});await duplicates(1,{...agent,status:403});
 const value={...accountValue('shared-source','new-company@example.test'),name:'Cedar Street Pantry'};
 const save=reviews=>h.command('account.save',{id:'new-company',value,duplicateReviews:reviews});
 const reviews=[...first.candidates,...second.candidates].map(({id,revision})=>({id,revision}));
 await h.command('account.save',{id:'new-company',value,duplicateReviews:reviews.slice(0,25)},{status:409});
 assert.equal((await h.request('/api/barrow/accounts/by-id/new-company')).status,404);
 await h.db.prepare('UPDATE bw_accounts SET revision=? WHERE id=?').bind('current-revision','duplicate-29').run();
 await h.command('account.save',{id:'new-company',value,duplicateReviews:reviews},{status:409});
 const current=await duplicates(2);reviews.splice(25,5,...current.candidates.map(({id,revision})=>({id,revision})));
 const saved=await save(reviews);assert.equal(saved.value.email,'new-company@example.test');
 assert.equal((await h.api('/api/barrow/accounts/by-id/duplicate-29',undefined,buyer)).value.email,'duplicate-29@example.test');
 // Unicode-equivalent names match even with a different source ID; an unchanged identity needs no new review.
 const names=await h.api('/api/barrow/accounts/duplicates?'+new URLSearchParams({name:'cedar street pantry',pierCustomerId:'another-source'}));
 assert.deepEqual(names.candidates.map(row=>row.id),['duplicate-29','new-company']);
 const unchanged=await h.api('/api/barrow/accounts/duplicates?'+new URLSearchParams({name:saved.value.name,pierCustomerId:saved.value.pierCustomerId,exclude:saved.id}));
 assert.deepEqual(unchanged.candidates,[]);
 await h.api('/api/barrow/accounts/duplicates?page=0',undefined,{status:400});
 const audit=await h.api('/api/barrow/audit?kind=account');assert.ok(JSON.stringify(audit).includes('new-company'));
});
