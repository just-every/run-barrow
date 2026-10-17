import type { EditionIdentity } from '../../base/identity'
import type { RunData, SiteBuild } from '../../base/run-site'
import { guideHtml, guides } from './content'

const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!))

export function docsPages(identity: EditionIdentity, run: RunData): SiteBuild['pages'] {
  return guides.map(guide => {
    const nav = guides.map(item => `<a href="${item.path}"${item.path === guide.path ? ' aria-current="page"' : ''}>${escape(item.title)}</a>`).join('')
    return {
      path: guide.path,
      html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(guide.title)} · ${escape(identity.product)}</title><meta name="description" content="Practical guides for running ${escape(identity.product)}, managing trade accounts and taking wholesale orders."><link rel="icon" href="${escape(identity.mark)}">${identity.fonts ? `<link rel="stylesheet" href="${escape(identity.fonts)}">` : ''}<link rel="stylesheet" href="${escape(identity.theme)}"></head>`
        + `<body class="br-docs"><a class="br-docs-skip" href="#guide">Skip to guide</a><header class="br-docs-header"><a class="br-docs-brand" href="/"><img src="${escape(identity.mark)}" width="32" height="32" alt=""><span>${escape(identity.product)}</span></a><nav aria-label="Site"><a href="/docs" aria-current="page">Docs</a><a href="/contract">Contract</a><a href="${escape(run.repository)}">Source</a><a class="br-docs-run" href="/run">Run ${escape(identity.product)} →</a></nav></header>`
        + `<div class="br-docs-awning" aria-hidden="true"></div><div class="br-docs-layout"><aside><nav class="br-docs-nav" aria-label="Guides"><p>Barrow guides</p>${nav}</nav></aside><main id="guide" class="br-docs-article" tabindex="-1">${guideHtml(guide, run.repository, identity.runSite)}<footer class="br-docs-article-footer"><a href="${escape(run.repository)}/blob/main/docs/${encodeURIComponent(guide.source)}">Read this guide on GitHub</a></footer></main></div><footer class="br-docs-footer"><span>${escape(identity.product)} · MIT licensed</span><a href="/run">Run ${escape(identity.product)} →</a></footer></body></html>`,
    }
  })
}
