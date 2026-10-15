import { drawnButton, scenery } from './shared'

function section(kind: string, heading: string, copy: string, drawing: string, reverse = false, awning = true): string {
  return `<section class="home-feature home-feature-${kind}${reverse ? ' home-feature-reverse' : ''}" aria-labelledby="home-${kind}"><div class="home-feature-copy"><h2 id="home-${kind}">${heading}</h2><p>${copy}</p></div><figure class="home-feature-art">${scenery(reverse ? 'left' : 'right', awning)}<div class="home-feature-cards">${drawing}</div></figure></section>`
}

function account(name: string, terms: string, minimum: string): string {
  return `<div class="home-card home-account"><h3>${name}</h3><dl><div><dt>Payment terms</dt><dd>${terms}</dd></div><div><dt>Minimum order</dt><dd>${minimum}</dd></div></dl></div>`
}

export function featureSections(): string {
  return section('prices', 'Every stockist, their own price list.', 'Agreed prices, minimums and payment terms for each customer. They sign in and see only theirs.', account('Juniper Café', '30 days', '$150.00') + account('Hill Pantry', 'Due on receipt', '$100.00'))
    + section('stock', 'Stock you can promise.', 'The catalogue shows live stock from Pier beside each price. Approve an order and Pier reserves every line.', '<div class="home-card home-stock"><p class="home-connected"><span aria-hidden="true"></span>Pier connected</p><table><thead><tr><th>Product</th><th>Available</th><th>Price</th></tr></thead><tbody><tr><td>House blend 1 kg</td><td>240</td><td>$24.00</td></tr></tbody></table></div>', true)
    + section('free', '100% free.', 'Free as in code, free as in cost. MIT licensed, on your own computer or your own account.', '<div class="home-card home-license"><h3>MIT License</h3><div class="home-license-lines" aria-hidden="true"><span></span><span></span><span></span></div></div>')
    + section('invoice', 'An invoice on their terms.', 'Every reserved order exports a CSV with the agreed prices, the due date and a stable invoice number, ready for your accounting system.', `<div class="home-card home-invoice"><h3>Invoice CSV</h3><div class="home-csv-columns"><code>invoice_number</code><code>due_date</code><code>line_cents</code></div>${drawnButton('Download invoice CSV')}</div>`, true)
    + section('move', 'Move your accounts in.', 'Upload your trade-account spreadsheet, review a dry run, then apply. Undo it if you need to.', `<div class="home-card home-import"><h3>1. Add your CSV</h3>${drawnButton('Run dry run')}</div><span class="home-import-arrow" aria-hidden="true">→</span><div class="home-card home-import"><h3>2. Review &amp; apply</h3>${drawnButton('Apply reviewed import')}</div>`)
}
