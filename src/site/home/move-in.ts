// 12 · Off NuORDER, line sheets and all: the copy and the one-line start beside the import preview.
// The terminal shows only the start command and a plain-words comment: no rer output, no local addresses.
import run from '../run.json'
import { escapeHtml, glyph, icon, ok } from '../shell/html'

const rows: [string, string][] = [
  ['Styles', `186 · variants 1,914 with UPCs ${ok}`],
  ['Images', `2,246 · 2,240 matched by <span class="mono-inline">style_color_position</span> ${ok} · 6 held until their styles arrive`],
  ['Companies', `142 · ship-tos 231 ${ok}`],
  ['Buyers', '188 → 188 reviewed invitations (logins never move)'],
  ['Price lists', `3 → Boutique, Volume and Department ${ok}`],
  ['Reps', `4 with territories ${ok}`],
  ['Open orders', `37 carried, sent on again 0 times ${ok}`],
  ['Line sheet', `Spring ’27 rebuilt from the assortment → rev 1 ${ok}`],
]

/** The start command with a break opportunity before the repository name, and never inside a token. */
const command = (line: string) => escapeHtml(line).split(' ').map(word => `<span class="nb">${word}</span>`).join(' ')

export function moveInSection(): string {
  return '<section class="section move-in" aria-labelledby="move-title"><div class="wrap move-grid">'
    + '<div class="move-copy"><p class="eyebrow">Moving in · Juniper &amp; Vale · Sat Sep 26 – Thu Oct 1</p>'
    + '<h2 id="move-title" class="xl">Off NuORDER, <span class="line">line sheets and all.</span></h2>'
    + '<p class="lede">Hannah previewed everything that would move, invited every buyer, and took orders in Barrow a week before the line sheet went out.</p>'
    + `<div class="terminal"><span class="terminal-dots" aria-hidden="true"><i></i><i></i><i></i></span><pre aria-label="Start Barrow"><code><span class="prompt" aria-hidden="true">$ </span>${command(run.clone)}\n<span class="comment"># clones, installs and starts Barrow on your computer</span></code></pre>`
    + `<button class="copy" type="button" data-copy="${escapeHtml(run.clone)}" hidden>${icon('copy', 'icon')}<span>Copy</span></button></div>`
    + '<p class="move-also">Also moves in from Pepperi, Brandboom, SparkLayer and WizCommerce.</p></div>'
    + `<article class="card import"><div class="card-head">${glyph('leaf', 'card-glyph xxl')}<div><h3 class="serif-title xl">Import preview · from NuORDER</h3><p class="muted">reviewed Sat Sep 26 by Hannah Pierce</p></div></div>`
    + `<dl>${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`
    + '<p class="import-foot">Cutover Thu Oct 1, 12:00 am · first Barrow order JV-10001</p></article>'
    + '</div></section>'
}
