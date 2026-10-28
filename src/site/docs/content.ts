import { Marked } from 'marked'

export interface Guide {
  source: string
  path: string
  title: string
  section: string
  markdown: string
}

const sources = import.meta.glob<string>('../../../docs/*.md', { query: '?raw', import: 'default', eager: true })

// The owner guides the run site publishes, in reading order, under their sidebar sections. Other Markdown in docs/
// (source lineage) stays in the repository and is linked there.
const published: [string, string][] = [
  ['README.md', 'Start'], ['GETTING-STARTED.md', 'Start'],
  ['ACCOUNTS.md', 'Everyday work'], ['ORDERS.md', 'Everyday work'], ['AGENTS-API.md', 'Everyday work'],
  ['IMPORT-ACCOUNTS.md', 'Your records'], ['MOVE-IN.md', 'Your records'], ['BACKUP-RESTORE.md', 'Your records'],
  ['COMMERCIAL-REFERENCE.md', 'Contract'],
]

export const guides: Guide[] = published.map(([source, section]) => {
  const markdown = sources[`../../../docs/${source}`]
  if (!markdown) throw new Error(`Documentation ${source} is missing.`)
  const heading = markdown.match(/^# (.+)$/m)?.[1]
  if (!heading) throw new Error(`Documentation ${source} needs a top-level title.`)
  return { source, section, markdown, title: heading, path: source === 'README.md' ? '/docs' : `/docs/${source.replace(/\.md$/, '').toLowerCase()}` }
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

const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!))

export function guideHtml(guide: Guide, repository: string, runSite: string): string {
  const markdown = new Marked({ gfm: true, breaks: false, async: false })
  markdown.use({
    walkTokens(token) {
      if (token.type === 'link') token.href = siteLink(token.href, guide, repository, runSite)
    },
    renderer: {
      // Inline commands and paths wrap only at their spaces, never inside a token.
      codespan({ text }) {
        return `<code>${text.split(' ').map(word => `<span class="nb">${escape(word)}</span>`).join(' ')}</code>`
      },
      // Commands and files sit in code cards with a Copy button (shown once script runs).
      code({ text, lang }) {
        return `<div class="docs-code"><pre${lang ? ` data-lang="${escape(lang)}"` : ''}><code>${escape(text)}</code></pre><button class="docs-copy" type="button" hidden>Copy</button></div>`
      },
      // Tables scroll inside their own box on narrow screens, never the page.
      table(token) {
        const cells = (row: { tokens: never[] }[], tag: string) => row.map(cell => `<${tag}>${this.parser.parseInline(cell.tokens)}</${tag}>`).join('')
        return `<div class="docs-table"><table><thead><tr>${cells(token.header as never, 'th')}</tr></thead><tbody>${token.rows.map(row => `<tr>${cells(row as never, 'td')}</tr>`).join('')}</tbody></table></div>`
      },
    },
  })
  return markdown.parse(guide.markdown, { async: false })
}
