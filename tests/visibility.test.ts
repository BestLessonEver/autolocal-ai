import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { visibilityInsights, reconcileVisibility, type VisibilityInput, type VisibilityTask } from '../src/lib/visibility-insights'
import { ownerTaskOutcome } from '../src/lib/visibility-plan'
import { syncGoogleConnection } from '../src/lib/google-sync'
import { sealGoogleSecret } from '../src/lib/google-vault'
import { tokenBinding, type GoogleConnection } from '../src/lib/google-connections'
import { POST as processVisibility } from '../src/app/api/visibility/process/route'
import type { SupabaseClient } from '@supabase/supabase-js'

const now = '2026-09-10T15:00:00.000Z'
const input = (): VisibilityInput => ({ now, site: { id: '11111111-1111-4111-8111-111111111111', business_name: 'Local Studio', city: 'Houston', state: 'TX', description: 'Personal lessons and small group classes with a focus on learning useful skills at your own pace.', phone: '7135550123', contact_email: 'contact@example.test', services: [{ name: 'Piano lessons', description: 'Individual piano lessons covering technique, reading, and music chosen together.' }], service_areas: ['Houston'], faq: [{ question: 'How do I start?', answer: 'Send an inquiry to discuss the next available lesson.' }], hero_image_url: 'https://example.test/photo.jpg', updated_at: now }, connections: [], leads: { available: true, unansweredCount: 0, oldestAt: null, observedAt: now } })
function google(base: VisibilityInput, provider = 'search_console', extra: Record<string,unknown> = {}) { base.connections.push({ provider, status: 'connected', last_synced_at: now, ...extra }); return base }
function asTask(candidate: ReturnType<typeof visibilityInsights>['candidates'][number]): VisibilityTask { return { ...candidate, status: 'open', completion: null, updatedAt: now } }

test('prioritized plan is bounded and uses actual missing details without invented scores', () => {
  const base = input(); base.site = { id: base.site.id, business_name: 'Local Studio' }; base.leads.unansweredCount = 3; base.leads.oldestAt = '2026-09-07T15:00:00Z'
  const plan = reconcileVisibility(base, [])
  assert.equal(plan.open.length, 5)
  assert.equal(plan.open[0].key, 'leads.reply')
  assert.match(plan.open[0].description, /not whether you called/)
  assert.equal(plan.open.find(task => task.key === 'website.services')?.inference, true)
  assert.ok(!JSON.stringify(plan).includes('score'))
  assert.ok(!JSON.stringify(plan).includes('Home repairs'))
})

test('query task uses real substantial low-click evidence and explains uncertain service relevance', () => {
  const base = google(input(), 'search_console', { metrics: { state: 'available', observedAt: now, startDate: '2026-08-09', endDate: '2026-09-07', queries: [{ query: 'guitar lessons Houston', impressions: 250, clicks: 1 }, { query: 'piano lessons Houston', impressions: 500, clicks: 2 }, { query: 'violin lessons', impressions: 20, clicks: 0 }, { query: 'drum lessons', impressions: 300, clicks: 50 }] } })
  const task = visibilityInsights(base).candidates.find(task => task.key === 'search.coverage')!
  assert.ok(task)
  assert.deepEqual(task.context.queries, ['guitar lessons Houston'])
  assert.match(task.description, /Confirm relevance first/)
  assert.equal(task.source.periodEnd, '2026-09-07')
  assert.equal(task.inference, true)
  assert.equal(task.evidenceExpiresAt, '2026-10-09T15:00:00.000Z')
})

test('stale or missing Google data never asserts a mismatch or completes an unresolved query', () => {
  const base = google(input(), 'search_console', { metrics: { state: 'available', observedAt: now, queries: [{ query: 'guitar lessons', impressions: 250, clicks: 0 }] } })
  const previous = visibilityInsights(base).candidates.filter(task => task.key === 'search.coverage').map(asTask)
  base.connections[0].last_synced_at = '2026-08-01T00:00:00Z'
  const result = reconcileVisibility(base, previous)
  assert.ok(!result.open.some(task => task.key === 'search.coverage'))
  assert.equal(result.tasks.find(task => task.key === 'search.coverage')?.status, 'open')
  assert.equal(result.sources.search_console.state, 'stale')
  base.connections[0].last_synced_at = now; base.connections[0].metrics = { state: 'no_data', observedAt: now, queries: [] }
  assert.equal(reconcileVisibility(base, previous).tasks.find(task => task.key === 'search.coverage')?.status, 'open')
})

test('task completion requires relevant changed facts and reopens when the fact becomes missing again', () => {
  const base = input(); base.site.faq = []
  const old = visibilityInsights(base).candidates.filter(task => task.key === 'website.faq').map(asTask)
  base.site.faq = [{ question: 'Do you offer evening lessons?', answer: 'Contact the studio about current times.' }]
  const completed = reconcileVisibility(base, old).tasks.find(task => task.key === 'website.faq')!
  assert.equal(completed.status, 'completed'); assert.equal(completed.completion?.method, 'verified_change')
  assert.match(completed.completion?.note || '', /publication is separate/)
  base.site.faq = []
  assert.equal(reconcileVisibility(base, [completed]).tasks.find(task => task.key === 'website.faq')?.status, 'open')
  const dismissed = ownerTaskOutcome(old[0], 'dismissed', '', now, old[0].revision)
  assert.equal(reconcileVisibility(base, [dismissed]).tasks.find(task => task.key === 'website.faq')?.status, 'dismissed')
  assert.throws(() => ownerTaskOutcome(old[0], 'completed', '', now, old[0].revision), /describe/)
  assert.throws(() => ownerTaskOutcome(old[0], 'dismissed', '', now, 'stale-revision'), /evidence.*changed/)
  assert.equal(ownerTaskOutcome(old[0], 'completed', 'Answered this in person for now.', now, old[0].revision).completion?.method, 'owner_reported')
})

test('query coverage can complete after matching actual service detail is added, but not after data disappears', () => {
  const base = google(input(), 'search_console', { metrics: { state: 'available', observedAt: now, queries: [{ query: 'guitar lessons Houston', impressions: 500, clicks: 0 }] } })
  const prior = visibilityInsights(base).candidates.filter(task => task.key === 'search.coverage').map(asTask)
  base.site.services = [{ name: 'Guitar lessons', description: 'Private guitar lessons for students in Houston.' }]
  assert.equal(reconcileVisibility(base, prior).tasks.find(task => task.key === 'search.coverage')?.completion?.method, 'verified_change')
})

test('GBP comparisons use a verified publication and tolerate www; disconnected evidence is ignored', () => {
  const base = google(input(), 'gbp', { profile: { observedAt: now, websiteUri: 'https://www.example.test/', phoneNumbers: { primaryPhone: '7135550123' }, profile: { description: 'Music lessons.' } } })
  base.site.website_current = 'https://unverified.test'
  assert.ok(!visibilityInsights(base).candidates.some(task => task.key === 'gbp.website'))
  Object.assign(base.site, { hosting_status: 'active', deploy_status: 'queued', deployment_verified_at: now, website_current: 'https://example.test', published_site_snapshot: { phone: '7135550123' } })
  assert.ok(!visibilityInsights(base).candidates.some(task => task.key === 'gbp.website'))
  base.site.website_current = 'https://new-site.test'
  assert.ok(visibilityInsights(base).candidates.some(task => task.key === 'gbp.website' && task.inference))
  base.connections[0].status = 'disconnected'
  assert.ok(!visibilityInsights(base).candidates.some(task => task.key === 'gbp.website'))
})

test('provider evidence is redacted after retention limit without inventing a completion', () => {
  const base = google(input(), 'search_console', { metrics: { state: 'available', observedAt: now, queries: [{ query: 'sensitive search words', impressions: 500, clicks: 0 }] } })
  const old = visibilityInsights(base).candidates.filter(task => task.key === 'search.coverage').map(asTask)
  base.now = '2026-11-15T15:00:00.000Z'
  const result = reconcileVisibility(base, old).tasks.find(task => task.key === 'search.coverage')!
  assert.equal(result.status, 'open'); assert.deepEqual(result.evidence, []); assert.deepEqual(result.context, {})
})

test('failed refresh labels still-current evidence as cached and missing lead access cannot complete a task', () => {
  const base = google(input(), 'gbp', { error_code: 'quota_exceeded', profile: { observedAt: now, profile: { description: 'Actual description' } } })
  base.leads.unansweredCount = 2
  const previous = visibilityInsights(base).candidates.filter(task => task.key === 'leads.reply').map(asTask)
  base.leads.available = false; base.leads.unansweredCount = null
  const result = reconcileVisibility(base, previous)
  assert.equal(result.sources.gbp.state, 'cached')
  assert.match(result.sources.gbp.label, /last refresh incomplete/)
  assert.equal(result.tasks.find(task => task.key === 'leads.reply')?.status, 'open')
  assert.ok(!result.open.some(task => task.key === 'leads.reply'))
})

test('internal visibility processing rejects unauthenticated and disabled runs before accessing storage', async () => {
  const oldKey = process.env.INTERNAL_API_KEY, oldFlag = process.env.AUTOLOCAL_ENABLE_VISIBILITY_WORKER
  try {
    process.env.INTERNAL_API_KEY = 'local-only-test-key'; process.env.AUTOLOCAL_ENABLE_VISIBILITY_WORKER = 'true'
    assert.equal((await processVisibility(new Request('https://app.example.test/api/visibility/process', { method: 'POST' }))).status, 401)
    process.env.AUTOLOCAL_ENABLE_VISIBILITY_WORKER = 'false'
    assert.equal((await processVisibility(new Request('https://app.example.test/api/visibility/process', { method: 'POST', headers: { Authorization: 'Bearer local-only-test-key' } }))).status, 503)
  } finally {
    if (oldKey === undefined) delete process.env.INTERNAL_API_KEY; else process.env.INTERNAL_API_KEY = oldKey
    if (oldFlag === undefined) delete process.env.AUTOLOCAL_ENABLE_VISIBILITY_WORKER; else process.env.AUTOLOCAL_ENABLE_VISIBILITY_WORKER = oldFlag
  }
})

test('shared Google refresh only reads provider data, persists raw metrics, and guards changed connections', async () => {
  const fixtureEnv = { GOOGLE_OAUTH_CLIENT_ID: 'fixture-client', GOOGLE_OAUTH_CLIENT_SECRET: 'fixture-secret', GOOGLE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'), AUTOLOCAL_ENABLE_GOOGLE_CONNECTIONS: 'true', GOOGLE_BUSINESS_PROFILE_API_APPROVED: 'true', NEXT_PUBLIC_SITE_URL: 'https://autolocal.example.invalid' }
  const previousEnv = Object.fromEntries(Object.keys(fixtureEnv).map(key => [key, process.env[key]]))
  Object.assign(process.env, fixtureEnv)
  try {
    for (const metricsFail of [false, true]) {
      const connection: GoogleConnection = { id: 'connection', site_id: 'site', owner_id: 'owner', provider: 'gbp', status: 'connected', tokens_ciphertext: sealGoogleSecret({ access_token: 'fixture-access', refresh_token: 'fixture-refresh' }, tokenBinding('site', 'gbp')), token_expires_at: new Date(Date.now() + 3600000).toISOString(), granted_scope: null, resource_name: 'locations/123', resource_label: 'Old label', account_name: null, profile: null, metrics: null, profile_revision: null, last_synced_at: null, error_code: null }
      let saved: Record<string, unknown> = {}; const conditions: unknown[][] = []; const methods: string[] = []
      const query = { eq(key: string, value: unknown) { conditions.push([key, value]); return query }, select() { return query }, async single() { return { data: { ...connection, ...saved }, error: null } } }
      const db = { from() { return { update(values: Record<string, unknown>) { saved = values; return query } } } } as unknown as SupabaseClient
      const result = await syncGoogleConnection(db, connection, async (url, init) => {
        methods.push(init?.method || 'GET')
        if (String(url).includes('businessinformation')) return Response.json({ name: 'locations/123', title: 'Fresh business title', profile: { description: 'Real description.' } })
        return metricsFail ? Response.json({ error: { message: 'Private provider failure' } }, { status: 403 }) : Response.json({ multiDailyMetricTimeSeries: [] })
      })
      assert.ok(methods.length >= 2 && methods.every(method => method === 'GET'))
      assert.equal(saved.resource_label, 'Fresh business title')
      assert.ok(conditions.some(([key, value]) => key === 'tokens_ciphertext' && value === connection.tokens_ciphertext))
      assert.ok(conditions.some(([key, value]) => key === 'resource_name' && value === connection.resource_name))
      assert.equal(result.partial, metricsFail)
      const metrics = saved.metrics as Record<string, unknown>
      if (metricsFail) { assert.equal(metrics.state, 'unavailable'); assert.equal(metrics.totals, null) }
      else { assert.ok(metrics.raw); assert.ok(!('totals' in metrics)); assert.ok(!('daily' in metrics)) }
      assert.ok(!JSON.stringify(result).includes('fixture-access'))
      assert.ok(!JSON.stringify(result).includes('Private provider failure'))
    }
  } finally { for (const [key, value] of Object.entries(previousEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value } }
})

test('additive task migration enforces private access, respects owner races, and leases bounded worker claims', async () => {
  const db = new PGlite()
  const migration = readFileSync('supabase/migrations/202609101500_visibility_tasks.sql', 'utf8')
  try {
    await db.exec("CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE TABLE website_previews(id uuid PRIMARY KEY,owner_id uuid);GRANT ALL ON website_previews TO service_role;INSERT INTO website_previews VALUES('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222');")
    await db.exec(migration); await db.exec(migration)
    for (const role of ['anon', 'authenticated']) { await db.exec('SET ROLE ' + role); await assert.rejects(db.query('SELECT * FROM visibility_tasks'), /permission denied/); await assert.rejects(db.query('SELECT * FROM claim_visibility_site()'), /permission denied/); await db.exec('RESET ROLE') }
    assert.equal((await db.query('SELECT * FROM claim_visibility_site()')).rows.length, 1)
    assert.equal((await db.query('SELECT * FROM claim_visibility_site()')).rows.length, 0)
    await db.exec("UPDATE website_previews SET visibility_claimed_at=now()-interval '11 minutes'")
    assert.equal((await db.query('SELECT * FROM claim_visibility_site()')).rows.length, 1)
    const row = { task_key: 'website.faq', title: 'Add an answer', description: 'Use real facts', priority: 'medium', rank: 55, evidence: [], source: { kind: 'website' }, action: { target: 'website' }, source_revision: 'test', inference: false, context: {}, evidence_expires_at: null, status: 'open', completion: null, updated_at: '2026-01-01T00:00:00Z' }
    const reconcile = (owner = '22222222-2222-4222-8222-222222222222') => db.query('SELECT reconcile_visibility_tasks($1,$2,$3)', ['11111111-1111-4111-8111-111111111111', owner, JSON.stringify([row])])
    await reconcile()
    await db.exec("UPDATE visibility_tasks SET status='dismissed',owner_updated_at='2026-01-02T00:00:00Z'")
    await reconcile()
    assert.equal((await db.query<{ status:string }>('SELECT status FROM visibility_tasks')).rows[0].status, 'dismissed')
    await db.exec("UPDATE visibility_tasks SET owner_updated_at=null,updated_at='2026-01-03T00:00:00Z',source_revision='newer-worker'")
    await reconcile()
    assert.equal((await db.query<{ source_revision:string }>('SELECT source_revision FROM visibility_tasks')).rows[0].source_revision, 'newer-worker')
    await db.exec("UPDATE website_previews SET owner_id='33333333-3333-4333-8333-333333333333'")
    await assert.rejects(reconcile(), /ownership changed/)
    await reconcile('33333333-3333-4333-8333-333333333333')
    assert.deepEqual((await db.query('SELECT owner_id,owner_updated_at,status FROM visibility_tasks')).rows[0], { owner_id: '33333333-3333-4333-8333-333333333333', owner_updated_at: null, status: 'open' })
  } finally { await db.close() }
})
