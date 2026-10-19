// 10 · To the door, and to the bank (on the page's one pale ultramarine band): one action queue with four of
// Ember Hollow's stores, each with a dated trail and one end pill. Amber only on the two slips.
import { glyph, nb, ok } from '../shell/html'

type Kind = 'done' | 'slip' | 'open' | 'note'
interface Row { store: string; town: string; sub: string; steps: [Kind, string][]; end: string }

const rows: Row[] = [
  { store: 'Sonoma Mercantile', town: 'Sonoma CA', sub: 'PO 5521', end: `delivered · within terms ${ok}`, steps: [
    ['done', `${nb('Fri Oct 9')} · 24 cases × 6 = 144 candles × $14.00 = ${nb('$2,016.00')} accepted`],
    ['done', `${nb('Tue Oct 13')} · UPS`],
    ['done', `${nb('Fri Oct 16,')} ${nb('2:14 pm PT')} · delivered ${ok}`],
    ['done', `Invoice 2212 · net 30 · due ${nb('Thu Nov 12')} · CA resale · tax $0.00`],
  ] },
  { store: 'Birch &amp; Fern', town: 'Burlington VT', sub: '2 parcels', end: `closed on UPS’s delivery scan ${ok}`, steps: [
    ['done', `${nb('Wed Oct 14')} · parcel 1 delivered ${ok}`],
    ['slip', `${nb('Thu Oct 15')} · parcel 2 UPS delay`],
    ['note', `“Parcel 2 is running late; UPS now expects ${nb('Mon Oct 19')}.”<small>drafted by agent · sent by Grace 9:20 am</small>`],
    ['done', `${nb('Mon Oct 19,')} ${nb('11:02 am')} · delivered ${ok}`],
  ] },
  { store: 'Harbor Home', town: 'Mystic CT', sub: `invoice 2208 ${nb('$1,836.00')}`, end: `settled ${ok}`, steps: [
    ['done', `${nb('Tue Oct 13')} · ACH debit on shipment`],
    ['slip', `${nb('Mon Oct 19')} · returned R01: insufficient funds · balance reopened`],
    ['done', `Card payment request drafted · sent by Grace ${nb('10:12 am')}`],
    ['done', `${nb('Wed Oct 21,')} ${nb('3:30 pm')} · paid by card`],
  ] },
  { store: 'Brightwater Market', town: 'Portland ME', sub: 'statement', end: `statement $0.00 ${ok}`, steps: [
    ['done', `Invoice 2196 · ${nb('Fri Oct 9')} · ${nb('$2,500.00')} · ACH settled ${nb('Fri Oct 23')}`],
    ['done', `Invoice 2231 · ${nb('Mon Oct 19')} · ${nb('$1,710.00')} · net 14`],
    ['open', `${nb('$4,210.00')} − ${nb('$2,500.00')} paid = ${nb('$1,710.00')} due ${nb('Mon Nov 2')}`],
    ['done', `ACH ${nb('Thu Oct 29')} → settled ${nb('Mon Nov 2')}`],
  ] },
]

export function followSection(): string {
  return '<section class="section follow wash" aria-labelledby="follow-title"><div class="wrap">'
    + '<div class="split-head"><div><p class="eyebrow">Agent · Ember Hollow · Tue Oct 13 <span aria-hidden="true">→</span><span class="visually-hidden">to</span> Mon Nov 2</p>'
    + '<h2 id="follow-title" class="xl">To the door, <span class="line">and to the bank.</span></h2></div>'
    + '<p class="lede">The agent follows every order until the carrier says delivered and the bank says paid, and drafts the note when either slips.</p></div>'
    + `<div class="card queue-card"><h3 class="queue-head">${glyph('candle', 'card-glyph xl')}<span class="serif-title xl">Ember Hollow · follow-through</span></h3>`
    + `<ol class="queue">${rows.map(row => `<li class="queue-row"><div class="queue-store"><p><b class="serif-name">${row.store},</b> <span class="serif-town">${row.town}</span></p><p class="muted">${row.sub}</p></div>`
      + `<ol class="trail">${row.steps.map(([kind, text]) => `<li class="t-${kind}"><span class="t-dot" aria-hidden="true"></span><span class="t-text">${text}</span></li>`).join('')}</ol>`
      + `<p class="pill pill-green queue-end">${row.end}</p></li>`).join('')}</ol>`
    + '<p class="queue-foot"><span>312 stockists · 41 states</span><span>open: 27 orders in transit or within terms · every one has an owner</span><span class="strong">a label, a sent email or a pending ACH never closes an order</span></p></div>'
    + '</div></section>'
}
