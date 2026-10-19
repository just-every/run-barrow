// 09 · A photographed PO, a checked order: Sam's handwritten Ivy & Oak PO 1187 (times MT), the agent card that
// accounts for all 14 lines, the thread with Erin Walsh and the 14-line draft, listed in PO order.
import { cursor, glyph, nb, ok } from '../shell/html'

const po = [
  ['Summit 28L navy', '5'], ['Ridge flask', '24'], ['Canyon hip pack', '8'], ['alpine beanie', '16'], ['valley crew', '12'], ['trail cap – green', '12'], ['pine hoodie', '6'],
  ['meadow tee', '24'], ['summit t-shirt', '24'], ['ridge pants', '8'], ['canyon short', '12'], ['highland sock', '24'], ['travel towel', '8'], ['field notebook', '36'],
]
const draft = [
  ['Summit 28L Pack · Navy', 'RS-2810-NVY', '4 × $74.00', '$296.00'],
  ['Ridge Flask 20 oz', 'RS-5120', '24 × $11.50', '$276.00'],
  ['Canyon Hip Pack', 'RS-2205', '8 × $26.00', '$208.00'],
  ['Trail Cap · Sage', 'RS-4410-SGE', '12 × $14.00', '$168.00'],
]

export function agentPoSection(): string {
  return '<section class="section agent-po" aria-labelledby="po-title"><div class="wrap">'
    + '<div class="split-head"><div><p class="eyebrow ink">Agent · Ridgeline Supply · Fri Oct 23, times MT</p>'
    + '<h2 id="po-title" class="xl">A photographed PO, <span class="line">a checked order.</span></h2></div>'
    + '<p class="lede ink">Sam emailed a photo of his handwritten PO. The agent read every line, checked prices and stock, and asked one question.</p></div>'
    + '<div class="po-grid" data-wires=".q1 .po-q>.r1 .dot;.q6 .po-q>.r6 .dot"><svg class="wires" aria-hidden="true"></svg>'
    + '<figure class="po-paper"><div class="po-sheet" role="img" aria-label="Sam Lee’s handwritten Ivy &amp; Oak PO 1187: fourteen numbered lines; line 1 asks for 5 Summit 28L navy and line 6 for 12 trail caps in green.">'
    + '<p class="po-title">Ivy &amp; Oak · PO 1187 · Sam Lee</p><ol>'
    + po.map(([name, qty], index) => `<li class="${index === 0 ? 'q1' : index === 5 ? 'q6' : ''}"><span class="po-n">${index + 1}</span><span class="po-line">${name} — <span class="po-q">${qty}</span></span></li>`).join('')
    + '</ol></div><figcaption>arrived in Ridgeline orders inbox 7:12 am</figcaption></figure>'
    + '<div class="po-middle"><div class="card po-agent">'
    + `<p class="po-agent-head">${glyph('mountain', 'card-glyph xl')}<span><b>7:14 am</b> · Read 14 lines · each cited to its region</span></p>`
    + '<ul><li class="ok-row"><span class="dot green"></span><span class="po-badge empty"></span><span>12 mapped from Sam’s own names · ‘ridge flask’ → RS-5120</span></li>'
    + '<li class="ask-row r1"><span class="dot amber"></span><span class="po-badge">1</span><span>Line 1 written 5 · case pack 4 · suggest 4 or 8</span></li>'
    + '<li class="ask-row r6"><span class="dot amber"></span><span class="po-badge">6</span><span>Line 6 ‘trail cap – green’ → Sage or Olive · asked Sam</span></li></ul></div>'
    + '<div class="card po-thread"><p class="po-thread-label">Thread</p><p class="bubble grey"><b>7:20 am</b> · Erin Walsh sent the agent’s question</p><p class="bubble blue"><b>7:41 am</b> · Sam: Sage. Make the packs 4.</p></div></div>'
    + '<div class="card po-draft"><h3 class="serif-title xxl">Draft · 14 lines</h3><table><caption class="visually-hidden">The draft order in PO order</caption><tbody>'
    + draft.map(([name, sku, qty, total]) => `<tr><th scope="row">${name}</th><td class="sku">${sku}</td><td>${qty}</td><td class="num">${total}</td></tr>`).join('')
    + '<tr><th scope="row">+ 10 more lines</th><td></td><td></td><td class="num">$2,338.00</td></tr>'
    + '<tr class="total"><th scope="row">Total</th><td></td><td></td><td class="num">$3,286.00</td></tr></tbody></table>'
    + `<ul class="po-checks"><li>Ivy &amp; Oak price book ${ok}</li><li>stock: NetSuite Boise, 6 min ago ${ok}</li><li>net 30 ${ok}</li><li>Texas resale certificate · tax $0.00 ${ok}</li></ul></div>`
    + '</div>'
    + `<ul class="po-done"><li class="pill pill-green lg">8:05 am · approved by Sam Lee ${ok}</li><li class="pill pill-green lg">8:30 am · accepted by Erin Walsh ${ok}</li>`
    + `<li class="pill pill-green lg">8:31 am · NetSuite ${nb('SO-48812')} acknowledged ${ok}</li><li class="pill pill-outline lg">ships ${nb('Mon Oct 26')}</li><li class="po-sam" aria-hidden="true">${cursor('Sam Lee')}</li></ul>`
    + '</div></section>'
}
