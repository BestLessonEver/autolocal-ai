#!/usr/bin/env node
// Local-only setup. No dotenv loading, provider activation, reset, or cloud fallback.
import { createClient } from '@supabase/supabase-js'
import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
export const schemaFiles = Object.freeze([
  'supabase/staging-baseline.sql',
  'supabase/migrations/202609100900_owner_leads_foundation.sql',
  'supabase/migrations/202609101100_google_connections.sql',
  'supabase/migrations/202609101500_visibility_tasks.sql',
  'supabase/migrations/202609101600_public_request_limits.sql',
])
const loopbackHosts = new Set(['127.0.0.1', '[::1]'])
class SetupError extends Error {}

function required(source, name) {
  const value = source[name]
  if (typeof value !== 'string' || !value || /[\r\n\0]/.test(value)) throw new SetupError(name + ' is required and must be a single value.')
  return value
}
function parsedUrl(value, label) {
  try { return new URL(value) } catch { throw new SetupError(label + ' must be an explicit loopback URL.') }
}
export function validateLocalConfig(source, root = repoRoot) {
  if (['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy'].some(name => source[name])) {
    throw new SetupError('Local bootstrap requires a proxy-free process environment. Use the local wrapper.');
  }
  const api = parsedUrl(required(source, 'AUTOLOCAL_LOCAL_API_URL'), 'Local API')
  if (!['http:', 'https:'].includes(api.protocol) || !loopbackHosts.has(api.hostname) || !api.port ||
      api.username || api.password || api.search || api.hash || !['', '/'].includes(api.pathname)) {
    throw new SetupError('Local API requires a loopback IP, explicit port, and no credentials, path, query, or fragment.')
  }
  const db = parsedUrl(required(source, 'AUTOLOCAL_LOCAL_DB_URL'), 'Local database')
  if (!['postgres:', 'postgresql:'].includes(db.protocol) || !loopbackHosts.has(db.hostname) || !db.port ||
      db.username !== 'postgres' || db.password || db.pathname !== '/postgres' || db.search || db.hash) {
    throw new SetupError('Local database requires postgres at a loopback IP and explicit port, database postgres, and no URL password or connection overrides.')
  }
  const password = required(source, 'AUTOLOCAL_LOCAL_DB_PASSWORD')
  const serviceKey = required(source, 'AUTOLOCAL_LOCAL_SERVICE_ROLE_KEY')
  if (serviceKey.trim() !== serviceKey || /\s/.test(serviceKey)) throw new SetupError('Local service key must contain no whitespace.')
  const runtimeDir = resolve(required(source, 'AUTOLOCAL_LOCAL_RUNTIME_DIR'))
  const runtimeRoot = resolve(root, '.runtime')
  const inside = relative(runtimeRoot, runtimeDir)
  if (!inside || inside.startsWith('..' + sep) || inside === '..' || isAbsolute(inside)) {
    throw new SetupError('Local runtime directory must be a child of this checkout\'s .runtime directory.')
  }
  const psqlPath = source.AUTOLOCAL_LOCAL_PSQL_PATH || 'psql'
  if (psqlPath !== 'psql' && (!isAbsolute(psqlPath) || /[\r\n\0]/.test(psqlPath))) {
    throw new SetupError('PSQL override must be an absolute executable path.')
  }
  return { apiUrl: api.origin, dbHost: db.hostname.replace(/^\[|\]$/g, ''), dbPort: db.port,
    dbUser: 'postgres', dbName: 'postgres', password, serviceKey, runtimeDir, runtimeRoot, psqlPath }
}
export function psqlEnvironment(config, source = process.env) {
  // Do not inherit PGHOST, PGSERVICE, PGOPTIONS, credentials, proxy, or dotenv settings.
  return {
    PATH: source.PATH || '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin',
    LANG: 'C', LC_ALL: 'C', PGHOST: config.dbHost, PGHOSTADDR: config.dbHost, PGPORT: config.dbPort,
    PGDATABASE: config.dbName, PGUSER: config.dbUser, PGPASSWORD: config.password,
    PGPASSFILE: '/dev/null', PGSERVICEFILE: '/dev/null', PGSSLMODE: 'disable',
    PGCONNECT_TIMEOUT: '10', PGAPPNAME: 'autolocal-local-bootstrap',
    PGOPTIONS: '-c statement_timeout=60000 -c lock_timeout=10000',
  }
}
export function guardedLocalFetch(apiUrl, fetcher = globalThis.fetch) {
  return async (input, options = {}) => {
    const url = parsedUrl(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'Storage request')
    if (url.origin !== apiUrl || !loopbackHosts.has(url.hostname) || url.username || url.password) {
      throw new SetupError('Storage request attempted to leave the configured loopback origin.')
    }
    const timeout = AbortSignal.timeout(15000)
    const response = await fetcher(input, { ...options, redirect: 'error',
      signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout })
    if ((response.url && new URL(response.url).origin !== apiUrl) || response.redirected) {
      throw new SetupError('Storage response attempted to leave the configured loopback origin.')
    }
    return response
  }
}
export async function ensureLocalStorage(client) {
  const bucketId = 'client-assets'
  const expectedMime = ['image/jpeg', 'image/png', 'image/webp']
  let result = await client.storage.getBucket(bucketId)
  if (result.error) {
    if (Number(result.error.statusCode || result.error.status) !== 404) {
      throw new SetupError('Local Storage lookup failed. Check the running local service and its local service key.')
    }
    const created = await client.storage.createBucket(bucketId, {
      public: true, fileSizeLimit: 5242880, allowedMimeTypes: expectedMime,
    })
    if (created.error && Number(created.error.statusCode || created.error.status) !== 409) {
      throw new SetupError('Local bucket creation failed. No existing bucket settings were changed.')
    }
    result = await client.storage.getBucket(bucketId)
  }
  const bucket = result.data
  if (result.error || !bucket || bucket.id !== bucketId || bucket.name !== bucketId ||
      bucket.public !== true || Number(bucket.file_size_limit) !== 5242880 ||
      JSON.stringify([...(bucket.allowed_mime_types || [])].sort()) !== JSON.stringify([...expectedMime].sort())) {
    throw new SetupError('Local client-assets settings differ from the required public 5 MB PNG/JPEG/WebP bucket. Review them without deleting files.')
  }
  return { id: bucketId, public: true, fileSizeLimit: 5242880, allowedMimeTypes: expectedMime, verified: true }
}
async function runtimeDirectory(config) {
  // Reject symlink traversal before creating directories or writing the manifest.
  const root = await realpath(repoRoot)
  const parts = relative(repoRoot, config.runtimeDir).split(sep)
  let current = root
  for (const part of parts) {
    current = join(current, part)
    let stat
    try { stat = await lstat(current) } catch (error) { if (error.code !== 'ENOENT') throw error }
    if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) throw new SetupError('Runtime path contains a symlink or non-directory.')
    if (!stat) await mkdir(current, { mode: 0o700 })
  }
  if (await realpath(config.runtimeDir) !== current) throw new SetupError('Runtime path must remain inside this checkout.')
}
function sql(config, contents, stage) {
  const result = spawnSync(config.psqlPath, [
    '-X', '--no-password', '--quiet', '--no-align', '--tuples-only',
    '--set=ON_ERROR_STOP=1', '--set=VERBOSITY=sqlstate',
  ], { cwd: repoRoot, env: psqlEnvironment(config), input: contents, encoding: 'utf8',
    timeout: 70000, maxBuffer: 1024 * 1024, windowsHide: true })
  if (result.error || result.status !== 0) {
    const state = result.stderr?.match(/ERROR:\s+([0-9A-Z]{5})(?:\s|$)/)?.[1]
    throw new SetupError(stage + ' failed' + (state ? ' (SQLSTATE ' + state + ')' : '') + '. Raw database output was withheld. Check the local service, credentials, and setup guide; do not reset it.')
  }
  return result.stdout.trim()
}
export const platformPreflightSql = [
  'DO $$ BEGIN',
  "IF current_database()<>'postgres' OR current_user<>'postgres' THEN RAISE EXCEPTION 'Unexpected local admin database'; END IF;",
  "IF to_regclass('auth.users') IS NULL OR to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL OR to_regprocedure('auth.uid()') IS NULL THEN RAISE EXCEPTION 'Managed Supabase schemas are missing'; END IF;",
  "IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls) THEN RAISE EXCEPTION 'Managed service role is missing'; END IF;",
  "IF to_regclass('autolocal_staging.installation') IS NULL AND (EXISTS(SELECT 1 FROM storage.buckets) OR EXISTS(SELECT 1 FROM storage.objects)) THEN RAISE EXCEPTION 'Unmarked project already has storage content'; END IF;",
  "IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='storage.objects'::regclass AND relrowsecurity) THEN RAISE EXCEPTION 'Storage RLS must be enabled'; END IF;",
  "IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND cmd IN ('ALL','INSERT','UPDATE','DELETE') AND roles && ARRAY['public','anon','authenticated']::name[]) THEN RAISE EXCEPTION 'Unexpected browser storage write policy'; END IF;",
  'END $$;',
].join('\n')
const applicationTables = [
  'website_previews', 'businesses', 'brand_profiles', 'posts', 'social_connections', 'subscriptions',
  'audit_requests', 'audits', 'outbound_emails', 'clients', 'change_requests', 'feedback', 'unsubscribes',
  'drip_queue', 'research_results', 'site_leads', 'lead_notifications', 'contact_inquiries',
  'integration_jobs', 'billing_events', 'google_connections', 'google_oauth_states',
  'google_change_proposals', 'google_change_events', 'visibility_tasks', 'public_request_limits',
]
const operationalTables = applicationTables.filter(table => !['businesses', 'brand_profiles', 'posts', 'subscriptions'].includes(table))
const arraySql = list => 'ARRAY[' + list.map(value => "'" + value.replaceAll("'", "''") + "'").join(',') + ']'
export const schemaVerificationSql = [
  'DO $$ DECLARE table_name text; role_name text; signature text; BEGIN',
  'FOREACH table_name IN ARRAY ' + arraySql(applicationTables) + ' LOOP',
  "IF to_regclass('public.'||table_name) IS NULL OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.'||table_name) AND relrowsecurity) THEN RAISE EXCEPTION 'Required application table or RLS missing'; END IF; END LOOP;",
  "FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP",
  'FOREACH table_name IN ARRAY ' + arraySql(operationalTables) + ' LOOP',
  "IF has_table_privilege(role_name,'public.'||table_name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN RAISE EXCEPTION 'Browser operational table privilege must be revoked'; END IF; END LOOP;",
  'FOREACH signature IN ARRAY ' + arraySql([
    'submit_site_lead(text,text,text,text,text,text,text,text,jsonb,uuid)', 'claim_lead_notifications(integer)',
    'claim_integration_jobs(integer)', 'claim_billing_event(text,text)', 'consume_google_oauth_state(text,text,uuid)',
    'claim_google_proposal(uuid,uuid,text)', 'finish_google_proposal(uuid,text,jsonb,text)', 'expire_google_cached_content()',
    'reconcile_visibility_tasks(uuid,uuid,jsonb)', 'claim_visibility_site()', 'consume_public_request_budget(text,text)',
    'unsubscribe_contact(text)', 'increment_preview_views(text)',
  ]) + ' LOOP',
  "IF to_regprocedure('public.'||signature) IS NULL OR has_function_privilege(role_name,'public.'||signature,'EXECUTE') THEN RAISE EXCEPTION 'Private runtime function missing or exposed'; END IF; END LOOP; END LOOP;",
  "IF has_table_privilege('authenticated','public.subscriptions','INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'Browser billing write privilege must be revoked'; END IF;",
  'END $$;',
  // Parse these exact columns to verify the billing/publishing and visibility handoff shape.
  'SELECT owner_id,subscription_status,checkout_event_id,checkout_request_key,checkout_session_id,checkout_site_snapshot,published_site_snapshot,requested_deployment_job_id,deployment_verified_at,website_current,visibility_next_check_at FROM website_previews LIMIT 0;',
  "NOTIFY pgrst, 'reload schema';",
].join('\n')
async function manifest(config, value) {
  const path = join(config.runtimeDir, 'database-setup.json')
  const temporary = path + '.' + randomUUID() + '.tmp'
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  await rename(temporary, path)
}
export async function main(source = process.env) {
  const config = validateLocalConfig(source)
  // Load only the fixed allowlist, before opening a DB connection.
  const files = await Promise.all(schemaFiles.map(async path => {
    const contents = await readFile(join(repoRoot, path), 'utf8')
    return { path, contents, sha256: createHash('sha256').update(contents).digest('hex') }
  }))
  await runtimeDirectory(config)
  const progress = {
    kind: 'autolocal-local-database', apiUrl: config.apiUrl,
    database: { host: config.dbHost, port: Number(config.dbPort), name: config.dbName },
    startedAt: new Date().toISOString(), verified: false, completedFiles: [],
  }
  try {
    sql(config, platformPreflightSql, 'Local platform preflight')
    for (const file of files) {
      sql(config, file.contents, file.path)
      progress.completedFiles.push({ path: file.path, sha256: file.sha256 })
      console.log('Applied ' + file.path)
    }
    sql(config, schemaVerificationSql, 'Local schema and permissions verification')
    const client = createClient(config.apiUrl, config.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: guardedLocalFetch(config.apiUrl) },
    })
    progress.storage = await ensureLocalStorage(client)
    progress.applicationTablesVerified = applicationTables.length
    progress.verified = true
    progress.completedAt = new Date().toISOString()
    await manifest(config, progress)
    console.log('Local database and client-assets verified. No users, customer fixtures, provider jobs, or files were created.')
  } catch (error) {
    progress.failedAt = new Date().toISOString()
    progress.error = error instanceof SetupError ? error.message : 'Local setup failed; no raw database or provider response was recorded.'
    await manifest(config, progress)
    throw new SetupError(progress.error)
  }
}

async function selfTest() {
  const assert = (await import('node:assert/strict')).default
  const base = {
    AUTOLOCAL_LOCAL_API_URL: 'http://127.0.0.1:54321',
    AUTOLOCAL_LOCAL_DB_URL: 'postgresql://postgres@127.0.0.1:54322/postgres',
    AUTOLOCAL_LOCAL_DB_PASSWORD: 'local-fixture-password',
    AUTOLOCAL_LOCAL_SERVICE_ROLE_KEY: 'local-fixture-service-key',
    AUTOLOCAL_LOCAL_RUNTIME_DIR: join(repoRoot, '.runtime', 'backend'),
  }
  const good = validateLocalConfig(base)
  assert.equal(good.dbHost, '127.0.0.1')
  for (const [name, value] of [
    ['AUTOLOCAL_LOCAL_API_URL', 'https://example.supabase.co:443'],
    ['AUTOLOCAL_LOCAL_API_URL', 'http://localhost:54321'],
    ['AUTOLOCAL_LOCAL_API_URL', 'http://127.0.0.1:54321@outside.invalid'],
    ['AUTOLOCAL_LOCAL_API_URL', 'http://127.0.0.1:54321/?redirect=https://outside.invalid'],
    ['AUTOLOCAL_LOCAL_DB_URL', 'postgresql://postgres@outside.invalid:54322/postgres'],
    ['AUTOLOCAL_LOCAL_DB_URL', 'postgresql://postgres@127.0.0.1:54322/postgres?host=outside.invalid'],
    ['AUTOLOCAL_LOCAL_DB_URL', 'postgresql://postgres:password@127.0.0.1:54322/postgres'],
    ['AUTOLOCAL_LOCAL_RUNTIME_DIR', '/tmp/outside-runtime'],
    ['HTTP_PROXY', 'http://outside.invalid:8080'],
  ]) assert.throws(() => validateLocalConfig({ ...base, [name]: value }), SetupError)
  assert.throws(() => validateLocalConfig({ SUPABASE_URL: base.AUTOLOCAL_LOCAL_API_URL }), SetupError)
  const childEnv = psqlEnvironment(good, { PATH: '/usr/bin', PGHOST: 'outside.invalid', PGSERVICE: 'production', PGOPTIONS: 'host=outside.invalid', SUPABASE_SERVICE_ROLE_KEY: 'foreign-key' })
  assert.equal(childEnv.PGHOSTADDR, '127.0.0.1')
  assert.equal(childEnv.PGPASSWORD, 'local-fixture-password')
  assert.equal(childEnv.PGSERVICE, undefined)
  assert.equal(childEnv.SUPABASE_SERVICE_ROLE_KEY, undefined)
  let fetchCalls = 0
  const safeFetch = guardedLocalFetch(good.apiUrl, async (_input, options) => {
    fetchCalls++
    assert.equal(options.redirect, 'error')
    return new Response('{}')
  })
  await safeFetch(good.apiUrl + '/storage/v1/bucket/client-assets')
  await assert.rejects(safeFetch('https://outside.invalid'), SetupError)
  assert.equal(fetchCalls, 1)
  const redirectFetch = guardedLocalFetch(good.apiUrl, async () => {
    const response = new Response('{}')
    Object.defineProperty(response, 'redirected', { value: true })
    return response
  })
  await assert.rejects(redirectFetch(good.apiUrl), SetupError)
  let stored = null
  let creates = 0
  const client = { storage: {
    getBucket: async () => stored ? { data: stored, error: null } : { data: null, error: { statusCode: '404' } },
    createBucket: async (id, options) => {
      creates++
      assert.equal(id, 'client-assets')
      assert.equal(options.fileSizeLimit, 5242880)
      stored = { id, name: id, public: options.public, file_size_limit: options.fileSizeLimit, allowed_mime_types: options.allowedMimeTypes }
      return { error: null }
    },
  } }
  assert.equal((await ensureLocalStorage(client)).verified, true)
  assert.equal((await ensureLocalStorage(client)).verified, true)
  assert.equal(creates, 1)
  stored.public = false
  await assert.rejects(ensureLocalStorage(client), SetupError)
  assert.equal(creates, 1)
  console.log('Local bootstrap guard and mocked Storage checks passed. No network, SQL, or filesystem mutations ran.')
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2)
    if (args.length === 1 && args[0] === '--self-test') await selfTest()
    else if (args.length) throw new SetupError('Only --self-test is supported. Supply local setup values through environment variables.')
    else await main()
  } catch (error) {
    console.error(error instanceof SetupError ? error.message : 'Local setup failed. No raw error or credential output was printed.')
    process.exitCode = 1
  }
}
