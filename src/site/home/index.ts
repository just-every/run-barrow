import { checkIdentity, type EditionIdentity } from '../../base/identity'
import { checkRunData, type RunData } from '../../base/run-site'
import { hero } from './hero'
import { featureSections } from './sections'
import { includedSection } from './included'
import { actions, escapeHtml, scenery } from './shared'

export function homeHtml(identity: EditionIdentity, data: RunData): string {
  checkIdentity(identity)
  checkRunData(data)
  const mark = escapeHtml(identity.mark)
  const source = escapeHtml(data.repository)
  return '<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>Barrow — wholesale ordering for your stockists</title><meta name="description" content="Each stockist orders at its own prices against live stock. Approve, and the invoice is ready. Free and open source.">'
    + `<link rel="icon" href="${mark}">${identity.fonts ? `<link rel="stylesheet" href="${escapeHtml(identity.fonts)}">` : ''}<link rel="stylesheet" href="${escapeHtml(identity.theme)}"><link rel="stylesheet" href="/landing/home.css"></head>`
    + `<body class="home-page"><a class="home-skip" href="#home-main">Skip to content</a><header class="home-header home-wrap"><a class="home-brand" href="/" aria-label="Barrow home"><img src="${mark}" alt="" width="28" height="32"><span>Barrow</span></a><nav aria-label="Site"><a href="/docs">Docs</a><a href="/contract">Contract</a><a class="home-source" href="${source}">Source</a></nav></header>`
    + `<main id="home-main">${hero()}${featureSections()}${includedSection()}<section class="home-closing" aria-labelledby="home-closing-title">${scenery('both')}<div class="home-closing-copy"><h2 id="home-closing-title">Run it beside your inbox.</h2><p>Invite one stockist and take their next order through Barrow. Keep everything else as it is.</p>${actions()}</div></section></main>`
    + `<footer class="home-footer home-wrap"><a class="home-footer-brand" href="/"><img src="${mark}" alt="" width="25" height="29"><span>Barrow <span class="home-footer-license">· MIT licensed</span></span></a><nav aria-label="Footer"><a href="/docs">Docs</a><a href="${source}">Source</a></nav></footer></body></html>`
}
