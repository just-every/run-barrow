// Public intake and email verification, with only the paid mail edge supplied by the harness.
export async function verifiedApplication(h, {name='Cedar Street Pantry',email='applicant@example.test'}={}) {
 const form=await h.api('/api/barrow/applications/form',undefined,{as:''});
 await new Promise(resolve=>setTimeout(resolve,3050));
 const bytes='%PDF-1.4 synthetic-barrow-301';
 const created=await h.api('/api/barrow/applications',{
  name,noEin:true,contactName:'River Buyer',email,phone:'803 555 0101',annualVolumeUsd:90000,
  locations:[{name:'Downtown store',line1:'101 Main Street',city:'Columbia',state:'SC',zip:'29201'}],
  documents:[{name:'resale.pdf',contentBase64:Buffer.from(bytes).toString('base64')}],consent:true,formToken:form.formToken,
 },{as:''});
 const code=h.mail.requests.findLast(row=>row.message.to.includes(email)&&row.message.subject==='Verify your trade application').message.text.match(/code is (\d{6})/)[1];
 const response=await h.request('/api/barrow/applications/verify',{method:'POST',as:'',body:{id:created.id,code}});
 if(response.status!==200)throw new Error('Application verification failed');
 const applicant={as:response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ')};
 return {application:await h.api('/api/barrow/applications/mine',undefined,applicant),applicant,bytes};
}
