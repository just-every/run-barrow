import type { SiteBuild } from '../../base/run-site'
import { identity } from '../../identity'
import run from '../run.json'
import { actions, documentHtml, siteFooter, siteHeader } from '../shell/chrome'
import { escapeHtml } from '../shell/html'
import { guideHtml, guides } from './content'

const COPY = "document.querySelectorAll('.docs-copy').forEach(b=>{b.hidden=false;b.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(b.closest('.docs-code').querySelector('code').textContent);b.textContent='Copied';setTimeout(()=>{b.textContent='Copy'},1600)}catch{}})})"
const LEAD = 'Run Barrow on your own computer, give each stockist its agreed prices, and take its orders through to an invoice.'

// The mark's five colors, set as a small swatch row under every guide title.
const swatch = '<span class="docs-swatch" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>'

export function docsPages(styles: string[]): SiteBuild['pages'] {
  const sections = [...new Set(guides.map(guide => guide.section))]
  return guides.map((guide, index) => {
    const nav = sections.map(section => `<p>${section}</p><ul>${guides.filter(item => item.section === section).map(item => `<li><a href="${item.path}"${item.path === guide.path ? ' aria-current="page"' : ''}>${escapeHtml(item.title)}</a></li>`).join('')}</ul>`).join('')
    const article = guideHtml(guide, run.repository, identity.runSite).replace(/<h1>([\s\S]*?)<\/h1>/, (_, title) => `<h1>${title}</h1>${swatch}`)
    const previous = guides[index - 1], next = guides[index + 1]
    const pager = `<nav class="docs-pager" aria-label="Guides in order">${previous ? `<a class="prev" href="${previous.path}"><span>Previous</span>${escapeHtml(previous.title)}</a>` : '<span></span>'}${next ? `<a class="next" href="${next.path}"><span>Next</span>${escapeHtml(next.title)}</a>` : ''}</nav>`
    const body = `${siteHeader('docs')}<div class="docs-layout"><aside class="docs-side"><nav class="docs-nav" aria-label="Guides">${nav}</nav></aside>`
      + `<main id="main" class="docs-article" tabindex="-1"><p class="eyebrow">Barrow docs · ${escapeHtml(guide.section)}</p>${article}`
      + `<p class="docs-source"><a href="${escapeHtml(run.repository)}/blob/main/docs/${encodeURIComponent(guide.source)}">Read this guide on GitHub</a></p>${pager}</main></div>`
      + `<section class="docs-run"><div><h2>Run Barrow on your computer.</h2><p>100% free and open source. MIT licensed.</p></div>${actions(false)}</section>${siteFooter()}`
    return {
      path: guide.path,
      html: documentHtml({ title: guide.path === '/docs' ? 'Docs · Barrow' : `${guide.title} · Barrow docs`, description: LEAD, styles }, body, 'docs-page', COPY),
    }
  })
}
