import test from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { ApiError } from '../src/lib/owner-access'
import { JobError, type IntegrationJob } from '../src/lib/integration-jobs'
import { assertStaticPublishingReady, GOOGLE_IMPORT_PUBLISHING_MESSAGE } from '../src/lib/publishing-readiness'
import { publishingSnapshot, queueDeployment, runDeployment } from '../src/lib/deployment-service'
import { createOwnerCheckout } from '../src/lib/checkout-session'

const manual = { id: 'site-a', slug: 'owner-website', business_name: 'Owner Business', template: 'ledger', description: 'Owner-authored text.' }
const reference = { ...manual, google_place_id: 'place123456789', business_facts: { useGoogleListing: true, googleOverrides: {} } }
const transient = { ...manual, business_name: 'Fresh Google name', google_source_url: 'https://maps.google.com/?cid=123', google_photos: [{ url: 'https://lh3.googleusercontent.com/transient', attributions: [] }] }
const blocked = (error: unknown) => error instanceof ApiError && error.status === 409 && error.message === GOOGLE_IMPORT_PUBLISHING_MESSAGE

test('static snapshots reject Google references and transient responses while retaining manual-site behavior', () => {
  for (const site of [reference, transient, { ...manual, google_photos: transient.google_photos }, { ...manual, google_attributions: [{ displayName: 'Data provider' }] }]) {
    assert.throws(() => publishingSnapshot(site), blocked)
  }
  const connectedManual = { ...manual, google_place_id: 'place123456789', google_source_url: null, google_photos: [], google_attributions: [] }
  assert.doesNotThrow(() => assertStaticPublishingReady(connectedManual))
  const snapshot = publishingSnapshot(connectedManual)
  assert.equal(snapshot.business_name, manual.business_name)
  assert.equal(snapshot.description, manual.description)
  assert.equal(snapshot.template, 'ledger')
})

test('Google references cannot create or resume checkout before any provider or database interaction', async () => {
  let calls = 0
  const unexpected = () => { calls++; throw new Error('No checkout operation expected') }
  const db = { from: unexpected } as unknown as SupabaseClient
  const stripe = { checkout: { sessions: { retrieve: unexpected, expire: unexpected, create: unexpected } } } as unknown as Stripe
  for (const site of [reference, transient]) {
    for (const previous of [{}, { checkout_request_key: 'unfinished-intent', checkout_session_id: 'old-checkout' }]) {
      await assert.rejects(() => createOwnerCheckout(db, stripe, { ...site, ...previous }, { mode: 'subscription' }), blocked)
    }
  }
  assert.equal(calls, 0)
})

test('deployment queue rejects the current reference-mode site even when given an older plain snapshot', async () => {
  let calls = 0
  const db = { from: () => { calls++; throw new Error('No queue operation expected') } } as unknown as SupabaseClient
  await assert.rejects(() => queueDeployment(db, reference, 'owner', publishingSnapshot(manual)), blocked)
  await assert.rejects(() => queueDeployment(db, manual, 'owner', transient), blocked)
  assert.equal(calls, 0)
})

test('a queued reference or transient deployment stops for review before provider requests or mutations', async () => {
  const previous = {
    publishing: process.env.AUTOLOCAL_ENABLE_PUBLISHING,
    namespace: process.env.AUTOLOCAL_PUBLISHING_NAMESPACE,
    environment: process.env.RAILWAY_ENVIRONMENT_NAME,
  }
  const originalFetch = globalThis.fetch
  let providerCalls = 0
  let mutations = 0
  globalThis.fetch = async () => { providerCalls++; throw new Error('No provider request expected') }
  process.env.AUTOLOCAL_ENABLE_PUBLISHING = 'true'
  delete process.env.AUTOLOCAL_PUBLISHING_NAMESPACE
  delete process.env.RAILWAY_ENVIRONMENT_NAME
  try {
    for (const [site, approved] of [[reference, manual], [manual, transient]]) {
      const db = { from: () => ({
        select: () => ({ eq: () => ({ single: async () => ({ data: { ...site, hosting_status: 'active', requested_deployment_job_id: 'job-a' }, error: null }) }) }),
        update: () => { mutations++; throw new Error('No mutation expected') },
      }) } as unknown as SupabaseClient
      const job: IntegrationJob = { id: 'job-a', kind: 'deploy', site_id: 'site-a', payload: { site: approved }, result: null, attempts: 1, idempotency_key: 'job-a' }
      await assert.rejects(() => runDeployment(db, job), error => error instanceof JobError && !error.retryable && error.needsReview && error.message === GOOGLE_IMPORT_PUBLISHING_MESSAGE)
    }
    assert.equal(providerCalls, 0)
    assert.equal(mutations, 0)
  } finally {
    globalThis.fetch = originalFetch
    for (const [key, value] of [['AUTOLOCAL_ENABLE_PUBLISHING', previous.publishing], ['AUTOLOCAL_PUBLISHING_NAMESPACE', previous.namespace], ['RAILWAY_ENVIRONMENT_NAME', previous.environment]]) {
      if (value === undefined) delete process.env[key!]
      else process.env[key!] = value
    }
  }
})
