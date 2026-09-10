import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import { appOrigin, ConfigurationError, integrationHealth } from '../src/lib/integration-config'
import { getStripe } from '../src/lib/providers/stripe'
import { deploymentState } from '../src/lib/providers/vercel'
import { checkAvailability, normalizeDomain, registerDomain, parseProviderPrice } from '../src/lib/vercel-domains'
import { hasSiteMarker, runDeployment, runDomainRegistration, siteRevision, publishingSnapshot } from '../src/lib/deployment-service'
import { JobError, retryState, type IntegrationJob } from '../src/lib/integration-jobs'
import { checkoutActions } from '../src/lib/billing-events'
import { getBillingPlans } from '../src/lib/billing-plans'

function withEnv(values: Record<string, string | undefined>) {
  const original = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]))
  for (const [key, value] of Object.entries(values)) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
  return () => { for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value } }
}

test('billing clients load without credentials and fail before a provider request', () => {
  const restore = withEnv({ AUTOLOCAL_ENABLE_BILLING: undefined, STRIPE_SECRET_KEY: undefined })
  try { assert.equal(integrationHealth().billing.enabled, false); assert.throws(() => getStripe(), ConfigurationError) } finally { restore() }
})
test('application links use configured environment and reject unsafe origins', () => {
  const restore = withEnv({ NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3100' })
  try {
    assert.equal(appOrigin(), 'http://127.0.0.1:3100')
    process.env.NEXT_PUBLIC_SITE_URL = 'https://user:password@example.test'
    assert.throws(appOrigin, ConfigurationError)
    process.env.NEXT_PUBLIC_SITE_URL = 'http://production.example.test'
    assert.throws(appOrigin, ConfigurationError)
  } finally { restore() }
})
test('domain checkout requires real prices and never substitutes a made-up quote', async () => {
  const restore = withEnv({ VERCEL_TOKEN: 'mock-only' }); const originalFetch = globalThis.fetch
  try {
    assert.equal(normalizeDomain('https://localhost/path'), null)
    assert.equal(normalizeDomain('Example.com'), 'example.com')
    globalThis.fetch = async input => String(input).includes('/availability')
      ? Response.json({ results: [{ domain: 'example.com', available: true }] })
      : Response.json({ purchasePrice: 100, renewalPrice: 200 })
    const [quote] = await checkAvailability(['example.com'])
    assert.equal(quote.retailPrice, 125); assert.equal(quote.retailRenew, 250)
    assert.equal(parseProviderPrice('17.99'), 17.99); assert.ok(Number.isNaN(parseProviderPrice('unavailable')))
    globalThis.fetch = async input => String(input).includes('/availability')
      ? Response.json({ results: [{ domain: 'example.com', available: true }] }) : new Response('', { status: 503 })
    await assert.rejects(() => checkAvailability(['example.com']))
  } finally { globalThis.fetch = originalFetch; restore() }
})
test('ambiguous domain purchase never becomes an automatic second charge', async () => {
  const restore = withEnv({ AUTOLOCAL_ENABLE_DOMAIN_PURCHASES: 'true', VERCEL_TOKEN: 'mock-only' }); const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = async () => { throw new Error('timeout after request accepted') }
    await assert.rejects(() => registerDomain('example.com', 17, { firstName: 'Test', lastName: 'Fixture', email: 'owner@example.test', phone: '+15555550100', address1: '1 Test', city: 'Test', state: 'TX', zip: '77000', country: 'US' }), (error: unknown) => error instanceof JobError && error.needsReview && !error.retryable)
    assert.equal(retryState(new JobError('Unknown order', false, true), 1).status, 'needs_review')
  } finally { globalThis.fetch = originalFetch; restore() }
})
test('bundled purchase activates hosting and queues domain; ordinary domain does not activate hosting', () => {
  assert.deepEqual(checkoutActions('hosting_and_domain'), { hosting: true, managed: false, domain: true })
  assert.deepEqual(checkoutActions('domain'), { hosting: false, managed: false, domain: true })
  assert.equal(checkoutActions('managed', false).hosting, false)
  assert.equal(checkoutActions('managed', true).hosting, true)
})
test('only active configured monthly prices are offered with server product scope', async () => {
  const restore = withEnv({ STRIPE_HOSTING_PRICE_ID: 'price_mock', STRIPE_MANAGED_PRICE_ID: undefined })
  try {
    const stripe = { prices: { retrieve: async () => ({ id: 'price_mock', active: true, type: 'recurring', recurring: { interval: 'month', interval_count: 1 }, unit_amount: 4200, currency: 'usd', product: { active: true, name: 'Verified plan', description: 'Website hosting', metadata: {} } }) } }
    const plans = await getBillingPlans(stripe as never)
    assert.equal(plans[0].amount, 4200); assert.equal(plans[0].scope, 'Website hosting')
    stripe.prices.retrieve = async () => ({ id: 'price_mock', active: false } as never)
    assert.deepEqual(await getBillingPlans(stripe as never), [])
  } finally { restore() }
})
test('publishing state requires provider readiness, correct routing and actual tenant content', async () => {
  const restore = withEnv({ AUTOLOCAL_ENABLE_PUBLISHING: 'true', VERCEL_TOKEN: 'mock-only' }); const originalFetch = globalThis.fetch
  const updates: Record<string, unknown>[] = []
  const site = { id: 'site-fixture', slug: 'fixture', hosting_status: 'active', domain_status: null, vercel_project_id: 'project-fixture', requested_deployment_job_id: 'job-fixture' }
  const db = { from() { const chain = { select() { return chain }, eq() { return chain }, single: async () => ({ data: site, error: null }), update(values: Record<string, unknown>) { updates.push(values); return chain }, then(resolve: (result: unknown) => void) { resolve({ error: null }) } }; return chain } } as unknown as SupabaseClient
  const snapshot = publishingSnapshot(site)
  const job: IntegrationJob = { id: 'job-fixture', kind: 'deploy', site_id: site.id, payload: { site: snapshot, revision: siteRevision(snapshot) }, result: { deploymentId: 'deployment-fixture', projectId: 'project-fixture', deploymentUrl: 'https://fixture.vercel.app' }, attempts: 1, idempotency_key: 'fixture' }
  let state = 'BUILDING'; let marker = 'wrong-tenant'; let revision = 'old-revision'
  globalThis.fetch = async input => {
    const url = String(input)
    if (url.includes('/v13/deployments/')) return Response.json({ readyState: state })
    if (url.includes('/v9/projects/')) return Response.json({ verified: true })
    if (url.includes('/v6/domains/')) return Response.json({ misconfigured: false })
    if (url.startsWith('https://fixture.autolocal.ai') || url.startsWith('https://fixture.vercel.app')) return new Response(`<html><head><meta name="autolocal-site" content="${marker}"><meta name="autolocal-revision" content="${revision}"></head></html>`, { headers: { 'content-type': 'text/html' } })
    return Response.json({})
  }
  try {
    await assert.rejects(() => runDeployment(db, job)); assert.equal(updates.some(row => row.deploy_status === 'live'), false)
    state = 'READY'
    await assert.rejects(() => runDeployment(db, job)); assert.equal(updates.some(row => row.deploy_status === 'live'), false)
    marker = 'fixture'
    await assert.rejects(() => runDeployment(db, job)); assert.equal(updates.some(row => row.deploy_status === 'live'), false)
    revision = job.id
    const result = await runDeployment(db, job)
    assert.ok('verified' in result && result.verified); assert.equal(updates.at(-1)?.deploy_status, 'live')
    assert.equal(deploymentState({ readyState: 'READY', aliasError: {} }), 'failed')
    assert.equal(hasSiteMarker('<meta name="autolocal-site" content="other">', 'fixture'), false)
  } finally { globalThis.fetch = originalFetch; restore() }
})
test('stale job with a persisted purchase intent requires review without contacting registrar', async () => {
  const restore = withEnv({ AUTOLOCAL_ENABLE_DOMAIN_PURCHASES: 'true' }); const originalFetch = globalThis.fetch
  const site = { custom_domain: 'example.com' }
  const db = { from() { const chain = { select() { return chain }, eq() { return chain }, single: async () => ({ data: site, error: null }) }; return chain } } as unknown as SupabaseClient
  globalThis.fetch = async () => { throw new Error('No network should be attempted') }
  try { await assert.rejects(() => runDomainRegistration(db, { id: 'job-fixture', kind: 'register_domain', site_id: 'site-fixture', payload: { domain: 'example.com', expectedPrice: 17 }, result: { purchaseStarted: true }, attempts: 2, idempotency_key: 'fixture' }), (error: unknown) => error instanceof JobError && error.needsReview) }
  finally { globalThis.fetch = originalFetch; restore() }
})
test('retries stop at the attempt limit and publishing state changes do not create new content revisions', () => {
  assert.equal(retryState(new Error('transient'), 4).status, 'retry')
  assert.equal(retryState(new Error('transient'), 5).status, 'failed')
  const site = { id: 'fixture', description: 'Original', deploy_status: 'live' }
  assert.equal(siteRevision(site), siteRevision({ ...site, deploy_status: 'queued' }))
  assert.notEqual(siteRevision(site), siteRevision({ ...site, description: 'Edited' }))
  for (const [key, value] of Object.entries({ service_areas: ['New city'], show_address: false, hero_crop: 90, image_caption: 'Owner photo', reviews_verified: true, brand_color_secondary: '#112233', site_mode: 'individual' })) assert.notEqual(siteRevision(site), siteRevision({ ...site, [key]: value }), key)
})
