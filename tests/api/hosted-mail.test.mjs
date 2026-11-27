import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash, randomBytes, randomUUID} from 'node:crypto';
import {installation} from './harness.mjs';

test('hosted invitations confirm native purchasing identity through the relay and after switching to a direct provider',async t=>{
 const messages=[];
 const h=await installation({bindings:{MAIL_PROVIDER:'rer',MAIL_RELAY_URL:'https://relay.example.test/mail',MAIL_API_KEY:'synthetic-barrow-20'},networkEdge:async request=>{
  if(request.url!=='https://relay.example.test/mail')return;
  assert.equal(request.method,'POST');
  assert.equal(request.headers.get('authorization'),'Bearer synthetic-barrow-20');
  messages.push(await request.json());
  return Response.json({messageId:'<synthetic-barrow-20@relay.example.test>'},{status:202});
 }});t.after(()=>h.close());
 const invitation=await h.request('/auth/invite',{method:'POST',body:{email:'cedar@example.test',displayName:'Cedar buyer',role:'member',returnTo:'/app'}});
 assert.equal(invitation.status,202);
 assert.equal(messages.length,1);
 assert.equal(messages[0].to,'cedar@example.test');
 const link=new URL(messages[0].text.match(/https?:\/\/[^\s<>]+\/auth\/confirm\?token=[^\s<>]+/)[0]);
 const confirmed=await h.request('/auth/confirm',{method:'POST',as:'',body:{token:link.searchParams.get('token')}});
 assert.equal(confirmed.status,303);
 const as=confirmed.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
 const state=await h.api('/api/barrow/state',undefined,{as});
 assert.equal(state.actor.email,'cedar@example.test');
 assert.equal(state.actor.role,'member');

 // Keep the relay URL while switching this installation to its direct provider.
 await h.configure({MAIL_PROVIDER:'resend'});
 {
  const as=await h.signIn('direct@example.test');
  assert.equal(h.mail.requests.length,1);
  assert.equal((await h.api('/api/barrow/state',undefined,{as})).actor.email,'direct@example.test');
 }
});

test('mail-off hosted installation refuses email and accepts a one-use owner sign-in',async t=>{
 const h=await installation({https:true,bindings:{AUTH_LOCAL:'false',MAIL_PROVIDER:'none',MAIL_FROM:'',MAIL_API_KEY:''}});
 t.after(()=>h.close());
 const page=await h.request('/signin',{as:''});
 assert.equal(page.status,200);
 assert.doesNotMatch(await page.text(),/action="\/auth\/magic-link"/);
 const refused=await h.request('/auth/magic-link',{method:'POST',as:'',body:{email:'owner@example.test'}});
 assert.equal(refused.status,503);
 assert.equal((await refused.json()).error,'mail_unavailable');
 const invitation=await h.request('/auth/invite',{method:'POST',body:{email:'buyer@example.test',displayName:'Buyer',role:'member',returnTo:'/app'}});
 assert.equal(invitation.status,503);
 assert.equal((await invitation.json()).error,'mail_unavailable');
 assert.equal(h.mail.requests.length,0);

 // Stand in for the Cloudflare D1 write that rer signin makes using the deployer's token.
 const token=randomBytes(32).toString('base64url'), now=Date.now();
 const hash=createHash('sha256').update('owner-signin\0'+token).digest('hex');
 const grant=await h.db.prepare(`INSERT INTO oa_owner_signins(id,token_hash,operator_id,operator_version,created_at,expires_at)
   SELECT ?,?,id,version,?,? FROM oa_operators WHERE role='owner' AND status='active'`)
  .bind(randomUUID(),hash,now,now+60_000).run();
 assert.equal(grant.meta.changes,1);
 assert.equal((await h.request('/auth/owner-signin?token='+token,{as:''})).status,200);
 const confirm={method:'POST',as:'',body:{token}};
 const signedIn=await h.request('/auth/owner-signin',confirm);
 assert.equal(signedIn.status,303);
 const as=signedIn.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
 assert.equal((await h.api('/api/barrow/state',undefined,{as})).actor.role,'owner');
 assert.equal((await h.request('/auth/owner-signin',confirm)).status,400);
});
