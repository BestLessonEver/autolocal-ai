import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, stat, readFile, writeFile, chmod, symlink, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  emptyConfig, validateConfig, readiness, configure, readConfig, validateBackendStatus,
  providerEnvironment, blankEnvironmentNames, ProviderConfigError, stripeListenerCommand, stripeListenerLine, stripeEvents, appOutputFilter, stripeListenerExitCode,
} from './provider-test.mjs'

const backend = {
  API_URL: 'http://127.0.0.1:54321', DB_URL: 'postgresql://postgres:fixture-password@127.0.0.1:54322/postgres',
  ANON_KEY: 'fixture-local-anon', SERVICE_ROLE_KEY: 'fixture-local-service',
}
const full = () => ({
  ...emptyConfig(), enableStripeSandbox: true, enableGoogleOAuth: true,
  STRIPE_SECRET_KEY: 'sk_test_fixtureOnly123456', STRIPE_WEBHOOK_SECRET: 'whsec_fixtureOnly123456',
  STRIPE_HOSTING_PRICE_ID: 'price_fixtureHosting', STRIPE_MANAGED_PRICE_ID: 'price_fixtureManaged',
  GOOGLE_OAUTH_CLIENT_ID: '123456-fixture.apps.googleusercontent.com', GOOGLE_OAUTH_CLIENT_SECRET: 'fixture-google-secret',
  GOOGLE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'), AUTOLOCAL_RATE_LIMIT_KEY: 'a'.repeat(64),
})

test('config rejects live Stripe keys, secret injection, cloud overrides, unknown switches and wrong key encodings', () => {
  for (const key of ['sk_live_fixtureSecret123456', 'rk_live_fixtureSecret123456', 'pk_test_fixture123456', 'fixture-secret']) {
    assert.throws(() => validateConfig({ ...emptyConfig(), STRIPE_SECRET_KEY: key }), ProviderConfigError)
  }
  for (const field of ['SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'VERCEL_TOKEN', 'AUTOLOCAL_ENABLE_GBP_WRITES', 'INTERNAL_API_KEY']) {
    assert.throws(() => validateConfig({ ...emptyConfig(), [field]: 'forbidden' }), ProviderConfigError)
  }
  assert.throws(() => validateConfig({ ...full(), GOOGLE_OAUTH_CLIENT_SECRET: 'secret\r\ninjected' }), ProviderConfigError)
  assert.throws(() => validateConfig({ ...full(), GOOGLE_TOKEN_ENCRYPTION_KEY: 'too-short' }), ProviderConfigError)
  assert.throws(() => validateConfig({ ...full(), enableGoogleOAuth: 'true' }), ProviderConfigError)
  assert.equal(validateConfig({ ...full(), STRIPE_SECRET_KEY: 'rk_test_fixtureOnly123456' }).enableStripeSandbox, true)
})

test('status supports absent credentials and exposes only booleans, never values', () => {
  const missing = readiness(emptyConfig(), false)
  assert.equal(missing.configPresent, false)
  assert.equal(missing.stripe.enabled, false)
  assert.equal(missing.google.enabled, false)
  const config = full()
  const text = JSON.stringify(readiness(config))
  for (const value of [config.STRIPE_SECRET_KEY, config.STRIPE_WEBHOOK_SECRET, config.GOOGLE_OAUTH_CLIENT_SECRET, config.GOOGLE_TOKEN_ENCRYPTION_KEY]) assert.equal(text.includes(value), false)
  const check = object => Object.values(object).forEach(value => typeof value === 'object' ? check(value) : assert.equal(typeof value, 'boolean'))
  check(readiness(config))
})

test('backend validation rejects cloud/DNS/alternate targets and connection query overrides', () => {
  for (const [key, value] of [
    ['API_URL', 'https://example.supabase.co'], ['API_URL', 'http://localhost:54321'],
    ['API_URL', 'http://user:pass@127.0.0.1:54321'], ['API_URL', 'http://127.0.0.1:54321?redirect=outside'],
    ['DB_URL', 'postgresql://postgres:fixture@cloud.invalid:54322/postgres'],
    ['DB_URL', 'postgresql://postgres:fixture@127.0.0.1:54322/postgres?host=cloud.invalid'],
    ['DB_URL', 'postgresql://postgres:fixture@127.0.0.1:54323/postgres'],
  ]) assert.throws(() => validateBackendStatus({ ...backend, [key]: value }), ProviderConfigError)
  assert.equal(validateBackendStatus(backend).serviceKey, backend.SERVICE_ROLE_KEY)
})

test('provider environment blanks production assignments and forces every unrelated capability off', () => {
  const fixtureEnv = 'STRIPE_SECRET_KEY=sk_live_fixture123\nSUPABASE_SERVICE_ROLE_KEY=cloud-service\nNEXT_PUBLIC_SUPABASE_URL=https://outside.invalid\nexport CUSTOM_SECRET=hidden\nCOLON_KEY: hidden\nDOTTED.NAME=value\nAUTOLOCAL_ENABLE_PUBLISHING=true\nINTERNAL_API_KEY=foreign-worker\n'
  assert.deepEqual(blankEnvironmentNames([fixtureEnv]), {
    STRIPE_SECRET_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '', NEXT_PUBLIC_SUPABASE_URL: '', CUSTOM_SECRET: '',
    COLON_KEY: '', 'DOTTED.NAME': '', AUTOLOCAL_ENABLE_PUBLISHING: '', INTERNAL_API_KEY: '',
  })
  const env = providerEnvironment(full(), backend, [fixtureEnv], {
    PATH: '/usr/bin', HOME: '/fixture', STRIPE_SECRET_KEY: 'sk_live_foreign123456', SUPABASE_SERVICE_ROLE_KEY: 'cloud-key',
    NODE_OPTIONS: '--import evil.mjs', HTTP_PROXY: 'http://outside.invalid',
  })
  assert.equal(env.STRIPE_SECRET_KEY, full().STRIPE_SECRET_KEY)
  assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, backend.SERVICE_ROLE_KEY)
  assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, backend.API_URL)
  assert.equal(env.CUSTOM_SECRET, '')
  assert.equal(env.NODE_OPTIONS, undefined)
  assert.equal(env.HTTP_PROXY, undefined)
  assert.equal(env.AUTOLOCAL_SITES_DOMAIN, 'autolocal-pilot.invalid')
  assert.equal(env.AUTOLOCAL_ENABLE_BILLING, 'true')
  assert.equal(env.AUTOLOCAL_ENABLE_GOOGLE_CONNECTIONS, 'true')
  assert.equal(env.GOOGLE_BUSINESS_PROFILE_API_APPROVED, 'false')
  for (const key of ['AUTOLOCAL_ENABLE_PUBLISHING', 'AUTOLOCAL_ENABLE_DOMAIN_PURCHASES', 'AUTOLOCAL_ENABLE_EMAIL', 'AUTOLOCAL_ENABLE_GBP_WRITES', 'AUTOLOCAL_ENABLE_VISIBILITY_WORKER', 'AUTOLOCAL_SCHEDULER_VERIFIED']) assert.equal(env[key], 'false')
  for (const key of ['INTERNAL_API_KEY', 'VERCEL_TOKEN', 'RESEND_API_KEY', 'DOMAIN_REGISTRANT_JSON', 'GOOGLE_PLACES_API_KEY', 'OPENAI_API_KEY']) assert.equal(env[key], '')
  const disabled = providerEnvironment({ ...full(), enableStripeSandbox: false, enableGoogleOAuth: false }, backend)
  assert.equal(disabled.STRIPE_SECRET_KEY, '')
  assert.equal(disabled.GOOGLE_OAUTH_CLIENT_SECRET, '')
  assert.throws(() => providerEnvironment({ ...full(), STRIPE_WEBHOOK_SECRET: '' }, backend), ProviderConfigError)
})

test('private initialization generates independent keys, preserves them on replay and merges concurrent handoffs', async () => {
  const project = await mkdtemp(join(tmpdir(), 'autolocal-provider-config-test-'))
  try {
    assert.equal(await readConfig(project), null)
    const initial = await configure({}, project)
    assert.equal(initial.google.encryptionKeyPresent, true)
    assert.equal(initial.google.enabled, false)
    assert.equal(initial.google.clientIdPresent, false)
    const first = await readConfig(project)
    const file = join(project, '.runtime/provider-test/config.json')
    assert.equal((await stat(file)).mode & 0o777, 0o600)
    assert.equal((await stat(join(project, '.runtime/provider-test'))).mode & 0o777, 0o700)
    await configure({}, project)
    assert.equal((await readConfig(project)).GOOGLE_TOKEN_ENCRYPTION_KEY, first.GOOGLE_TOKEN_ENCRYPTION_KEY)
    await Promise.all([
      configure({ GOOGLE_OAUTH_CLIENT_SECRET: 'fixture-only-google-secret' }, project),
      configure({ STRIPE_SECRET_KEY: 'sk_test_fixtureOnly123456', STRIPE_WEBHOOK_SECRET: 'whsec_fixtureOnly123456' }, project),
    ])
    const merged = await readConfig(project)
    assert.equal(merged.GOOGLE_OAUTH_CLIENT_SECRET, 'fixture-only-google-secret')
    assert.equal(merged.STRIPE_SECRET_KEY, 'sk_test_fixtureOnly123456')
    await assert.rejects(configure({ GOOGLE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString('base64') }, project), ProviderConfigError)
    assert.equal((await readConfig(project)).GOOGLE_TOKEN_ENCRYPTION_KEY, first.GOOGLE_TOKEN_ENCRYPTION_KEY)
    await chmod(file, 0o644)
    await assert.rejects(readConfig(project), ProviderConfigError)
    await chmod(file, 0o600)
    const raw = await readFile(file, 'utf8')
    await writeFile(file, '{"invalid":', { mode: 0o600 })
    await assert.rejects(readConfig(project), ProviderConfigError)
    await writeFile(file, raw, { mode: 0o600 })
  } finally { await rm(project, { recursive: true, force: true }) }
})

test('configuration refuses symlink traversal before writing private secrets', async () => {
  const project = await mkdtemp(join(tmpdir(), 'autolocal-provider-symlink-test-'))
  try {
    await mkdir(join(project, 'outside'))
    await symlink(join(project, 'outside'), join(project, '.runtime'))
    await assert.rejects(configure({}, project), ProviderConfigError)
    await assert.rejects(readFile(join(project, 'outside/provider-test/config.json')), /ENOENT/)
  } finally { await rm(project, { recursive: true, force: true }) }
})

test('Stripe listener uses only a sandbox env key, fixed local target and explicit supported events', () => {
  const command = stripeListenerCommand(full(), '/fixture', { PATH: '/usr/bin', STRIPE_API_KEY: 'sk_live_foreign', NODE_OPTIONS: '--import evil' })
  assert.equal(command.env.STRIPE_API_KEY, full().STRIPE_SECRET_KEY)
  assert.equal(command.env.NODE_OPTIONS, undefined)
  assert.equal(command.args.includes('--live'), false)
  assert.equal(command.args.includes('--api-key'), false)
  assert.equal(command.args.at(-1), 'http://127.0.0.1:3102/api/webhook/stripe')
  assert.equal(command.args.includes(stripeEvents.join(',')), true)
  assert.throws(() => stripeListenerCommand({ ...full(), STRIPE_SECRET_KEY: 'sk_live_fixtureOnly123456' }), ProviderConfigError)
})

test('Stripe listener checks signing secret without printing it and suppresses raw customer output', () => {
  const secret = full().STRIPE_WEBHOOK_SECRET
  assert.deepEqual(stripeListenerLine('Ready! Your webhook signing secret is ' + secret + ' (^C to quit)', secret), { listenerReady: true, signingSecretMatched: true })
  assert.throws(() => stripeListenerLine('Ready! whsec_differentFixture1234', secret), ProviderConfigError)
  assert.equal(stripeListenerLine('Customer: private-fixture@example.invalid', secret), null)
  assert.deepEqual(stripeListenerLine('2026-09-10 --> checkout.session.completed [evt_fixture123]', secret), { eventId: 'evt_fixture123', eventType: 'checkout.session.completed' })
  assert.deepEqual(stripeListenerLine('2026-09-10 <-- [200] POST localhost [evt_fixture123]', secret), { eventId: 'evt_fixture123', httpStatus: 200 })
  const safe = JSON.stringify(stripeListenerLine('error: ' + secret + ' private-fixture@example.invalid', secret))
  assert.equal(safe.includes(secret), false)
  assert.equal(safe.includes('private-fixture'), false)
})

test('Next output filter suppresses OAuth/auth URLs and errors across arbitrary chunk boundaries', () => {
  const messages = []
  const feed = appOutputFilter(value => messages.push(value))
  feed('GET /api/connections/google/callback?co')
  feed('de=fixture-google-secret-code&sta')
  feed('te=fixture-google-state 307 in 11ms\n')
  feed('GET /auth/callback?token_hash=fixture-auth-token 307 in 1ms\n')
  feed('Error: provider returned fixture-client-secret and email fixture@example.invalid\n')
  feed(' ✓ Rea')
  feed('dy in 1270ms\n')
  feed('POST /api/checkout?sk_test_fixtureSecret123 200 in 30ms\n')
  feed('Error: listen EADDR')
  feed('INUSE: address already in use http://127.0.0.1:3102/?code=fixture-secret\n')
  assert.deepEqual(messages, [
    { appReady: true, origin: 'http://127.0.0.1:3102' },
    { appReady: false, localPortAlreadyInUse: true },
  ])
  assert.equal(JSON.stringify(messages).includes('fixture'), false)
})

test('a secret appearing in a Stripe error never falsely confirms listener readiness', () => {
  assert.deepEqual(stripeListenerLine('Error using ' + full().STRIPE_WEBHOOK_SECRET, full().STRIPE_WEBHOOK_SECRET), { listenerError: true })
})

test('Stripe listener cannot exit successfully before its signing secret was verified', () => {
  assert.equal(stripeListenerExitCode(0, null, false), 1)
  assert.equal(stripeListenerExitCode(null, null, false), 1)
  assert.equal(stripeListenerExitCode(0, null, true), 0)
  assert.equal(stripeListenerExitCode(2, null, true), 2)
})
