// Refresh verified Google listing signals and queue reviewed publishing only when
// production publishing is explicitly available. Credentials stay in the
// process environment and are never printed or passed as arguments.
const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL
const key = process.env.INTERNAL_API_KEY
if (!configuredOrigin || !key) throw new Error('NEXT_PUBLIC_SITE_URL and INTERNAL_API_KEY are required')

const origin = new URL(configuredOrigin)
if (origin.protocol !== 'https:' || origin.username || origin.password) throw new Error('A plain HTTPS application origin is required')

const args = process.argv.slice(2)
if (args.some(arg => arg !== '--dry-run')) throw new Error('Usage: nightly-optimize.sh [--dry-run]')
const dryRun = args.includes('--dry-run')

console.log('🌙 AutoLocal Nightly Optimization')
console.log(`   Time: ${new Date().toISOString()}`)
console.log(`   Dry run: ${dryRun}`)
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

let services
try {
  const response = await fetch(new URL('/api/system/health', origin.origin), {
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || !result.services || typeof result.services !== 'object') throw new Error('Invalid health response')
  services = result.services
} catch {
  console.error('❌ Optimization health check failed; /api/optimize was not called.')
  process.exit(1)
}

if (services.publishing !== true) {
  console.log('✅ Optimization skipped — publishing capability is disabled.')
  process.exit(0)
}

let response
try {
  response = await fetch(new URL('/api/optimize', origin.origin), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ dryRun }),
    redirect: 'error',
    signal: AbortSignal.timeout(120_000),
  })
} catch {
  console.error('❌ Optimization request failed.')
  process.exit(1)
}

const result = await response.json().catch(() => null)
if (!response.ok || !result || typeof result !== 'object') {
  console.error(`❌ Optimization failed${response.status ? ` (HTTP ${response.status})` : ''}.`)
  process.exit(1)
}

if (result.summary && Number.isInteger(result.summary.sitesChanged)) {
  console.log(`✅ Optimization complete — ${result.summary.sitesChanged} site(s) refreshed; publishing is queued and verified separately.`)
} else if (result.message === 'No active sites to optimize') {
  console.log('✅ Optimization complete — no active sites to optimize.')
} else {
  console.error('❌ Optimization returned an unexpected response.')
  process.exit(1)
}
