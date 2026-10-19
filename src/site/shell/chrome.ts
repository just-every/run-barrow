// The run site's document head, header, footer and the page's one action, shared by the homepage and /docs.
import run from '../run.json'
import { bindText } from './bind'
import { escapeHtml, glyphDefs, icon } from './html'

export const links = { home: '/', run: '/run', docs: '/docs', contract: '/contract', source: run.repository, license: `${run.repository}/blob/main/LICENSE` }

/** Where "Try the demo" goes: the hosted demo this repo publishes (deploy-demo.json). */
export const demoHref = 'https://demo.run-barrow.com/'

const SHARE_IMAGE = 'https://run-barrow.com/site/share.jpg'

export interface PageHead { title: string; description: string; styles: string[]; preload?: string[] }

export function documentHtml(head: PageHead, body: string, bodyClass: string, script = ''): string {
  const preload = ['/fonts/source-serif-4/source-serif-4-latin-standard-normal.woff2', '/fonts/inter/inter-latin-wght-normal.woff2']
  return '<!doctype html><html lang="en-US"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + `<title>${escapeHtml(head.title)}</title><meta name="description" content="${escapeHtml(head.description)}"><meta name="theme-color" content="#ffffff">`
    + `<meta property="og:type" content="website"><meta property="og:site_name" content="Barrow"><meta property="og:title" content="${escapeHtml(head.title)}"><meta property="og:description" content="${escapeHtml(head.description)}">`
    + `<meta property="og:image" content="${SHARE_IMAGE}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image">`
    + '<link rel="icon" href="/favicon.ico" sizes="32x32"><link rel="icon" type="image/svg+xml" href="/favicon-32.svg"><link rel="apple-touch-icon" href="/apple-touch-icon.png">'
    + [...preload, ...(head.preload ?? [])].map(href => `<link rel="preload" href="${href}" as="${href.endsWith('.woff2') ? 'font' : 'image'}"${href.endsWith('.woff2') ? ' type="font/woff2" crossorigin' : ''}>`).join('')
    + '<link rel="stylesheet" href="/rer-theme.css">' + head.styles.map(href => `<link rel="stylesheet" href="${escapeHtml(href)}">`).join('')
    + `</head><body class="${bodyClass}"><a class="skip-link" href="#main">Skip to content</a>${glyphDefs}${bindText(body)}${script ? `<script>${script}</script>` : ''}</body></html>`
}

export const lockup = (className = 'site-brand'): string => `<a class="${className}" href="${links.home}" aria-label="Barrow home"><img src="/brand/mark.svg" alt="" width="40" height="40"><span>Barrow</span></a>`

export function siteHeader(current?: 'docs'): string {
  return `<header class="site-header"><div class="site-header-row">${lockup()}<nav aria-label="Site">`
    + `<a href="${links.docs}"${current === 'docs' ? ' aria-current="page"' : ''}>Docs</a><a href="${links.contract}">Contract</a><a href="${escapeHtml(links.source)}">Source</a></nav></div></header>`
}

/** Run Barrow (the one ultramarine button), then the demo and the docs as text links. */
export function actions(demo = true): string {
  return `<div class="site-actions"><a class="site-button" href="${links.run}">Run Barrow ${icon('arrow', 'button-arrow')}</a>`
    + `${demo ? `<a class="site-link" href="${demoHref}">Try the demo</a>` : ''}<a class="site-link" href="${links.docs}">Read the docs</a></div>`
}

export function siteFooter(): string {
  return `<footer class="site-footer"><div class="site-footer-row"><div class="site-footer-brand">${lockup()}<span class="site-footer-tag">Free, open source wholesale ordering</span></div>`
    + `<nav aria-label="Footer"><a href="${links.docs}">Docs</a><a href="${links.contract}">Contract</a><a href="${escapeHtml(links.source)}">Source</a><a href="${escapeHtml(links.license)}">MIT licensed</a></nav></div></footer>`
}
