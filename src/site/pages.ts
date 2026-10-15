// Build-time public content only; installation data never enters the run site.
import { runPageHtml, siteNotFoundHtml, type RunData, type SiteBuild, type SiteContext } from '../base/run-site'
import { identity } from '../identity'
import run from './run.json'
import { homeHtml } from './home'
import { docsPages } from './docs/pages'
import './docs/docs.css'

export function sitePages({ styles = [] }: SiteContext): SiteBuild {
  const data: RunData = run
  const styled = (html: string) => html.replace('</head>', `${styles.map(href => `<link rel="stylesheet" href="${href}">`).join('')}</head>`)
  return {
    pages: [
      { path: '/', html: styled(homeHtml(identity, data)) },
      { path: '/run', html: styled(runPageHtml({ ...identity, band: undefined }, data).replace('<body>', '<body class="br-run-site">')) },
      ...docsPages(identity, data).map(page => ({ ...page, html: styled(page.html) })),
      { path: '/404', html: styled(siteNotFoundHtml(identity, data)) },
    ],
    assets: ['rer-theme.css', 'fonts', 'brand', 'landing'],
  }
}
