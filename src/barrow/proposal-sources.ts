import type { Bindings } from '../auth.server'
import { catalogue, pierOrder } from './pier'
import { account } from './accounts'
import { digest } from './digest'
import { shippingSettings } from './shipping'
import { previewSubstitution } from './substitution-preview'
import { fail, integer, text, type Actor, type Order } from './model'
import type { ProposalGrant } from './proposal-grants'
import type { ProposalCandidate } from './agent-proposal-model'

const exact = (value: any, fields: string[]) => {
 if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !fields.includes(key)))
  fail('PROPOSAL_SCHEMA', 'Use structured product, unit, quantity and delivery fields only. Documents and instructions are never executable input.', 400)
}
export function proposalInput(p: any) {
 exact(p, ['id','number','revision','orderId','model','runId','reportedCostCents','candidates'])
 const identifier = (value: unknown, name: string) => {
  const result = text(value,name,100)
  if (!/^[\w.:-]+$/.test(result)) fail('PROPOSAL_SCHEMA', `${name} must be an opaque identifier, without document text or instructions.`,400)
  return result
 }
 if (!Array.isArray(p.candidates) || p.candidates.length < 1 || p.candidates.length > 5) fail('PROPOSAL_SCHEMA','Supply one to five complete candidate baskets.',400)
 for (const candidate of p.candidates) {
  exact(candidate,['lines','methodId','warehouse'])
  if (!Array.isArray(candidate.lines) || !candidate.lines.length || candidate.lines.length > 100) fail('PROPOSAL_SCHEMA','Supply a complete replacement basket.',400)
  for (const line of candidate.lines) {
   exact(line,['fromSku','fromUnit','sku','unit','quantity'])
   text(line.fromSku,'Original SKU',100); text(line.sku,'Replacement SKU',100)
   if (line.fromUnit !== undefined) text(line.fromUnit,'Original unit',32)
   if (line.unit !== undefined) text(line.unit,'Replacement unit',32)
   integer(line.quantity,'Replacement quantity',1)
  }
  if (candidate.methodId !== undefined) text(candidate.methodId,'Delivery method',60)
  if (candidate.warehouse !== undefined) text(candidate.warehouse,'Warehouse',160)
 }
 return {model:identifier(p.model,'Model'),runId:identifier(p.runId,'Run'),reportedCostCents:integer(p.reportedCostCents,'Self-reported external run cost',0),candidates:p.candidates as any[]}
}
/** Only native commercial records and authenticated inventory facts are sources.
 * Document bytes and model-written instructions never enter the tool context. */
export async function proposalFingerprint(env: Bindings, actor: Actor, order: Order) {
 if(await env.DB.prepare('SELECT account_id FROM bw_terms_assignments WHERE account_id=?').bind(order.accountId).first())fail('PROPOSAL_TERMS','This account has assigned sales terms. This proposal door cannot replace or bypass a fresh terms acceptance.')
 const selected = await account(env.DB,actor,order.accountId),stock = await catalogue(env,selected),upstream = await pierOrder(env,order)
 const {substitutions,revision,reservation,release,status,...commercial} = order
 // Offer/acceptance record revisions are the workflow itself. Commercial data
 // and inventory, including this order's reservation, must still match exactly.
 return {fingerprint:await digest(JSON.stringify({commercial,accountRevision:selected.revision,stock:stock.items,upstream,shipping:await shippingSettings(env.DB)})),accountRevision:selected.revision,observedAt:stock.observedAt}
}
export async function proposalCandidates(env: Bindings, actor: Actor, order: Order, grant: ProposalGrant, inputs: any[]): Promise<ProposalCandidate[]> {
 const candidates:ProposalCandidate[]=[]
 for (const input of inputs) {
  for (const line of input.lines) if (line.sku !== line.fromSku && !grant.allowedSubstitutes.some(row => row.fromSku === line.fromSku && row.skus.includes(line.sku)))
   fail('PROPOSAL_ASSORTMENT','The owner has not approved this original-to-replacement SKU mapping for this account.',403)
  const current = await previewSubstitution(env,actor,order,input)
  if (current.deliveryOptions.required && !current.delivery) fail('PROPOSAL_DELIVERY','Select a priced delivery option; an unapproved freight quote cannot be proposed.')
  const beforeMerchandise = order.lines.reduce((n,line)=>n+(line.lineCents??line.quantity*line.unitCents),0)
  const merchandise = current.lines.reduce((n,line)=>n+(line.lineCents??line.quantity*line.unitCents),0)
  candidates.push({lines:current.lines,delivery:current.delivery,deliveryOptions:current.deliveryOptions.options,totalCents:current.totalCents,
   merchandiseDifferenceCents:merchandise-beforeMerchandise,freightDifferenceCents:order.delivery?.totalCents===null||current.delivery?.totalCents===null?null:(current.delivery?.totalCents??0)-(order.delivery?.totalCents??0),taxNote:current.taxNote,rank:0})
 }
 // Stable and explainable: least additional total first. Stock, assortment,
 // units, minimums and delivery eligibility have already passed native doors.
 return candidates.sort((a,b)=>a.totalCents-b.totalCents).map((candidate,index)=>({...candidate,rank:index+1}))
}
