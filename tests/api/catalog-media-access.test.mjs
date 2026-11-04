import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {activateStaff,archive,installation,restore} from './harness.mjs';
import {mediaFixture,mediaPath,mediaReason,mediaPolicy,mediaEmail} from './catalog-media-fixture.mjs';
import {imageSha} from '../fixtures/confirmation-image.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

test('catalog media: native scoped managers review stored matches, atomic replacement fences stale authority and preserves retained documents and private history',async t=>{
 const {h,pier,replacementSha,catalogs,membership,manager}=await mediaFixture(t);
 const {as}=manager.who,who={as};let grant=manager.grant;assert.ok(as);
 const match={catalogId:'spring',sku:'OAT-1',slot:1,imageSha256:replacementSha};
 const view=()=>h.api(mediaPath,undefined,who),preview=(input=match,opts=who)=>h.api(mediaPath+'/preview',input,opts);
 const apply=(review,input=match,opts=who)=>h.api(mediaPath+'/apply',{...input,fingerprint:review.fingerprint,reason:mediaReason},opts);
 const update=async policy=>{grant=await h.command('staff.update',{userId:grant.userId,revision:grant.revision,policy,reason:mediaReason});return grant};
 const originalMembership=(await h.api(mediaPath)).revision;
 await membership([catalogs[0],catalogs[0]],{status:400});
 await membership([{...catalogs[0],skus:['absent']}],{status:409});
 await membership([{...catalogs[0],images:['f'.repeat(64)]}],{status:400});
 assert.equal((await h.api(mediaPath)).revision,originalMembership);
 const buyer={as:await h.signIn((await h.api('/api/barrow/accounts/by-id/cedar')).value.email)};
 let order=await h.command('order.prepare',{accountId:'cedar',lines:[{sku:'OAT-1',quantity:2}]},buyer);
 order=await h.command('order.submit',{orderId:order.id},buyer);order=await h.command('order.approve',{orderId:order.id});
 const confirmation='/api/barrow/orders/'+order.id+'/confirmations/2.pdf';
 const frozen=hash(Buffer.from(await(await h.request(confirmation,buyer)).arrayBuffer()));
 const history=await h.api('/api/barrow/imports/nuorder'),stock=await pier.api('/api/pier/state');
 const otherManager=await activateStaff(h,mediaEmail(902),mediaPolicy([], {entitlements:[],catalogMedia:undefined}));
 const operations=await activateStaff(h,mediaEmail(903),mediaPolicy([], {role:'operations',entitlements:[],catalogMedia:undefined}));
 const winter=await activateStaff(h,mediaEmail(904),mediaPolicy(['winter']));
 const {token}=await h.api('/api/barrow/agent-token',{});
 for(const denied of [{as:otherManager.who.as},{as:operations.who.as},buyer,{as:'',headers:{authorization:`Bearer ${token}`}}]) {
  await h.api(mediaPath,undefined,{...denied,status:403});await preview(match,{...denied,status:403});
  await apply({fingerprint:'synthetic-barrow-905'},match,{...denied,status:403});
 }
 for(const policy of [mediaPolicy([]),mediaPolicy(['absent']),mediaPolicy(['spring'],{role:'operations'}),mediaPolicy(['spring'],{entitlements:[]})])
  await h.command('staff.invite',{email:mediaEmail(906),name:'Invalid media grant',policy,reason:mediaReason},{status:400});
 assert.deepEqual((await view()).catalogs.map(row=>row.id),['spring']);assert.equal((await view()).acceptedImages,undefined);
 assert.deepEqual((await h.api(mediaPath,undefined,{as:winter.who.as})).catalogs.map(row=>row.id),['winter']);
 await preview({...match,catalogId:'winter',sku:'RYE-1'},{...who,status:403});
 await preview({...match,sku:'SHARED-1'},{...who,status:403});
 await preview({...match,imageSha256:'f'.repeat(64)},{...who,status:403});
 await preview({...match,catalogId:'winter',sku:'RYE-1',imageSha256:imageSha},{as:winter.who.as,status:403});
 await preview({...match,sku:'RYE-1'},{...who,status:409});
 await preview({...match,url:'https://media.invalid/image.jpg'},{...who,status:400});
 for(const endpoint of ['/api/barrow/imports/nuorder','/api/barrow/catalog-maintenance/export.json','/api/barrow/variant-attributes'])await h.api(endpoint,undefined,{...who,status:403});
 await h.command('variant.image',{sku:'OAT-1',contentBase64:'synthetic-barrow-907'},{...who,status:403});
 await h.api(mediaPath+'/membership',{catalogs,reason:mediaReason},{...who,status:403});
 const before=await h.api('/api/barrow/variant-attributes');const review=await preview();assert.equal(review.grantRevision,grant.revision);assert.deepEqual(review.affectedCatalogs,['spring']);assert.ok(review.imageRevision);
 assert.deepEqual(await h.api('/api/barrow/variant-attributes'),before,'preparation writes no variants');
 const outcomes=await Promise.all([h.request(mediaPath+'/apply',{method:'POST',as,body:{...match,fingerprint:review.fingerprint,reason:mediaReason}}),h.request(mediaPath+'/apply',{method:'POST',as,body:{...match,fingerprint:review.fingerprint,reason:mediaReason}})]);
 assert.deepEqual(outcomes.map(row=>row.status).sort(),[200,409]);
 let attrs=await h.api('/api/barrow/variant-attributes');assert.equal(attrs.variants['OAT-1'].image.sha256,replacementSha);assert.equal(attrs.variants['OAT-1'].imageSlots['1'].sha256,replacementSha);assert.equal(attrs.variants['RYE-1'].image.sha256,replacementSha);
 const listing=(await h.api('/api/barrow/catalog-maintenance/export.json')).listings.find(row=>row.sku==='OAT-1');assert.equal(listing.mediaSha256,replacementSha);assert.equal(listing.mediaSlots.filter(row=>row.slot===1).length,1);
 await apply(review,match,{...who,status:409});
 assert.equal((await h.api('/api/barrow/orders/'+order.id,undefined,buyer)).lines[0].image.sha256,imageSha);
 assert.equal(hash(Buffer.from(await(await h.request(confirmation,buyer)).arrayBuffer())),frozen);
 assert.deepEqual(await h.api('/api/barrow/imports/nuorder'),history);const stockAfter=await pier.api('/api/pier/state');for(const key of ['orders','positions','stockPositions','warehouseStocks','companyStocks','commands'])assert.deepEqual(stockAfter[key],stock[key],key);
 const second={...match,slot:2};let stale=await preview(second);
 await update(mediaPolicy(['spring']));await apply(stale,second,{...who,status:409});
 stale=await preview(second);await membership(catalogs);await apply(stale,second,{...who,status:409});
 stale=await preview(second);await h.command('variant.attributes',{revision:attrs.revision,variants:[{sku:'OAT-1',style:'OAT',color:'Natural',size:'Case'}]});
 await apply(stale,second,{...who,status:409});await membership(catalogs);
 // Explicitly granting both memberships allows the shared target only with a
 // reference the owner accepted for both. Assortment metadata grants nothing.
 await update(mediaPolicy(['spring','winter']));const shared={...match,sku:'SHARED-1',slot:2};await apply(await preview(shared),shared);
 assert.equal((await h.api('/api/barrow/variant-attributes')).variants['SHARED-1'].imageSlots['2'].sha256,replacementSha);
 const ownEvents=(await h.api('/api/barrow/audit?person='+grant.userId,undefined,who)).events.filter(row=>row.action==='catalog-media.applied');assert.equal(ownEvents.length,2);assert.ok(ownEvents.every(row=>row.actorId===grant.userId&&row.source&&row.revision&&row.reason));
 const csv=await(await h.request('/api/barrow/audit.csv?person='+grant.userId,who)).text();for(const event of ownEvents)assert.ok(csv.includes(event.id));assert.ok(!csv.includes(winter.grant.userId));
 await update(mediaPolicy(['spring']));const narrowed=(await h.api('/api/barrow/audit?person='+grant.userId,undefined,who)).events.filter(row=>row.action==='catalog-media.applied');assert.equal(narrowed.length,1);assert.equal(JSON.parse(narrowed[0].reason).sku,'OAT-1');
 stale=await preview(second);grant=await h.command('staff.revoke',{userId:grant.userId,revision:grant.revision,reason:mediaReason});await apply(stale,second,{...who,status:403});await h.api(mediaPath,undefined,{...who,status:403});
 await update(mediaPolicy(['spring']));stale=await preview(second);
 await h.api('/auth/operator/status',{operatorId:grant.userId,status:'inactive'});await apply(stale,second,{...who,status:401});
 await h.api('/auth/operator/status',{operatorId:grant.userId,status:'active'});const reactivated={as:await h.signIn(mediaEmail(901),'existing')};await h.api(mediaPath,undefined,{...reactivated,status:403});
 const events=(await h.api('/api/barrow/audit?limit=200')).events;assert.ok(events.some(row=>row.actorId===grant.userId&&row.action==='staff.permission-refused'&&row.source?.startsWith('catalog-media.')));
 const restored=await installation();t.after(()=>restored.close());await restore(restored,await archive(h));
 const roster=(await restored.api('/api/barrow/staff/members')).members;assert.ok(roster.every(row=>row.state==='revoked'&&!row.effective));
 const oldPerson={as:await restored.signIn(mediaEmail(901))};await restored.api(mediaPath,undefined,{...oldPerson,status:403});await restored.api(mediaPath+'/apply',{...second,fingerprint:stale.fingerprint,reason:mediaReason},{...oldPerson,status:403});
 assert.equal(hash(Buffer.from(await(await restored.request(confirmation)).arrayBuffer())),frozen);
});
