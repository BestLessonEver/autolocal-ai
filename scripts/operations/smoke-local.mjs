import assert from 'node:assert/strict'
import { load } from 'cheerio'

const origin = new URL(process.argv[2] || 'http://127.0.0.1:3100')
if (!['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) throw new Error('This smoke check accepts a local server only')
const checks = [
  ['/', 200, '/'], ['/about', 200, '/about'], ['/blog', 200, '/blog'],
  ['/blog/google-reviews-local-seo', 200, '/blog/google-reviews-local-seo'],
  ['/blog/ai-search-business-website', 200, '/blog/ai-search-business-website'],
  ['/sitemap.xml', 200], ['/robots.txt', 200],
  ['/onboarding', 308], ['/packages', 308], ['/free-website', 308],
  ['/audit/retired-report', 308], ['/building/fixture', 307], ['/unknown-page-smoke-check', 404],
]
for (const [path, status, canonical] of checks) {
  const response = await fetch(new URL(path, origin), { redirect: 'manual', signal: AbortSignal.timeout(20000) })
  assert.equal(response.status, status, path)
  const body = await response.text()
  if (canonical) {
    const document = load(body)
    assert.equal(new URL(document('link[rel="canonical"]').attr('href')).pathname, canonical, `${path} canonical`)
    assert.ok(document('h1').text().trim(), `${path} heading`)
  }
  if (path === '/sitemap.xml') {
    assert.ok(body.includes('/blog/ai-search-business-website'))
    for (const privatePath of ['/dashboard', '/preview/', '/onboarding', '/free-website']) assert.equal(body.includes(privatePath), false, privatePath)
  }
  if (path === '/robots.txt') assert.ok(body.includes('Disallow: /dashboard'))
  console.log(JSON.stringify({ path, status: response.status, passed: true }))
}
