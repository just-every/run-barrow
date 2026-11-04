import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { documentation, renderDocumentation } from '../scripts/agent-docs.mjs'
import { documentedRegistry } from './agent-door/prompt-fixture.mjs'
import { chromium } from '@playwright/test'

const output = resolve('dist/site')
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }

// Serve the real static build with the extensionless paths used by its host.
async function siteServer() {
  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    const file = resolve(output, `.${pathname}`)
    if (file !== output && !file.startsWith(output + sep)) { response.writeHead(404).end(); return }
    const candidates = pathname.endsWith('/') ? [resolve(file, 'index.html')] : extname(file) ? [file] : [`${file}.html`, resolve(file, 'index.html')]
    for (const candidate of candidates) {
      try {
        const content = await readFile(candidate)
        response.writeHead(200, { 'content-type': types[extname(candidate)] ?? 'application/octet-stream' }).end(content)
        return
      } catch (error) {
        if (!['ENOENT', 'EISDIR', 'ENOTDIR'].includes(error.code)) { response.writeHead(500).end(); return }
      }
    }
    response.writeHead(404, { 'content-type': 'text/html' }).end(await readFile(resolve(output, '404.html')))
  })
  await new Promise((done, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', done) })
  return { server, origin: `http://127.0.0.1:${server.address().port}` }
}

test('built run site serves its guides, Markdown navigation and local assets', async () => {
  const { server, origin } = await siteServer()
  try {
    const queued = ['/', '/run', '/docs', '/docs/agents', '/404']
    const registry = await documentedRegistry()
    assert.equal(await readFile('docs/AGENTS.md', 'utf8'), renderDocumentation(await documentation()), 'Agent docs generator must reject stale runtime documentation')
    const visited = new Set()
    let articleLinked = false
    while (queued.length) {
      const path = queued.shift()
      if (visited.has(path)) continue
      visited.add(path)
      const response = await fetch(origin + path)
      assert.equal(response.status, 200, `Public site resource failed: ${path}`)
      const type = response.headers.get('content-type') ?? ''
      if (!type.includes('html') && !type.includes('css')) { await response.arrayBuffer(); continue }
      const content = await response.text()
      if (path === '/docs') {
        assert.match(content, /<main\b[^>]*>[\s\S]*<h1\b/, 'Docs must render Markdown as an article')
      }
      if (path === '/docs/agents') {
        const encoded = content.match(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/)?.[1]
        assert.ok(encoded, 'Agent guide must render the exact public registry schemas')
        const decoded = encoded.replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&')
        assert.deepEqual(JSON.parse(decoded), registry, 'Built page must carry the same registry as the checked MCP documentation')
        assert.ok(content.includes('aria-current="page"'), 'The current agent guide must be reachable through guide navigation')
      }
      const references = type.includes('html')
        ? [...content.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)].map(match => match[1])
        : [...content.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)].map(match => match[1])
      for (const reference of references) {
        const url = new URL(reference.replaceAll('&amp;', '&'), origin + path)
        if (url.origin !== origin) continue
        assert.ok(!/^\/(?:app|signin|login|sign-in|setup|auth)(?:\/|$)/.test(url.pathname), `Instance-only link in public site: ${url.pathname}`)
        if (url.pathname.startsWith('/docs/')) articleLinked = true
        queued.push(url.pathname + url.search)
      }
    }
    assert.ok(articleLinked, 'Docs index must link to a rendered guide')
    const missing = await fetch(origin + '/no-such-guide')
    assert.equal(missing.status, 404)
    assert.match(missing.headers.get('content-type'), /text\/html/)
    assert.equal(await missing.text(), await readFile(resolve(output, '404.html'), 'utf8'))
    const browser = await chromium.launch({ headless: true,
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
      args: ['--no-sandbox'] })
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
      await page.goto(origin + '/docs')
      await page.getByRole('link', { name: 'Company agent jobs', exact: true }).first().click()
      assert.equal(new URL(page.url()).pathname, '/docs/agents', 'A reader can reach the jobs from the guide navigation')
      assert.equal(await page.getByRole('heading', { name: 'Company agent jobs', exact: true }).count(), 1)
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'The agent guide fits the viewport')
      await page.getByText('Open the exact registry JSON', { exact: true }).click()
      assert.deepEqual(JSON.parse(await page.locator('.docs-code pre code').textContent()), registry, 'A reader can open the exact tool schemas')
      await page.getByText('Open the exact registry JSON', { exact: true }).click()
      const evidence = process.env.BARROW_AGENT_EVIDENCE
      if (evidence) {
        await mkdir(evidence, { recursive: true })
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: 1000 })
          await page.screenshot({ path: resolve(evidence, `agents-guide-${width}.png`), fullPage: true })
        }
      }
      console.log('PROBE BASE-AGENT-013 page: built guide navigation -> registry-derived discovery, jobs and expandable schemas at 1440; optional captures at 1440 and 390')
    } finally { await browser.close() }
  } finally {
    server.closeAllConnections()
    await new Promise((done, fail) => server.close(error => error ? fail(error) : done()))
  }
})
