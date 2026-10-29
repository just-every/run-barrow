import test from 'node:test';
import assert from 'node:assert/strict';
import {returnClaimsFixture} from './return-claims-fixture.mjs';
import {activateStaff,archive,installation,restore} from './harness.mjs';
const stockFacts=state=>Object.fromEntries(['orders','movements','returns','shipments','commands','positions','stockPositions','warehouseStocks','companyStocks'].map(key=>[key,state[key]]));

test('return requests bind partial authorization to current revisions, reconcile real receipts once and retain separately owned disputed quantities without moving stock or money',async t=>{
 const f=await returnClaimsFixture(t),{h,pier,buyer,other,order}=f;
 let claim=await f.request();
 assert.equal(claim.quantity,3);assert.equal(claim.creditProposal,null);assert.ok(claim.createdBy);assert.equal(claim.history[0].action,'return.request');
 const old=claim;
 claim=await h.command('return.revise',{id:claim.id,revision:claim.revision,quantity:3,reason:'Damaged cartons confirmed',condition:'Two crushed and one disputed.'},buyer);
 await h.command('return.decide',{id:claim.id,revision:old.revision,orderRevision:order.revision,quantity:2,instructions:'Use the supplier returns desk.',reason:'Approve two for review.'},{status:409});
 await h.command('return.decide',{id:claim.id,revision:claim.revision,orderRevision:order.revision,quantity:2,instructions:'Use the supplier returns desk.',reason:'Buyer cannot authorize.'},{...buyer,status:403});
 const apiPath=`/api/barrow/orders/${order.id}/return-claims`;
 await h.api(apiPath,undefined,{...other,status:404});
 await h.command('return.revise',{id:claim.id,revision:claim.revision,quantity:3,reason:'Foreign change',condition:'Foreign'},{...other,status:404});
 const {token}=await h.api('/api/barrow/agent-token',{});
 await h.api(apiPath,undefined,{headers:{authorization:'Bearer '+token},status:403});
 const original=await h.api('/api/barrow/orders/'+order.id),inventory=stockFacts(await pier.api('/api/pier/state')),financial=await h.api('/api/barrow/credits?orderId='+order.id),commissions=(await h.api('/api/barrow/reports/commissions')).rows;
 claim=await h.command('return.decide',{id:claim.id,revision:claim.revision,orderRevision:order.revision,quantity:2,instructions:'Bring two units to the supplier returns desk.',reason:'Two units authorized; one remains disputed.'});
 assert.equal(claim.decision.quantity,2);assert.equal(claim.disputedQuantity,1);assert.equal(claim.tasks.length,2);assert.equal(claim.creditProposal,null);
 assert.deepEqual(stockFacts(await pier.api('/api/pier/state')),inventory);assert.deepEqual(await h.api('/api/barrow/orders/'+order.id),original);assert.deepEqual(await h.api('/api/barrow/credits?orderId='+order.id),financial);assert.deepEqual((await h.api('/api/barrow/reports/commissions')).rows,commissions);
 const {who:operations}=await activateStaff(h,['synthetic-barrow-942','example.test'].join('@'),{role:'operations',accounts:['cedar'],warehouses:'all',reports:['fulfillment'],discountLimitCents:0,stockExceptionLimitCents:0});
 await h.api(apiPath,undefined,{...operations,status:403});await h.command('return.decide',{id:claim.id,revision:claim.revision,orderRevision:order.revision,quantity:2,instructions:'No functional authority.',reason:'Not enabled.'},{...operations,status:403});
 assert.ok(!(await h.api('/api/barrow/followups?view=all',undefined,operations)).tasks.some(row=>row.kind==='return'));
 const disputed=claim.tasks.find(row=>row.id.startsWith('return-dispute:')),owner=disputed.ownerId;
 await h.command('followup.update',{id:disputed.id,revision:disputed.revision,nextContactDate:'2035-01-17',contact:{outcome:'failed',note:'Supplier could not reach the buyer; remainder is still disputed.'}});
 // Two concurrent requests cannot both consume the same remaining original units.
 const responses=await Promise.all([1,2].map(()=>h.request('/api/barrow/commands',{method:'POST',as:buyer.as,body:{type:'return.request',payload:{orderId:order.id,line:1,quantity:3,reason:'Second damaged case',condition:'Held'}}})));
 assert.deepEqual(responses.map(row=>row.status).sort(),[200,409]);
 let second=(await f.claims()).claims.find(row=>row.id!==claim.id);assert.ok(second);
 second=await h.command('return.decide',{id:second.id,revision:second.revision,orderRevision:order.revision,quantity:2,instructions:'Keep this second case separate.',reason:'Authorize two separate units.'});
 const received=await f.receive(2);
 await h.command('return.reconcile',{id:claim.id,revision:claim.revision,receipts:[{returnId:received.id,quantity:2}]},{...buyer,status:403});
 claim=await h.command('return.reconcile',{id:claim.id,revision:claim.revision,receipts:[{returnId:received.id,quantity:2}]});
 assert.equal(claim.evidence.quantity,2);assert.equal(claim.creditProposal.amountCents,13000);assert.equal(claim.creditProposal.currency,'USD');assert.equal(claim.creditProposal.lines[0].returnId,received.id);
 const replay=await h.command('return.reconcile',{id:claim.id,revision:claim.revision,receipts:[{returnId:received.id,quantity:2}]});assert.equal(replay.revision,claim.revision);assert.equal(replay.receipts.length,1);
 await h.command('return.reconcile',{id:second.id,revision:second.revision,receipts:[{returnId:received.id,quantity:1}]},{status:409});
 const physicalAfter=stockFacts(await pier.api('/api/pier/state'));
 await h.command('followup.refresh',{});await h.command('followup.refresh',{});
 claim=(await f.claims()).claims.find(row=>row.id===claim.id);
 const persisted=claim.tasks.find(row=>row.id===disputed.id);assert.equal(persisted.ownerId,owner);assert.equal(persisted.nextContactDate,'2035-01-17');assert.equal(persisted.status,'open');assert.equal(persisted.contacts.length,1);
 assert.deepEqual(await h.api('/api/barrow/credits?orderId='+order.id),financial);assert.deepEqual(stockFacts(await pier.api('/api/pier/state')),physicalAfter);assert.deepEqual(await h.api('/api/barrow/orders/'+order.id),original);
 // Current prices cannot rewrite the original credit proposal.
 const account=await h.api('/api/barrow/accounts/by-id/cedar');await h.command('account.save',{id:account.id,revision:account.revision,value:{...account.value,prices:[{sku:'OAT-1',unitCents:9900,minQty:2}]}});
 assert.equal((await f.claims()).claims.find(row=>row.id===claim.id).creditProposal.amountCents,13000);
 await h.configure({PIER_SESSION:undefined});await h.command('followup.refresh',{});
 const unknown=(await f.claims()).claims.find(row=>row.id===claim.id);assert.equal(unknown.evidence.available,false);assert.equal(unknown.creditProposal,null);assert.equal(unknown.tasks.find(row=>row.id===disputed.id).status,'open');
 await h.command('return.reconcile',{id:second.id,revision:second.revision,receipts:[{returnId:received.id,quantity:1}]},{status:409});
 await h.configure({PIER_SESSION:pier.cookie});
 const exported=await h.api('/api/barrow/export.json');assert.equal(exported.manifest.counts.returnclaims,2);assert.equal(exported.returnclaims.find(row=>row.id===claim.id).revision,claim.revision);assert.equal(exported.returnclaims.find(row=>row.id===claim.id).pierOrderId,order.pierOrderId);
 const csv=await(await h.request('/api/barrow/export/returnclaims.csv')).text();assert.ok(csv.includes(received.id));assert.ok(csv.includes('13000')===false);assert.ok(csv.includes(claim.id));
 const mine=await h.api('/api/barrow/export.json',undefined,buyer);assert.equal(mine.returnclaims.length,2);assert.equal(mine.followups,undefined);assert.equal(mine.returnclaims[0].history,'');
 const foreign=await h.api('/api/barrow/export.json',undefined,other);assert.deepEqual(foreign.returnclaims,[]);
 const audit=await h.api('/api/barrow/audit?search='+claim.id);assert.ok(JSON.stringify(audit).includes('return.decide'));assert.ok(JSON.stringify(audit).includes(owner));
 const saved=await archive(h),restored=await installation();t.after(()=>restored.close());await restore(restored,saved);
 const restoredExport=await restored.api('/api/barrow/export.json');assert.equal(restoredExport.returnclaims.find(row=>row.id===claim.id).restored,true);
 await restored.command('return.decide',{id:second.id,revision:second.revision,orderRevision:order.revision,quantity:2,instructions:'No restored action.',reason:'No restored action.'},{status:409});
 // Removing one company person erases their narrative while keeping the original commercial linkage.
 const successor=['synthetic-barrow-943','example.test'].join('@');
 await h.command('company.invite',{accountId:'cedar',email:successor,name:'Successor administrator',policy:{rights:['administrator'],locations:'all',perOrderLimitCents:null,approvalLimitCents:null},reason:'Retain an administrator before erasing the requesting person.'});
 const invitation=new URL(h.mail.requests.findLast(row=>row.message.subject==='Your company buyer invitation'&&row.message.to.includes(successor)).message.text.match(/https?:\/\/[^\s<>]+\/app\?[^\s<>]+/)[0]);
 await h.command('company.accept',{invitationId:invitation.searchParams.get('companyInvitation'),token:invitation.searchParams.get('companyToken')},{as:await h.signIn(successor,'existing')});
 const member=(await h.api('/api/barrow/company/members?accountId=cedar')).members.find(row=>row.userId===claim.createdBy);
 await h.command('company.erase',{memberId:member.id,revision:member.revision,confirm:'ERASE',reason:'Erase the return requester’s personal narrative.'});
 let personal=(await h.api('/api/barrow/export.json')).returnclaims.find(row=>row.id===claim.id);assert.equal(personal.reason,'[Erased return text]');assert.equal(personal.condition,'[Erased return text]');assert.ok(personal.receipts.includes(received.id));
 const personalReplay=await installation();t.after(()=>personalReplay.close());await restore(personalReplay,saved,{journalSource:h});
 personal=(await personalReplay.api('/api/barrow/export.json')).returnclaims.find(row=>row.id===claim.id);assert.equal(personal.reason,'[Erased return text]');assert.equal(personal.condition,'[Erased return text]');
 // The erasure review includes personal narratives; later journal replay keeps them redacted.
 await h.command('retention.request',{accountId:'cedar',requester:'Buyer',channel:'Verified request',verificationNote:'Supplier verified the current buyer request.',held:false,reason:'Review return narrative erasure.'});
 let preview=await h.command('retention.preview',{accountId:'cedar'});assert.ok(preview.items.some(row=>row.id==='return:'+claim.id));
 await h.command('retention.erase-account',{accountId:'cedar',accountRevision:preview.accountRevision,requestRevision:preview.requestRevision,policyRevision:preview.policyRevision,reviewHash:preview.reviewHash,confirm:'ERASE',reason:'Remove personal return narratives.'});
 const erased=(await h.api('/api/barrow/export.json')).returnclaims.find(row=>row.id===claim.id);assert.equal(erased.reason,'[Erased return text]');assert.equal(erased.condition,'[Erased return text]');assert.equal(erased.restored,true);assert.ok(erased.receipts.includes(received.id));
 await h.api(apiPath,undefined,{...buyer,status:401});
 const later=await h.api('/api/barrow/erasure-journal'),replayed=await installation();t.after(()=>replayed.close());
 await replayed.api('/api/barrow/erasure-journal',{bundle:later,confirm:'JOURNAL',reason:'Attach the complete later journal.'});await restore(replayed,saved,{journalSource:h});
 const fenced=(await replayed.api('/api/barrow/export.json')).returnclaims.find(row=>row.id===claim.id);assert.equal(fenced.reason,'[Erased return text]');assert.equal(fenced.condition,'[Erased return text]');
 await returnNarrativeErasure(t);
});


async function returnNarrativeErasure(t) {
 const f=await returnClaimsFixture(t),{h,buyer,order}=f;
 const invite=async(number,rights)=>{
  const email=['synthetic-barrow-'+number,'example.test'].join('@');
  await h.command('company.invite',{accountId:'cedar',email,name:'Return purchaser '+number,policy:{rights,locations:'all',perOrderLimitCents:null,approvalLimitCents:null},reason:'Add an entitled purchaser for the return review.'});
  const link=new URL(h.mail.requests.findLast(row=>row.message.subject==='Your company buyer invitation'&&row.message.to.includes(email)).message.text.match(/https?:\/\/[^\s<>]+\/app\?[^\s<>]+/)[0]);
  const who={as:await h.signIn(email,'existing')};
  const member=await h.command('company.accept',{invitationId:link.searchParams.get('companyInvitation'),token:link.searchParams.get('companyToken')},who);
  return {who,member};
 };
 const reviser=await invite(952,['purchaser','administrator']);await invite(953,['administrator']);
 const originalReason='synthetic-barrow-954 private original narrative',revisedReason='synthetic-barrow-955 private revised narrative',revisedCondition='synthetic-barrow-956 private revised condition';
 let claim=await h.command('return.request',{orderId:order.id,line:1,quantity:3,reason:originalReason,condition:'Original goods condition'},buyer);
 const creator=claim.createdBy;
 claim=await h.command('return.revise',{id:claim.id,revision:claim.revision,quantity:3,reason:revisedReason,condition:revisedCondition},reviser.who);
 claim=(await f.claims()).claims.find(row=>row.id===claim.id);
 const revisedBy=claim.history.at(-1).by;
 assert.notEqual(revisedBy,creator);assert.equal(claim.createdBy,creator);
 const decisionReason='synthetic-barrow-957 private decision narrative',instructions='synthetic-barrow-958 private instructions';
 claim=await h.command('return.decide',{id:claim.id,revision:claim.revision,orderRevision:order.revision,quantity:2,instructions,reason:decisionReason});
 const receipt=await f.receive(2);
 claim=await h.command('return.reconcile',{id:claim.id,revision:claim.revision,receipts:[{returnId:receipt.id,quantity:2}]});
 const commercial={id:claim.id,createdBy:claim.createdBy,orderId:claim.orderId,basis:claim.basis,quantity:claim.quantity,receipts:claim.receipts};
 const audit=()=>h.api('/api/barrow/audit?orderId='+order.id+'&limit=200');
 const originalAudit=(await audit()).events.filter(row=>row.subjectId===claim.id);
 assert.ok(originalAudit.some(row=>row.reason===originalReason));assert.ok(originalAudit.some(row=>row.reason===revisedReason));assert.ok(originalAudit.some(row=>row.reason===decisionReason));
 const saved=await archive(h);
 const members=()=>h.api('/api/barrow/company/members?accountId=cedar');
 const erase=async userId=>{
  const member=(await members()).members.find(row=>row.userId===userId);
  return h.command('company.erase',{memberId:member.id,revision:member.revision,confirm:'ERASE',reason:'Erase this return contributor’s personal narrative.'});
 };
 const current=async()=> (await f.claims()).claims.find(row=>row.id===claim.id);
 // The original creator no longer owns text replaced by another purchaser.
 await erase(creator);
 let shown=await current();assert.equal(shown.reason,revisedReason);assert.equal(shown.condition,revisedCondition);assert.equal(shown.decision.reason,decisionReason);
 assert.equal(shown.history.find(row=>row.action==='return.request').reason,'[Erased return text]');
 let events=(await audit()).events;
 assert.ok(!JSON.stringify(events).includes(originalReason));assert.ok(events.some(row=>row.reason===revisedReason));
 await erase(revisedBy);
 shown=await current();assert.equal(shown.reason,'[Erased return text]');assert.equal(shown.condition,'[Erased return text]');assert.equal(shown.decision.reason,decisionReason);
 assert.equal(shown.decision.instructions,instructions);assert.equal(shown.restored,true);
 assert.deepEqual(Object.fromEntries(Object.keys(commercial).map(key=>[key,shown[key]])),commercial);
 events=(await audit()).events;assert.ok(!JSON.stringify(events).includes(revisedReason));
 // Audit provenance and the controlled reconciliation observation survive redaction.
 for(const before of originalAudit){const after=events.find(row=>row.id===before.id);assert.ok(after);for(const key of ['subjectId','actorId','action','createdAt','accountId','orderId','revision'])assert.equal(after[key],before[key]);}
 assert.equal(events.find(row=>row.action==='return.reconcile'&&row.subjectId===claim.id).reason,originalAudit.find(row=>row.action==='return.reconcile').reason);
 const memberReplay=await installation();t.after(()=>memberReplay.close());await restore(memberReplay,saved,{journalSource:h});
 let restored=(await memberReplay.api('/api/barrow/export.json')).returnclaims.find(row=>row.id===claim.id);
 assert.equal(restored.reason,'[Erased return text]');assert.equal(restored.condition,'[Erased return text]');
 let replayAudit=await memberReplay.api('/api/barrow/audit?orderId='+order.id+'&limit=200');
 assert.ok(!JSON.stringify(replayAudit).includes(originalReason));assert.ok(!JSON.stringify(replayAudit).includes(revisedReason));assert.ok(JSON.stringify(replayAudit).includes(decisionReason));
 // Account erasure also removes an owner's decision narrative and its audit copy.
 await h.command('retention.request',{accountId:'cedar',requester:'Buyer',channel:'Verified request',verificationNote:'Supplier verified the current account request.',held:false,reason:'Review personal return narrative erasure.'});
 const preview=await h.command('retention.preview',{accountId:'cedar'});
 assert.ok(preview.items.some(row=>row.id==='return:'+claim.id));
 await h.command('retention.erase-account',{accountId:'cedar',accountRevision:preview.accountRevision,requestRevision:preview.requestRevision,policyRevision:preview.policyRevision,reviewHash:preview.reviewHash,confirm:'ERASE',reason:'Remove personal return text and its audit copies.'});
 shown=(await h.api('/api/barrow/export.json')).returnclaims.find(row=>row.id===claim.id);
 assert.equal(JSON.parse(shown.decision).reason,'[Erased return text]');assert.equal(JSON.parse(shown.decision).instructions,'[Erased return text]');assert.ok(shown.receipts.includes(receipt.id));
 events=(await audit()).events;assert.ok(!JSON.stringify(events).includes(decisionReason));
 const csv=await(await h.request('/api/barrow/audit.csv?orderId='+order.id)).text();assert.ok(!csv.includes(decisionReason));assert.ok(csv.includes(claim.id));
 const accountReplay=await installation();t.after(()=>accountReplay.close());await restore(accountReplay,saved,{journalSource:h});
 replayAudit=await accountReplay.api('/api/barrow/audit?orderId='+order.id+'&limit=200');
 for(const reason of [originalReason,revisedReason,decisionReason])assert.ok(!JSON.stringify(replayAudit).includes(reason));
 restored=(await accountReplay.api('/api/barrow/export.json')).returnclaims.find(row=>row.id===claim.id);
 assert.equal(restored.reason,'[Erased return text]');assert.equal(restored.condition,'[Erased return text]');assert.equal(JSON.parse(restored.decision).instructions,'[Erased return text]');assert.ok(restored.receipts.includes(receipt.id));
}
