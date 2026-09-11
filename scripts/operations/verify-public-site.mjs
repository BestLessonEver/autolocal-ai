// Read-only HTTP checks. Does not sign in, submit forms, or invoke workers.
import assert from 'node:assert/strict'
import { load } from 'cheerio'

const args = process.argv.slice(2)
const address = args.shift()
if (!address || args.some(arg => !['--staging', '--allow-local', '--require-launch-services'].includes(arg))) {
  throw new Error('Usage: node scripts/operations/verify-public-site.mjs ORIGIN [--staging] [--allow-local] [--require-launch-services]')
}
let origin
try { origin = new URL(address) } catch { throw new Error('Supply a plain application origin.') }
const local = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash ||
    (local ? !args.includes('--allow-local') || !['http:', 'https:'].includes(origin.protocol) : origin.protocol !== 'https:')) {
  throw new Error('Use an HTTPS origin without credentials, paths or query strings. Local servers additionally require --allow-local.')
}
const staging = args.includes('--staging')
const results = []
async function read(path, status = 200) {
  const response = await fetch(new URL(path, origin), {
    method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(20_000),
    headers: { 'User-Agent': 'AutoLocal-Public-Release-Check/1.0' },
  })
  assert.ok((Array.isArray(status) ? status : [status]).includes(response.status), `${path}: HTTP status`)
  return { response, body: await response.text() }
}
function robotsDirectives(document, response) {
  return [document('meta[name="robots"]').attr('content') || '', response.headers.get('x-robots-tag') || ''].join(',').toLowerCase()
}
async function check(name, operation) {
  try {
    await operation()
    results.push({ check: name, passed: true })
  } catch {
    // Never log response bodies, user data, headers, or credential-bearing URLs.
    results.push({ check: name, passed: false })
  }
  console.log(JSON.stringify(results.at(-1)))
}

for (const path of ['/', '/templates', '/about', '/contact', '/privacy', '/terms', '/blog/ai-search-business-website']) {
  await check(`Public page ${path}`, async () => {
    const { response, body } = await read(path)
    const document = load(body)
    assert.ok(document('h1').text().trim())
    assert.ok(document('title').text().trim())
    assert.equal(new URL(document('link[rel="canonical"]').attr('href')).href, new URL(path, origin).href)
    const directives = robotsDirectives(document, response)
    assert.equal(directives.includes('noindex'), staging)
  })
}
const templateIds = ['summit', 'atelier', 'ledger', 'win95', 'myspace', 'receipt']
for (const path of ['/start', '/demo', '/dashboard', ...templateIds.map(template => `/templates/${template}`)]) {
  await check(`Non-indexed page ${path}`, async () => {
    const { response, body } = await read(path)
    assert.ok(robotsDirectives(load(body), response).includes('noindex'))
  })
}
for (const template of templateIds) {
  await check(`Rendered template demo ${template}`, async () => {
    const { response, body } = await read(`/templates/${template}?embed=1`)
    const document = load(body)
    assert.ok(robotsDirectives(document, response).includes('noindex'))
    assert.equal(document(`.al-site.al-${template}`).length, 1)
    assert.equal(document('h1').length, 1)
    assert.equal(document('form[data-al-inquiry]').attr('data-mode'), 'demo')
    assert.equal(document('a[href^="tel:"],a[href^="mailto:"]').length, 0)
    document('a[href^="#"]').each((_, element) => {
      const target = document(element).attr('href').slice(1)
      assert.ok(document('[id]').toArray().some(node => document(node).attr('id') === target))
    })
  })
}
await check('Sitemap contains only public canonical URLs', async () => {
  const { body } = await read('/sitemap.xml')
  const document = load(body, { xmlMode: true })
  const locations = document('loc').map((_, node) => document(node).text()).get()
  assert.ok(locations.length >= 5)
  for (const location of locations) {
    const url = new URL(location)
    assert.equal(url.origin, origin.origin)
    assert.ok(['/','/about','/templates','/contact','/blog'].includes(url.pathname) || /^\/blog\/[^/]+$/.test(url.pathname))
  }
  for (const path of ['/', '/templates', '/contact']) assert.ok(locations.includes(new URL(path, origin).href))
})
await check('Robots matches the intended environment', async () => {
  const { body } = await read('/robots.txt')
  if (staging) assert.match(body, /^Disallow: \/\s*$/m)
  else {
    assert.doesNotMatch(body, /^Disallow: \/\s*$/m)
    for (const path of ['/api/', '/dashboard', '/preview/', '/templates/']) assert.ok(body.includes(`Disallow: ${path}`))
    assert.ok(body.includes(`Sitemap: ${new URL('/sitemap.xml', origin).href}`))
  }
})
for (const path of ['/api/leads', '/api/dashboard/my-sites', '/api/admin/integrations']) {
  // A deliberately disabled internal key yields 503 in isolated staging.
  const status = staging && path === '/api/admin/integrations' ? [401, 503] : 401
  await check(`Anonymous access denied ${path}`, async () => { await read(path, status) })
}
await check('Missing page returns 404', async () => { await read('/autolocal-release-check-not-a-page', 404) })
await check('Application availability', async () => {
  const { body } = await read('/api/system/health')
  const health = JSON.parse(body)
  assert.equal(health.verification, 'configuration_only')
  assert.equal(health.services?.accounts, true)
  if (args.includes('--require-launch-services')) {
    for (const capability of ['businessSearch', 'billing', 'publishing', 'notifications']) assert.equal(health.services[capability], true)
  }
})
const passed = results.every(result => result.passed)
console.log(JSON.stringify({ verification: 'public_http_surfaces_only', staging, checks: results.length, passed,
  limitation: 'Does not prove authenticated ownership, provider approval, payment, exact-revision publication, notification delivery, scheduler execution, search indexing, or lead growth.' }))
if (!passed) process.exitCode = 1
