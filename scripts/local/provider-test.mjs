#!/usr/bin/env node
// Deliberate provider-test launcher. Never changes production env files or starts workers.
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { stripVTControlCharacters } from 'node:util'
import { constants } from 'node:fs'
import { lstat, mkdir, open, readFile, rename, unlink } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const root = fileURLToPath(new URL('../../', import.meta.url))
export const appOrigin = 'http://127.0.0.1:3102'
export const googleCallback = appOrigin + '/api/connections/google/callback'
export class ProviderConfigError extends Error {}
const flags = ['enableStripeSandbox', 'enableGoogleOAuth', 'googleBusinessProfileApproved']
const values = [
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_HOSTING_PRICE_ID', 'STRIPE_MANAGED_PRICE_ID',
  'GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_TOKEN_ENCRYPTION_KEY', 'AUTOLOCAL_RATE_LIMIT_KEY',
]
const allowed = new Set(['version', ...flags, ...values])
export function emptyConfig() {
  return { version: 1, ...Object.fromEntries(flags.map(name => [name, false])), ...Object.fromEntries(values.map(name => [name, ''])) }
}
export function validateConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !allowed.has(key))) {
    throw new ProviderConfigError('Provider config contains unsupported fields. Supabase and other provider settings cannot be supplied here.')
  }
  const config = { ...emptyConfig(), ...input }
  if (config.version !== 1 || flags.some(name => typeof config[name] !== 'boolean')) throw new ProviderConfigError('Provider config version or enable switches are invalid.')
  for (const name of values) {
    if (typeof config[name] !== 'string' || config[name].length > 4096 || config[name].trim() !== config[name] || /[\s\0]/.test(config[name])) {
      throw new ProviderConfigError('Provider config contains an invalid credential field.')
    }
  }
  if (config.STRIPE_SECRET_KEY && !/^[sr]k_test_[A-Za-z0-9]{12,}$/.test(config.STRIPE_SECRET_KEY)) {
    throw new ProviderConfigError('Only Stripe sandbox/test secret or restricted keys are accepted. Live keys are rejected even when billing is disabled.')
  }
  if (config.STRIPE_WEBHOOK_SECRET && !/^whsec_[A-Za-z0-9]{12,}$/.test(config.STRIPE_WEBHOOK_SECRET)) throw new ProviderConfigError('Stripe webhook signing secret has an invalid format.')
  for (const name of ['STRIPE_HOSTING_PRICE_ID', 'STRIPE_MANAGED_PRICE_ID']) {
    if (config[name] && !/^price_[A-Za-z0-9]+$/.test(config[name])) throw new ProviderConfigError('Stripe price identifier has an invalid format.')
  }
  if (config.GOOGLE_OAUTH_CLIENT_ID && !/^\d+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(config.GOOGLE_OAUTH_CLIENT_ID)) throw new ProviderConfigError('Google web client identifier has an invalid format.')
  if (config.GOOGLE_TOKEN_ENCRYPTION_KEY && (!/^[A-Za-z0-9+/]{43}=$/.test(config.GOOGLE_TOKEN_ENCRYPTION_KEY) || Buffer.from(config.GOOGLE_TOKEN_ENCRYPTION_KEY, 'base64').length !== 32)) {
    throw new ProviderConfigError('Google encryption requires a locally generated 32-byte base64 key.')
  }
  if (config.AUTOLOCAL_RATE_LIMIT_KEY && !/^[a-f0-9]{64}$/.test(config.AUTOLOCAL_RATE_LIMIT_KEY)) throw new ProviderConfigError('Local rate-limit key must contain 32 random bytes encoded as hex.')
  return config
}
export function readiness(config, configPresent = true) {
  config = validateConfig(config)
  const stripeConfigured = !!(config.STRIPE_SECRET_KEY && config.STRIPE_WEBHOOK_SECRET && (config.STRIPE_HOSTING_PRICE_ID || config.STRIPE_MANAGED_PRICE_ID))
  const googleConfigured = !!(config.GOOGLE_OAUTH_CLIENT_ID && config.GOOGLE_OAUTH_CLIENT_SECRET && config.GOOGLE_TOKEN_ENCRYPTION_KEY)
  return {
    configPresent,
    stripe: { requested: config.enableStripeSandbox, configured: stripeConfigured, enabled: config.enableStripeSandbox && stripeConfigured,
      sandboxKeyPresent: !!config.STRIPE_SECRET_KEY, webhookSecretPresent: !!config.STRIPE_WEBHOOK_SECRET,
      hostingPricePresent: !!config.STRIPE_HOSTING_PRICE_ID, managedPricePresent: !!config.STRIPE_MANAGED_PRICE_ID },
    google: { requested: config.enableGoogleOAuth, configured: googleConfigured, enabled: config.enableGoogleOAuth && googleConfigured,
      clientIdPresent: !!config.GOOGLE_OAUTH_CLIENT_ID, clientSecretPresent: !!config.GOOGLE_OAUTH_CLIENT_SECRET,
      encryptionKeyPresent: !!config.GOOGLE_TOKEN_ENCRYPTION_KEY, businessProfileApprovalConfirmed: config.googleBusinessProfileApproved },
    rateLimitKeyPresent: !!config.AUTOLOCAL_RATE_LIMIT_KEY,
    forcedOff: { liveStripe: true, publicPublishing: true, domainPurchases: true, externalEmail: true, googleProfileWrites: true, internalWorkers: true, aiAndPlaces: true },
  }
}
async function configDirectory(projectRoot, create) {
  let path = projectRoot
  for (const part of ['.runtime', 'provider-test']) {
    path = join(path, part)
    let stat
    try { stat = await lstat(path) } catch (error) { if (error.code !== 'ENOENT') throw error }
    if (!stat && !create) return null
    if (!stat) { await mkdir(path, { mode: 0o700 }); stat = await lstat(path) }
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new ProviderConfigError('Provider config path must use real local directories.')
    if (part === 'provider-test' && (stat.mode & 0o077)) throw new ProviderConfigError('Provider config directory must have permissions 700.')
  }
  return path
}
export async function readConfig(projectRoot = root) {
  const dir = await configDirectory(projectRoot, false)
  if (!dir) return null
  let file
  try { file = await open(join(dir, 'config.json'), constants.O_RDONLY | constants.O_NOFOLLOW) }
  catch (error) { if (error.code === 'ENOENT') return null; throw new ProviderConfigError('Provider config could not be opened safely.') }
  try {
    const stat = await file.stat()
    if (!stat.isFile() || stat.size > 20000 || (stat.mode & 0o077) || (process.getuid && stat.uid !== process.getuid())) {
      throw new ProviderConfigError('Provider config must be an owner-only regular file with permissions 600.')
    }
    let value
    try { value = JSON.parse(await file.readFile('utf8')) } catch { throw new ProviderConfigError('Provider config JSON is invalid; no input was printed.') }
    return validateConfig(value)
  } finally { await file.close() }
}
export async function configure(patch = {}, projectRoot = root) {
  // Validate patch keys before touching storage; omitted fields retain their existing values.
  validateConfig(patch)
  const dir = await configDirectory(projectRoot, true)
  const lockPath = join(dir, 'config.lock')
  let lock
  for (let attempt = 0; attempt < 50; attempt++) {
    try { lock = await open(lockPath, 'wx', 0o600); break }
    catch (error) {
      if (error.code !== 'EEXIST') throw error
      await new Promise(done => setTimeout(done, 100))
    }
  }
  if (!lock) throw new ProviderConfigError('Another config update is in progress. Retry without editing the file concurrently.')
  try {
    const previous = await readConfig(projectRoot)
    const initial = previous || { ...emptyConfig(),
      GOOGLE_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'), AUTOLOCAL_RATE_LIMIT_KEY: randomBytes(32).toString('hex') }
    if (!previous && patch.GOOGLE_TOKEN_ENCRYPTION_KEY !== undefined) throw new ProviderConfigError('The initial local encryption key is generated independently; do not import an existing environment key.');
    if (previous?.GOOGLE_TOKEN_ENCRYPTION_KEY && patch.GOOGLE_TOKEN_ENCRYPTION_KEY !== undefined && patch.GOOGLE_TOKEN_ENCRYPTION_KEY !== previous.GOOGLE_TOKEN_ENCRYPTION_KEY) {
      throw new ProviderConfigError('The existing local encryption key cannot be replaced through configure; saved Google grants would become unreadable.')
    }
    const config = validateConfig({ ...initial, ...patch })
    const temporary = join(dir, 'config.' + randomUUID() + '.tmp')
    const file = await open(temporary, 'wx', 0o600)
    try { await file.writeFile(JSON.stringify(config, null, 2) + '\n'); await file.sync() } finally { await file.close() }
    await rename(temporary, join(dir, 'config.json'))
    return readiness(config)
  } finally { await lock.close(); await unlink(lockPath) }
}
export function validateBackendStatus(input) {
  let api, db, password
  try { api = new URL(input.API_URL); db = new URL(input.DB_URL); password = decodeURIComponent(db.password) }
  catch { throw new ProviderConfigError('Local backend returned invalid connection details; no input was printed.') }
  if (api.origin !== 'http://127.0.0.1:54321' || api.pathname !== '/' || api.username || api.password || api.search || api.hash ||
      db.protocol !== 'postgresql:' || db.hostname !== '127.0.0.1' || db.port !== '54322' || db.pathname !== '/postgres' ||
      db.username !== 'postgres' || db.search || db.hash || !password || /[\r\n\0]/.test(password) ||
      typeof input.ANON_KEY !== 'string' || !input.ANON_KEY || typeof input.SERVICE_ROLE_KEY !== 'string' || !input.SERVICE_ROLE_KEY) {
    throw new ProviderConfigError('Provider tests require the dedicated loopback Supabase backend; cloud or alternate targets are rejected.')
  }
  return { apiUrl: api.origin, anonKey: input.ANON_KEY, serviceKey: input.SERVICE_ROLE_KEY }
}
function safeSystemEnvironment(source) {
  return Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL'].filter(key => typeof source[key] === 'string').map(key => [key, source[key]]))
}
async function localBackend(projectRoot, source) {
  const backend = join(projectRoot, '.runtime', 'backend')
  let settings
  try { settings = await readFile(join(backend, 'supabase', 'config.toml'), 'utf8') }
  catch { throw new ProviderConfigError('The dedicated local Supabase config is missing.') }
  if (/^\s*\[auth\.email\.smtp\]/m.test(settings)) throw new ProviderConfigError('Provider tests require the local mail catcher, without a custom SMTP configuration.');
  const header = settings.split(/^\s*\[/m)[0]
  if (!/^\s*project_id\s*=\s*(["'])autolocal-local\1\s*(?:#.*)?$/m.test(header)) throw new ProviderConfigError('Dedicated local Supabase project marker is missing.')
  const env = { ...safeSystemEnvironment(source), DO_NOT_TRACK: '1', SUPABASE_TELEMETRY_DISABLED: '1',
    DOCKER_HOST: 'unix://' + source.HOME + '/.colima/autolocal/docker.sock' }
  const result = spawnSync('npm', ['exec', '--yes', '--package=supabase@2.117.0', '--', 'supabase', 'status', '--workdir', backend, '--output', 'json'],
    { cwd: projectRoot, env, encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024 })
  if (result.error || result.status !== 0) throw new ProviderConfigError('The dedicated local Supabase backend is not ready. No cloud fallback was attempted.')
  let status
  try { status = JSON.parse(result.stdout) } catch { throw new ProviderConfigError('Local backend status was unreadable; credentials were not printed.') }
  validateBackendStatus(status)
  return status
}
export function blankEnvironmentNames(sources) {
  const blank = {}
  for (const source of sources) for (const line of source.split('\n')) {
    const key = line.match(/^\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*|:\s+)/)?.[1]
    if (key) blank[key] = ''
  }
  return blank
}
export function providerEnvironment(config, backendStatus, envSources = [], system = {}) {
  config = validateConfig(config)
  const backend = validateBackendStatus(backendStatus)
  const status = readiness(config)
  if ((status.stripe.requested && !status.stripe.configured) || (status.google.requested && !status.google.configured) || !config.AUTOLOCAL_RATE_LIMIT_KEY) {
    throw new ProviderConfigError('A requested provider or local protection is incomplete. Run the redacted status command before launch.')
  }
  return {
    ...blankEnvironmentNames(envSources), ...safeSystemEnvironment(system), NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1',
    NEXT_DIST_DIR: '.next-dev/provider-test', NEXT_PUBLIC_SITE_URL: appOrigin, NEXT_PUBLIC_BASE_URL: appOrigin,
    NEXT_PUBLIC_SUPABASE_URL: backend.apiUrl, NEXT_PUBLIC_SUPABASE_ANON_KEY: backend.anonKey, SUPABASE_SERVICE_ROLE_KEY: backend.serviceKey,
    AUTOLOCAL_RATE_LIMIT_KEY: config.AUTOLOCAL_RATE_LIMIT_KEY, INTERNAL_API_KEY: '',
    RAILWAY_ENVIRONMENT_NAME: 'local-provider-test', AUTOLOCAL_PUBLISHING_NAMESPACE: 'local', AUTOLOCAL_SITES_DOMAIN: 'autolocal-pilot.invalid',
    AUTOLOCAL_ENABLE_BILLING: String(status.stripe.enabled),
    STRIPE_SECRET_KEY: status.stripe.enabled ? config.STRIPE_SECRET_KEY : '', STRIPE_WEBHOOK_SECRET: status.stripe.enabled ? config.STRIPE_WEBHOOK_SECRET : '',
    STRIPE_HOSTING_PRICE_ID: status.stripe.enabled ? config.STRIPE_HOSTING_PRICE_ID : '', STRIPE_MANAGED_PRICE_ID: status.stripe.enabled ? config.STRIPE_MANAGED_PRICE_ID : '',
    AUTOLOCAL_ENABLE_GOOGLE_CONNECTIONS: String(status.google.enabled), GOOGLE_BUSINESS_PROFILE_API_APPROVED: String(status.google.enabled && config.googleBusinessProfileApproved),
    GOOGLE_OAUTH_CLIENT_ID: status.google.enabled ? config.GOOGLE_OAUTH_CLIENT_ID : '', GOOGLE_OAUTH_CLIENT_SECRET: status.google.enabled ? config.GOOGLE_OAUTH_CLIENT_SECRET : '',
    GOOGLE_TOKEN_ENCRYPTION_KEY: config.GOOGLE_TOKEN_ENCRYPTION_KEY,
    AUTOLOCAL_ENABLE_PUBLISHING: 'false', AUTOLOCAL_ENABLE_DOMAIN_PURCHASES: 'false', AUTOLOCAL_ENABLE_EMAIL: 'false',
    AUTOLOCAL_ENABLE_GBP_WRITES: 'false', AUTOLOCAL_ENABLE_VISIBILITY_WORKER: 'false', AUTOLOCAL_SCHEDULER_VERIFIED: 'false',
    AUTOLOCAL_TRUST_PROXY_IP_HEADERS: 'false', AUTOLOCAL_EDGE_RATE_LIMIT_VERIFIED: 'false',
    VERCEL_TOKEN: '', DOMAIN_REGISTRANT_JSON: '', RESEND_API_KEY: '', EMAIL_FROM: '', OPENAI_API_KEY: '', GOOGLE_PLACES_API_KEY: '', NEXT_PUBLIC_GOOGLE_PLACES_KEY: '',
  }
}
export function appOutputFilter(emit) {
  let pending = '', ready = false, portError = false
  return chunk => {
    pending += chunk
    if (pending.length > 65536) { pending = ''; return }
    const lines = pending.split(/[\r\n]/)
    pending = lines.pop() || ''
    for (const line of lines) {
      const clean = stripVTControlCharacters(line)
      // Only emit our own fixed messages. Never emit a line, URL, stack or substring.
      if (!ready && /^\s*[✓✔]?\s*Ready in\s/.test(clean)) {
        ready = true
        emit({ appReady: true, origin: appOrigin })
      }
      if (!portError && /\bEADDRINUSE\b/.test(clean)) {
        portError = true
        emit({ appReady: false, localPortAlreadyInUse: true })
      }
    }
  }
}

async function launch() {
  const config = await readConfig()
  if (!config) throw new ProviderConfigError('Initialize the private provider-test config first.')
  const backend = await localBackend(root, process.env)
  const envSources = []
  // Read assignment names only for blanking. No dotenv values are exported or reused.
  for (const name of ['.env.example', '.env', '.env.local', '.env.development', '.env.development.local']) {
    try { envSources.push(await readFile(join(root, name), 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  const env = providerEnvironment(config, backend, envSources, process.env)
  console.log(JSON.stringify(readiness(config), null, 2))
  console.log('Starting deliberate provider-test app at ' + appOrigin + '. Stop the existing app first; this command never kills it.')
  const child = spawn(process.execPath, [join(root, 'node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', '3102'],
    { cwd: root, env, stdio: ['inherit', 'pipe', 'pipe'] })
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding('utf8')
    stream.on('data', appOutputFilter(safe => console.log(JSON.stringify(safe))))
  }
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal))
  child.once('error', () => { console.error('Could not start provider-test app.'); process.exitCode = 1 })
  child.once('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0) })
}
export const stripeEvents = Object.freeze([
  'checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.expired',
  'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.payment_failed',
])
export function stripeListenerCommand(config, projectRoot = root, system = {}) {
  config = validateConfig(config)
  if (!readiness(config).stripe.enabled) throw new ProviderConfigError('Stripe sandbox setup must be complete and deliberately enabled before listening.')
  return {
    executable: join(projectRoot, '.runtime/tools/stripe/node_modules/.bin/stripe'),
    args: ['listen', '--skip-update', '--color', 'off', '--config', '/dev/null', '--events', stripeEvents.join(','),
      '--forward-to', appOrigin + '/api/webhook/stripe'],
    env: { ...safeSystemEnvironment(system), STRIPE_API_KEY: config.STRIPE_SECRET_KEY, DO_NOT_TRACK: '1' },
  }
}
export function stripeListenerLine(line, expectedSecret) {
  const clean = stripVTControlCharacters(line)
  const secret = clean.match(/\bwhsec_[A-Za-z0-9]+\b/)?.[0]
  if (secret) {
    const actual = Buffer.from(secret), expected = Buffer.from(expectedSecret)
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new ProviderConfigError('Stripe listener signing secret does not match local config. Listener stopped; update the private signing-secret handoff before retrying.')
    if (/\bReady\b/i.test(clean)) return { listenerReady: true, signingSecretMatched: true }
    return /\b(error|failed|unauthorized)\b/i.test(clean) ? { listenerError: true } : null
  }
  const eventId = clean.match(/\bevt_[A-Za-z0-9]+\b/)?.[0]
  if (eventId) {
    const eventType = stripeEvents.find(event => clean.includes(event))
    const status = clean.match(/\[(\d{3})\]/)?.[1]
    return { eventId, ...(eventType ? { eventType } : {}), ...(status ? { httpStatus: Number(status) } : {}) }
  }
  if (/\b(error|failed|unauthorized)\b/i.test(clean)) return { listenerError: true }
  return null
}
export function stripeListenerExitCode(code, signal, ready) {
  return ready ? (code ?? (signal ? 1 : 0)) : 1
}
async function listenStripe() {
  const config = await readConfig()
  if (!config) throw new ProviderConfigError('Initialize private provider-test config first.')
  const command = stripeListenerCommand(config, root, process.env)
  const child = spawn(command.executable, command.args, { cwd: root, env: command.env, stdio: ['ignore', 'pipe', 'pipe'] })
  let stopped = false, ready = false
  const stop = message => {
    if (stopped) return
    stopped = true
    console.error(message)
    child.kill('SIGTERM')
    process.exitCode = 1
  }
  const timer = setTimeout(() => stop('Stripe listener did not confirm a matching signing secret within 30 seconds.'), 30000)
  for (const stream of [child.stdout, child.stderr]) {
    let pending = ''
    stream.on('data', chunk => {
      pending += chunk.toString()
      if (pending.length > 65536) { pending = ''; stop('Stripe listener produced unexpected output; raw output was withheld.'); return }
      const lines = pending.split(/[\r\n]/)
      pending = lines.pop() || ''
      for (const line of lines) {
        if (stopped) break
        try {
          const safe = stripeListenerLine(line, config.STRIPE_WEBHOOK_SECRET)
          if (safe?.listenerReady) { ready = true; clearTimeout(timer) }
          if (safe && (ready || safe.listenerError)) console.log(JSON.stringify(safe))
        } catch (error) { stop(error instanceof ProviderConfigError ? error.message : 'Stripe listener output could not be validated.') }
      }
    })
  }
  child.once('error', () => { clearTimeout(timer); stop('Could not start the installed local Stripe CLI. No credentials were printed.') })
  child.once('exit', (code, signal) => {
    clearTimeout(timer)
    if (!stopped) process.exitCode = stripeListenerExitCode(code, signal, ready)
    console.log(JSON.stringify({ listenerStopped: true, signingSecretWasVerified: ready }))
  })
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { clearTimeout(timer); child.kill(signal) })
}

async function stdinPatch() {
  let text = ''
  for await (const chunk of process.stdin) {
    text += chunk.toString()
    if (text.length > 20000) throw new ProviderConfigError('Config patch is too large.')
  }
  try { return JSON.parse(text) } catch { throw new ProviderConfigError('Config patch must be JSON on stdin; input was not printed.') }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new ProviderConfigError('Usage: provider-test.mjs init|configure|status|app|stripe-listen. Credentials belong in private config or stdin, never arguments.')
    const command = process.argv[2]
    if (command === 'init') console.log(JSON.stringify(await configure(), null, 2))
    else if (command === 'configure') console.log(JSON.stringify(await configure(await stdinPatch()), null, 2))
    else if (command === 'status') {
      const config = await readConfig()
      console.log(JSON.stringify(readiness(config || emptyConfig(), !!config), null, 2))
    } else if (command === 'app') await launch()
    else if (command === 'stripe-listen') await listenStripe()
    else throw new ProviderConfigError('Usage: provider-test.mjs init|configure|status|app|stripe-listen.')
  } catch (error) {
    console.error(error instanceof ProviderConfigError ? error.message : 'Provider-test setup failed; no raw error, config, or credentials were printed.')
    process.exitCode = 1
  }
}
