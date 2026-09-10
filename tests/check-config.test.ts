import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import test from 'node:test'

const fixture = {
  NODE_ENV: 'test' as const,
  NEXT_PUBLIC_SITE_URL: 'https://staging.example.test',
  NEXT_PUBLIC_SUPABASE_URL: 'https://database.example.test',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-anonymous',
  SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-secret',
  GOOGLE_PLACES_API_KEY: 'fixture-places-secret',
  STRIPE_SECRET_KEY: 'fixture-stripe-secret',
  STRIPE_WEBHOOK_SECRET: 'fixture-webhook-secret',
  STRIPE_HOSTING_PRICE_ID: 'fixture-price',
  VERCEL_TOKEN: 'fixture-vercel-secret',
  INTERNAL_API_KEY: 'fixture-worker-secret',
  RESEND_API_KEY: 'fixture-email-secret',
  EMAIL_FROM: 'fixture@example.test',
  AUTOLOCAL_RATE_LIMIT_KEY: 'fixture-rate-limit-secret-32-bytes',
  AUTOLOCAL_ENABLE_BILLING: 'true',
  AUTOLOCAL_ENABLE_PUBLISHING: 'true',
  AUTOLOCAL_ENABLE_EMAIL: 'true',
  AUTOLOCAL_SCHEDULER_VERIFIED: 'true',
}

function check(overrides: Record<string, string | undefined> = {}, strict = true) {
  const result = spawnSync(process.execPath, [
    '--import', 'tsx', path.resolve('scripts/operations/check-config.ts'), ...(strict ? ['--strict'] : []),
  ], {
    // Never inherit real provider credentials or load an environment file.
    env: { ...fixture, ...overrides },
    encoding: 'utf8',
    timeout: 15000,
  })
  assert.equal(result.error, undefined)
  assert.equal(result.stderr, '')
  return { status: result.status, report: JSON.parse(result.stdout), output: result.stdout }
}

test('strict checker accepts explicit HTTPS origin and shared limiter configuration without exposing values', () => {
  const { status, report, output } = check()
  assert.equal(status, 0)
  assert.equal(report.verification, 'configuration_only')
  assert.equal(report.required.applicationOrigin, true)
  assert.equal(report.required.publicRateLimiting, true)
  for (const section of [report.required, report.assumptions, report.optional]) {
    assert.ok(Object.values(section).every(value => typeof value === 'boolean'))
  }
  for (const value of Object.values(fixture).filter(value => value.includes('fixture') || value.includes('https://'))) {
    assert.equal(output.includes(value), false)
  }
  assert.equal(check({ NEXT_PUBLIC_SITE_URL: 'https://staging.example.test/' }).status, 0)
})

test('strict checker rejects implicit localhost and legacy BASE-only configuration', () => {
  assert.equal(check({ NEXT_PUBLIC_SITE_URL: undefined }).report.required.applicationOrigin, false)
  const result = check({ NEXT_PUBLIC_SITE_URL: undefined, NEXT_PUBLIC_BASE_URL: 'https://legacy.example.test' })
  assert.equal(result.status, 1)
  assert.equal(result.report.required.applicationOrigin, false)
})

test('strict checker rejects non-HTTPS and non-origin URLs even when runtime normalization accepts them', () => {
  for (const origin of [
    'http://localhost:3000',
    'https://user:password@staging.example.test',
    'https://staging.example.test/dashboard',
    'https://staging.example.test/../',
    'https://staging.example.test?token=secret',
    'https://staging.example.test#fragment',
    'https://staging.example.test?',
    'https://staging.example.test\\dashboard',
    'not-a-url',
  ]) {
    const result = check({ NEXT_PUBLIC_SITE_URL: origin })
    assert.equal(result.status, 1)
    assert.equal(result.report.required.applicationOrigin, false)
    assert.equal(result.output.includes(origin), false)
  }
})

test('strict checker requires the runtime shared limiter key length and database configuration', () => {
  for (const key of [undefined, 'short']) {
    const result = check({ AUTOLOCAL_RATE_LIMIT_KEY: key })
    assert.equal(result.status, 1)
    assert.equal(result.report.required.publicRateLimiting, false)
  }
  const missingDatabase = check({ SUPABASE_SERVICE_ROLE_KEY: undefined })
  assert.equal(missingDatabase.status, 1)
  assert.equal(missingDatabase.report.required.publicRateLimiting, false)
  // Match the runtime's byte count, rather than accidentally counting characters.
  assert.equal(check({ AUTOLOCAL_RATE_LIMIT_KEY: 'é'.repeat(16) }).status, 0)
})

test('proxy and edge claims remain separate configuration-only assumptions', () => {
  const disabled = check()
  assert.equal(disabled.status, 0)
  assert.deepEqual(disabled.report.assumptions, { trustedProxyHeaders: false, edgeRateLimitVerified: false })
  const asserted = check({ AUTOLOCAL_TRUST_PROXY_IP_HEADERS: 'true', AUTOLOCAL_EDGE_RATE_LIMIT_VERIFIED: 'true' })
  assert.equal(asserted.status, 0)
  assert.deepEqual(asserted.report.assumptions, { trustedProxyHeaders: true, edgeRateLimitVerified: true })
  assert.equal(check({ VERCEL: '1' }).report.assumptions.trustedProxyHeaders, true)
})

test('non-strict checker preserves development runtime availability without implying shared limiter readiness', () => {
  const result = check({ NEXT_PUBLIC_SITE_URL: undefined, AUTOLOCAL_RATE_LIMIT_KEY: undefined }, false)
  assert.equal(result.status, 0)
  assert.equal(result.report.required.applicationOrigin, true)
  assert.equal(result.report.required.publicRateLimiting, false)
})
