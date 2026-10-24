import test from 'node:test';
import assert from 'node:assert/strict';
import {installation} from './harness.mjs';

test('a hosted invitation travels through the assigned RER mail relay and confirms native purchasing identity',async t=>{
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
});


test('switching a hosted sender to a direct provider ignores its retained relay URL',async t=>{
 const h=await installation({bindings:{MAIL_PROVIDER:'resend',MAIL_RELAY_URL:'https://relay.example.test/mail'}});t.after(()=>h.close());
 const as=await h.signIn('cedar@example.test');
 assert.equal(h.mail.requests.length,1);
 assert.equal((await h.api('/api/barrow/state',undefined,{as})).actor.email,'cedar@example.test');
});
