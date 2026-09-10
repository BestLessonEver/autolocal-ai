import assert from 'node:assert/strict'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ConfigurationError } from '../src/lib/integration-config'
import { publishingTarget } from '../src/lib/providers/publishing-target'
import { publishingSnapshot, queueDeployment, runDeployment, runDomainRegistration, siteRevision } from '../src/lib/deployment-service'
import { JobError, type IntegrationJob } from '../src/lib/integration-jobs'

function environment(overrides: Record<string, string | undefined> = {}) {
  const values = {
    AUTOLOCAL_PUBLISHING_NAMESPACE: 'staging', AUTOLOCAL_SITES_DOMAIN: 'sites.staging.example.test',
    RAILWAY_ENVIRONMENT_NAME: 'staging', AUTOLOCAL_ENABLE_PUBLISHING: 'true',
    VERCEL_TOKEN: 'mock-only', VERCEL_TEAM_ID: undefined, NEXT_PUBLIC_SITE_URL: 'https://staging.example.test',
    VERCEL_AUTOMATION_BYPASS_SECRET: undefined, ...overrides,
  }
  const original = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]))
  for (const [key, value] of Object.entries(values)) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
  return () => { for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value } }
}

function fixture(siteValues: Record<string, unknown> = {}) {
  const site = { id: 'site-fixture', slug: 'fixture', hosting_status: 'active', requested_deployment_job_id: 'job-fixture', ...siteValues }
  const snapshot = publishingSnapshot(site)
  const updates: Record<string, unknown>[] = []
  const db = { from() {
    const chain = { select() { return chain }, eq() { return chain }, single: async () => ({ data: site, error: null }), update(value: Record<string, unknown>) { updates.push(value); return chain }, then(resolve: (value: unknown) => void) { resolve({ error: null }) } }
    return chain
  } } as unknown as SupabaseClient
  const job: IntegrationJob = { id: 'job-fixture', kind: 'deploy', site_id: site.id, payload: { site: snapshot, revision: siteRevision(snapshot), publishingScope: publishingTarget(site).scope }, result: null, attempts: 1, idempotency_key: 'fixture' }
  return { site, job, db, updates }
}

const needsReview = (error: unknown) => error instanceof JobError && error.needsReview && !error.retryable

test('staging project names cannot collide with production names and depend on environment and site identity', () => {
  const restore = environment()
  try {
    const site = { id: 'first', slug: 'fixture' }
    const first = publishingTarget(site)
    assert.match(first.projectName, /^autolocalstage-staging-/)
    assert.notEqual(first.projectName, publishingTarget({ ...site, id: 'second' }).projectName)
    process.env.AUTOLOCAL_SITES_DOMAIN = 'other-staging.example.test'
    assert.notEqual(first.projectName, publishingTarget(site).projectName)
    assert.ok(publishingTarget({ id: 'first', slug: 'a'.repeat(100) }).projectName.length <= 100)
    delete process.env.AUTOLOCAL_PUBLISHING_NAMESPACE
    process.env.RAILWAY_ENVIRONMENT_NAME = 'production'
    delete process.env.AUTOLOCAL_SITES_DOMAIN
    assert.equal(publishingTarget(site).projectName, 'autolocal-fixture')
    assert.equal(publishingTarget(site).domain, 'fixture.autolocal.ai')
  } finally { restore() }
})

test('named nonproduction Railway environments require a namespace and explicit isolated domain', () => {
  const restore = environment()
  try {
    const site = { id: 'fixture', slug: 'fixture' }
    delete process.env.AUTOLOCAL_PUBLISHING_NAMESPACE
    assert.throws(() => publishingTarget(site), ConfigurationError)
    process.env.AUTOLOCAL_PUBLISHING_NAMESPACE = 'staging'
    for (const domain of ['', 'autolocal.ai', 'https://sites.example.test']) {
      process.env.AUTOLOCAL_SITES_DOMAIN = domain
      assert.throws(() => publishingTarget(site), ConfigurationError)
    }
    process.env.AUTOLOCAL_SITES_DOMAIN = 'sites.staging.example.test'
    assert.throws(() => publishingTarget({ ...site, custom_domain: 'customer.example.test', domain_status: 'active' }), needsReview)
  } finally { restore() }
})

test('copied production content jobs stop before any provider request', async () => {
  const restore = environment(), originalFetch = globalThis.fetch
  let requests = 0
  globalThis.fetch = async () => { requests++; throw new Error('Unexpected provider request') }
  try {
    const { db, job } = fixture({ vercel_project_id: 'production-project' })
    delete job.payload.publishingScope
    await assert.rejects(() => runDeployment(db, job), needsReview)
    assert.equal(requests, 0)
    const staged = fixture()
    delete process.env.AUTOLOCAL_PUBLISHING_NAMESPACE
    process.env.RAILWAY_ENVIRONMENT_NAME = 'production'
    await assert.rejects(() => runDeployment(staged.db, staged.job), needsReview)
    assert.equal(requests, 0)
  } finally { globalThis.fetch = originalFetch; restore() }
})

test('copied production project references are read-verified and never used in a provider mutation', async () => {
  const restore = environment(), originalFetch = globalThis.fetch
  const calls: string[] = []
  globalThis.fetch = async (input, options) => {
    calls.push(`${options?.method || 'GET'} ${new URL(String(input)).pathname}`)
    return Response.json({ id: 'production-project', name: 'autolocal-fixture' })
  }
  try {
    const { db, job } = fixture({ vercel_project_id: 'production-project' })
    await assert.rejects(() => runDeployment(db, job), needsReview)
    assert.deepEqual(calls, ['GET /v9/projects/production-project'])
    calls.length = 0
    job.kind = 'suspend_site'
    job.payload = {}
    const cancelled = fixture({ vercel_project_id: 'production-project', hosting_status: 'cancelled' })
    await assert.rejects(() => runDeployment(cancelled.db, job), needsReview)
    assert.deepEqual(calls, ['GET /v9/projects/production-project'])
  } finally { globalThis.fetch = originalFetch; restore() }
})

test('resumed staging jobs reject a deployment belonging to another project before promotion', async () => {
  const restore = environment(), originalFetch = globalThis.fetch
  const { db, site, job } = fixture({ vercel_project_id: 'staging-project' })
  job.result = { projectId: 'staging-project', deploymentId: 'copied-deployment', deploymentUrl: 'https://copied.vercel.app', promoted: true }
  const calls: string[] = []
  globalThis.fetch = async (input, options) => {
    const pathname = new URL(String(input)).pathname
    calls.push(`${options?.method || 'GET'} ${pathname}`)
    if (pathname === '/v9/projects/staging-project') return Response.json({ id: 'staging-project', name: publishingTarget(site).projectName })
    return Response.json({ id: 'copied-deployment', projectId: 'production-project', readyState: 'READY' })
  }
  try {
    await assert.rejects(() => runDeployment(db, job), needsReview)
    assert.deepEqual(calls, ['GET /v9/projects/staging-project', 'GET /v13/deployments/copied-deployment'])
  } finally { globalThis.fetch = originalFetch; restore() }
})

test('fresh staging publication creates and promotes only its isolated project and domain', async () => {
  const restore = environment(), originalFetch = globalThis.fetch
  const { db, site, job, updates } = fixture()
  const target = publishingTarget(site)
  const mutations: { path: string; body?: Record<string, unknown> }[] = []
  globalThis.fetch = async (input, options) => {
    const url = new URL(String(input))
    if (options?.method === 'POST') mutations.push({ path: url.pathname, body: options.body ? JSON.parse(String(options.body)) : undefined })
    if (url.pathname === `/v9/projects/${target.projectName}`) return new Response('', { status: 404 })
    if (url.pathname === '/v13/deployments') return Response.json({ id: 'staging-deployment', projectId: 'staging-project', url: 'staging.vercel.app' })
    if (url.pathname === '/v9/projects/staging-project') return Response.json({ id: 'staging-project', name: target.projectName })
    if (url.pathname === '/v13/deployments/staging-deployment') return Response.json({ id: 'staging-deployment', projectId: 'staging-project', readyState: 'READY' })
    if (url.pathname.includes('/promote/')) return new Response(null, { status: 202 })
    if (url.pathname.startsWith('/v9/projects/staging-project/domains/')) return Response.json({ verified: true })
    if (url.pathname.startsWith('/v6/domains/')) return Response.json({ misconfigured: false })
    if (url.hostname === 'staging.vercel.app' || url.hostname === target.domain) return new Response(`<meta name="autolocal-site" content="fixture"><meta name="autolocal-revision" content="${job.id}">`, { headers: { 'Content-Type': 'text/html' } })
    if (url.pathname === '/v10/projects/staging-project/domains') return Response.json({})
    throw new Error('Unexpected provider target')
  }
  try {
    const result = await runDeployment(db, job)
    assert.ok('verified' in result && result.verified)
    assert.equal(mutations[0].body?.name, target.projectName)
    assert.equal(mutations[0].body?.project, undefined)
    const files = mutations[0].body?.files as { file: string; data: string }[]
    const html = files.find(file => file.file === 'index.html')!.data
    assert.match(html, /<meta name="robots" content="noindex,nofollow">/)
    assert.doesNotMatch(html, /content="index,follow"/)
    assert.equal(files.find(file => file.file === 'robots.txt')?.data, 'User-agent: *\nDisallow: /\n')
    assert.deepEqual(mutations.slice(1), [
      { path: '/v10/projects/staging-project/promote/staging-deployment', body: undefined },
      { path: '/v10/projects/staging-project/domains', body: { name: target.domain } },
    ])
    assert.equal(updates.at(-1)?.website_current, target.siteUrl)
  } finally { globalThis.fetch = originalFetch; restore() }
})

test('queued staging content carries its environment scope and does not reuse another domain queue key', async () => {
  const restore = environment()
  const rows: Record<string, unknown>[] = []
  const db = { from() {
    const chain = {
      upsert(row: Record<string, unknown>) { rows.push(row); return chain },
      select() { return chain }, eq() { return chain }, update() { return chain },
      maybeSingle: async () => ({ data: { id: 'queued-job' }, error: null }),
      single: async () => ({ data: { status: 'pending' }, error: null }),
      then(resolve: (value: unknown) => void) { resolve({ error: null }) },
    }
    return chain
  } } as unknown as SupabaseClient
  try {
    const site = { id: 'site-fixture', slug: 'fixture' }
    await queueDeployment(db, site)
    const firstScope = publishingTarget(site).scope
    process.env.AUTOLOCAL_SITES_DOMAIN = 'other-staging.example.test'
    await queueDeployment(db, site)
    assert.notEqual(rows[0].idempotency_key, rows[1].idempotency_key)
    assert.equal((rows[0].payload as Record<string, unknown>).publishingScope, firstScope)
    assert.equal((rows[1].payload as Record<string, unknown>).publishingScope, publishingTarget(site).scope)
  } finally { restore() }
})

test('staging registrar jobs remain blocked even if domain purchasing is enabled accidentally', async () => {
  const restore = environment({ AUTOLOCAL_ENABLE_DOMAIN_PURCHASES: 'true' }), originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => { calls++; throw new Error('Unexpected purchase') }
  try {
    const { db, job } = fixture()
    await assert.rejects(() => runDomainRegistration(db, job), needsReview)
    assert.equal(calls, 0)
  } finally { globalThis.fetch = originalFetch; restore() }
})
