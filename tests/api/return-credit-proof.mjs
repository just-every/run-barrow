import assert from 'node:assert/strict';
import {activateStaff} from './harness.mjs';

export async function proveReturnCredit(f,claim,received) {
 const {h,pier,buyer,other,order,edge}=f;
 const financial=await h.api('/api/barrow/credits?orderId='+order.id),calls=edge.requests.length;
 const payload={orderId:order.id,returnId:received.id,claimId:claim.id,claimRevision:claim.revision,inspectionVersion:received.version,expectedCents:13000,lines:[{line:1,quantity:2}],reason:'Issue only the inspected, authorized two-unit return credit.'};
 const attempt=(patch={},who={})=>h.command('credit.issue',{...payload,...patch},who);
 await attempt({}, {status:409}); // Physical receipt without inspection is insufficient.
 assert.deepEqual(await h.api('/api/barrow/credits?orderId='+order.id),financial);
 const inspected=await f.inspect(received);
 assert.equal(inspected.status,'quarantine');
 let current=(await f.claims()).claims.find(row=>row.id===claim.id);
 assert.equal(current.evidence.inspections[0].version,inspected.version);
 assert.equal(current.evidence.inspections[0].condition,'damaged');
 assert.equal(current.creditProposal.lines[0].inspection.disposition,'quarantine');
 assert.equal(current.canCredit,true);
 payload.inspectionVersion=inspected.version;
 const stockFacts=state=>Object.fromEntries(['version','orders','movements','returns','shipments','commands','reservations'].map(key=>[key,state[key]]));
 const inventory=stockFacts(await pier.api('/api/pier/state')); 
 await attempt({claimRevision:'synthetic-barrow-stale'}, {status:409});
 await attempt({inspectionVersion:received.version}, {status:409});
 await attempt({expectedCents:12999}, {status:409});
 await attempt({lines:[{line:1,quantity:3}]}, {status:409});
 await attempt({claimId:undefined}, {status:409});
 await attempt({}, {...buyer,status:403});await attempt({}, {...other,status:404});
 const policy={role:'finance',accounts:['cedar'],warehouses:'all',reports:['finance'],discountLimitCents:0,stockExceptionLimitCents:0,creditLimitCents:12999,refundLimitCents:0};
 const limited=await activateStaff(h,['synthetic-barrow-947','example.test'].join('@'),policy);
 await attempt({}, {...limited.who,status:403});
 assert.equal((await f.claims(limited.who)).claims.find(row=>row.id===claim.id).canCredit,false);
 const before=(await h.api('/api/barrow/reports/commissions')).rows.filter(row=>row.orderId===order.id);
 assert.deepEqual(before.map(row=>[row.rep,row.grossCents,row.reversedCents]),[['avery',2340,780],['blair',1560,520]]);
 assert.ok(before.every(row=>row.returnIds.includes(received.id)));
 const credit=await attempt();assert.equal(credit.amountCents,13000);assert.equal(credit.returnAuthorization.claimId,claim.id);
 assert.equal(credit.returnAuthorization.inspection.version,inspected.version);assert.equal(credit.returnAuthorization.approvedQuantity,2);
 assert.equal((await attempt()).id,credit.id);
 assert.equal((await h.api('/api/barrow/credits?orderId='+order.id)).credits.length,1);
 assert.deepEqual(stockFacts(await pier.api('/api/pier/state')),inventory);assert.equal(edge.requests.length,calls);
 const after=(await h.api('/api/barrow/reports/commissions')).rows.filter(row=>row.orderId===order.id);
 assert.deepEqual(after.map(row=>[row.rep,row.grossCents,row.reversedCents]),before.map(row=>[row.rep,row.grossCents,row.reversedCents]));
 assert.ok(after.every(row=>row.creditIds.includes(credit.id)&&row.returnIds.includes(received.id)&&row.sourceLineId));
 const statement=await h.api('/api/barrow/statements/cedar?to=2100-12-31',undefined,buyer),section=statement.sections.find(row=>row.currency==='USD');
 assert.equal(section.openingCents,0);assert.equal(section.closingCents,26000);assert.equal(section.creditedCents,13000);
 const entry=section.entries.find(row=>row.kind==='credit-note');assert.equal(entry.id,credit.id);assert.equal(entry.amountCents,-13000);assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(entry.date));
 const next=new Date(entry.date+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+1);
 const later=await h.api('/api/barrow/statements/cedar?from='+next.toISOString().slice(0,10)+'&to=2100-12-31',undefined,buyer);
 assert.equal(later.sections[0].openingCents,26000);assert.equal(later.sections[0].closingCents,26000);assert.equal(later.sections[0].entries.length,0);
 for(const suffix of ['csv','pdf']) {
  const body=await(await h.request('/api/barrow/statements/cedar.'+suffix+'?to=2100-12-31',buyer)).text();
  assert.ok(body.includes(credit.id));assert.ok(body.includes(entry.date));assert.ok(body.includes(suffix==='csv'?'26000':'260.00'));assert.ok(body.includes(suffix==='csv'?'-13000':'-130.00'));
 }
 const exported=await h.api('/api/barrow/export.json',undefined,buyer),record=exported.creditnotes.find(row=>row.id===credit.id);
 assert.equal(JSON.parse(record.returnAuthorization).claimId,claim.id);assert.equal(exported.manifest.counts.creditnotes,1);assert.equal(exported.manifest.totals.find(row=>row.currency==='USD').creditCents,13000);
 const csv=await(await h.request('/api/barrow/export/creditnotes.csv',buyer)).text();assert.ok(csv.includes(claim.id));assert.ok(csv.includes(received.id));assert.ok(!csv.includes('[object Object]'));
 assert.equal((await h.api('/api/barrow/export.json',undefined,other)).creditnotes.length,0);
 current=(await f.claims()).claims.find(row=>row.id===claim.id);
 assert.equal(current.creditProposal,null);assert.equal(current.credits[0].id,credit.id);assert.equal(current.disputedQuantity,1);assert.equal(current.tasks.find(row=>row.id.startsWith('return-dispute:')).status,'open');
 const audit=(await h.api('/api/barrow/audit?orderId='+order.id)).events.find(row=>row.action==='credit.issued');assert.equal(audit.subjectId,credit.id);assert.ok(audit.actorId);assert.equal(audit.source,received.id);
}
