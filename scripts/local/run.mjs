// Local-only orchestration. Never prints keys or imports the cloud .env.local.
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const runtime = resolve(root, '.runtime')
const backend = resolve(runtime, 'backend')
const command = process.argv[2]
if (!['status', 'prepare', 'app', 'verify', 'email'].includes(command)) {
  console.error('Usage: node scripts/local/run.mjs status|prepare|app|verify|email')
  process.exit(1)
}
const safeEnv = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL'].filter(key => process.env[key]).map(key => [key, process.env[key]]))
safeEnv.DO_NOT_TRACK = '1'
safeEnv.SUPABASE_TELEMETRY_DISABLED = '1'
// Select the dedicated container runtime without changing the user's default.
safeEnv.DOCKER_HOST = `unix://${process.env.HOME}/.colima/autolocal/docker.sock`
let configuration
try { configuration = readFileSync(resolve(backend, 'supabase/config.toml'), 'utf8') }
catch { throw new Error('The dedicated local backend configuration is missing.') }
const projectHeader = configuration.split(/^\s*\[/m)[0]
if (!/^\s*project_id\s*=\s*(["'])autolocal-local\1\s*(?:#.*)?$/m.test(projectHeader)) {
  throw new Error('Refusing a backend without the dedicated autolocal-local project marker.')
}
const status = spawnSync('npm', ['exec', '--yes', '--package=supabase@2.117.0', '--', 'supabase', 'status', '--workdir', backend, '--output', 'json'], { cwd: root, env: safeEnv, encoding: 'utf8', timeout: 60_000, maxBuffer: 1024 * 1024 })
if (status.status !== 0) throw new Error('Local backend is not ready. See docs/LOCAL-BACKEND.md; no cloud connection was attempted.')
let local
try { local = JSON.parse(status.stdout) } catch { throw new Error('Local backend returned an unreadable status; credentials were not printed.') }
let api, database, databasePassword
try {
  api = new URL(local.API_URL)
  database = new URL(local.DB_URL)
  databasePassword = decodeURIComponent(database.password)
} catch {
  // URL errors can include their input; never allow a status URL into a stack.
  throw new Error('Local backend returned invalid connection details; credentials were not printed.')
}
if (api.origin !== 'http://127.0.0.1:54321' || api.pathname !== '/' || api.search || api.hash || api.username || api.password ||
    database.protocol !== 'postgresql:' || database.hostname !== '127.0.0.1' || database.port !== '54322' || database.pathname !== '/postgres' || database.username !== 'postgres' || database.search || database.hash ||
    typeof local.ANON_KEY !== 'string' || !local.ANON_KEY || typeof local.SERVICE_ROLE_KEY !== 'string' || !local.SERVICE_ROLE_KEY) throw new Error('Refusing a backend that does not match this dedicated local setup.')
mkdirSync(runtime, { recursive: true, mode: 0o700 })
const appOrigin = 'http://127.0.0.1:3102'
const localEnv = {
  ...safeEnv,
  AUTOLOCAL_LOCAL_API_URL: api.origin,
  AUTOLOCAL_LOCAL_DB_URL: 'postgresql://postgres@127.0.0.1:54322/postgres',
  AUTOLOCAL_LOCAL_DB_PASSWORD: databasePassword,
  AUTOLOCAL_LOCAL_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
  AUTOLOCAL_LOCAL_ANON_KEY: local.ANON_KEY,
  AUTOLOCAL_LOCAL_APP_URL: appOrigin,
  AUTOLOCAL_LOCAL_MAILPIT_URL: 'http://127.0.0.1:54324',
  AUTOLOCAL_LOCAL_RUNTIME_DIR: backend,
}
if (command === 'status') {
  console.log(JSON.stringify({ api: api.origin, app: appOrigin, mail: 'http://127.0.0.1:54324', credentialsPresent: true }))
  process.exit(0)
}
let args
let env = localEnv
if (command === 'app') {
  // Next reads env files itself: predefine every configured key as empty before
  // providing the local values so an existing cloud key cannot leak into it.
  const blank = {}
  for (const filename of ['.env.example', '.env', '.env.local', '.env.development', '.env.development.local']) {
    let source
    try { source = readFileSync(resolve(root, filename), 'utf8') } catch { continue }
    for (const line of source.split('\n')) {
      // Match the assignment forms accepted by Next's bundled dotenv parser.
      const key = line.match(/^\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*|:\s+)/)?.[1]
      if (key) blank[key] = ''
    }
  }
  env = {
    ...blank, ...safeEnv, NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1',
    NEXT_DIST_DIR: '.next-dev/local-backend',
    NEXT_PUBLIC_SITE_URL: appOrigin, NEXT_PUBLIC_BASE_URL: appOrigin,
    NEXT_PUBLIC_SUPABASE_URL: api.origin, NEXT_PUBLIC_SUPABASE_ANON_KEY: local.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
    AUTOLOCAL_RATE_LIMIT_KEY: randomBytes(32).toString('hex'),
    INTERNAL_API_KEY: randomBytes(32).toString('hex'),
    RAILWAY_ENVIRONMENT_NAME: 'local', AUTOLOCAL_PUBLISHING_NAMESPACE: 'local',
    AUTOLOCAL_ENABLE_BILLING: 'false', AUTOLOCAL_ENABLE_PUBLISHING: 'false',
    AUTOLOCAL_ENABLE_DOMAIN_PURCHASES: 'false', AUTOLOCAL_ENABLE_EMAIL: 'false',
    AUTOLOCAL_ENABLE_GOOGLE_CONNECTIONS: 'false', AUTOLOCAL_ENABLE_GBP_WRITES: 'false',
    AUTOLOCAL_ENABLE_VISIBILITY_WORKER: 'false', AUTOLOCAL_SCHEDULER_VERIFIED: 'false',
    AUTOLOCAL_TRUST_PROXY_IP_HEADERS: 'false', AUTOLOCAL_EDGE_RATE_LIMIT_VERIFIED: 'false',
  }
  args = [resolve(root, 'node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', '3102']
} else {
  const script = command === 'prepare' ? 'prepare-database' : command === 'email' ? 'verify-email' : 'verify-flow'
  args = [resolve(root, `scripts/local/${script}.mjs`), ...(command === 'prepare' ? [] : ['--run'])]
}
const child = spawn(process.execPath, args, { cwd: root, env, stdio: 'inherit' })
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal))
child.once('error', () => { console.error('Could not start the local operation.'); process.exitCode = 1 })
child.once('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0) })
