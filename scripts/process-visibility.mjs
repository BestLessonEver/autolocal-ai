#!/usr/bin/env node
// Invoke from an owner-controlled scheduler. Never print the internal credential.
const origin = process.env.NEXT_PUBLIC_SITE_URL
const key = process.env.INTERNAL_API_KEY
if (!origin || !key) throw new Error('Configure NEXT_PUBLIC_SITE_URL and INTERNAL_API_KEY for the scheduler.')
const url = new URL('/api/visibility/process', origin)
if (url.username || url.password || (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('Use an HTTPS application origin without credentials.')
const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, redirect: 'error', signal: AbortSignal.timeout(65000) })
const result = await response.json().catch(() => ({}))
if (!response.ok) throw new Error(result.error || `Visibility worker returned ${response.status}.`)
console.log(JSON.stringify({ processed: result.processed, refreshed: result.refreshed, refreshFailures: result.refreshFailures, openTasks: result.openTasks }))
if (Number(result.refreshFailures || 0) > 0) process.exitCode = 1
