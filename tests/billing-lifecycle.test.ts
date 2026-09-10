import { test } from 'node:test'
import assert from 'node:assert/strict'
import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fulfillBillingEvent } from '../src/lib/billing-events'
import { createOwnerCheckout } from '../src/lib/checkout-session'
import { publishingSnapshot, queueDeployment, runDeployment } from '../src/lib/deployment-service'

// A small query adapter exercises fulfillment ordering, persisted intents and failure recovery.
function database(site: Record<string, unknown>) {
  const tables: Record<string, Record<string, unknown>[]> = { website_previews: [site], integration_jobs: [], billing_events: [] }
  const db = { auth: { admin: { getUserById: async () => ({ data: { user: { email: 'verified-owner@example.test', email_confirmed_at: '2026-09-10' } }, error: null }) } }, from(table: string) {
    const filters: ((row: Record<string, unknown>) => boolean)[] = []
    let change: Record<string, unknown> | undefined; let upsert: Record<string, unknown> | undefined
    let evaluated: { data: Record<string, unknown>[]; error: null } | undefined
    function evaluate() {
      if (evaluated) return evaluated
      let rows = (tables[table] || []).filter(row => filters.every(filter => filter(row)))
      if (upsert) {
        if (tables[table].some(row => row.idempotency_key === upsert!.idempotency_key)) rows = []
        else { const row = { id: `job-${tables[table].length + 1}`, ...upsert }; tables[table].push(row); rows = [row] }
      }
      if (change) for (const row of rows) Object.assign(row, change)
      evaluated = { data: structuredClone(rows), error: null }; return evaluated
    }
    const query = {
      select() { return query }, eq(key: string, value: unknown) { filters.push(row => row[key] === value); return query },
      is(key: string, value: unknown) { filters.push(row => (row[key] ?? null) === value); return query },
      lte(key: string, value: number) { filters.push(row => Number(row[key] || 0) <= value); return query },
      update(value: Record<string, unknown>) { change = value; return query },
      upsert(value: Record<string, unknown>) { upsert = value; return query },
      async single() { const result = evaluate(); return { ...result, data: result.data[0] || null } },
      async maybeSingle() { return query.single() },
      then(resolve: (result: unknown) => void) { resolve(evaluate()) },
    }
    return query
  } } as unknown as SupabaseClient
  return { db, tables }
}
const base = () => ({ id: 'site-fixture', slug: 'fixture', owner_id: 'owner-fixture', email: 'owner@example.test', description: 'Approved content', hosting_status: 'preview', billing_event_created: 0, checkout_request_key: 'intent-fixture' })
const event = (type: string, object: unknown, created = 100) => ({ id: 'evt-fixture', type, created, data: { object } }) as Stripe.Event

test('paid bundle saves approved content and durably queues both jobs exactly once', async () => {
  const site = { ...base(), checkout_site_snapshot: publishingSnapshot(base()) }
  site.description = 'Unapproved later draft'
  const { db, tables } = database(site)
  const stripe = { subscriptions: { retrieve: async () => ({ id: 'sub-fixture', status: 'active', trial_end: null }) } } as unknown as Stripe
  const payment = event('checkout.session.completed', { id: 'cs-fixture', payment_status: 'paid', customer: 'cus-fixture', subscription: 'sub-fixture', metadata: { siteId: site.id, owner_id: site.owner_id, product: 'hosting_and_domain', domain: 'fixture.com', domainPurchasePrice: '20', checkout_request_key: 'intent-fixture' } })
  const previous = process.env.NEXT_PUBLIC_SITE_URL; process.env.NEXT_PUBLIC_SITE_URL = 'https://app.example.test'
  try {
    await fulfillBillingEvent(db, stripe, payment)
    assert.equal(tables.website_previews[0].hosting_status, 'active')
    assert.equal(tables.website_previews[0].subscription_status, 'active')
    assert.deepEqual(tables.integration_jobs.map(job => job.kind).sort(), ['deploy', 'email', 'register_domain'])
    assert.equal(((tables.integration_jobs[0].payload as Record<string, unknown>).site as Record<string, unknown>).description, 'Approved content')
    assert.equal(tables.integration_jobs.find(job => job.kind === 'register_domain')?.idempotency_key, 'domain:site-fixture:fixture.com')
    await fulfillBillingEvent(db, stripe, payment)
    assert.equal(tables.integration_jobs.length, 3)
  } finally { if (previous === undefined) delete process.env.NEXT_PUBLIC_SITE_URL; else process.env.NEXT_PUBLIC_SITE_URL = previous }
})

test('unpaid and owner-mismatched checkout events never activate a website', async () => {
  const { db, tables } = database(base())
  await fulfillBillingEvent(db, {} as Stripe, event('checkout.session.completed', { payment_status: 'unpaid' }))
  await assert.rejects(() => fulfillBillingEvent(db, {} as Stripe, event('checkout.session.completed', { payment_status: 'paid', metadata: { siteId: 'site-fixture', owner_id: 'another-owner' } })))
  assert.equal(tables.website_previews[0].hosting_status, 'preview'); assert.equal(tables.integration_jobs.length, 0)
})

test('legacy subscriptions require exact stored ID and stale lifecycle events cannot roll state back', async () => {
  const { db, tables } = database({ ...base(), stripe_subscription_id: 'sub-legacy', hosting_status: 'active', billing_event_created: 150 })
  const subscription = { id: 'sub-legacy', status: 'canceled', metadata: {}, customer: 'cus-legacy' }
  await fulfillBillingEvent(db, {} as Stripe, event('customer.subscription.deleted', subscription, 100))
  assert.equal(tables.website_previews[0].hosting_status, 'active')
  await fulfillBillingEvent(db, {} as Stripe, event('customer.subscription.deleted', subscription, 200))
  assert.equal(tables.website_previews[0].hosting_status, 'cancelled')
  assert.equal(tables.integration_jobs[0].kind, 'suspend_site')
  await assert.rejects(() => fulfillBillingEvent(db, {} as Stripe, event('customer.subscription.deleted', { ...subscription, id: 'sub-unknown' }, 300)))
})

test('portal cancellation timestamps remain pending until cancellation and can be withdrawn', async () => {
  const { db, tables } = database({ ...base(), stripe_subscription_id: 'sub-portal', hosting_status: 'active' })
  // Observed in the real sandbox portal: cancel_at is set but cancel_at_period_end is false.
  const subscription = { id: 'sub-portal', status: 'active', metadata: {}, customer: 'cus-portal', cancel_at_period_end: false, cancel_at: 1791660342 }
  await fulfillBillingEvent(db, {} as Stripe, event('customer.subscription.updated', subscription, 200))
  assert.equal(tables.website_previews[0].hosting_status, 'pending_cancel')
  assert.equal(tables.website_previews[0].subscription_status, 'active')
  assert.equal(tables.website_previews[0].cancel_date, '2026-10-10T19:25:42.000Z')
  assert.equal(tables.integration_jobs.length, 0)
  await fulfillBillingEvent(db, {} as Stripe, event('customer.subscription.updated', { ...subscription, cancel_at: null }, 300))
  assert.equal(tables.website_previews[0].hosting_status, 'active')
  assert.equal(tables.website_previews[0].cancel_date, null)
  assert.equal(tables.integration_jobs.length, 0)
})

test('checkout preserves an already scheduled cancellation returned by Stripe', async () => {
  const site = { ...base(), checkout_site_snapshot: publishingSnapshot(base()) }
  const { db, tables } = database(site)
  const stripe = { subscriptions: { retrieve: async () => ({ id: 'sub-fixture', status: 'active', trial_end: null, cancel_at_period_end: false, cancel_at: 1791660342 }) } } as unknown as Stripe
  const payment = event('checkout.session.completed', { id: 'cs-fixture', payment_status: 'paid', customer: 'cus-fixture', subscription: 'sub-fixture', metadata: { siteId: site.id, owner_id: site.owner_id, product: 'hosting', checkout_request_key: 'intent-fixture' } })
  await fulfillBillingEvent(db, stripe, payment)
  assert.equal(tables.website_previews[0].hosting_status, 'pending_cancel')
  assert.equal(tables.website_previews[0].cancel_date, '2026-10-10T19:25:42.000Z')
  assert.deepEqual(tables.integration_jobs.map(job => job.kind).sort(), ['deploy', 'email'])
})

test('checkout retries recover the same durable provider intent after a lost response', async () => {
  const { db, tables } = database({ ...base(), checkout_request_key: null })
  const keys: string[] = []
  const stripe = { checkout: { sessions: { create: async (_params: unknown, options: { idempotencyKey: string }) => { keys.push(options.idempotencyKey); if (keys.length === 1) throw new Error('Response lost'); return { id: 'cs-recovered', url: 'https://checkout.stripe.com/fixture' } } } } } as unknown as Stripe
  const params = { mode: 'payment', metadata: { product: 'domain' } } as Stripe.Checkout.SessionCreateParams
  await assert.rejects(() => createOwnerCheckout(db, stripe, { ...tables.website_previews[0], id: 'site-fixture' }, params))
  const session = await createOwnerCheckout(db, stripe, { ...tables.website_previews[0], id: 'site-fixture' }, params)
  assert.equal(session.id, 'cs-recovered'); assert.equal(keys[0], keys[1]); assert.equal(tables.website_previews[0].checkout_session_id, session.id)
})

test('current publication deduplicates, but an explicit rollback queues a fresh approved deployment', async () => {
  const site = { ...base(), deploy_status: 'live', published_site_snapshot: publishingSnapshot(base()) }
  const { db, tables } = database(site)
  const first = await queueDeployment(db, site)
  tables.integration_jobs[0].status = 'succeeded'
  assert.equal(await queueDeployment(db, site), first)
  assert.equal(tables.integration_jobs.length, 1)
  site.published_site_snapshot = publishingSnapshot({ ...site, description: 'Different live content' })
  assert.notEqual(await queueDeployment(db, site), first)
  assert.equal(tables.integration_jobs.length, 2)
})

test('a superseded retry never contacts a provider or changes newer publication state', async () => {
  const site = { ...base(), hosting_status: 'active', requested_deployment_job_id: 'new-job', deploy_status: 'live' }
  const { db, tables } = database(site)
  const originalFetch = globalThis.fetch, previous = process.env.AUTOLOCAL_ENABLE_PUBLISHING
  globalThis.fetch = async () => { throw new Error('No provider request expected') }; process.env.AUTOLOCAL_ENABLE_PUBLISHING = 'true'
  try {
    const result = await runDeployment(db, { id: 'old-job', kind: 'deploy', site_id: site.id, payload: {}, result: null, attempts: 3, idempotency_key: 'old' })
    assert.ok('skipped' in result); assert.equal(tables.website_previews[0].deploy_status, 'live')
  } finally { globalThis.fetch = originalFetch; if (previous === undefined) delete process.env.AUTOLOCAL_ENABLE_PUBLISHING; else process.env.AUTOLOCAL_ENABLE_PUBLISHING = previous }
})

test('automatic refresh cannot replace a newer owner-approved publishing request', async () => {
  const site = { ...base(), hosting_status: 'active' }
  const { db, tables } = database(site)
  const ownerJob = await queueDeployment(db, { ...site, description: 'New owner-approved content' })
  const latest = tables.website_previews[0]
  const automaticJob = await queueDeployment(db, { ...latest, description: 'Older published content', google_rating: 4.8 }, 'listing-refresh')
  assert.equal(automaticJob, ownerJob)
  assert.equal(tables.website_previews[0].requested_deployment_job_id, ownerJob)
})
