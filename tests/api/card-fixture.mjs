import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {installation,stock,accountValue} from './harness.mjs';
export function cardEdge() {
 const refunds=new Map();let loseRefund=false,refuseRefund=false;
 const intents=new Map(),sessions=new Map(),methods=new Map(),customers=new Map(),requests=[],secret='synthetic-barrow-2';
 let sequence=0,captures=0,loseCapture=false;
 const next=()=>`synthetic-barrow-${++sequence+100}`;
 const networkEdge=async request=>{
  const url=new URL(request.url);if(url.hostname!=='api.stripe.com')return;
  const path=url.pathname.replace('/v1',''),body=request.method==='POST'?new URLSearchParams(await request.text()):null;
  requests.push({path,method:request.method,body,key:request.headers.get('idempotency-key')});
  if(path==='/account')return Response.json({id:'synthetic-barrow-3',country:'US'});
  if(path==='/balance')return Response.json({livemode:false});
  if(path==='/webhook_endpoints')return Response.json({id:'synthetic-barrow-4',secret});
  if(path.startsWith('/webhook_endpoints/'))return Response.json({deleted:true});
  if(path==='/customers'){const identity=body.get('metadata[barrowInstallationId]')+':'+body.get('metadata[barrowAccountId]');if(!customers.has(identity))customers.set(identity,{id:next()});return Response.json(customers.get(identity))}
  if(path==='/checkout/sessions') {
   const duplicate=[...sessions.values()].find(s=>s.key===request.headers.get('idempotency-key'));if(duplicate)return Response.json(duplicate);
   const session={id:next(),key:request.headers.get('idempotency-key'),livemode:false,status:'open',client_reference_id:body.get('client_reference_id'),customer:body.get('customer'),installationId:body.get('setup_intent_data[metadata][barrowInstallationId]'),url:'https://checkout.stripe.com/c/pay/synthetic-barrow-5'};sessions.set(session.id,session);return Response.json(session);
  }
  if(path.startsWith('/checkout/sessions/')){const parts=path.split('/'),session=sessions.get(parts.at(-1)==='expire'?parts.at(-2):parts.at(-1));if(parts.at(-1)==='expire')session.status='expired';return Response.json(session)}
  if(path.startsWith('/payment_methods/'))return Response.json(methods.get(path.split('/').at(-1)));
  if(path==='/refunds'){if(refuseRefund){refuseRefund=false;return Response.json({error:{type:'invalid_request_error'}},{status:400})}const key=request.headers.get('idempotency-key');let refund=[...refunds.values()].find(row=>row.key===key);if(!refund){refund={id:next(),key,payment_intent:body.get('payment_intent'),amount:Number(body.get('amount')),currency:intents.get(body.get('payment_intent')).currency,status:'pending',metadata:{barrowRefundId:body.get('metadata[barrowRefundId]'),barrowInstallationId:body.get('metadata[barrowInstallationId]')}};refunds.set(refund.id,refund)}if(loseRefund){loseRefund=false;throw Error('Lost response after real refund request at the paid network edge')}return Response.json(refund)}
  if(path.startsWith('/refunds/'))return Response.json(refunds.get(path.split('/').at(-1)));
  if(path==='/payment_intents') {
   const duplicate=[...intents.values()].find(i=>i.metadata.barrowPaymentId===body.get('metadata[barrowPaymentId]')&&i.metadata.barrowInstallationId===body.get('metadata[barrowInstallationId]'));if(duplicate)return Response.json(duplicate);
   const method=methods.get(body.get('payment_method'));
   const intent={id:next(),livemode:false,amount:Number(body.get('amount')),customer:body.get('customer'),currency:body.get('currency'),metadata:{barrowPaymentId:body.get('metadata[barrowPaymentId]'),barrowInstallationId:body.get('metadata[barrowInstallationId]')},status:method.outcome??'requires_capture',created:Math.floor(Date.now()/1000),next_action:method.outcome==='requires_action'?{redirect_to_url:{url:'https://hooks.stripe.com/3d_secure/synthetic-barrow-6'}}:null};intents.set(intent.id,intent);return Response.json(intent);
  }
  const match=/^\/payment_intents\/([^/]+)(?:\/(capture|cancel))?$/.exec(path);
  if(match) {
   const intent=intents.get(match[1]);assert.ok(intent);
   if(match[2]==='capture') {if(intent.status!=='succeeded'){captures++;intent.status='succeeded';intent.amount_received=intent.amount}if(loseCapture){loseCapture=false;throw Error('Network response lost after provider capture')}}
   if(match[2]==='cancel')intent.status='canceled';
   return Response.json(intent);
  }
  throw Error('Unexpected Stripe network request '+path);
 };
 return {networkEdge,requests,intents,sessions,secret,refunds,loseRefund(){loseRefund=true},refuseRefund(){refuseRefund=true},async refundEvent(h,refund,{type='refund.updated',id=next()}={}){const object=refunds.get(refund.providerRefundId),time=Math.floor(Date.now()/1000),body=JSON.stringify({id,type,created:time,livemode:false,data:{object}}),signature=`t=${time},v1=${createHmac('sha256',secret).update(`${time}.${body}`).digest('hex')}`;return {body,signature,response:await h.raw('/api/barrow/card-webhook',{method:'POST',headers:{'stripe-signature':signature},body})}},get captures(){return captures},loseCapture(){loseCapture=true},complete(payment,{funding='credit',state='NY',outcome,setupFailure=false}={}) {
  const session=[...sessions.values()].find(s=>s.client_reference_id===payment.id&&s.installationId===payment.installationId);assert.ok(session);
  const method={id:next(),customer:session.customer,type:'card',card:{funding,brand:'visa',last4:'4242'},billing_details:{address:{country:'US',state}},outcome};methods.set(method.id,method);session.status=setupFailure?'open':'complete';session.setup_intent={status:setupFailure?'requires_payment_method':'succeeded',payment_method:method,...(setupFailure?{last_setup_error:{type:'card_error'}}:{})};
 },async event(h,payment,{type='payment_intent.succeeded',id=next(),created=Math.floor(Date.now()/1000),tamper=false}={}) {
  const intent=intents.get(payment.providerPaymentId),event={id,livemode:false,type,created,data:{object:intent}},body=JSON.stringify(event),time=Math.floor(Date.now()/1000),sig=createHmac('sha256',secret).update(`${time}.${body}`).digest('hex');
  const response=await h.raw('/api/barrow/card-webhook',{method:'POST',headers:{'content-type':'application/json','stripe-signature':`t=${time},v1=${sig}`},body:tamper?body+' ':body});return {response,event,body,signature:`t=${time},v1=${sig}`};
 }};
}
export async function cardFixture(t,{built=false,https=false,edge=cardEdge(),connect=true}={}) {
 const pier=await installation({pier:true});t.after(()=>pier.close());const product=await stock(pier,'200');
 const h=await installation({built,https,networkEdge:edge.networkEdge,bindings:{PIER_ORIGIN:pier.origin,PIER_SESSION:pier.cookie,CARD_WEBHOOK_ORIGIN:'https://synthetic-barrow.example.test'}});t.after(()=>h.close());
 const account=await h.command('account.save',{id:'cedar',value:{...accountValue(product.customer.id),state:'NY'}}),buyer={as:await h.signIn(account.value.email)};
 const otherParty=await pier.command('party.save',{kind:'customer',name:'Wren Foods'});await h.command('account.save',{id:'wren',value:{...accountValue(otherParty.id,'wren@example.test'),name:'Wren Foods'}});const other={as:await h.signIn('wren@example.test')};
 if(connect)await h.command('card.connect',{secretKey:'synthetic-barrow-1',consent:true,reason:'Owner reviewed Stripe custody and permitted New York credit-card policy.',surchargeBps:200,allowedStates:['NY']});
 let references=0;const order=async(reference='Card collection '+(++references))=>{const draft=await h.command('order.prepare',{accountId:'cedar',reference,lines:[{sku:'OAT-1',quantity:2}]},buyer);await h.command('order.submit',{orderId:draft.id},buyer);return h.command('order.approve',{orderId:draft.id})};
 const prepared=async(options={})=>{const issued=await order(),payment=await h.command('card.prepare',{orderId:issued.id},buyer);edge.complete(payment,options);return {order:issued,payment:await h.command('card.refresh',{paymentId:payment.id},buyer)}};
 return {h,pier,product,buyer,other,edge,order,prepared};
}

export async function assertFinancialFloor(h,payment){const date=new Date(payment.latestFinancialAt??payment.updatedAt),month=date.getUTCMonth();date.setUTCFullYear(date.getUTCFullYear()+7);if(date.getUTCMonth()!==month)date.setUTCDate(0);const preview=await h.command('retention.preview',{accountId:payment.accountId});assert.equal(preview.items.find(row=>row.id==='order:'+payment.orderId).floorUntil,date.toISOString())}
