// Configure in an approved scheduler only. This processes queued provider work.
// Credentials stay in the environment and are never printed or passed as arguments.
const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL
const key = process.env.INTERNAL_API_KEY
if (!configuredOrigin || !key) throw new Error('NEXT_PUBLIC_SITE_URL and INTERNAL_API_KEY are required')
const origin = new URL(configuredOrigin)
if (origin.protocol !== 'https:' || origin.username || origin.password) throw new Error('A plain HTTPS application origin is required')
let failed = false
const workers = ['/api/jobs/process', '/api/leads/notifications/process']
if (process.env.AUTOLOCAL_ENABLE_VISIBILITY_WORKER === 'true') workers.push('/api/visibility/process')
for (const path of workers) {
  try {
    const response = await fetch(new URL(path, origin.origin), { method: 'POST', headers: { Authorization: `Bearer ${key}` }, redirect: 'error', signal: AbortSignal.timeout(290000) })
    const result = await response.json().catch(() => ({}))
    const incomplete = Number(result.failed || 0) > 0 || Number(result.refreshFailures || 0) > 0 || (Array.isArray(result.results) && result.results.some(job => ['failed', 'needs_review'].includes(job.status)))
    if (!response.ok || incomplete) failed = true
    console.log(JSON.stringify({ worker: path, status: response.status, processed: Number(result.processed || 0), needsAttention: !response.ok || incomplete }))
  } catch {
    failed = true
    console.error(JSON.stringify({ worker: path, needsAttention: true, error: 'Worker request failed; inspect protected application job status.' }))
  }
}
if (failed) process.exitCode = 1
