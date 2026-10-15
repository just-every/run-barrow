import { Marked } from 'marked'

export interface Guide {
  source: string
  path: string
  title: string
  markdown: string
}

const sources = import.meta.glob<string>('../../../docs/*.md', { query: '?raw', import: 'default', eager: true })
const order = ['README.md', 'GETTING-STARTED.md', 'ACCOUNTS.md', 'ORDERS.md', 'IMPORT-ACCOUNTS.md', 'BACKUP-RESTORE.md', 'AGENTS-API.md', 'MOVE-IN.md', 'SOURCES.md']

export const guides: Guide[] = Object.entries(sources).map(([file, markdown]) => {
  const source = file.split('/').at(-1)!
  const heading = markdown.match(/^# (.+)$/m)?.[1]
  if (!heading) throw new Error(`Documentation ${source} needs a top-level title.`)
  return { source, markdown, title: heading, path: source === 'README.md' ? '/docs' : `/docs/${source.replace(/\.md$/, '').toLowerCase()}` }
}).sort((a, b) => {
  const position = (source: string) => order.includes(source) ? order.indexOf(source) : order.length
  return position(a.source) - position(b.source) || a.source.localeCompare(b.source)
})

/** Resolve repo-relative Markdown links without copying docs into the site. */
function siteLink(href: string, guide: Guide, repository: string, runSite: string): string {
  if (href.startsWith(`${runSite}/`)) return href.slice(runSite.length)
  if (/^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(href)) return href
  const url = new URL(href, `https://repository.invalid/docs/${guide.source}`)
  const source = decodeURIComponent(url.pathname.replace(/^\/docs\//, ''))
  const destination = guides.find(item => item.source === source)
  if (destination) return `${destination.path}${url.search}${url.hash}`
  return `${repository}/blob/main${url.pathname}${url.search}${url.hash}`
}

export function guideHtml(guide: Guide, repository: string, runSite: string): string {
  const markdown = new Marked({ gfm: true, breaks: false, async: false })
  markdown.use({
    walkTokens(token) {
      if (token.type === 'link') token.href = siteLink(token.href, guide, repository, runSite)
    },
  })
  return markdown.parse(guide.markdown, { async: false })
}
