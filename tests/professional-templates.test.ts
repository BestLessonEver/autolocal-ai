import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { load } from 'cheerio'
import { generateStaticHtml, generateStaticSiteFiles } from '../src/lib/static-templates'
import { renderProfessionalSite, resolveSiteUrl, siteStructuredData } from '../src/components/templates/professional-renderer'
import { inquiryRuntimeScript } from '../src/components/templates/inquiry-runtime'
import { publicSiteData } from '../src/components/templates/public-site-data'
import { TEMPLATE_DEMOS } from '../src/components/templates/demo-data'

const record = { ...TEMPLATE_DEMOS.summit, demo: false, slug: 'real-test-business', business_name: 'Example & Sons', tagline: 'Help for your home.', description: 'Repairs and maintenance in the local area.', hosting_status: 'active', deploy_status: 'live', phone: '(713) 555-0199', email: 'private-owner@example.test', contact_email: 'public@example.test', website_current: 'https://old-provider.example.test', custom_domain: null, domain_status: null, city: 'Houston', state: 'TX', address: '123 Example Street', faq: [], hero_image_url: null, image_caption: null }

test('three families use identical preview/export content and working anchor destinations', () => {
  for (const family of ['summit', 'atelier', 'ledger']) {
    const html = generateStaticHtml(record, family, { apiBaseUrl: 'https://app.example.test' })
    const $ = load(html)
    const preview = load(renderProfessionalSite(record, family, { mode: 'live', apiBaseUrl: 'https://app.example.test' }))
    assert.equal($('.al-site').html(), preview('.al-site').html())
    assert.equal($('h1').length, 1)
    assert.equal($(`.al-${family}`).length, 1)
    assert.equal($('form[data-al-inquiry]').attr('data-endpoint'), 'https://app.example.test/api/leads/submit')
    assert.equal($('form').attr('data-mode'), 'live')
    assert.equal($('a[href="tel:+7135550199"]').length, 0)
    assert.ok($('a[href="tel:7135550199"]').length)
    assert.ok($('a[href="mailto:public@example.test"]').length)
    assert.ok(!html.includes(record.email))
    assert.equal($('script[src*="tailwind"]').length, 0)
    $('a[href^="#"]').each((_, element) => {
      const id = $(element).attr('href')!.slice(1)
      assert.ok($(`[id="${id}"]`).length, `Missing ${id} in ${family}`)
    })
  }
})

test('exported search files use the actual intended site and truthful service entities', () => {
  const files = generateStaticSiteFiles(record, 'summit', { siteUrl: 'https://client.example.test' })
  assert.deepEqual(files.map(file => file.file), ['index.html', 'robots.txt', 'sitemap.xml'])
  const $ = load(files[0].data)
  assert.equal($('link[rel=canonical]').attr('href'), 'https://client.example.test')
  assert.equal($('meta[name=autolocal-site]').attr('content'), record.slug)
  assert.equal($('meta[name=robots]').attr('content'), 'index,follow')
  assert.match(files[1].data, /Sitemap: https:\/\/client.example.test\/sitemap.xml/)
  assert.match(files[2].data, /<loc>https:\/\/client.example.test\/<\/loc>/)
  const graph = JSON.parse($('script[type="application/ld+json"]').html()!)['@graph']
  assert.equal(graph[0]['@type'], 'LocalBusiness')
  assert.equal(graph.filter((item: { '@type': string }) => item['@type'] === 'Service').length, record.services.length)
  assert.ok(!files[0].data.includes('old-provider.example.test'))
  assert.equal(resolveSiteUrl({ ...record, custom_domain: 'pending.example.test', domain_status: 'verifying' }), 'https://real-test-business.autolocal.ai')
  assert.equal(resolveSiteUrl({ ...record, custom_domain: 'ready.example.test', domain_status: 'active' }), 'https://ready.example.test')
})

test('unconfirmed reviews, hidden addresses, owner credentials and invented facts stay absent', () => {
  const source = { ...record, id: 'private-id', owner_id: 'private-owner', stripe_customer_id: 'cus_secret', discord_webhook_url: 'secret', access_token: 'secret', show_address: false, reviews_verified: false, reviews: [{ author: 'Invented Person', text: 'Fabricated praise', rating: 5, date: '' }], google_rating: 5, google_review_count: 999 }
  const publicData = publicSiteData(source)
  const html = generateStaticHtml(publicData, 'ledger')
  for (const secret of ['private-id', 'private-owner', 'cus_secret', 'Fabricated praise', 'Invented Person', '999', record.address, record.email]) assert.ok(!html.includes(secret), `Leaked ${secret}`)
  assert.equal(publicData.address, null)
  assert.ok(!JSON.stringify(publicData).includes('secret'))
  assert.ok(!JSON.stringify(siteStructuredData(publicData, 'https://example.test')).includes(record.address))
  assert.ok(!html.includes('licensed'))
  assert.ok(!html.includes('five-star'))
})

test('untrusted text cannot break HTML, scripts, or image URLs', () => {
  const attack = '</script><script>alert(1)</script><img src=x onerror=alert(2)>'
  const html = generateStaticHtml({ ...record, business_name: attack, description: attack, contact_email: '" onmouseover="alert(1)', hero_image_url: 'javascript:alert(1)', logo_url: 'https://example.test/image?key=secret', brand_color_primary: 'red; background:url(javascript:alert(1))' }, 'atelier')
  const $ = load(html)
  assert.equal($('[onerror],[onmouseover]').length, 0)
  assert.equal($('img[src^="javascript:"]').length, 0)
  assert.ok(!html.includes('key=secret'))
  assert.equal($('script').length, 2)
  assert.equal(JSON.parse($('script[type="application/ld+json"]').html()!)['@graph'][0].name, attack)
})

test('demo output cannot be indexed and has no real contact links', () => {
  for (const family of ['summit', 'atelier', 'ledger'] as const) {
    const files = generateStaticSiteFiles(TEMPLATE_DEMOS[family], family)
    const $ = load(files[0].data)
    assert.equal($('form').attr('data-mode'), 'demo')
    assert.equal($('meta[name=robots]').attr('content'), 'noindex,nofollow')
    assert.equal($('a[href^="tel:"],a[href^="mailto:"]').length, 0)
    assert.match(files[1].data, /Disallow: \//)
    assert.ok(!files[2].data.includes('<url>'))
  }
})

function formHarness(mode: string, result: Record<string, unknown>, ok = true) {
  const calls: { url: string; body: Record<string, string> }[] = []
  const listeners: Record<string, (event: { preventDefault(): void; target: unknown }) => Promise<void>> = {}
  const status = { textContent: '', focus() {} }
  const button = { disabled: false, textContent: 'Send inquiry' }
  const serviceChoice = { value: '' }
  const fields = { name: 'Local Test', email: 'contact@example.test', phone: '', message: 'A test inquiry', service: 'Repairs', website: '' }
  class FakeForm {}
  class FakeElement {
    dataset = { inquiryService: 'Home repairs' }
    closest(selector: string): FakeElement | { querySelector(): typeof serviceChoice } { return selector === '.al-site' ? { querySelector: () => serviceChoice } : this }
  }
  const form = Object.assign(new FakeForm(), { dataset: { mode, slug: record.slug, endpoint: 'https://app.example.test/api/leads/submit' } as Record<string, string>, resetCount: 0,
    querySelector(selector: string) { return selector === '[data-form-status]' ? status : selector === 'button[type="submit"]' ? button : { focus() {} } },
    matches() { return true }, reportValidity() { return true }, reset() { this.resetCount++ },
    addEventListener(name: string, callback: typeof listeners[string]) { listeners[name] = callback }, removeEventListener() {},
  })
  const document = { addEventListener(name: string, callback: typeof listeners[string]) { listeners[name] = callback }, referrer: 'https://referrer.example.test/private/path?ignored=value' }
  vm.runInNewContext(inquiryRuntimeScript(), {
    document, URL, URLSearchParams, AbortController, Error, HTMLFormElement: FakeForm, Element: FakeElement,
    FormData: class { get(key: string) { return fields[key as keyof typeof fields] } },
    window: { setTimeout, clearTimeout, location: { origin: 'https://client.example.test', pathname: '/', search: '?utm_source=google&utm_medium=organic&utm_campaign=profile&private=ignored' }, crypto: { randomUUID: () => '7d9ecf81-bfe8-4b93-92ea-71bd32d1dfd8' } },
    fetch: async (url: string, options: { body: string }) => { calls.push({ url, body: JSON.parse(options.body) }); return { ok, json: async () => result } },
  })
  return { form, status, button, calls, serviceChoice, chooseService: () => listeners.click({ preventDefault() {}, target: new FakeElement() }), submit: () => listeners.submit({ preventDefault() {}, target: form }) }
}

test('exported inquiry runtime actually executes and only confirms a durable lead', async () => {
  const success = formHarness('live', { success: true, lead_id: 'lead-123' })
  await success.submit()
  assert.equal(success.calls.length, 1)
  assert.equal(success.calls[0].body.slug, record.slug)
  assert.equal(success.calls[0].body.utm_source, 'google')
  assert.equal(success.calls[0].body.landing_page, 'https://client.example.test/')
  assert.equal(success.calls[0].body.referrer, 'https://referrer.example.test')
  assert.ok(!JSON.stringify(success.calls).includes('private=ignored'))
  assert.equal(success.form.resetCount, 1)
  assert.match(success.status.textContent, /not a confirmed appointment/)
  const failure = formHarness('live', { success: true })
  await failure.submit()
  assert.equal(failure.form.resetCount, 0)
  assert.match(failure.status.textContent, /could not be saved/)
  assert.ok(failure.form.dataset.submissionId)
  assert.equal(failure.button.disabled, false)
})

test('demo and private preview runtime never submit to the network', async () => {
  for (const mode of ['demo', 'preview']) {
    const form = formHarness(mode, {})
    await form.submit()
    assert.equal(form.calls.length, 0)
    assert.equal(form.form.resetCount, 0)
    assert.match(form.status.textContent, mode === 'demo' ? /No inquiry has been sent/ : /private preview/)
  }
})

test('service inquiry links carry the chosen service into the shared form', async () => {
  const html = load(generateStaticHtml(record, 'summit'))
  assert.equal(html('a[data-inquiry-service]').first().attr('data-inquiry-service'), record.services[0].name)
  const example = formHarness('demo', {})
  await example.chooseService()
  assert.equal(example.serviceChoice.value, 'Home repairs')
  assert.equal(example.calls.length, 0)
})
