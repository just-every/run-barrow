import { useState } from 'react'
import { request, errorMessage } from './api'
import { Notice } from './primitives'
import { money, day, type Account, type Order, type RunCommand } from './types'
import type { SellThroughReview } from '../sell-through'

type Selection = {sku: string; unit: string; quantity: number}
export function SellThroughPlanner({accounts,busy,run}:{accounts:Account[];busy:boolean;run:RunCommand}) {
 const [accountId,setAccount]=useState(accounts[0]?.id??'')
 const [input,setInput]=useState({csv:'',observedOn:'',requestedDate:'',horizonDays:'10',seasonalityBps:'10000',budgetCents:'',reference:''})
 const [authorized,setAuthorized]=useState(false),[outage,setOutage]=useState(false),[acknowledged,setAcknowledged]=useState(false)
 const [review,setReview]=useState<SellThroughReview|null>(null),[selections,setSelections]=useState<Selection[]|undefined>()
 const [dirty,setDirty]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[accepted,setAccepted]=useState(false)
 const [key,setKey]=useState(()=>crypto.randomUUID())
 const locked=busy||loading
 const invalidate=()=>{setReview(null);setSelections(undefined);setAcknowledged(false);setAccepted(false);setError('');setKey(crypto.randomUUID())}
 function field(name:keyof typeof input,value:string) {setInput(current=>({...current,[name]:value}));invalidate()}
 const payload=()=>({accountId,authorized,...input,horizonDays:Number(input.horizonDays),seasonalityBps:Number(input.seasonalityBps),budgetCents:Number(input.budgetCents),...(selections?{selections}:{}),acknowledgedOutage:outage})
 async function compare() {
  setLoading(true);setError('');setAcknowledged(false)
  try {
   const {result}=await request<{result:SellThroughReview}>('/api/barrow/commands',{type:'order.sellthrough-preview',payload:payload()})
   setReview(result);setSelections(result.lines.map(({sku,unit,quantity})=>({sku,unit,quantity})));setDirty(false);setKey(crypto.randomUUID())
  } catch(cause) {setError(errorMessage(cause));setReview(null)}
  finally {setLoading(false)}
 }
 function edit(sku:string,value:string) {
  setSelections(current=>current?.map(line=>line.sku===sku?{...line,quantity:Number(value)}:line));setDirty(true);setAcknowledged(false);setError('')
 }
 async function accept() {
  if(!review||dirty||!acknowledged||review.blockers.length)return
  setLoading(true)
  try {
   if(await run('order.sellthrough',{...payload(),fingerprint:review.fingerprint,acknowledged,key})) {setAccepted(true);setReview(null);setSelections(undefined);setInput(current=>({...current,csv:''}));setAuthorized(false);setOutage(false)}
   else {setDirty(true);setAcknowledged(false)}
  } finally {setLoading(false)}
 }
 return <details className="br-card br-stack"><summary>Plan from sell-through</summary><section className="br-stack" aria-label="Sell-through planning">
  <h3>Plan a replenishment</h3><p>Use your normalized POS export to compare demand, stock on hand and open prebooks. Preview sends no contact and reserves no stock.</p>
  {error&&<Notice error>{error}</Notice>}{accepted&&<p role="status">One draft prepared. Review it below; submission and supplier approval are separate.</p>}
  <fieldset className="br-stack" disabled={locked}>
   <label>Trade account<select value={accountId} onChange={event=>{setAccount(event.target.value);setAuthorized(false);invalidate()}}>{accounts.map(account=><option key={account.id} value={account.id}>{account.value.name}</option>)}</select></label>
   <label>Normalized POS CSV<textarea rows={5} maxLength={262144} value={input.csv} onChange={event=>field('csv',event.target.value)} /></label>
   <p>Columns: sku, unit, sold, observedDays, onHand, status. Use complete or outage; leave sold empty for an outage. <a href="https://github.com/just-every/run-barrow/blob/main/docs/SELL-THROUGH.md">Export format and calculation</a></p>
   <div className="br-form-grid"><label>Stock observed on<input type="date" value={input.observedOn} onChange={event=>field('observedOn',event.target.value)} /></label><label>Requested replenishment date<input type="date" value={input.requestedDate} onChange={event=>field('requestedDate',event.target.value)} /></label></div>
   <div className="br-form-grid"><label>Demand horizon days<input type="number" min="1" max="366" step="1" value={input.horizonDays} onChange={event=>field('horizonDays',event.target.value)} /></label><label>Buyer seasonality basis points<input type="number" min="1" max="50000" step="1" value={input.seasonalityBps} onChange={event=>field('seasonalityBps',event.target.value)} /></label><label>Merchandise budget in cents<input type="number" min="0" max="1000000000" step="1" value={input.budgetCents} onChange={event=>field('budgetCents',event.target.value)} /></label></div>
   <label>Purchase order reference<input maxLength={100} value={input.reference} onChange={event=>field('reference',event.target.value)} /></label>
   <label style={{display:'flex',alignItems:'flex-start',gap:8,minHeight:44}}><input style={{width:20,minHeight:20,flex:'0 0 20px',marginTop:2}} type="checkbox" checked={authorized} onChange={event=>{setAuthorized(event.target.checked);invalidate()}} />I authorize this account’s export for this calculation and the accepted commercial summary.</label>
   <label style={{display:'flex',alignItems:'flex-start',gap:8,minHeight:44}}><input style={{width:20,minHeight:20,flex:'0 0 20px',marginTop:2}} type="checkbox" checked={outage} onChange={event=>{setOutage(event.target.checked);setDirty(true);setAcknowledged(false)}} />I acknowledge manual quantities where an outage leaves demand unknown.</label>
   <button type="button" disabled={!authorized||!input.csv||!input.observedOn||!input.requestedDate||input.budgetCents===''} onClick={()=>void compare()}>{loading?'Calculating…':review?'Recalculate edited plan':'Compare demand and commitments'}</button>
   {review&&<section className="br-stack" aria-label="Sell-through comparison">
    <p>Purchase cadence: {review.cadenceDays===null?'Unknown':`${review.cadenceDays} days`}. Requested {day(review.requestedDate)}. Total {money(review.totalCents,review.currency as 'USD'|'CAD')} against {money(review.budgetCents,review.currency as 'USD'|'CAD')} budget.</p>
    {review.lines.map(line=><div className="br-card br-stack" key={line.sku}><p><strong>{line.sku}</strong> · suggested {line.suggested??'Unknown'} {line.unit}</p><p>Sold {line.sold??'Unknown'} in {line.observedDays} days · on hand {line.onHand} · open commitments {line.openBaseQuantity} base units.</p><p>{line.explanation}</p><label>Chosen quantity for {line.sku}<input type="number" min="0" max="1000000" step="1" value={selections?.find(value=>value.sku===line.sku)?.quantity??line.quantity} onChange={event=>edit(line.sku,event.target.value)} /></label></div>)}
    {dirty&&<p role="status">Plan changed. Recalculate and review before accepting.</p>}
    {!!review.blockers.length&&<Notice error>{review.blockers.map(reason=><p key={reason}>{reason}</p>)}</Notice>}
    <label style={{display:'flex',alignItems:'flex-start',gap:8,minHeight:44}}><input style={{width:20,minHeight:20,flex:'0 0 20px',marginTop:2}} type="checkbox" checked={acknowledged} disabled={dirty||!!review.blockers.length} onChange={event=>setAcknowledged(event.target.checked)} />I accept these exact quantities, date, prices and uncertainty for one draft.</label>
    <button type="button" disabled={dirty||!acknowledged||!!review.blockers.length} onClick={()=>void accept()}>Prepare one reviewed draft</button>
   </section>}
  </fieldset>
 </section></details>
}

export function SellThroughContact({order,canReview,busy,run}:{order:Order;canReview:boolean;busy:boolean;run:RunCommand}) {
 const [nextContactDate,setDate]=useState(order.sellThrough?.contact?.nextContactDate??''),[acknowledged,setAcknowledged]=useState(false)
 const contact=order.sellThrough?.contact
 return <div className="br-stack" role="group" aria-label="Rep contact review">
  <p>{contact?`Rep-reviewed next contact: ${day(contact.nextContactDate)}.`:'Rep contact date has not been reviewed.'} Recording a date sends no message.</p>
  {canReview&&!['cancelled','superseded','releasing'].includes(order.status)&&<>
   <label>Next rep contact date<input type="date" value={nextContactDate} disabled={busy} onChange={event=>{setDate(event.target.value);setAcknowledged(false)}} /></label>
   <label style={{display:'flex',alignItems:'flex-start',gap:8,minHeight:44}}><input style={{width:20,minHeight:20,flex:'0 0 20px',marginTop:2}} type="checkbox" checked={acknowledged} disabled={busy} onChange={event=>setAcknowledged(event.target.checked)} />I reviewed this plan and its next contact date. No outreach is authorized.</label>
   <button type="button" disabled={busy||!nextContactDate||!acknowledged} onClick={()=>void run('order.sellthrough-contact',{orderId:order.id,revision:order.revision,nextContactDate,acknowledged})}>Save reviewed contact date</button>
  </>}
 </div>
}
