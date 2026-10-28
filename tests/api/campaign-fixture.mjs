import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {sheetFixture} from './line-sheet-fixture.mjs';
import {accountValue} from './harness.mjs';
export const campaignClock='2026-10-28T12:00:00.000Z';
const email=n=>['synthetic-barrow-'+n,'example.test'].join('@');
export async function campaignFixture(t,options={}){
 const key=Buffer.from('synthetic-barrow-021'),f=await sheetFixture(t,{...options,clock:campaignClock,https:true,bindings:{...options.bindings,MAIL_WEBHOOK_SECRET:'wh'+'sec_'+key.toString('base64'),MAIL_EVENT_TENANT:'synthetic-barrow-22'}}),{h,pier}=f;
 const save=async(a,patch)=>h.command('account.save',{id:a.id,revision:a.revision,value:{...a.value,...patch}});
 f.cedar=await save(await h.api('/api/barrow/accounts/by-id/cedar'),{channel:'Spring',tags:['spring']});
 f.wren=await save(await h.api('/api/barrow/accounts/by-id/wren'),{channel:'Spring',tags:['spring'],currency:'USD'});
 // Two distinct USD price books make an accidentally shared price visible on both page and PDF.
 f.wren=await f.importBook(f.wren,'USD',1303);
 f.sheet=await f.publish(f.cedar,'wholesale');
 const all=[f.cedar,f.wren];
 for(let n=3;n<=30;n++){
  const party=await pier.command('party.save',{name:'Synthetic campaign company '+n,kind:'customer'});
  const a=await h.command('account.save',{id:'synthetic-barrow-'+n,value:{...accountValue(party.id,email(n)),name:'Synthetic campaign company '+n,channel:'Spring',tags:['spring'],minimumCents:0,prices:f.skus.map(sku=>({sku,unitCents:n%2?1201:1303,minQty:1})),...(n===30?{lifecycle:'closed'}:{})}});all.push(a);
  if(n<29)await h.signIn(a.value.email);
 }
 // One approved account has a suppressed purchaser plus a second eligible purchaser.
 const additional=email(31),second={as:await h.signIn(email(31))};
 await h.command('company.invite',{accountId:'cedar',email:additional,name:'Synthetic second purchaser',policy:{rights:['purchaser'],locations:'all',perOrderLimitCents:null,approvalLimitCents:null},reason:'Owner approved this additional company purchaser.'});
 const message=h.mail.requests.findLast(r=>r.message.to.includes(additional)&&r.message.text.includes('companyInvitation'))?.message;
 assert.ok(message);
 const link=new URL(message.text.match(/https?:\/\/\S+/)[0]);
 await h.command('company.accept',{invitationId:link.searchParams.get('companyInvitation'),token:link.searchParams.get('companyToken')},second);
 // Seed a real signed suppression at the same network boundary used by campaigns below.
 const segment=await h.command('segment.save',{name:'Spring wholesale accounts',filters:{channel:'Spring',tag:'spring'}});
 const draft=await h.command('campaign.save',{name:'Spring campaign',subject:'Your spring assortment',message:'Review your account prices and adjust the suggested quantities.',source:{kind:'sheet',id:f.sheet.id},segmentId:segment.id,lines:[{sku:f.skus[0],quantity:2}],attachPdf:true});
 async function webhook(d,type='email.delivered',valid=true,eventId='synthetic-barrow-event-'+d.id){
  const person=await h.db.prepare('SELECT email FROM oa_operators WHERE id=?').bind(d.recipient_id).first();
  const eventTime=options.built?Date.parse(campaignClock):Date.now();
  const stamp=String(Math.floor(eventTime/1000)),body=JSON.stringify({type,created_at:new Date(eventTime-1000).toISOString(),data:{email_id:d.provider_message_id,to:[person.email]}}),signature=createHmac('sha256',key).update(`${eventId}.${stamp}.${body}`).digest('base64');
  return h.raw('/api/barrow/campaign-mail/webhook',{method:'POST',headers:{'svix-id':eventId,'svix-timestamp':stamp,'svix-signature':'v1,'+(valid?signature:'invalid')},body});
 }
 // Suppress the primary purchaser through a signed bounced campaign receipt, without contact to the large audience.
 const tiny=await h.command('campaign.save',{name:'Suppression source',subject:'Synthetic boundary receipt',message:'Synthetic suppression receipt.',source:{kind:'sheet',id:f.sheet.id},filters:{accountIds:['cedar'],buyerIds:[(await h.api('/api/barrow/state',undefined,f.buyers.cedar)).actor.id]},attachPdf:true});
 const prior=await h.command('campaign.send',{id:tiny.id,revision:tiny.revision});
 const bounced=prior.deliveries[0];assert.equal(bounced.status,'accepted');assert.equal((await webhook(bounced,'email.bounced')).status,200);
 return {...f,all,second,segment,draft,webhook,async send(c=draft){return h.command('campaign.send',{id:c.id,revision:c.revision})},campaignMail:()=>h.mail.deliveries.filter(d=>d.message.subject===draft.subject),async receive(c){for(const d of c.deliveries.filter(d=>d.status==='accepted'))assert.equal((await webhook(d)).status,200);return h.api('/api/barrow/campaigns/'+c.id)}};
}
