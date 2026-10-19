// The run site (run-barrow.com) `rer build --site` writes: the homepage with its Run action, /run, the docs from
// docs/*.md, /contract from CONTRACT.md and the not-found page. Every Run page string and command is in run.json;
// nothing here reads installation data.
import { contractPageHtml } from '../base/contract-page'
import { runPageHtml, siteNotFoundHtml, type RunData, type SiteBuild, type SiteContext } from '../base/run-site'
import { identity } from '../identity'
import run from './run.json'
import { homeHtml } from './home'
import { docsPages } from './docs/pages'
import './styles/site.css'
import './styles/hero.css'
import './styles/sections.css'
import './styles/cards.css'
import './styles/docs.css'
import './styles/run.css'

const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// Base's shared pages (src/base, copied unchanged) print British "licence" and day-month dates;
// Barrow is a US product, so its run site says "license" and "October 17, 2026".
const usEnglish = (html: string) => html
  .replaceAll(`${run.licence} licence<`, `${run.licence} license<`)
  .replace(new RegExp(`>(\\d{1,2}) (${months.join('|')}) (\\d{4})<`, 'g'), '>$2 $1, $3<')

export function sitePages({ styles = [], contract }: SiteContext): SiteBuild {
  const data: RunData = run
  const styled = (html: string, bodyClass: string) => html
    .replace('</head>', `${styles.map(href => `<link rel="stylesheet" href="${href}">`).join('')}</head>`)
    .replace('<body>', `<body class="${bodyClass}">`)
  const base = { ...identity, band: undefined }
  return {
    pages: [
      { path: '/', html: homeHtml(styles) },
      { path: '/run', html: usEnglish(styled(runPageHtml(base, data, contract), 'br-base-page br-run')) },
      ...(contract ? [{ path: '/contract', html: usEnglish(styled(contractPageHtml(base, data, contract), 'br-base-page br-contract')) }] : []),
      ...docsPages(styles),
      { path: '/404', html: usEnglish(styled(siteNotFoundHtml(base, data, contract), 'br-base-page br-missing')) },
    ],
    assets: ['rer-theme.css', 'fonts', 'brand', 'site', 'favicon.ico', 'favicon-32.svg', 'apple-touch-icon.png'],
  }
}
