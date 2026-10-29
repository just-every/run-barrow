import assert from 'node:assert/strict';
import {activateStaff} from './harness.mjs';

export async function authorizeScopedReturn(f,claim) {
 const {h,order,pier}=f;
 const policy={role:'operations',accounts:['cedar'],warehouses:['New York'],reports:['fulfillment'],discountLimitCents:0,stockExceptionLimitCents:0,returnLimitCents:12999};
 const operator=await activateStaff(h,['synthetic-barrow-948','example.test'].join('@'),policy);
 const payload={id:claim.id,revision:claim.revision,orderRevision:order.revision,quantity:2,instructions:'Keep this second case separate.',reason:'Authorize two separate units.'};
 await h.command('return.decide',payload,{...operator.who,status:403});
 assert.equal((await f.claims()).claims.find(row=>row.id===claim.id).decision,undefined);
 let grant=await h.command('staff.update',{userId:operator.id,revision:operator.grant.revision,policy:{...policy,returnLimitCents:13000,warehouses:['Other warehouse']},reason:'Restrict the return operator to another source warehouse.'});
 await f.claims({...operator.who,status:403});await h.command('return.decide',payload,{...operator.who,status:403});
 grant=await h.command('staff.update',{userId:operator.id,revision:grant.revision,policy:{...policy,returnLimitCents:13000},reason:'Allow exact two-unit original-price returns in the named account and source warehouse.'});
 const inventory=await pier.api('/api/pier/state');
 const decided=await h.command('return.decide',payload,operator.who);assert.equal(decided.decision.by,operator.id);assert.equal(decided.decision.quantity,2);
 for(const key of ['orders','movements','returns','shipments','commands'])assert.deepEqual((await pier.api('/api/pier/state'))[key],inventory[key]);
 const tasks=(await h.api('/api/barrow/followups?view=all',undefined,operator.who)).tasks.filter(row=>row.sourceId===claim.id);
 assert.equal(tasks.length,2);assert.ok(tasks.every(row=>row.warehouses.includes('New York')&&row.status==='open'&&row.ownerId));
 const csv=await(await h.request('/api/barrow/export/returnclaims.csv',operator.who)).text();assert.ok(csv.includes(claim.id));assert.ok(csv.includes('cedar'));assert.ok(csv.includes(operator.id));
 await h.command('credit.issue',{orderId:order.id,returnId:'synthetic-barrow-no-receipt',lines:[{line:1,quantity:2}],reason:'Operations has no financial authority.'},{...operator.who,status:403});
 await h.command('staff.revoke',{userId:operator.id,revision:grant.revision,reason:'Remove current return admission.'});
 await f.claims({...operator.who,status:404});
 assert.equal((await h.request('/api/barrow/export/returnclaims.csv',operator.who)).status,403);
 await h.command('return.reconcile',{id:claim.id,revision:decided.revision,receipts:[{returnId:'synthetic-barrow-no-receipt',quantity:2}]},{...operator.who,status:404});
 const audit=(await h.api('/api/barrow/audit?search='+claim.id)).events;assert.ok(audit.some(row=>row.action==='return.decide'&&row.actorId===operator.id));
 return decided;
}
